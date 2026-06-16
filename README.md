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
- Multi-branch ready foundation for Islamabad today and Lahore/Karachi later
- SEO basics: metadata, Open Graph, Twitter cards, sitemap, and robots
- Security baseline: password hashing, JWT auth, origin-based CSRF mitigation, rate limiting, Helmet, input validation, Prisma-backed query safety, and audit logs

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

## Production Notes

- Replace demo asset artwork with professional brand photography or generated campaign imagery before launch.
- Set `WEB_ORIGINS` on the backend to include every production frontend origin, for example `https://pocketpakistan.com,https://www.pocketpakistan.com`.
- Move JWT storage to secure httpOnly cookies if web and API are deployed on the same parent domain.
- Add payment gateway adapters behind the existing `PaymentMethod` model before enabling card/JazzCash/EasyPaisa.
- Add Redis for caching and queue-backed order notifications when live traffic increases.
- Add branch routing logic based on delivery zone polygons once multiple outlets are active.
- Configure CDN-backed media storage for uploaded product images.

## Future Expansion

- Multi-branch delivery zones and rider assignment
- Payment provider adapters
- Inventory deduction on order confirmation
- Branch-specific promotional campaigns
- Mobile apps using the same API domain contracts
