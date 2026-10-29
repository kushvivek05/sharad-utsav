import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type PassRule = {
  code: string; name: string; audience: 'adult' | 'child' | 'family'; priceCents: number;
  initialStock: number; dayRule: 'selected-days' | 'all-event-days' | 'single-day';
  chargeRule: 'per-person-day' | 'per-person' | 'per-family';
  familyComposition?: { adultCount: number; childCount: number };
};
export type ExtraRule = {
  code: string; name: string; description: string; priceCents: number; initialStock: number;
  selectionRule: 'quantity' | 'per-day' | 'per-session'; unitLabel: string;
  availableDates?: 'all-event-days' | string[]; maximumPerAttendee?: boolean;
};
export type PromoRule = { code: string; status: 'active' | 'expired' | 'maxed-out'; discountRule: 'percentage' | 'fixed-cents' | 'child-tickets-free'; value: number; message: string };
export type EventConfig = {
  schemaVersion: number;
  event: {
    slug: string; name: string; currency: 'USD';
    venue: { name: string; address: string | null; city: string; region: string; country: string };
    schedule: { timeZone: string; startDate: string; endDate: string; dailyTimings: Array<{ date: string; startTime: string | null; endTime: string | null }> };
  };
  ageRules: { freeBelow: number; child: { minimum: number; maximum: number }; adultMinimum: number; bookingContactMinimum: number };
  passes: PassRule[];
  extras: ExtraRule[];
  promoCodes: PromoRule[];
};

const configPath = fileURLToPath(new URL('../../config/event.json', import.meta.url));
const raw = JSON.parse(readFileSync(configPath, 'utf8')) as EventConfig;

function assertConfig(config: EventConfig) {
  if (config.schemaVersion !== 1) throw new Error('Unsupported event config schemaVersion.');
  if (!config.event?.slug || !config.event.name || config.event.currency !== 'USD') throw new Error('Event name, slug, and USD currency are required.');
  const dates = config.event.schedule?.dailyTimings?.map(day => day.date);
  if (!dates?.length || dates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date)) || new Set(dates).size !== dates.length) throw new Error('Event dailyTimings must contain unique YYYY-MM-DD dates.');
  if (dates[0] !== config.event.schedule.startDate || dates.at(-1) !== config.event.schedule.endDate) throw new Error('Event startDate and endDate must match the first and last dailyTimings entries.');
  for (const day of config.event.schedule.dailyTimings) {
    for (const time of [day.startTime, day.endTime]) if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`Invalid time for ${day.date}; use 24-hour HH:MM or null.`);
  }
  if (config.ageRules.freeBelow < 0 || config.ageRules.child.minimum !== config.ageRules.freeBelow || config.ageRules.child.maximum + 1 !== config.ageRules.adultMinimum || config.ageRules.bookingContactMinimum < config.ageRules.adultMinimum) throw new Error('Age rules must be contiguous, non-overlapping, and require an adult booking contact.');
  const codes = [...config.passes, ...config.extras, ...config.promoCodes].map(item => item.code);
  if (new Set(codes).size !== codes.length) throw new Error('Pass and extra codes must be unique.');
  for (const item of [...config.passes, ...config.extras]) {
    if (!item.code || !item.name || !Number.isInteger(item.priceCents) || item.priceCents < 0 || !Number.isInteger(item.initialStock) || item.initialStock < 0) throw new Error(`Invalid price or stock settings for ${item.code || 'unnamed item'}.`);
  }
  for (const pass of config.passes) {
    if (!['adult', 'child', 'family'].includes(pass.audience) || !['selected-days', 'all-event-days', 'single-day'].includes(pass.dayRule) || !['per-person-day', 'per-person', 'per-family'].includes(pass.chargeRule)) throw new Error(`Unsupported pass rule for ${pass.code}.`);
    if (pass.audience === 'family' && (!pass.familyComposition || pass.chargeRule !== 'per-family' || pass.dayRule !== 'single-day')) throw new Error(`Family pass ${pass.code} needs a composition, per-family charge, and single-day rule.`);
    if (pass.familyComposition && (!Number.isInteger(pass.familyComposition.adultCount) || pass.familyComposition.adultCount < 1 || !Number.isInteger(pass.familyComposition.childCount) || pass.familyComposition.childCount < 1)) throw new Error(`Family composition for ${pass.code} must use positive whole numbers.`);
  }
  for (const extra of config.extras) {
    if (!['quantity', 'per-day', 'per-session'].includes(extra.selectionRule)) throw new Error(`Unsupported extra rule for ${extra.code}.`);
    if (Array.isArray(extra.availableDates) && extra.availableDates.some(date => !dates.includes(date))) throw new Error(`Extra ${extra.code} has dates outside the event schedule.`);
  }
  for (const promo of config.promoCodes) {
    if (!['active', 'expired', 'maxed-out'].includes(promo.status) || !['percentage', 'fixed-cents', 'child-tickets-free'].includes(promo.discountRule) || !Number.isFinite(promo.value) || promo.value < 0 || promo.discountRule === 'percentage' && promo.value > 100) throw new Error(`Unsupported promo rule or value for ${promo.code}.`);
  }
}

assertConfig(raw);
export function loadEventConfig(): EventConfig {
  const updated = JSON.parse(readFileSync(configPath, 'utf8')) as EventConfig;
  assertConfig(updated);
  return updated;
}
export function getPublicEventConfig() {
  const eventConfig = loadEventConfig();
  return {
    schemaVersion: eventConfig.schemaVersion,
    event: eventConfig.event,
    ageRules: eventConfig.ageRules,
    passes: eventConfig.passes,
    extras: eventConfig.extras,
    promoCodes: eventConfig.promoCodes.map(({ code, status, message }) => ({ code, status, message })),
  };
}
