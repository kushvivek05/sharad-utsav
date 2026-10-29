# Booking edge cases and expected behavior

This is the behavior checklist I would use for manual acceptance and future automated tests. It describes the current implementation; it is not a claim that every case has an automated test. All booking examples use event dates from `apps/api/config/event.json`.

| Area | Scenario | Expected app behavior |
| --- | --- | --- |
| Event configuration | Change a valid event name, price, date, or initial stock in `event.json` while using Compose | The API reads the mounted host file on the next request. Reload the booking page to fetch new event and availability data. Invalid JSON/configuration returns an API error rather than silently accepting invalid rules. |
| Availability math | Initial stock 10, sold quantity 3 | API returns 7 for that product. |
| Availability math | Reduce initial stock below already booked quantity | API returns 0 (never a negative number); new purchases for that item are rejected. Existing bookings are not deleted. |
| Sold out | Initial stock 0 (such as All-Day Adult) | UI should show no availability/disable selection; a direct quote or booking request is rejected with `409 OUT_OF_STOCK`. |
| Free-only booking | Booking contains one or more valid under-five `FREE` attendees and no paid tickets/extras | Current API can confirm a zero-total booking; the attendees consume no paid inventory. Decide whether this should remain allowed when finalizing free-child registration policy. |
| Concurrent stock | Two different bookings race for the last shared workshop place | The mutex lock serializes the commits. One can succeed; the next rechecks MySQL stock and fails with `409 OUT_OF_STOCK`. |
| Day pass | Adult selects three valid dates | Server charges three adult day-pass units and checks that many units remain. |
| Day pass | Duplicate date or date outside the configured event | Server rejects the attendee with `422`; dates must be unique and configured. |
| All-Day pass | Attendee selects all event dates | One All-Day unit is charged, not one per date. |
| All-Day pass | Request omits one event date or chooses an unknown date | Server rejects it; All-Day passes must cover every configured event date. |
| Age boundary | Age 4 uses `FREE` | No paid ticket quantity or price is added. Attendee name, age, and at least one valid date are still required. |
| Age boundary | Age 5 or 11 uses child pass | Accepted as child ticket if the other booking rules pass. |
| Age boundary | Age 12 uses adult pass | Accepted as adult ticket if the other booking rules pass. |
| Age mismatch | Age 7 tries an adult ticket, or age 15 tries a child ticket | Rejected by server validation with `422`, even if the browser is bypassed. |
| Nonsense age | Missing, string, fractional, negative, or over-120 age | Rejected; ages must be whole numbers from 0 through 120. |
| Booker eligibility | Booker age 17 | Rejected; booking contact minimum comes from event config (18 for this event). |
| Booker eligibility | Booker age 18 and not an attendee | Allowed; booking contact does not need to appear in the attendee list. |
| Family Pass | Two adults and two children, all assigned the same single date | Counts as one Family Pass inventory unit and costs the configured flat package price. |
| Family Pass | Wrong composition, split across days, or an incomplete family group | Rejected by server validation. A Family Pass attendee cannot be under five; under-five guests must use `FREE`. |
| Guest details | Quantity changes after attendee data was entered | The UI resizes guest details to match ticket quantity; removing tickets removes the excess guest fields. Server validates each submitted attendee. |
| Dandiya sticks | Integer quantity within remaining stock | Accepted and charged per pair. Quantity greater than remaining stock is rejected. |
| Dinner plates | Quantity no greater than attendees attending on that date | Accepted and charged per plate for that date. |
| Dinner plates | Quantity exceeds attendees on that date, is fractional, or uses a date outside the event | Rejected by server validation. |
| Workshop dates | Workshop chosen on Nov 11 or Nov 13 and within shared stock | Accepted; selections across both dates consume the same configured workshop inventory pool. |
| Workshop dates | Workshop chosen on another festival date | Rejected as unavailable on that date. |
| Extra quantities | Negative or fractional quantity | Rejected; extra quantities must be non-negative whole numbers. |
| Promo: percentage | `SEVA10` with a subtotal that does not divide evenly by ten cents | Discount is 10%, rounded down to whole cents. |
| Promo: fixed | `FLAT20` on a subtotal below $20 | Discount is capped at the subtotal; total cannot become negative. |
| Promo: child | `KIDSFREE` with paid child passes | Child-ticket charges are removed; adult and extra charges remain. Family Pass price is not included in the child-ticket discount. |
| Promo: unavailable | `EXPIRED5` or `MAXEDOUT` | Code is recognized and its configured expired/used-up message is shown; no discount is applied. |
| Promo: unknown | Any unconfigured code | No discount; quote includes an unrecognized-code message. |
| Tampered price | Client sends extra price/total fields or changes browser display values | Server ignores client pricing and recomputes totals from `event.json`. |
| Quote then stock changes | Another booking consumes stock after quote | Quote does not reserve inventory. Booking rechecks stock and can reject with `409 OUT_OF_STOCK`. |
| Idempotency key | Missing, too short/long, or invalid-character key | Booking rejected with `422`; the API requires 8–128 characters from `[A-Za-z0-9._:-]`. |
| Idempotency retry | Same key and same booking values/property order are retried | Original confirmation is returned; a second booking is not created. |
| Idempotency misuse | Same key is reused with a different body | Rejected with `409 IDEMPOTENCY_CONFLICT`. JSON property order affects the current request hash, so keep the serialized body unchanged on retries. |
| Persistence | API restarts after a confirmed booking | Booking and item rows remain in MySQL; remaining availability continues to reflect the sale. |
| Database outage | MySQL is unreachable | `/health` returns `503`; booking/availability requests fail without exposing database credentials or stack traces to the visitor. |
| CORS | Browser origin is present in `CORS_ORIGINS` | API permits GET/POST/OPTIONS and the `Content-Type` and `Idempotency-Key` headers. Unlisted origins are not granted CORS access. |
| Payment | Visitor presses the final confirm button | App records a `CONFIRMED` booking using simulated payment; no card details or payment provider are involved. |
| Unimplemented operations | Visitor needs email, refund, cancel, ticket QR, or staff check-in | No such workflow exists yet; see the unfinished-work list in `README.md`. |

## High-priority automated coverage to add

1. API unit tests for age boundaries, pass/day rules, extra eligibility, promo calculations, and integer-cent rounding.
2. Integration tests against MySQL for migration repeatability, rollback behavior, idempotent retries, and booking persistence.
3. A concurrency test that starts multiple independent requests for the final inventory unit and verifies exactly one succeeds.
4. Browser tests for stock display, changing ticket counts, attendee field matching, toast errors, review pricing, and confirmation.
