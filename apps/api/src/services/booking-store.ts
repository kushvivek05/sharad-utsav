import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { runMigrations } from './migrations.js';
import { loadEventConfig, type EventConfig } from './event-config.js';

type Attendee = { name: string; age: number; ticket: string; days: string[] };
type Input = {
  contact: { name: string; email: string; phone: string; age: number };
  attendees: Attendee[];
  extras: Record<string, number | Record<string, number>>;
  promoCode?: string;
};
type Booking = Record<string, unknown> & { confirmationCode: string; quote?: { quantities?: Record<string, number> } };
type Quote = ReturnType<typeof makeQuote>;
type Rules = { config: EventConfig; dates: string[]; passes: Map<string, EventConfig['passes'][number]>; extras: Map<string, EventConfig['extras'][number]> };
type SoldRow = RowDataPacket & { product_code: string; sold: number | string };
const legacyStorePath = path.resolve(env.bookingStorePath || path.join(process.cwd(), 'data', 'booking-store.json'));
let initialization: Promise<void> | undefined;

export class BookingInputError extends Error {
  constructor(message: string, public code = 'INVALID_BOOKING', public status = 422) { super(message); }
}
const fail = (message: string, code = 'INVALID_BOOKING', status = 422): never => { throw new BookingInputError(message, code, status); };

async function initializeStore() {
  if (initialization) return initialization;
  initialization = (async () => {
    await runMigrations();
    await migrateLegacyFile();
  })().catch(error => { initialization = undefined; throw error; });
  return initialization;
}

async function migrateLegacyFile() {
  const [migrationRows] = await pool.execute<RowDataPacket[]>('SELECT name FROM schema_migrations WHERE name = ?', ['legacy_json_bookings_v1']);
  if (migrationRows.length) return;
  let oldBookings: Booking[] = [];
  try {
    const saved = JSON.parse(readFileSync(legacyStorePath, 'utf8')) as { bookings?: Booking[] };
    if (!Array.isArray(saved.bookings)) throw new Error('Legacy booking store has an invalid format.');
    oldBookings = saved.bookings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM booking_mutex WHERE id = 1 FOR UPDATE');
    const [checkRows] = await connection.execute<RowDataPacket[]>('SELECT name FROM schema_migrations WHERE name = ?', ['legacy_json_bookings_v1']);
    if (checkRows.length) { await connection.commit(); return; }
    for (const booking of oldBookings) {
      const createdAt = typeof booking.createdAt === 'string' ? booking.createdAt : new Date(0).toISOString();
      if (!booking.confirmationCode) continue;
      const quantities = booking.quote?.quantities ?? {};
      const [result] = await connection.execute<import('mysql2').ResultSetHeader>(
        'INSERT IGNORE INTO bookings (confirmation_code, idempotency_key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?)',
        [booking.confirmationCode, `legacy:${booking.confirmationCode}`, 'legacy-import', JSON.stringify(booking), new Date(createdAt)],
      );
      if (result.affectedRows) {
        for (const [productCode, quantity] of Object.entries(quantities)) if (Number.isInteger(quantity) && quantity > 0) {
          await connection.execute('INSERT INTO booking_items (booking_id, product_code, quantity) VALUES (?, ?, ?)', [result.insertId, productCode, quantity]);
        }
      }
    }
    await connection.execute('INSERT INTO schema_migrations (name, applied_at) VALUES (?, UTC_TIMESTAMP(3))', ['legacy_json_bookings_v1']);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

function loadRules(): Rules {
  const config = loadEventConfig();
  return {
    config,
    dates: config.event.schedule.dailyTimings.map(day => day.date),
    passes: new Map(config.passes.map(pass => [pass.code, pass])),
    extras: new Map(config.extras.map(extra => [extra.code, extra])),
  };
}
async function remainingStock(config: EventConfig, connection?: PoolConnection) {
  await initializeStore();
  const queryable = connection ?? pool;
  const [rows] = await queryable.query<SoldRow[]>('SELECT product_code, SUM(quantity) AS sold FROM booking_items GROUP BY product_code');
  const sold: Record<string, number> = {};
  for (const row of rows) sold[row.product_code] = Number(row.sold);
  return Object.fromEntries([...config.passes, ...config.extras].map(item => [item.code, Math.max(0, item.initialStock - (sold[item.code] ?? 0))]));
}

function validate(value: unknown, rules: Rules): Input {
  if (!value || typeof value !== 'object') fail('Booking details are missing.');
  const input = value as Input;
  if (!input.contact || typeof input.contact.name !== 'string' || input.contact.name.trim().length < 2 || input.contact.name.length > 100) fail('Enter the booking contact’s name.');
  if (typeof input.contact.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact.email)) fail('Enter a valid email address.');
  if (typeof input.contact.phone !== 'string' || input.contact.phone.replace(/\D/g, '').length < 7 || input.contact.phone.length > 30) fail('Enter a valid phone number.');
  if (!Number.isInteger(input.contact.age) || input.contact.age < rules.config.ageRules.bookingContactMinimum || input.contact.age > 120) fail(`The person booking must be at least ${rules.config.ageRules.bookingContactMinimum} years old.`);
  if (!Array.isArray(input.attendees) || input.attendees.length < 1 || input.attendees.length > 200) fail('Add at least one attendee.');

  for (const [index, attendee] of input.attendees.entries()) {
    if (!attendee || typeof attendee.name !== 'string' || attendee.name.trim().length < 2 || attendee.name.length > 100) fail(`Enter the name for attendee ${index + 1}.`);
    if (!Number.isInteger(attendee.age) || attendee.age < 0 || attendee.age > 120) fail(`Enter a valid age for attendee ${index + 1}.`);
    if (!Array.isArray(attendee.days) || attendee.days.length < 1 || attendee.days.some(date => !rules.dates.includes(date)) || new Set(attendee.days).size !== attendee.days.length) fail(`Choose valid event dates for attendee ${index + 1}.`);
    if (attendee.age < rules.config.ageRules.freeBelow) {
      if (attendee.ticket !== 'FREE') fail(`Attendee ${index + 1} is under ${rules.config.ageRules.freeBelow} and does not need a pass.`);
      continue;
    }
    const pass = rules.passes.get(attendee.ticket);
    if (!pass) throw new BookingInputError(`Choose a valid pass for attendee ${index + 1}.`);
    if (pass.audience === 'child' && (attendee.age < rules.config.ageRules.child.minimum || attendee.age > rules.config.ageRules.child.maximum)) fail(`Attendee ${index + 1} needs a pass that matches their age.`);
    if (pass.audience === 'adult' && attendee.age < rules.config.ageRules.adultMinimum) fail(`Attendee ${index + 1} needs a pass that matches their age.`);
    if (pass.audience === 'family' && attendee.age < rules.config.ageRules.child.minimum) fail(`Attendee ${index + 1} is too young for a Family Pass.`);
    if (pass.dayRule === 'all-event-days' && (attendee.days.length !== rules.dates.length || !rules.dates.every(date => attendee.days.includes(date)))) fail('All-Day Passes must include every event date.');
    if (pass.dayRule === 'single-day' && attendee.days.length !== 1) fail(`${pass.name} is valid for one selected date.`);
  }

  for (const pass of rules.config.passes.filter(item => item.audience === 'family')) {
    const family = input.attendees.filter(attendee => attendee.ticket === pass.code);
    const composition = pass.familyComposition!;
    const familySize = composition.adultCount + composition.childCount;
    for (const date of rules.dates) {
      const attending = family.filter(attendee => attendee.days[0] === date);
      if (!attending.length) continue;
      const families = attending.length / familySize;
      if (!Number.isInteger(families) || attending.filter(person => person.age >= rules.config.ageRules.adultMinimum).length !== families * composition.adultCount || attending.filter(person => person.age >= rules.config.ageRules.child.minimum && person.age <= rules.config.ageRules.child.maximum).length !== families * composition.childCount) fail(`${pass.name} requires ${composition.adultCount} adults and ${composition.childCount} children for the same date.`);
    }
  }

  if (!input.extras || typeof input.extras !== 'object' || Array.isArray(input.extras)) fail('Choose valid event extras.');
  for (const [code, selection] of Object.entries(input.extras)) {
    const extra = rules.extras.get(code);
    if (!extra) throw new BookingInputError(`Unknown extra: ${code}.`);
    const dated = extra.selectionRule !== 'quantity';
    if (dated && (!selection || typeof selection !== 'object' || Array.isArray(selection))) fail(`Enter a valid quantity for ${extra.name}.`);
    if (!dated && (typeof selection !== 'number' || !Number.isInteger(selection) || selection < 0)) fail(`Enter a valid quantity for ${extra.name}.`);
    const selections = dated ? selection as Record<string, number> : { quantity: selection as number };
    for (const [date, quantity] of Object.entries(selections)) {
      const validDate = !dated || rules.dates.includes(date) && (extra.availableDates === undefined || extra.availableDates === 'all-event-days' || extra.availableDates.includes(date));
      if (!validDate) fail(`${extra.name} is not available on ${date}.`);
      if (!Number.isInteger(quantity) || quantity < 0) fail(`Enter a whole-number quantity for ${extra.name}.`);
      if (dated && extra.maximumPerAttendee && quantity > input.attendees.filter(person => person.days.includes(date)).length) fail(`${extra.name} quantity cannot exceed the guests attending on that date.`);
    }
  }
  return input;
}

function calculateQuantities(input: Input, rules: Rules) {
  const quantities: Record<string, number> = Object.fromEntries([...rules.config.passes, ...rules.config.extras].map(item => [item.code, 0]));
  for (const attendee of input.attendees) {
    if (attendee.ticket === 'FREE') continue;
    const pass = rules.passes.get(attendee.ticket)!;
    if (pass.chargeRule === 'per-person-day') quantities[pass.code] += attendee.days.length;
    else if (pass.chargeRule === 'per-person') quantities[pass.code]++;
  }
  for (const pass of rules.config.passes.filter(item => item.chargeRule === 'per-family')) {
    const familySize = pass.familyComposition!.adultCount + pass.familyComposition!.childCount;
    quantities[pass.code] = input.attendees.filter(person => person.ticket === pass.code).length / familySize;
  }
  for (const extra of rules.config.extras) {
    const selection = input.extras[extra.code];
    if (selection === undefined) continue;
    quantities[extra.code] = typeof selection === 'number' ? selection : Object.values(selection).reduce((sum, quantity) => sum + quantity, 0);
  }
  return quantities;
}

function makeQuote(input: Input, stock: Record<string, number>, rules: Rules) {
  const quantities = calculateQuantities(input, rules);
  const items = [...rules.config.passes, ...rules.config.extras];
  const lines = items.filter(item => quantities[item.code] > 0).map(item => ({ name: item.name, quantity: quantities[item.code], totalInCents: quantities[item.code] * item.priceCents }));
  const subtotalInCents = lines.reduce((sum, line) => sum + line.totalInCents, 0);
  const childTicketTotal = rules.config.passes.filter(pass => pass.audience === 'child').reduce((sum, pass) => sum + quantities[pass.code] * pass.priceCents, 0);
  const promoCode = typeof input.promoCode === 'string' ? input.promoCode.trim().toUpperCase() : '';
  const promo = rules.config.promoCodes.find(item => item.code === promoCode);
  let discountInCents = 0, promoMessage = '';
  if (promoCode && !promo) promoMessage = 'That promo code is not recognized.';
  else if (promo?.status === 'expired' || promo?.status === 'maxed-out') promoMessage = promo.message;
  else if (promo?.status === 'active') {
    if (promo.discountRule === 'percentage') discountInCents = Math.floor(subtotalInCents * promo.value / 100);
    else if (promo.discountRule === 'fixed-cents') discountInCents = Math.min(subtotalInCents, promo.value);
    else if (promo.discountRule === 'child-tickets-free') discountInCents = childTicketTotal;
    promoMessage = `${promo.code} applied: ${promo.message}`;
  }
  return { lines, quantities, subtotalInCents, discountInCents, totalInCents: Math.max(0, subtotalInCents - discountInCents), currency: rules.config.event.currency, promoCode: promoCode || null, promoMessage, stock };
}

function checkStock(quote: Quote, rules: Rules) {
  for (const [code, quantity] of Object.entries(quote.quantities)) if (quantity > (quote.stock[code] ?? 0)) {
    const itemName = rules.passes.get(code)?.name ?? rules.extras.get(code)?.name ?? code;
    fail(`${itemName} is sold out or unavailable in that quantity.`, 'OUT_OF_STOCK', 409);
  }
}

export async function getAvailability() {
  const rules = loadRules();
  return remainingStock(rules.config);
}

export async function closeBookingStore() { await pool.end(); }
export async function calculateQuote(value: unknown) {
  const rules = loadRules();
  const input = validate(value, rules);
  const quote = makeQuote(input, await remainingStock(rules.config), rules);
  checkStock(quote, rules);
  return quote;
}
export async function completeBooking(value: unknown, idempotencyKey: string | undefined) {
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new BookingInputError('A valid Idempotency-Key header is required.');
  const serializedRequest = JSON.stringify(value);
  if (serializedRequest === undefined) fail('Booking details are missing.');
  const requestHash = createHash('sha256').update(serializedRequest).digest('hex');
  const rules = loadRules();
  await initializeStore();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM booking_mutex WHERE id = 1 FOR UPDATE');
    const [existingRows] = await connection.execute<RowDataPacket[]>('SELECT request_hash, response_json FROM bookings WHERE idempotency_key = ? FOR UPDATE', [idempotencyKey]);
    const existing = existingRows[0] as (RowDataPacket & { request_hash: string; response_json: string }) | undefined;
    if (existing) {
      if (existing.request_hash !== requestHash) fail('This payment attempt key was already used for different booking details.', 'IDEMPOTENCY_CONFLICT', 409);
      await connection.commit();
      return JSON.parse(existing.response_json) as Booking;
    }
    const input = validate(value, rules);
    const quote = makeQuote(input, await remainingStock(rules.config, connection), rules);
    checkStock(quote, rules);
    const { stock: _stock, ...savedQuote } = quote;
    const createdAt = new Date().toISOString();
    const booking: Booking = {
      confirmationCode: `SU26-${randomUUID().slice(0, 8).toUpperCase()}`,
      status: 'CONFIRMED', contact: input.contact, attendees: input.attendees, extras: input.extras,
      quote: savedQuote, createdAt,
    };
    const [insertResult] = await connection.execute<import('mysql2').ResultSetHeader>(
      'INSERT INTO bookings (confirmation_code, idempotency_key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?)',
      [booking.confirmationCode, idempotencyKey, requestHash, JSON.stringify(booking), new Date(createdAt)],
    );
    for (const [productCode, quantity] of Object.entries(quote.quantities)) if (quantity > 0) {
      await connection.execute('INSERT INTO booking_items (booking_id, product_code, quantity) VALUES (?, ?, ?)', [insertResult.insertId, productCode, quantity]);
    }
    await connection.commit();
    return booking;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}
export async function checkBookingStore() {
  await initializeStore();
  await pool.query('SELECT 1');
}
