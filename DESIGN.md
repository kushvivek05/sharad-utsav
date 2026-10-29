# Sharad Utsav Booking — Design Note

**Written:** 29 October 2026, before the next implementation change.

This is the intended design at the start of that work. It records the plan, not a claim that every item is already complete.

## Domain model

I will model the event as one JSON-configured event with dates, venue and timing, age rules, pass catalog, extras, promotions, and initial inventory. Keeping those rules together lets the API and page display the same event settings and lets organizers adjust prices or capacity without changing booking logic.

A booking has one contact person and a list of attendees. Each attendee has a name and age, one ticket kind, and the event dates they will attend. A Day Pass can cover multiple selected dates for that attendee; its price and inventory use person-days. An all-event pass covers every configured date. A Family Pass is a package for two adults and two children on one selected date. Children below the configured free age are listed as free attendees and do not consume admission stock.

Extras are selections attached to the booking. Depending on their configured rule, an extra is either a booking-level quantity or a quantity for an eligible date/session. The server calculates prices in integer cents from the current JSON rules. The browser sends selections, never authoritative prices or totals. MySQL stores completed bookings and their product quantities; availability is configured initial stock minus completed sales. A quote is informational and does not reserve stock.

## Intended API

All routes are under `/api/v1`. Successful responses use `{ "success": true, "data": ... }`; failures use `{ "success": false, "error": { "code": "...", "message": "..." } }`.

| Method and path | Request | Response intent |
| --- | --- | --- |
| `GET /health` | None | Service and storage health. |
| `GET /event` | None | Public event details and configurable dates, passes, extras, age rules, and promotion options. |
| `GET /availability` | None | Current remaining stock by product code; must not be cached. |
| `POST /quote` | `{ contact, attendees, extras, promoCode? }` | Validates the draft and returns server-calculated line items, discounts, total, and an availability snapshot. Does not reserve stock. |
| `POST /bookings` | Same booking body plus `Idempotency-Key` header | Revalidates and reprices, checks and consumes stock transactionally, then returns a confirmation and price snapshot. Repeating the same key and request returns the same confirmation; reusing the key with different data is a conflict. |

A booking body is planned as `{ contact: { name, age, email, phone }, attendees: [{ name, age, ticket, days }], extras: { PRODUCT_CODE: quantity-or-date-map }, promoCode }`. Exact product codes and date eligibility come from event configuration.

## Tricky cases to handle

- A person can choose several dates for one Day Pass; charge and stock both scale by selected person-days.
- Attendee age must match the ticket class. Under-age children are free; malformed, missing, or implausible ages must be rejected. The booking contact must meet the minimum age.
- A pass or extra can sell out after the page loads or after a quote. Confirmation must recheck current stock and must never oversell, including simultaneous workshop bookings.
- Retries after a network timeout must not create duplicate bookings. Idempotency must distinguish a legitimate retry from reuse of a key for changed data.
- Extras can be restricted to selected attendance dates or specific sessions. Removing a date must not leave an invalid extra selection in the submitted payload.
- Family Pass composition, promotions (including expired and maxed-out codes), free attendees, and zero-price bookings need explicit validation and understandable messages.
- The configured stock is initial capacity, not current availability after sales. Editing configuration should not erase completed sales.

## Deliberate non-goals for this pass

I will use simulated payment and collect no card data; a real payment provider, payment reconciliation, refunds, and asynchronous payment workers are later work. I will not add authentication or an organizer/admin interface, check-in scanning, email delivery, tax handling, inventory holds with expiry, or Redis-backed queues yet. A quote will not lock stock. I will keep the initial configuration scoped to one event and avoid building a general multi-tenant event platform until the product needs it.
