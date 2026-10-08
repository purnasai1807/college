# College Canteen

A student-friendly canteen ordering application: browse the menu, reserve a pickup slot and counter, pay through Razorpay UPI checkout, follow kitchen progress, and collect with a one-time QR code. PostgreSQL is the source of truth for users, orders, payments, inventory, pickup capacity, and audit events.

## What is included

- Student menu search, categories, favorites, cart, checkout, order history, tracking, digital receipts, and in-app notifications.
- Password-based student/staff/admin sign-in, registration, password reset, signed HTTP-only sessions, role checks, and owner-scoped order access.
- Multi-campus and multi-canteen student selection, with tenant-scoped admin, kitchen, pickup, and reporting operations.
- Admin dashboard for menu and stock, counter/slot/staff management, canteen opening status, searchable kitchen orders, reports, settlement CSV export, refunds, and payment reconciliation.
- Kitchen order board with live updates and batched item totals; counter QR scanner with manual order-number lookup.
- PostgreSQL/Prisma persistence, expiring inventory and slot reservations, order/payment state transitions, audit logs, and signed, single-use pickup tokens.
- Razorpay payment-provider adapter, hosted checkout, signed webhook processing, idempotency, amount/currency checks, and provider-backed refunds.

The UI is intentionally straightforward and mobile-first. It is an operational application, not an AI-generated-content product or a static mockup. Real payment confirmation and refunds require a configured Razorpay account; there is no client-side “paid” action or simulated payment success.

### Why TypeScript/TSX instead of Python?

`.tsx` is used for the React pages and components because it combines the browser UI with type-checked JSX. The backend in this version is not TSX: Next.js API routes and business services are regular TypeScript (`.ts`) and handle PostgreSQL, authentication, orders, Razorpay webhooks, refunds, inventory, and QR validation on the server. Keeping the UI and API in one Next.js application gives this deployment one server and one language toolchain. Python/FastAPI could also implement the backend, but would require a separate service and an API integration/migration; adding an unused Python service would not make this app more functional. No AI features are required or used in the canteen ordering flow.

## Run locally

Requirements: Node.js 20+, npm, and PostgreSQL 14+.

1. Copy `.env.example` to `.env`; set `DATABASE_URL`, a random `AUTH_SECRET`, and the application URL.
2. Install packages: `npm install`.
3. Create/update the database schema: `npm run db:push`.
4. Create the initial canteen and, if configured, the first super-admin: `npm run db:bootstrap`.
5. Start Next.js: `npm run dev`.

For Docker, set `DB_PASSWORD` and `AUTH_SECRET` in `.env`, then run `docker compose up --build`. Compose starts PostgreSQL, waits for its health check, applies committed Prisma migrations, bootstraps the first canteen/admin, and starts the app on port 3000.

### First administrator

Set `ADMIN_EMAIL` and an `ADMIN_PASSWORD` of at least 12 characters before the first bootstrap. The app creates a super-admin only when no super-admin exists. Keep credentials in an untracked `.env` or deployment secret store; never use a shared development password in production. After login, open `/admin` to add menu items, counters, pickup slots, and staff.

## UPI payments and webhooks

The integration uses Razorpay's Orders API and hosted checkout; the browser only opens checkout and cannot mark an order paid. The backend validates Razorpay's webhook signature, event ID, provider order ID, amount, and currency before changing payment/order state and issuing the pickup QR.

1. Create a Razorpay account and use **test keys** while developing.
2. Set `PAYMENT_PROVIDER_KEY`, `PAYMENT_PROVIDER_SECRET`, and `PAYMENT_WEBHOOK_SECRET` in `.env` or the deployment secret store.
3. Configure a publicly reachable HTTPS webhook at `/api/payments/webhook` for `payment.captured` and `refund.processed`, using the same webhook secret.
4. Use Razorpay's test UPI methods and verify captured payments through the webhook. A local webhook can be forwarded with a secure development tunnel.
5. Before accepting real payments, configure live credentials, HTTPS, the production webhook, account settlement, and refund policies in the provider dashboard.

Do not put provider secrets in `NEXT_PUBLIC_*` variables or the browser. Checkout availability is not proof of payment: the signed provider webhook is authoritative. If a payment arrives after an order hold expires, it is recorded and flagged for reconciliation rather than silently restoring the cancelled order.

## Database and account setup

`prisma/schema.prisma` defines campuses/canteens, counters, tenant-assigned users, food, inventory quantities, pickup slots, orders, payments, webhook events, QR tokens, notifications, audit logs, refunds, favorites, password resets, shared rate-limit buckets, and realtime events. Migrations are in `prisma/migrations`. For local schema iteration, use `npm run db:push`; for deployment, use `npm run db:migrate` (`prisma migrate deploy`).

Rate limiting and realtime invalidation use PostgreSQL so separate app instances share the same state. Realtime delivery polls the shared event table while an SSE connection is open; keep the database connection pool sized for the expected number of concurrent streams. Food image upload is optional and uses an S3-compatible bucket: configure the `IMAGE_STORAGE_*` variables, allow browser POST uploads from the app origin in the bucket CORS policy, and serve uploaded keys from `IMAGE_STORAGE_PUBLIC_URL`. For AWS, prefer the deployment's workload identity rather than static access keys. Uploads are restricted to JPEG, PNG, and WebP files up to 5 MB.

Optional email-based password-reset links use Resend: set `RESEND_API_KEY` and `MAIL_FROM`. Without an email provider, the application reports that reset email is unavailable; reset links are not exposed as successful email delivery.

## Main screens and APIs

| Screen | Route | Purpose |
| --- | --- | --- |
| Student menu and cart | `/` | Browse/search food, favorites, choose counter/slot, checkout |
| Sign in | `/login` | Student, staff, kitchen, and admin authentication |
| Orders and tracking | `/orders`, `/orders/[id]` | History, status, receipt, pickup QR, reorder |
| Kitchen | `/kitchen` | Accept, prepare, and mark paid orders ready |
| Counter pickup | `/scan` | Scan QR or look up an order and verify collection |
| Admin | `/admin` | Orders, menu, stock, counters, staff, settings, refunds |
| Reports | `/admin/reports` | Sales, payment, item, and inventory summaries/CSV |

API route handlers live under `src/app/api`. Important flows include `/api/orders`, `/api/payments/webhook`, `/api/pickup/verify`, `/api/pickup/collect`, and the `/api/admin/*` endpoints. Student order reads are restricted to the signed-in user's own orders; kitchen and collection actions require the appropriate role. Collection is an atomic backend transition and cannot be repeated.

## Configuration

See `.env.example` for the full variable list. Required for a deployed application:

- `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`
- `PAYMENT_PROVIDER_KEY`, `PAYMENT_PROVIDER_SECRET`, `PAYMENT_WEBHOOK_SECRET` for payment checkout
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` for first-run administrator provisioning
- `DB_PASSWORD` for the provided Docker Compose PostgreSQL service

The app uses INR/Asia-Kolkata conventions for canteen slots and payment currency. Set and verify opening hours, cancellation/refund rules, staff permissions, and slot capacity with the actual canteen before launch.

## Test and build

- `npm test` runs the pickup-token and webhook-signature tests; with `TEST_DATABASE_URL`, it also exercises PostgreSQL concurrency, tenant-isolation, and shared-rate-limit tests.
- Point `TEST_DATABASE_URL` only at a disposable PostgreSQL database. Never run integration tests against production data.
- `npm run lint` runs the strict TypeScript check.
- `npm run build` generates Prisma Client and builds Next.js.

## Production launch checklist

1. Provision managed PostgreSQL, enable encrypted connections and automated backups, and set its connection URL as `DATABASE_URL`.
2. Configure the production app URL and a randomly generated `AUTH_SECRET` (at least 32 bytes), plus `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` (at least 12 characters) in the hosting provider's secret store.
3. Deploy the app, apply migrations with `npm run db:migrate`, and run `npm run db:bootstrap` once to create the campus, canteen, main counter, and initial super-admin. Do not run the demo `npm run db:seed` in production.
4. Test with Razorpay test keys first. For live checkout, complete the provider's account/KYC process, configure live keys as secrets, and register the production HTTPS endpoint `/api/payments/webhook` for `payment.captured` and `refund.processed`.
5. If menu image uploads are required, configure the `IMAGE_STORAGE_*` secrets, public bucket URL, and bucket CORS policy. Otherwise uploads remain explicitly unavailable while menu image URLs still work.
6. Configure monitoring/alerts, database pool capacity for open SSE connections, and retention policies. Have students, kitchen staff, and counter staff test the full order, cancellation/refund, and pickup flow before opening orders.

Do not deploy live payments without valid provider credentials and a verified public HTTPS webhook. Live payment/refund processing and camera scanning require the corresponding provider account, deployed endpoint, and browser/device and cannot be tested by CI alone.
