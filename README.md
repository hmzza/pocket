# Pocket - The Shawarma Spot

Pocket is a multi-branch food ordering and operations platform for a shawarma
business. It includes a public customer website, an authenticated admin portal,
and a cashier-focused POS workspace backed by one Express API and PostgreSQL
database.

## Repository

```text
.
|-- apps
|   |-- api       Express + Prisma REST API
|   |-- web       Next.js customer site, admin portal, and POS
|   `-- desktop   Electron wrappers for the POS and Admin workspaces
|-- prisma        Schema, migrations, and local seed scripts
|-- scripts       Deployment and permission-registry validation scripts
|-- ecosystem.config.js
`-- .env.example
```

## Stack

- Next.js 14, React, TypeScript, and Tailwind CSS
- Express, TypeScript, and Zod validation
- PostgreSQL and Prisma
- JWT authentication with HTTP-only cookies
- Branch-scoped data access and centralized route permissions
- Helmet, CORS allowlisting, CSRF checks, rate limits, and audit logging

## Current Product Areas

### Public website

- Branch-aware catalog, prices, availability, search, menu, cart, and product pages
- Guest checkout without requiring customer login or signup
- Delivery and pickup checkout modes
- Pakistan-time shop and delivery availability banners and schedules
- Delivery sectors and generated sub-sectors
- Pickup slots within the current shop-hours window, plus Fast pickup
- Cash on Delivery for delivery orders and pay-at-counter pickup orders
- Branch-specific coupons and server-side checkout validation
- Product customization, meal customization for supported products, and Box of 6
- Order tracking, receipts, and responsive customer navigation

### POS

- Counter checkout for dine-in, takeaway, delivery, Foodpanda, and online pickup orders
- Active order queue, watch-later flow, order history, editing, deletion, receipts,
  payment status, and payment-method capture
- Delivery rider assignment and WhatsApp dispatch
- Pickup orders enter the queue as takeaway orders and show their requested pickup time
- Realtime incoming delivery and pickup notifications with browser sound controls
- Branch-specific catalog, pricing, availability, and product ordering

### Admin portal

Main routes include:

- Overview
- Business Analytics and Product Analytics
- Products and branch-specific product ordering
- Website Control
- Promotions and coupon management
- Users and staff permissions
- Inventory
- Orders, Order Audit, Customers, and Delivery
- Expenses
- Capital: Loans, Investments, and Savings
- Finances, Daily Closing, and Foodpanda Settlements
- Foodpanda
- Business Health

Admin and POS access are controlled through the permission registry in
`apps/api/src/lib/permissions.ts`. Super Admin has unrestricted access to
registered routes. Staff accounts receive only explicitly selected permissions.
Riders are user accounts for delivery assignment and do not receive admin or
POS permissions.

## Business Rules

- Reporting uses Pakistan time (`Asia/Karachi`) with a 6:00 AM to 6:00 AM
  business day.
- The selected branch is held in the shared branch context. Super Admin can
  switch branches; other users are restricted to assigned branches.
- Product catalog prices and availability are branch-specific through
  `BranchProduct`.
- Daily Closing reconciles Cash, Easypaisa, and JazzCash, including sales,
  expenses, loans, investments, transfers, additions, savings movements, and
  expected-versus-actual differences.
- Inventory deduction is controlled by a branch-specific toggle. Stock purchases
  and explicit inventory actions remain available when order deduction is paused.
- Inventory recipes support raw ingredients, retail items, nested prep items,
  weighted-average purchase costing, and automatic complete-batch prep production.
- Expense title favorites are branch-specific, retain their category, and can be
  removed without changing historical expense records.
- Packaging is retained for compatibility but excluded from current stock
  deduction and recipe costing.
- Deployments run migrations and builds only. Production catalog data is not
  reseeded or overwritten during deployment.

## Local Development

1. Copy the environment template and set a local PostgreSQL connection:

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pocket?schema=public"
```

2. Install dependencies:

```bash
npm install
```

3. Generate Prisma Client and apply migrations:

```bash
npx prisma generate
npx prisma migrate dev
```

4. For a fresh local/demo database only, run the seed:

```bash
npm run prisma:seed
```

The seed is for local setup. It must not be used as a production deployment
step because production catalog prices, images, availability, recipes, and
operational history must remain unchanged.

5. Start the API and website:

```bash
npm run dev
```

- Website: `http://localhost:3000`
- API: `http://localhost:4000`
- Admin login: `http://localhost:3000/admin/login`
- POS login: `http://localhost:3000/pos/login`

The public website does not expose the admin login in its customer footer.

## Environment

See `.env.example` for the supported variables:

- `DATABASE_URL`
- `API_PORT`
- `WEB_URL`
- `WEB_ORIGINS`
- `API_URL`
- `JWT_SECRET`
- `AUTH_SESSION_DAYS` (default: 30; controls both JWT and browser-cookie lifetime)
- `TRUST_PROXY`
- `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`
- `INITIAL_POS_EMAIL` and `INITIAL_POS_PASSWORD`

Bootstrap credentials are environment-controlled. Do not commit production
credentials or reuse local demo passwords in production.

## Useful Commands

```bash
npm run lint
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run validate:permissions
```

The permission validation command checks protected admin API routes against the
central permission registry.

## API Surface

The API is mounted under `/api` and includes:

- Public catalog, branches, storefront status, coupons, tracking, receipts, and checkout
- Auth login, admin login, POS login, logout, and session inspection
- Customer profile, cart, favorites, and order compatibility endpoints
- Admin dashboard, analytics, products, categories, promotions, coupons, website
  settings, users, branches, inventory, recipes, expenses, finance, daily closing,
  capital, delivery, order audit, customers, Foodpanda, and settlements
- POS catalog, checkout, order editing, lookup, receipts, and promotion data
- Operations queue, realtime incoming-order events, rider assignment, order status,
  payment status, receipt events, and permanent order deletion

Routes are implemented in `apps/api/src/routes`. Branch and permission checks are
enforced server-side; client-supplied branch values are not trusted for access
control.

## Deployment

`scripts/deploy.sh` is used by the deployment workflow. It:

1. Checks out the requested commit.
2. Restores environment files kept outside the repository.
3. Runs `npm ci`.
4. Generates Prisma Client and runs `prisma migrate deploy` for the API.
5. Builds the selected workspace.
6. Reloads the PM2 process and performs a health check.

It does not run `prisma:seed`.

Database migrations are additive unless explicitly reviewed otherwise. A failed
deployment can roll back application code, but an already-applied database
migration is not automatically rolled back.

## Documentation Rule

When adding or changing a user-facing route, admin tab, POS workflow, API
contract, data model, permission, or business-day rule, update this README in
the same change. Keep the feature list, route notes, setup commands, and any
operational safety notes aligned with the implementation.

For desktop-specific packaging and printer instructions, see
`apps/desktop/README.md`.
