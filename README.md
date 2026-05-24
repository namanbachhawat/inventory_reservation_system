# 📦 Inventory Reservation System

A production-ready inventory reservation system built with Next.js, featuring **concurrency-safe stock reservations**, **idempotent API operations**, and **automatic expiry cleanup**.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │ Product List  │  │ Reservation Detail          │   │
│  │  + Reserve    │  │  + Countdown + Confirm/     │   │
│  │    Modal      │  │    Cancel                   │   │
│  └──────────────┘  └────────────────────────────┘   │
└────────────────────────┬────────────────────────────┘
                         │ SWR / fetch
┌────────────────────────▼────────────────────────────┐
│              Next.js API Route Handlers              │
│  ┌──────────┐ ┌──────────────┐ ┌────────────────┐   │
│  │ Products │ │ Reservations │ │ Cron: Expire   │   │
│  │ GET      │ │ POST/Confirm │ │ Reservations   │   │
│  │          │ │ /Release     │ │ (every 5 min)  │   │
│  └──────────┘ └──────┬───────┘ └────────────────┘   │
│                      │                               │
│     ┌────────────────▼────────────────────┐          │
│     │  Idempotency Layer                  │          │
│     │  (Check IdempotencyRecord table)    │          │
│     └────────────────┬────────────────────┘          │
│                      │                               │
│     ┌────────────────▼────────────────────┐          │
│     │  Concurrency Control                │          │
│     │  SELECT ... FOR UPDATE              │          │
│     │  Serializable Transaction           │          │
│     └────────────────┬────────────────────┘          │
└──────────────────────┼───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│              Neon PostgreSQL (Hosted)                  │
│  ┌─────────┐ ┌───────────┐ ┌───────────┐            │
│  │ Product │ │ Inventory │ │Reservation│            │
│  │         │ │(row lock) │ │           │            │
│  └─────────┘ └───────────┘ └───────────┘            │
│  ┌───────────┐ ┌───────────────────┐                 │
│  │ Warehouse │ │IdempotencyRecord  │                 │
│  └───────────┘ └───────────────────┘                 │
└──────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer      | Technology                            |
| ---------- | ------------------------------------- |
| Framework  | Next.js 16 (App Router)               |
| Language   | TypeScript (strict mode)              |
| ORM        | Prisma v7 + @prisma/adapter-pg        |
| Database   | PostgreSQL on Neon (hosted)            |
| Cache      | Upstash Redis (distributed locking)   |
| Validation | Zod (shared between API + frontend)   |
| UI         | Tailwind CSS v4 + shadcn/ui           |
| Hosting    | Vercel                                |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) PostgreSQL database
- An [Upstash](https://upstash.com) Redis instance (optional for local dev)

### 1. Clone & Install

```bash
git clone https://github.com/namanbachhawat/inventory_reservation_system.git
cd inventory_reservation_system
npm install
```

### 2. Environment Variables

Copy the example and fill in your values:

```bash
cp .env.example .env
```

| Variable                    | Description                         |
| --------------------------- | ----------------------------------- |
| `DATABASE_URL`              | Neon PostgreSQL connection string    |
| `UPSTASH_REDIS_REST_URL`    | Upstash Redis REST URL              |
| `UPSTASH_REDIS_REST_TOKEN`  | Upstash Redis REST token            |
| `CRON_SECRET`               | Secret for Vercel cron auth         |

### 3. Set Up Database

```bash
npx prisma db push      # Push schema to Neon
npx prisma generate      # Generate Prisma client
npx prisma db seed       # Seed with sample data
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## API Reference

### `GET /api/products`

Returns all products with per-warehouse stock availability.

```json
[
  {
    "id": "clx...",
    "name": "Wireless Headphones",
    "sku": "WH-001",
    "inventory": [
      {
        "warehouseId": "clx...",
        "warehouseName": "London Warehouse",
        "available": 40,
        "total": 45,
        "reserved": 5
      }
    ]
  }
]
```

### `GET /api/warehouses`

Returns all warehouses.

### `POST /api/reservations`

Creates a new reservation with concurrency-safe stock locking.

**Request:**
```json
{
  "productId": "string",
  "warehouseId": "string",
  "quantity": 5
}
```

**Headers:** `Idempotency-Key` (optional)

**Responses:**
- `201` — Reservation created (PENDING, expires in 15 min)
- `400` — Validation error
- `404` — Inventory not found
- `409` — Insufficient stock

### `GET /api/reservations/:id`

Returns a single reservation with product and warehouse details.

### `POST /api/reservations/:id/confirm`

Confirms a PENDING reservation.

**Headers:** `Idempotency-Key` (optional)

**Responses:**
- `200` — Confirmed (or already confirmed)
- `404` — Not found
- `410` — Expired or released

### `POST /api/reservations/:id/release`

Releases a reservation and returns stock to inventory.

**Responses:**
- `200` — Released (or already released, idempotent)
- `404` — Not found

### `GET /api/cron/expire-reservations`

Vercel cron endpoint (every 5 min). Expires PENDING reservations past `expiresAt`.

**Headers:** `Authorization: Bearer <CRON_SECRET>`

---

## Concurrency Safety

This is the core design challenge. Two simultaneous requests for the last available unit must serialize — one succeeds, one gets `409 Insufficient stock`.

### How It Works

The `POST /api/reservations` handler uses **PostgreSQL row-level locking** inside a transaction:

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Lock the specific inventory row — blocks other transactions
  const rows = await tx.$queryRaw`
    SELECT * FROM "Inventory"
    WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
    FOR UPDATE
  `;

  // 2. Check availability (totalUnits - reservedUnits >= quantity)
  // 3. Increment reservedUnits
  // 4. Create Reservation record
});
```

**`SELECT ... FOR UPDATE`** acquires an exclusive row-level lock on the Inventory row. Any concurrent transaction attempting to lock the same row will block until the first transaction commits or rolls back.

### Testing Concurrency

```bash
# Fire two simultaneous requests for the last available unit:
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"productId":"<id>","warehouseId":"<id>","quantity":50}' &

curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"productId":"<id>","warehouseId":"<id>","quantity":50}' &

# One will get 201, the other will get 409
```

---

## Idempotency

The API supports idempotent operations via the `Idempotency-Key` header on `POST /api/reservations` and `POST /api/reservations/:id/confirm`.

### How It Works

1. Client sends a request with `Idempotency-Key: <unique-key>` header
2. Before processing, the API checks the `IdempotencyRecord` table for that key
3. **If found** (within 24h TTL): return the cached `statusCode` and `responseBody` immediately — no business logic runs
4. **If not found**: process the request normally, then atomically write the key + response to `IdempotencyRecord`

### Why It Matters

- **Network retries**: If a client retries due to timeout, the same reservation isn't created twice
- **Double-clicks**: If a user clicks "Confirm" twice rapidly, only one confirmation occurs
- **Keys expire** after 24 hours (`createdAt` filter on lookup)

---

## Expiry Mechanism

Reservations in PENDING status automatically expire after **15 minutes**. Two complementary mechanisms ensure cleanup:

### 1. Lazy Expiry (on read)

When `GET /api/products` is called, a **fire-and-forget** background cleanup runs:

```typescript
// Non-blocking — doesn't delay the response
prisma.reservation.findMany({
  where: { status: 'PENDING', expiresAt: { lt: new Date() } }
}).then(async (expired) => {
  for (const r of expired) {
    await prisma.$transaction(async (tx) => {
      tx.reservation.update({ data: { status: 'RELEASED' } });
      tx.inventory.update({ data: { reservedUnits: { decrement: r.quantity } } });
    });
  }
});
```

**Pros**: No extra infrastructure needed, runs on every product listing request.
**Cons**: Only runs when products are fetched — if nobody visits the site, expired reservations aren't cleaned up.

### 2. Vercel Cron (explicit)

A dedicated endpoint at `/api/cron/expire-reservations` runs **once daily** (due to Vercel Hobby plan limitations):

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/expire-reservations",
    "schedule": "0 0 * * *"
  }]
}
```

**Pros**: Guaranteed daily cleanup regardless of traffic.
**Cons**: Limited to once a day on the Hobby plan (requires Vercel Pro for more frequent schedules, e.g., every 5 minutes).

Both approaches run the same cleanup logic. Together, they ensure expired reservations are released. Note that the **lazy expiry** mechanism still runs on every product fetch, ensuring real-time cleanup for active users even without frequent cron jobs.

---

## Deployment (Vercel)

### 1. Push to GitHub

```bash
git remote add origin https://github.com/namanbachhawat/inventory_reservation_system.git
git push -u origin master
```

### 2. Import in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the GitHub repository
3. Add environment variables (`DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`)
4. Deploy

### 3. Post-Deploy

The `vercel.json` cron config is automatically picked up. Verify it's running at **Settings → Cron Jobs** in the Vercel dashboard.

---

## Data Model

```
Product ──┐
           ├── Inventory (unique: productId + warehouseId)
Warehouse ─┘          │
                      │ totalUnits - reservedUnits = available
                      │
              Reservation (PENDING → CONFIRMED | RELEASED)
                      │
              IdempotencyRecord (key + cached response, 24h TTL)
```

## License

MIT
