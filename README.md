# Sharad Utsav 2026 booking app

A booking site for Sharad Utsav at Radha Krishna Temple in Allen, Texas, November 10–14, 2026. The browser app is Next.js; booking and inventory rules are enforced by an Express API; MySQL/InnoDB stores bookings and sold quantities. The API, not the browser, calculates prices and validates bookings.

## Run locally

### Option A: Docker Compose

Install Docker Desktop, copy the example environment file, and replace both example passwords with private values:

```sh
cp docker-compose.env.example docker-compose.env
docker compose --env-file docker-compose.env up --build
```

The stack runs the site at `http://localhost:3001`, API at `http://localhost:4000/api/v1`, phpMyAdmin at `http://localhost:8080`, MySQL forwarded to port `3307`, and Redis on the private Compose network. Compose applies pending SQL migrations before starting the API. MySQL and Redis data persist in named volumes. `docker-compose.env` is ignored by Git; do not commit it.

### Option B: Next.js and Express on the host

Requirements: Node.js 20.9+ and npm. Start a MySQL server first. To use the Compose MySQL service, copy `docker-compose.env.example` as above, then run `docker compose --env-file docker-compose.env up -d mysql`.

Install dependencies and configure the API:

```sh
npm ci
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`: set `MYSQL_HOST=127.0.0.1`, `MYSQL_PORT=3307` for Compose MySQL, and set `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` to match `docker-compose.env`. The API example defaults to port 3306, which is for a locally installed MySQL server.

Build and apply migrations once, then run the API and web app in separate terminals:

```sh
npm run build --workspace=@sharad-utsav/api
npm run migrate --workspace=@sharad-utsav/api
npm run dev:api
```

```sh
cp apps/web/.env.example apps/web/.env.local
npm run dev:web
```

The web app defaults to `http://localhost:3000` and the API to `http://localhost:4000`. `CORS_ORIGINS` in `apps/api/.env` must include the browser-visible web origin. `apps/api/.env` and `apps/web/.env.local` are local-only and must not be committed.

## Environment variables

### Vercel frontend project

Set the Vercel project Root Directory to `apps/web`, then set the following project environment variable:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Public API origin plus `/api/v1`, for example `https://api.example.com/api/v1`. It is included in the browser build, so it must not contain credentials. |

This repository currently deploys the Express API as a separate Node.js service, not as a Vercel Function. Set the API variables below on that service. Set `CORS_ORIGINS` there to the exact Vercel site origin, including any custom domain. Do not put MySQL credentials in the Vercel frontend project.

Vercel supplies `NODE_ENV=production` for production deployments; the frontend does not need its own database or API secrets.

### Express API service

These are read and validated centrally by [`apps/api/src/config/env.ts`](apps/api/src/config/env.ts). `PORT` may be supplied by the API host; `MYSQL_SSL_CA` is only needed for a private database CA.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode. Production requires a non-empty `MYSQL_PASSWORD`. |
| `PORT` | `4000` | HTTP port for the Express API. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated exact browser origins allowed to call the API. |
| `MYSQL_HOST` | `127.0.0.1` | MySQL hostname. Use `mysql` from inside Compose; use `127.0.0.1` from the host. |
| `MYSQL_PORT` | `3306` | MySQL port reachable from the API. |
| `MYSQL_USER` | `root` in development; `sharad_utsav_app` in production | Database account. Use a dedicated least-privilege app account in production. |
| `MYSQL_PASSWORD` | empty in development | Database password; required in production. |
| `MYSQL_DATABASE` | `sharad_utsav` | Database containing booking tables. |
| `MYSQL_POOL_SIZE` | `10` | Maximum MySQL pool connections (1–100). |
| `MYSQL_SSL` | `false` | Enables TLS with certificate verification. |
| `MYSQL_SSL_CA` | unset | Optional path to a CA certificate file when enabling MySQL TLS. |
| `BOOKING_STORE_PATH` | `./data/booking-store.json` relative to API working directory | Optional old JSON store to import once. Not needed for a fresh install. |

### Docker Compose only

| Variable | Purpose |
| --- | --- |
| `MYSQL_ROOT_PASSWORD` | Initializes the local MySQL root account. Do not use this account in the API. |
| `WEB_PORT` | Host port for the site (example: `3001`). |
| `API_PORT` | Host port for the API (example: `4000`). |
| `MYSQL_FORWARD_PORT` | Host port for MySQL (example: `3307`). |
| `PHPMYADMIN_PORT` | Host port for phpMyAdmin (example: `8080`). |

`MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_POOL_SIZE`, and `CORS_ORIGINS` are also consumed by Compose and passed to the API. `NEXT_PUBLIC_API_BASE_URL` is a frontend **build-time** variable; rebuild the web image after changing it. Redis is provisioned but the booking code does not currently use it.

## Event configuration and inventory

Edit [`apps/api/config/event.json`](apps/api/config/event.json) for event details, date/time, passes, prices, initial stock, extras, eligibility rules, and promo codes. Compose mounts this directory into the API container read-only, so edits on the host are read on the next API request without rebuilding the API image. Reload the booking page to fetch the latest settings.

Availability is `max(0, initialStock - booked quantity in MySQL)`, not the raw `initialStock`. A quote does not reserve items; the booking endpoint locks the inventory mutex, recalculates the price, checks stock again, and commits booking and item rows in one transaction. A successful booking therefore changes availability even when `event.json` is unchanged.

Migrations are versioned SQL files in [`apps/api/migrations`](apps/api/migrations) and are tracked in `schema_migrations`. The API also applies pending migrations on first store initialization. The JSON legacy import is separately recorded as `legacy_json_bookings_v1`.

## API contract

All endpoints use the Express API base URL ending in `/api/v1`. Success responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code": "...", "message": "..." } }`. Money is integer cents. CORS permits `Content-Type` and `Idempotency-Key`.

| Method and path | Request | Success response / important errors |
| --- | --- | --- |
| `GET /health` | None | `200` when MySQL is reachable; otherwise `503 DATABASE_UNAVAILABLE`. |
| `GET /event` | None | Current public event, age, pass, extra, and promo configuration. |
| `GET /availability` | None | Remaining quantity keyed by product code. `Cache-Control: no-store`. |
| `POST /quote` | Booking payload below | Server-calculated lines, subtotal, discount, total, promo message, and availability snapshot. Does not reserve stock. Invalid inputs return `422`; insufficient stock returns `409 OUT_OF_STOCK`. |
| `POST /bookings` | Same payload and an `Idempotency-Key` header (8–128 chars; `[A-Za-z0-9._:-]`) | `201` with confirmed booking and price snapshot. Stock is rechecked and persisted transactionally. Same key and same serialized request return the original confirmation; same key with a different request returns `409 IDEMPOTENCY_CONFLICT`. |

Booking payload:

```json
{
  "contact": { "name": "Asha Patel", "age": 38, "email": "asha@example.com", "phone": "+1 555 0100" },
  "attendees": [
    { "name": "Asha Patel", "age": 35, "ticket": "DAY_ADULT", "days": ["2026-11-10"] },
    { "name": "Ravi Patel", "age": 9, "ticket": "DAY_CHILD", "days": ["2026-11-10"] }
  ],
  "extras": {
    "DANDIYA_STICKS": 1,
    "DINNER_PLATE": { "2026-11-10": 2 },
    "GARBA_WORKSHOP": { "2026-11-11": 0, "2026-11-13": 0 }
  },
  "promoCode": "SEVA10"
}
```

Ticket codes are `DAY_ADULT`, `DAY_CHILD`, `ALL_DAY_ADULT`, `ALL_DAY_CHILD`, `FAMILY_PASS`, and `FREE` (under five only). Extras use configured codes. Other notable errors: malformed booking data or missing idempotency key `422`; unsupported route `404`; idempotency conflict or stock shortage `409`; database busy/unavailable `503`; unexpected failure `500` with a generic public message.

## Decisions I made

The SRS calls out agreed technology and product decisions in Section 2.1, functional requirements in Section 8, and open decisions in Section 24. These choices guide the current implementation:

- **Separate frontend and backend:** the Next.js frontend calls a separate Express API. Keeping booking and payment logic behind the API makes it possible to add a payment provider, payment reconciliation, background workers, and scheduled jobs later. Those payment and worker/cron capabilities are not implemented yet.
- **Concurrency-safe, retry-safe booking commits:** a single InnoDB mutex row serializes booking commits while the API rechecks stock inside the transaction. A unique `idempotency_key` makes retries return the original confirmation; the request hash detects when a key is reused for different booking details. The hash itself is not unique. The current global mutex is straightforward but can limit throughput; finer-grained locks are a future improvement.
- **One Day Pass selection can cover multiple dates:** each attendee can select multiple festival dates in one booking. The pass is charged per selected person-day ($15 per adult day or $8 per child day), so the attendee does not need a separate booking for each date. Stock is counted for each selected person-day.
- **Event-based JSON rules:** `event.json` contains the event details, ticket and extra catalog, dates, prices, eligibility, stock limits, and promotion rules. The API reloads it per request, and the frontend reads the event through `/event` instead of maintaining its own prices or catalog.
- **Extra stock interpretation:** Dinner Plates use the configured 1,700 as one event-wide pool, and both workshop dates draw from the same two-place pool. The exact daily dinner allocation and workshop capacity semantics still need confirmation.
- **Free children are registered:** ages below five are represented as `FREE` attendees with name, age, and selected dates, but consume no admission stock. This is the working choice for door lists; whether these children need registration/check-in remains an open product decision.
- **Simulated payment for now:** a valid booking is immediately marked `CONFIRMED`; no card data is collected and no external payment provider is integrated.

## Unfinished work and limitations

- No real payment processing, payment reconciliation, refund/cancellation workflow, or email confirmation is implemented.
- Confirmation is a booking code only; downloadable tickets, attendee entitlements, door check-in scanning, and volunteer/admin tools are not implemented.
- Authentication, authorization, audit/admin controls, tax handling, and privacy/retention policy are not implemented.
- There is no reservation hold/expiry flow. Availability can change between quote and confirmation; the booking endpoint handles that by rejecting stale quantities.
- The current catalog/config is for one event, and bookings do not store a configuration version or normalized event/product IDs. Historical price details are retained in the booking quote snapshot, but the SRS’s full multi-event/config-version design is unfinished.
- Redis runs in Compose but is unused by the application.
- This repository does not configure the Express API as a Vercel Function; it needs a separate Node-compatible API deployment and reachable MySQL database.
- `TEST-CASES.md` is a proposed manual/acceptance checklist, not proof that every case has an automated test. No automated test suite is currently configured.
- Production deployment, load/concurrency targets, operational monitoring, backups, and a real launch environment are not configured or verified.
