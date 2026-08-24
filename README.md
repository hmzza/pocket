# POCKET - The Shawarma Spot

Production-ready starter for a branded food ordering platform with:

- `apps/web`: Next.js 14 customer site and admin portal
- `apps/api`: Express + Prisma REST API
- `prisma/`: PostgreSQL schema and seed data
- multi-branch ready data model for future outlet expansion

## Stack

- Next.js + TypeScript + TailwindCSS
- Express.js + TypeScript
- PostgreSQL + Prisma
- JWT auth with role-based access
- Origin allowlisting for both apex and `www` frontend domains in production

## Project Structure

```text
.
├── apps
│   ├── api
│   │   └── src
│   └── web
│       ├── app
│       ├── components
│       ├── lib
│       └── public/images
├── prisma
│   ├── schema.prisma
│   └── seed.ts
└── .env.example
```

## Delivered Features

- Customer storefront with landing page, menu, product details, search, cart, checkout, order tracking, favorites, recently viewed, and account dashboard
- Admin portal with login, dashboard, products, orders, customers, analytics, and CMS views
- REST API for auth, catalog, customer cart/checkout, orders, admin reporting, products, categories, coupons, notifications, and CMS
- PostgreSQL schema covering users, roles, branches, branch pricing, orders, carts, reviews, favorites, coupons, notifications, settings, CMS, suppliers, ingredients, and inventory
- Delivery and takeaway ordering on the website, rider management, dispatch with WhatsApp notifications, and cash-on-delivery reconciliation (see Delivery & Takeaway below)
- Multi-branch ready foundation for Islamabad today and Lahore/Karachi later
- SEO basics: metadata, Open Graph, Twitter cards, sitemap, and robots
- Security baseline: password hashing, JWT auth, origin-based CSRF mitigation, rate limiting, Helmet, input validation, Prisma-backed query safety, and audit logs

## Delivery & Takeaway

Customers can order on the website for delivery or takeaway without an account.
Staff accept the order, assign a rider, and notify them on WhatsApp.

### Online ordering is closed by default

`addToCart` used to be hardcoded to refuse, showing a notice that pointed
customers at Foodpanda. That is now the `ordering.online` setting, and it still
defaults to **closed**, so deploying changes nothing until someone opens it.

Open it from **Admin → Website Control → Online ordering**. The closed notice is
editable there too. The switch is enforced by `POST /api/checkout` as well as the
storefront, and every failure path (absent key, malformed value, failed request)
is treated as closed.

While ordering is closed, customers can still browse the menu and track an
existing order.

### Customer flow

1. Choose **Delivery** or **Takeaway** at checkout. Takeaway needs no address and
   is charged no delivery fee.
2. Give a name and a Pakistani mobile number. Email is optional; the phone is the
   guest identity, so the same person ordering as `0300-1234567` and
   `+92 300 1234567` is one customer, not two.
3. Cash on delivery, or cash on pickup for takeaway.
4. The order number is shown on its own confirmation screen and can be looked up
   later at `/track` with the order number plus that phone number.

Repeat submissions carry a `clientRequestId`, so a double click or a retry after a
dropped response returns the original order instead of creating a second one.

### Staff flow

1. A new order arrives as **Awaiting Acceptance**, and both the admin Orders page
   and the POS queue sound a repeating alert until someone deals with it. Either
   screen can accept it, so whichever one staff are sitting on works. Browsers block audio until the page has
   been clicked once, so the banner offers **Enable alert sound** when that
   happens; the alert can be silenced per browser and the choice is remembered.
2. **Accept** moves it to the **Preparing** queue. Rejecting needs a reason,
   which is then shown against the order.
3. A rider can be assigned at any point from here. Nothing is sent yet, and
   Dispatch says the rider is waiting on the kitchen.
4. **Ready** is the trigger: the moment the order is marked ready, from Orders or
   the POS queue, the assigned rider is messaged to come and collect it.
5. Dispatch then advances the delivery: picked up, on the way, delivered.

| Screen | What it does |
|---|---|
| **Orders** | Delivery/Takeaway filters, the Awaiting/Preparing/Ready queues, accept, reject, mark ready, and the audible alert |
| **POS queue** | The same audible alert, with Accept and Ready on each order, for staff working the counter screen |
| **Riders** | Rider records: contact, CNIC, licence, vehicle, duty status |
| **Dispatch** | Assign and reassign riders, send the WhatsApp, advance each delivery to the door |

An order must be accepted before a rider can be assigned. Assigning does not move
the order to *out for delivery*; that happens when the rider actually has the
food. A failed delivery returns the order to *ready* with a reason, because the
food exists and someone has to decide what happens to it. Reassigning an order
that is already out for delivery also puts it back to *ready*, since it is up for
collection again.

### Rider WhatsApp notifications

The rider is called out when the order is marked **Ready**, not when they were
assigned, so nobody is sent for food that is not cooked yet. Both conditions have
to hold: a rider is assigned and the order is ready, and whichever happens second
sends the message. The call-out carries the order number, customer name, contact
number, address, items, and the cash to collect. Reassignment sends the previous
rider a message telling them not to deliver it, and calls the incoming rider in.

Two providers, chosen with `WHATSAPP_PROVIDER`:

- **`deeplink`** (default) prepares a `wa.me` link for an admin to open and send.
  No Meta account, no verified number, no approved templates. Messages show as
  *not sent yet* until someone clicks, and the Dispatch board says plainly that
  sending is manual and counts what is still waiting.
- **`cloud-api`** sends automatically. Needs a Meta Business account, a verified
  WhatsApp number and its phone number id, a system-user token, and approved
  message templates. Business-initiated messages outside the 24-hour service
  window are rejected as free text, so in practice the template names are
  required, not optional. See `.env.example`.

Nothing about an assignment depends on a message succeeding. Failures are
recorded on the message row with a retry, and a failed automatic send still
leaves a `wa.me` fallback so the rider can be reached by hand.

> The `cloud-api` HTTP path has not been exercised against a live WhatsApp
> Business account, because no credentials exist for this project. Its request
> shape and failure handling are covered by offline tests; treat the first real
> send as the actual test.

### Cash on delivery and the daily close

Cash on delivery counts toward Daily Closing and Cash Position, but only once
collected, and on the day the rider handed it in rather than the day the order was
placed. An order taken late and delivered after midnight would otherwise land on a
day that is already closed.

An order whose delivery is still open is not counted even if it has been marked
paid early, because the money is with the customer.

### Built to extend, not built yet

| Reserved | Where |
|---|---|
| Live GPS tracking | `DeliveryLocation` table and the `Delivery.last*` columns, written by nothing today |
| Customer-facing live tracking | `Delivery.trackingToken`, unique per delivery; `/track` is where it would render |
| Customer accounts | Guest checkout already creates a customer row keyed on phone, so claiming an account later is a password, not a migration |
| Rider app login | `Rider.userId` and `RoleCode.RIDER`, both unassigned |
| Automatic WhatsApp | Set `WHATSAPP_PROVIDER=cloud-api` and the template variables; no code change |

Known gaps, deliberately not built: delivery zones or distance-based fees (there is
one flat `Branch.deliveryFee`), a rider cash settlement ledger, store opening-hours
gating on the public checkout, and delivery orders taken at the POS counter.

## Local Development

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Update `DATABASE_URL` in `.env` so it matches your local PostgreSQL user, password, port, and database.

Example:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pocket?schema=public"
```

3. Create the database in local PostgreSQL:

```bash
createdb pocket
```

4. Install dependencies:

```bash
npm install
```

5. Generate Prisma client and apply schema:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

6. Seed demo data:

```bash
npm run prisma:seed
```

7. Start the platform:

```bash
npm run dev
```

Frontend: `http://localhost:3000`

API: `http://localhost:4000`

## Seeded Credentials

- Admin: `admin@pocketshawarma.com`
- Admin password: `PocketAdmin123!`
- Customer: `customer@pocketshawarma.com`
- Customer password: `PocketCustomer123!`

## API Overview

### Public

- `GET /health`
- `GET /api/content/home`
- `GET /api/products`
- `GET /api/products/:slug`
- `GET /api/categories`
- `GET /api/search?q=shawarma`
- `GET /api/branches`
- `POST /api/coupons/validate`
- `GET /api/track/:orderNumber`

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Customer

- `GET /api/customer/profile`
- `PATCH /api/customer/profile`
- `GET /api/customer/cart`
- `POST /api/customer/cart/items`
- `PATCH /api/customer/cart/items/:itemId`
- `DELETE /api/customer/cart/items/:itemId`
- `GET /api/customer/favorites`
- `POST /api/customer/favorites/:productId`
- `DELETE /api/customer/favorites/:productId`
- `GET /api/customer/orders`
- `POST /api/customer/checkout`

### Admin

- `GET /api/admin/dashboard`
- `GET /api/admin/analytics/sales`
- `GET /api/admin/products`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PATCH /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/:id/status`
- `GET /api/admin/customers`
- `GET /api/admin/coupons`
- `POST /api/admin/coupons`
- `GET /api/admin/cms`
- `PUT /api/admin/cms/:key`
- `GET /api/admin/notifications`
- `POST /api/track`
- `GET /api/admin/riders`
- `POST /api/admin/riders`
- `PATCH /api/admin/riders/:id`
- `PATCH /api/admin/riders/:id/availability`
- `DELETE /api/admin/riders/:id`
- `GET /api/admin/deliveries`
- `POST /api/admin/deliveries/assign`
- `POST /api/admin/deliveries/:id/reassign`
- `POST /api/admin/deliveries/:id/status`
- `POST /api/admin/deliveries/messages/:id/retry`
- `POST /api/admin/deliveries/messages/:id/sent`

## Production Notes

- Replace demo asset artwork with professional brand photography or generated campaign imagery before launch.
- Set `WEB_ORIGINS` on the backend to include every production frontend origin, for example `https://pocketpakistan.com,https://www.pocketpakistan.com`.
- Move JWT storage to secure httpOnly cookies if web and API are deployed on the same parent domain.
- Add payment gateway adapters behind the existing `PaymentMethod` model before enabling card/JazzCash/EasyPaisa.
- Add Redis for caching and queue-backed order notifications when live traffic increases.
- Add branch routing logic based on delivery zone polygons once multiple outlets are active.
- Configure CDN-backed media storage for uploaded product images.

## Future Expansion

- Multi-branch delivery zones (rider assignment is built; zone-based routing and distance pricing are not)
- Payment provider adapters
- Inventory deduction on order confirmation
- Branch-specific promotional campaigns
- Mobile apps using the same API domain contracts
