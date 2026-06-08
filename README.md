# POCKET - The Shawarma Spot

Production-ready starter for a branded food ordering platform with:

- `apps/web`: Next.js 14 customer site and admin portal
- `apps/api`: Express + Prisma REST API
- `prisma/`: PostgreSQL schema and seed data
- Dockerized local stack and multi-branch ready data model

## Stack

- Next.js + TypeScript + TailwindCSS
- Express.js + TypeScript
- PostgreSQL + Prisma
- JWT auth with role-based access
- Docker + Docker Compose

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
├── docker-compose.yml
├── Dockerfile.api
├── Dockerfile.web
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

2. Install dependencies:

```bash
npm install
```

3. Start PostgreSQL with Docker:

```bash
docker compose up -d db
```

4. Generate Prisma client and apply schema:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

5. Seed demo data:

```bash
npm run prisma:seed
```

6. Start the platform:

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
- Move JWT storage to secure httpOnly cookies if web and API are deployed on the same parent domain.
- Add payment gateway adapters behind the existing `PaymentMethod` model before enabling card/JazzCash/EasyPaisa.
- Add Redis for caching and queue-backed order notifications when live traffic increases.
- Add branch routing logic based on delivery zone polygons once multiple outlets are active.
- Configure CDN-backed media storage for uploaded product images.

## Docker

### Local build from source

If someone has the repo and Docker installed, they can run the whole stack without installing Node, Prisma, or PostgreSQL locally:

```bash
docker compose up --build -d
```

That starts:

- `db` on `localhost:5435`
- `api` on `localhost:4000`
- `web` on `localhost:3000`

The API container automatically:

1. waits for Postgres
2. runs `prisma migrate deploy`
3. runs the seed routine once

The seed is guarded by a marker (`system.seed.version`), so normal restarts do not duplicate data.

### Publish to Docker Hub

Yes, this is a good fit for Docker Hub. The practical setup is:

- one image for `web`
- one image for `api`
- one PostgreSQL container from the official image

That way the target machine only needs Docker and a compose file.

Build and push the images:

```bash
docker build -f Dockerfile.api -t yourdockerhubusername/pocket-api:latest .
docker build -f Dockerfile.web -t yourdockerhubusername/pocket-web:latest .

docker push yourdockerhubusername/pocket-api:latest
docker push yourdockerhubusername/pocket-web:latest
```

### Run prebuilt images from Docker Hub

1. Copy the Hub env template:

```bash
cp .env.docker-hub.example .env.docker-hub
```

2. Set your pushed image names in `.env.docker-hub`:

```bash
POCKET_API_IMAGE=yourdockerhubusername/pocket-api:latest
POCKET_WEB_IMAGE=yourdockerhubusername/pocket-web:latest
```

3. Start everything:

```bash
docker compose --env-file .env.docker-hub -f docker-compose.hub.yml up -d
```

That is the simplest consumer flow. They do not need to install:

- Node.js
- npm
- Prisma CLI
- PostgreSQL

They only need Docker.

### Optional updates for a fresh seed

If you want the containerized stack to reseed a fresh database version:

```bash
SEED_VERSION=2
```

or force reseeding:

```bash
FORCE_SEED=true
```

Use that only when you intentionally want the seed routine to run again.

### Recommended Production Topology

1. Deploy PostgreSQL as a managed service.
2. Run Prisma migrations in CI/CD before application rollout.
3. Deploy `apps/api` behind a reverse proxy with HTTPS and env-secret management.
4. Deploy `apps/web` as a separate service pointing to the API base URL.
5. Add centralized logging and alerting for orders, failed auth, and low-stock events.

## Future Expansion

- Multi-branch delivery zones and rider assignment
- Payment provider adapters
- Inventory deduction on order confirmation
- Branch-specific promotional campaigns
- Mobile apps using the same API domain contracts
