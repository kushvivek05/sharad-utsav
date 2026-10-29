'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
type Pass = { code: string; name: string; audience: 'adult' | 'child' | 'family'; priceCents: number; initialStock: number; dayRule: 'selected-days' | 'all-event-days' | 'single-day'; chargeRule: 'per-person-day' | 'per-person' | 'per-family'; familyComposition?: { adultCount: number; childCount: number } };
type Extra = { code: string; name: string; description: string; priceCents: number; initialStock: number; selectionRule: 'quantity' | 'per-day' | 'per-session'; unitLabel: string; availableDates?: 'all-event-days' | string[]; maximumPerAttendee?: boolean };
type Settings = { schemaVersion: number; event: { slug: string; name: string; currency: string; venue: { name: string; address: string | null; city: string; region: string; country: string }; schedule: { timeZone: string; startDate: string; endDate: string; dailyTimings: Array<{ date: string; startTime: string | null; endTime: string | null }> } }; ageRules: { freeBelow: number; child: { minimum: number; maximum: number }; adultMinimum: number; bookingContactMinimum: number }; passes: Pass[]; extras: Extra[]; promoCodes: Array<{ code: string; status: string; message: string }> };
type Guest = { name: string; age: string };
type FreeGuest = Guest & { days: string[] };
type Group = { id: number; ticket: string; quantity: number; days: string[]; guests: Guest[] };
type ExtraSelection = number | Record<string, number>;
type Quote = { lines: Array<{ name: string; quantity: number; totalInCents: number }>; quantities: Record<string, number>; stock: Record<string, number>; subtotalInCents: number; discountInCents: number; totalInCents: number; currency: string; promoMessage: string };
type Confirmation = { confirmationCode: string; quote: { totalInCents: number } };
const blankGuest = (): Guest => ({ name: '', age: '' });
const money = (amount: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
const dateLabel = (date: string, zone: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: zone }).format(new Date(`${date}T12:00:00Z`));
async function api<T>(route: string, data?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${API}${route}`, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'The booking service is unavailable.');
  return result.data as T;
}
function initialExtras(items: Extra[], dates: string[]): Record<string, ExtraSelection> {
  return Object.fromEntries(items.map(item => [item.code, item.selectionRule === 'quantity' ? 0 : Object.fromEntries((item.availableDates === 'all-event-days' || !item.availableDates ? dates : item.availableDates).map(date => [date, 0]))]));
}

export default function BookingFlow({ slug }: { slug: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [step, setStep] = useState(1);
  const [groups, setGroups] = useState<Group[]>([]);
  const [nextId, setNextId] = useState(1);
  const [free, setFree] = useState<FreeGuest[]>([]);
  const [contact, setContact] = useState({ name: '', email: '', phone: '', age: '' });
  const [extras, setExtras] = useState<Record<string, ExtraSelection>>({});
  const [promoCode, setPromoCode] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const dates = settings?.event.schedule.dailyTimings.map(day => day.date) ?? [];
  const attendingDates = dates.filter(date => groups.some(group => group.guests.length > 0 && group.days.includes(date)) || free.some(guest => guest.days.includes(date)));
  const passFor = (code: string) => settings?.passes.find(pass => pass.code === code);
  const guestCount = useMemo(() => groups.reduce((count, group) => count + group.guests.length, 0) + free.length, [groups, free]);

  function selectedQuantity(code: string) {
    const pass = settings?.passes.find(item => item.code === code);
    if (pass) return groups.filter(group => group.ticket === code).reduce((sum, group) => {
      if (pass.chargeRule === 'per-person-day') return sum + group.guests.length * group.days.length;
      if (pass.chargeRule === 'per-family') return sum + group.quantity;
      return sum + group.guests.length;
    }, 0);
    const selection = extras[code];
    return typeof selection === 'number' ? selection : selection ? Object.values(selection).reduce((sum, quantity) => sum + quantity, 0) : 0;
  }
  function remainingAfterDraft(code: string) { return Math.max(0, (stock[code] ?? 0) - selectedQuantity(code)); }

  useEffect(() => {
    Promise.all([api<Settings>('/event'), api<Record<string, number>>('/availability')]).then(([config, available]) => {
      if (config.event.slug !== slug) throw new Error('This event could not be found.');
      const configuredDates = config.event.schedule.dailyTimings.map(day => day.date);
      setSettings(config); setStock(available); setExtras(initialExtras(config.extras, configuredDates));
      const pass = config.passes.find(item => available[item.code] > 0) ?? config.passes[0];
      if (pass) { setGroups([{ id: 1, ticket: pass.code, quantity: 1, days: [configuredDates[0]], guests: [blankGuest()] }]); setNextId(2); }
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Event details could not be loaded.'));
  }, [slug]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  function resize(group: Group, pass: Pass, quantity: number): Group {
    const perUnit = pass.familyComposition ? pass.familyComposition.adultCount + pass.familyComposition.childCount : 1;
    const guests = Array.from({ length: quantity * perUnit }, (_, index) => group.guests[index] ?? blankGuest());
    const selectedDays = pass.dayRule === 'all-event-days' ? dates : pass.dayRule === 'single-day' ? [group.days[0] ?? dates[0]] : group.days.length ? group.days : [dates[0]];
    return { ...group, ticket: pass.code, quantity, guests, days: selectedDays };
  }
  function changeGroup(id: number, update: (group: Group) => Group) { setGroups(items => items.map(group => group.id === id ? update(group) : group)); }
  function addGroup() {
    if (!settings) return;
    const pass = settings.passes.find(item => stock[item.code] > 0) ?? settings.passes[0];
    if (!pass) return;
    setGroups(items => [...items, { id: nextId, ticket: pass.code, quantity: 1, days: [dates[0]], guests: [blankGuest()] }]); setNextId(id => id + 1);
  }
  function bookingPayload() {
    const attendees = groups.flatMap(group => group.guests.map(guest => ({ ...guest, age: Number(guest.age), ticket: group.ticket, days: group.days })))
      .concat(free.map(guest => ({ ...guest, age: Number(guest.age), ticket: 'FREE' })));
    const selectedExtras = Object.fromEntries(settings!.extras.map(extra => {
      const selection = extras[extra.code];
      if (extra.selectionRule === 'quantity') return [extra.code, typeof selection === 'number' ? selection : 0];
      const availableDates = extra.availableDates === 'all-event-days' || !extra.availableDates ? dates : extra.availableDates;
      const applicableDates = availableDates.filter(date => attendingDates.includes(date));
      const values = typeof selection === 'object' && selection !== null ? selection : {};
      return [extra.code, Object.fromEntries(applicableDates.map(date => [date, values[date] ?? 0]))];
    }));
    return { contact: { ...contact, age: Number(contact.age) }, attendees, extras: selectedExtras, promoCode };
  }
  async function review() {
    setBusy(true); setError('');
    try { setQuote(await api<Quote>('/quote', bookingPayload())); idempotencyKey.current = crypto.randomUUID(); setStep(3); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Please review your booking details.'); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError('');
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      setConfirmation(await api<Confirmation>('/bookings', bookingPayload(), { 'Idempotency-Key': idempotencyKey.current }));
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setBusy(false); }
  }

  if (!settings) return <section className="section"><div className="container"><div className="booking-panel">{error || 'Loading event settings…'}</div></div></section>;
  const event = settings.event, timezone = event.schedule.timeZone;
  if (event.slug !== slug) return <section className="section"><div className="container"><div className="booking-panel"><h1>Event not found</h1><a href="/">Return to event</a></div></div></section>;
  const datesString = `${dateLabel(event.schedule.startDate, timezone)} – ${dateLabel(event.schedule.endDate, timezone)}`;
  const venueString = [event.venue.name, event.venue.address, event.venue.city, event.venue.region, event.venue.country].filter(Boolean).join(', ');
  const format = (amount: number) => money(amount, event.currency);
  const ticketedGuests = groups.reduce((count, group) => count + group.guests.length, 0);
  if (confirmation) return <section className="section"><div className="container"><div className="booking-confirmation"><p className="eyebrow">Booking confirmed</p><h1>You’re on the guest list.</h1><p>Confirmation <strong>{confirmation.confirmationCode}</strong></p><p>Payment total: <strong>{format(confirmation.quote.totalInCents)}</strong></p><p className="text-muted">Save your confirmation code and show it at the entrance.</p></div></div></section>;

  return <section className="section booking-section" id="tickets"><div className="container booking-container">
    <header className="booking-intro"><p className="eyebrow booking-kicker">✦ &nbsp; Sharad Utsav · {datesString} &nbsp; ✦</p><h1>{event.name}</h1><p className="text-muted">{venueString}</p>{event.schedule.dailyTimings.some(day => day.startTime || day.endTime) && <details className="event-timings"><summary>Daily timings</summary><ul>{event.schedule.dailyTimings.filter(day => day.startTime || day.endTime).map(day => <li key={day.date}>{dateLabel(day.date, timezone)} · {day.startTime ?? '—'}–{day.endTime ?? '—'}</li>)}</ul></details>}</header>
    <nav className="booking-progress booking-progress--simple" aria-label="Booking steps">{['Passes', 'Guests & extras', 'Review'].map((label, index) => <span key={label} aria-current={step === index + 1 ? 'step' : undefined} className={step === index + 1 ? 'is-current' : step > index + 1 ? 'is-complete' : ''}><b>{index + 1}</b>{label}</span>)}</nav>
    {error && <div className="booking-toast" role="alert" aria-live="assertive"><span className="booking-toast__icon" aria-hidden="true">!</span><p>{error}</p><button type="button" aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}

    {step === 1 && <section className="booking-panel ticket-step"><div className="panel-heading"><div><p className="eyebrow">Step 1</p><h2>Choose passes</h2></div><span className="step-hint">Add another group for different dates or ticket types</span></div>
      <div className="ticket-groups">{groups.map((group, index) => { const pass = passFor(group.ticket)!; const familySize = pass.familyComposition ? pass.familyComposition.adultCount + pass.familyComposition.childCount : 1; return <article className="ticket-group" key={group.id}><div className="ticket-group__top"><div><span className="ticket-group__number">Pass group {index + 1}</span><h3>{pass.name}</h3></div><button className="text-button" type="button" onClick={() => setGroups(items => items.filter(item => item.id !== group.id))}>Remove</button></div>
        <label className="ticket-type-label" htmlFor={`pass-${group.id}`}>Pass type</label><select className="booking-select" id={`pass-${group.id}`} value={group.ticket} onChange={e => { const next = passFor(e.target.value); if (next) changeGroup(group.id, current => { const updated = resize(current, next, 1); return { ...updated, guests: updated.guests.map(guest => ({ ...guest, age: '' })) }; }); }}>
          {settings.passes.map(option => <option key={option.code} value={option.code} disabled={stock[option.code] <= 0}>{option.name} · {format(option.priceCents)}{option.chargeRule === 'per-person-day' ? ' / person / day' : option.chargeRule === 'per-family' ? ' / family' : ' / person'} · {stock[option.code] ?? 0} available{stock[option.code] <= 0 ? ' · sold out' : ''}</option>)}
        </select>
        <div className="ticket-group__options"><div><span className="field-label">{pass.familyComposition ? 'Number of families' : 'Number of people'}</span><div className="quantity-stepper"><button type="button" aria-label="Decrease quantity" disabled={group.quantity <= 1} onClick={() => changeGroup(group.id, current => resize(current, pass, current.quantity - 1))}>−</button><output>{group.quantity}</output><button type="button" aria-label="Increase quantity" disabled={group.quantity >= Math.min(20, stock[group.ticket] ?? 20)} onClick={() => changeGroup(group.id, current => resize(current, pass, current.quantity + 1))}>＋</button></div></div>
          <div><span className="field-label">{pass.dayRule === 'all-event-days' ? 'Dates covered' : 'Choose date(s)'}</span>{pass.dayRule === 'all-event-days' ? <p className="all-days-label">All {dates.length} event dates included</p> : <div className="date-choice-row">{event.schedule.dailyTimings.map(day => <label className={`date-choice ${group.days.includes(day.date) ? 'selected' : ''}`} key={day.date}><input type={pass.dayRule === 'single-day' ? 'radio' : 'checkbox'} name={`pass-day-${group.id}`} checked={group.days.includes(day.date)} onChange={() => changeGroup(group.id, current => ({ ...current, days: pass.dayRule === 'single-day' ? [day.date] : current.days.includes(day.date) ? current.days.length > 1 ? current.days.filter(date => date !== day.date) : current.days : [...current.days, day.date] }))} /><span>{dateLabel(day.date, timezone)}</span></label>)}</div>}</div>
        </div>{pass.familyComposition && <p className="inline-help">Each family pass includes {pass.familyComposition.adultCount} adults and {pass.familyComposition.childCount} children on one date.</p>}
        <p className="group-price-hint">{pass.dayRule === 'selected-days' ? `${group.days.length} ${group.days.length === 1 ? 'date' : 'dates'} selected` : pass.dayRule === 'all-event-days' ? `Covers all ${dates.length} event dates` : 'One selected date'} <span className="availability-pill">{remainingAfterDraft(pass.code)} left after selection</span></p>
      </article>; })}</div>
      <div className="ticket-step__bottom"><div><button className="add-guest" type="button" onClick={addGroup}>＋ Add another pass group</button><p className="free-toddler-hint">Children under {settings.ageRules.freeBelow} are free. Add them on the next step.</p></div><div className="ticket-step__actions"><span>{ticketedGuests} ticketed {ticketedGuests === 1 ? 'guest' : 'guests'}</span><button className="button button-primary" onClick={() => { setError(''); setStep(2); }}>Enter guest details →</button></div></div>
    </section>}

    {step === 2 && <section className="booking-panel"><div className="panel-heading"><div><p className="eyebrow">Step 2</p><h2>Guests & extras</h2></div><span className="step-hint">{guestCount} guest details to complete</span></div>
      <div className="guest-details-list">{groups.map(group => { const pass = passFor(group.ticket)!; const familySize = pass.familyComposition ? pass.familyComposition.adultCount + pass.familyComposition.childCount : 1; return <div className="guest-detail-group" key={group.id}><h3>{pass.name} <span>· {group.guests.length} {group.guests.length === 1 ? 'guest' : 'guests'}</span></h3>{group.guests.map((guest, index) => { const familyIndex = index % familySize; const role = pass.audience === 'family' ? familyIndex < pass.familyComposition!.adultCount ? 'Adult' : 'Child' : pass.audience === 'adult' ? 'Adult' : 'Child'; return <div className="guest-detail-row" key={index}><span className="guest-number">{pass.audience === 'family' ? `Family ${Math.floor(index / familySize) + 1} · ${role}` : `${role} ${index + 1}`}</span><label><span className="sr-only">Guest name</span><input placeholder="Full name" value={guest.name} onChange={e => changeGroup(group.id, current => ({ ...current, guests: current.guests.map((person, i) => i === index ? { ...person, name: e.target.value } : person) }))} /></label><label className="age-field"><span className="sr-only">Age</span><input type="number" min="0" max="120" placeholder="Age" value={guest.age} onChange={e => changeGroup(group.id, current => ({ ...current, guests: current.guests.map((person, i) => i === index ? { ...person, age: e.target.value } : person) }))} /></label></div>; })}</div>; })}
        <div className="guest-detail-group free-guest-group"><div className="free-guest-heading"><h3>Children under {settings.ageRules.freeBelow} <span>· free · no pass needed</span></h3><div className="quantity-stepper"><button type="button" aria-label="Remove child" disabled={!free.length} onClick={() => setFree(items => items.slice(0, -1))}>−</button><output>{free.length}</output><button type="button" aria-label="Add child under five" onClick={() => setFree(items => [...items, { ...blankGuest(), days: [dates[0]] }])}>＋</button></div></div>{free.map((guest, index) => <div className="free-child-card" key={index}><div className="guest-detail-row"><span className="guest-number">Free child</span><label><span className="sr-only">Child name</span><input placeholder="Full name" value={guest.name} onChange={e => setFree(items => items.map((person, i) => i === index ? { ...person, name: e.target.value } : person))} /></label><label className="age-field"><span className="sr-only">Child age</span><input type="number" min="0" max={settings.ageRules.freeBelow - 1} placeholder="Age" value={guest.age} onChange={e => setFree(items => items.map((person, i) => i === index ? { ...person, age: e.target.value } : person))} /></label></div><div className="day-picker free-child-days"><span>Attending</span>{event.schedule.dailyTimings.map(day => <label className="day-option" key={day.date}><input type="checkbox" checked={guest.days.includes(day.date)} onChange={() => setFree(items => items.map((person, i) => { if (i !== index) return person; const selected = person.days.includes(day.date) ? person.days.filter(date => date !== day.date) : [...person.days, day.date]; return { ...person, days: selected.length ? selected : person.days }; }))} /><span>{dateLabel(day.date, timezone)}</span></label>)}</div></div>)}</div>
      </div>
      <div className="compact-extras"><h3>Optional extras</h3><p className="text-muted">Dates follow the attendance dates selected for your guests.</p>{settings.extras.map(extra => { const choice = extras[extra.code]; const configuredDates = extra.availableDates === 'all-event-days' || !extra.availableDates ? dates : extra.availableDates; const choiceDates = configuredDates.filter(date => attendingDates.includes(date)); return <div className="config-extra" key={extra.code}><div className="config-extra__heading"><strong>{extra.name}</strong><span>{format(extra.priceCents)} per {extra.unitLabel}{extra.selectionRule === 'per-day' ? ', per day' : ''}</span></div><p className="text-muted">{extra.description}</p>{extra.selectionRule === 'quantity' ? <label className="extra-control"><span>Quantity <small>{remainingAfterDraft(extra.code)} remaining after selection</small></span><input aria-label={`${extra.name} quantity`} type="number" min="0" max={stock[extra.code] ?? extra.initialStock} value={typeof choice === 'number' ? choice : 0} onChange={e => setExtras(items => ({ ...items, [extra.code]: Math.max(0, Number(e.target.value)) }))} /></label> : choiceDates.length ? <><div className={`date-quantity-grid ${extra.selectionRule === 'per-session' ? 'date-quantity-grid--workshop' : ''}`}>{choiceDates.map(date => { const values = typeof choice === 'object' ? choice : {}; const otherSelections = Object.entries(values).reduce((sum, [key, quantity]) => sum + (key === date ? 0 : quantity), 0); const maximum = extra.selectionRule === 'per-session' ? Math.max(0, (stock[extra.code] ?? extra.initialStock) - otherSelections) : extra.maximumPerAttendee ? groups.reduce((sum, group) => sum + (group.days.includes(date) ? group.guests.length : 0), 0) + free.filter(guest => guest.days.includes(date)).length : stock[extra.code] ?? extra.initialStock; return <label key={date}><span>{dateLabel(date, timezone)}</span><input aria-label={`${extra.name} quantity for ${date}`} type="number" min="0" max={maximum} value={values[date] ?? 0} onChange={e => setExtras(items => ({ ...items, [extra.code]: { ...values, [date]: Math.max(0, Number(e.target.value)) } }))} /></label>; })}</div><small className="availability-note">{remainingAfterDraft(extra.code)} {extra.unitLabel}{remainingAfterDraft(extra.code) === 1 ? '' : 's'} remaining after selection</small></> : <p className="text-muted">Choose an attendance date for your passes to add this extra.</p>}</div>; })}</div>
      <div className="contact-section"><h3>Booking contact</h3><p className="text-muted">The person booking must be at least {settings.ageRules.bookingContactMinimum}. They don’t need to attend.</p><div className="contact-fields"><label>Name<input autoComplete="name" value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></label><label>Age<input type="number" min={settings.ageRules.bookingContactMinimum} max="120" placeholder={`${settings.ageRules.bookingContactMinimum}+`} value={contact.age} onChange={e => setContact({ ...contact, age: e.target.value })} /></label><label>Email<input type="email" autoComplete="email" value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /></label><label>Phone<input type="tel" autoComplete="tel" value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} /></label><label>Promo code <span className="optional">optional</span><input value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="Enter code" list="promo-list" /></label><datalist id="promo-list">{settings.promoCodes.map(item => <option value={item.code} key={item.code} />)}</datalist></div></div>
      <div className="step-actions"><button className="button button-secondary" onClick={() => setStep(1)}>← Edit passes</button><button className="button button-primary" disabled={busy} onClick={review}>{busy ? 'Checking…' : 'Review booking →'}</button></div>
    </section>}

    {step === 3 && quote && <section className="booking-panel review-panel"><p className="eyebrow">Step 3 · Simulated payment</p><h2>Review your booking</h2><div className="review-summary"><div><strong>Festival guests</strong><span>{guestCount} total · {groups.map(group => `${passFor(group.ticket)?.name ?? group.ticket} (${group.quantity}) · ${group.days.map(date => dateLabel(date, timezone)).join(', ')}`).join('; ')}</span></div><div><strong>Booking contact</strong><span>{contact.name} · {contact.email} · {contact.phone}</span></div></div><h3 className="price-breakdown-heading">Price breakdown <span>USD</span></h3><div className="quote-lines">{quote.lines.map((line, index) => <div className="quote-line" key={index}><span>{line.name} <small>× {line.quantity}</small></span><strong>{money(line.totalInCents, quote.currency)}</strong></div>)}<div className="quote-line"><span>Subtotal</span><strong>{money(quote.subtotalInCents, quote.currency)}</strong></div>{quote.discountInCents > 0 && <div className="quote-line discount"><span>Discount{promoCode ? ` · ${promoCode.toUpperCase()}` : ''}</span><strong>−{money(quote.discountInCents, quote.currency)}</strong></div>}<div className="quote-total"><span>Amount due</span><strong>{money(quote.totalInCents, quote.currency)}</strong></div></div><div className="availability-summary"><h3>Availability at quote time</h3>{[...settings.passes, ...settings.extras].filter(item => (quote.quantities[item.code] ?? 0) > 0).map(item => { const requested = quote.quantities[item.code] ?? 0; const available = quote.stock[item.code] ?? 0; return <div className="availability-summary__row" key={item.code}><span>{item.name} <small>{requested} in this booking</small></span><strong>{Math.max(0, available - requested)} left if confirmed</strong></div>; })}<p>Availability is checked again when you confirm.</p></div>{quote.promoMessage && <p className="promo-message">{quote.promoMessage}</p>}<p className="payment-caption">Demo checkout uses simulated payment and won’t collect card details.</p><div className="step-actions"><button className="button button-secondary" onClick={() => { setError(''); setStep(2); }}>← Edit details</button><button className="button button-primary" disabled={busy} onClick={confirm}>{busy ? 'Confirming…' : `Confirm · ${money(quote.totalInCents, quote.currency)}`}</button></div></section>}
  </div></section>;
}
