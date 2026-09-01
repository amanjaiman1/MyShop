<div align="center">

# Aurelia

**Beauty inventory, priced right.**

A production-quality, mobile-first Progressive Web App for a cosmetics resale
shop — inventory and purchase-cost tracking, a fast point of sale with live
profit analysis, FIFO cost accounting, and date-accurate profit & loss reports.

Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS · shadcn/ui ·
Supabase (Postgres, Auth, Storage, RLS) · Recharts · ZXing

</div>

---

## Why it exists

The owner buys cosmetics — sometimes 100+ identical items at once — and resells
them individually or in multi-product orders. The recurring, expensive mistake
is **forgetting the purchase cost and accidentally selling at or below it.**

Aurelia's answer:

- Every product remembers **each purchase batch and its own cost**.
- The moment a selling price is typed, the app shows **profit, low profit,
  break-even or loss** — with the exact figures — before the sale is made.
- Sales consume stock **FIFO** (oldest cost layer first) and freeze the cost as
  a snapshot, so historical profit never changes when you restock at a new price.
- Loss-making and break-even sales require an **explicit confirmation** (or can
  be blocked entirely).
- Reports compute in the **shop's timezone**, so "Today" is your day, not the
  browser's.

## Feature tour

| Area | What you get |
| --- | --- |
| **Dashboard** | Today's net sales / gross profit / net profit, today‑vs‑yesterday (safe % — never "∞"), last‑5‑day trend, month‑to‑date, inventory investment, projected profit, and warning cards (loss‑priced, break‑even, low/out of stock, expiring) that deep‑link to filtered lists. |
| **Products** | Grid & list views, trigram search by name/brand/shade/SKU/barcode/code, category and status filters, add/edit with image upload, archive/restore, **printable barcode & QR labels**. |
| **Product detail** | Live inventory position, **price simulator** (earnings per item, margin, markup, break‑even, projection over current stock), per‑batch profitability, price history timeline, and stock‑movement audit. |
| **Purchases** | Fast multi‑line "Record purchase": pick a supplier (or create one inline), scan/search products, enter quantity + unit cost + optional lot/expiry, watch the total investment build, save. 100 identical items become **one batch of 100**; a re‑buy at another cost becomes a **separate batch**. |
| **Scan & Sell (POS)** | Rear‑camera scanning (torch, camera switch, manual entry), a persisted cart, and per‑line + order‑level profit analysis recomputed by the database. Clear warnings for below‑recommended, below‑minimum, at‑cost and below‑cost prices; loss / break‑even sales need confirmation. |
| **Sales** | History with status filters, invoice search, full profit breakdown, **partial returns** (stock restored at original cost) and **voids** (reversal, never deletion). |
| **Expenses** | Operating costs by category with a breakdown donut, date filters and CSV export. Buying stock is **not** an expense — it's inventory investment that becomes COGS when sold. |
| **Reports** | A dedicated **Profit & Loss** page with Today / Yesterday / Last 5·10·20·30 Days / This·Last Month / This Year / All Time / Custom, plus **Monthly** and **Yearly** history generated from your first day of use, charts with exact tooltips, and CSV exports of every dataset. |
| **PWA** | Installable, standalone display, offline app shell, and an honest offline state — Aurelia never pretends a financial transaction succeeded without a connection. |

## Financial model (how the money is defined)

- **Money is integer minor units** (paise for INR) everywhere — in the database
  and the app. There is no floating‑point money. Percentages are derived only
  for display.
- **Projected profit** — potential profit if all current stock sells at
  configured prices. Never presented as money already earned.
- **Realized gross profit** = net sales − FIFO cost of goods actually sold.
- **Net profit** = realized gross profit − operating expenses.
- **Inventory investment** = purchase cost tied up in unsold stock.

```
Gross sales − Discounts − Returns = Net sales
Net sales   − Cost of goods sold  = Realized gross profit
Gross profit − Operating expenses = Net profit
```

All aggregation happens in PostgreSQL (secure `SECURITY DEFINER` RPCs scoped to
`auth.uid()`), so the browser never computes or is trusted with financial
totals, and reports don't download your whole history to add it up.

---

## Local setup

### Prerequisites

- Node.js 20+ and npm
- A [Supabase](https://supabase.com) project (free tier is fine)
- Optionally the [Supabase CLI](https://supabase.com/docs/guides/cli) for local
  development and migrations

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in from **Supabase → Project Settings → Data API**:

| Variable | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally |
| `SUPABASE_SERVICE_ROLE_KEY` | service‑role key — **only** for the owner bootstrap and demo seed scripts; never exposed to the browser |
| `DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD` | the owner account the seed creates |

### 3. Apply the database schema

**Option A — Supabase CLI (recommended)**

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies everything in supabase/migrations
```

**Option B — SQL editor**

Open each file in `supabase/migrations/` in order (they are named
chronologically) and run them in the Supabase SQL editor.

The migrations create all tables, constraints, indexes, RLS policies, the FIFO
sale RPC, the reporting RPCs, and the Storage buckets.

### 4. Create the owner & (optionally) seed demo data

There is **no public sign‑up** — Aurelia is a single‑owner ledger. The seed
script creates the owner account for you and fills the shop with realistic data:

```bash
npm run seed:demo
```

This signs in as the owner and drives the real `record_purchase` /
`complete_sale` RPCs, so it also serves as an end‑to‑end smoke test of FIFO
costing. It creates lipsticks, foundations, skincare, perfumes, eyeliners,
mascaras and nail products with multiple cost batches (including a 100‑unit
batch and deliberately profitable, low‑margin, break‑even and loss‑making
sales) spread across dates so **every** report window is meaningful.

> Prefer to start empty? Create the owner yourself in **Supabase → Authentication
> → Add user** (set "Auto Confirm"), and sign in. The `on_auth_user_created`
> trigger seeds the profile plus default product & expense categories.

### 5. Run

```bash
npm run dev          # http://localhost:3000
```

Sign in with your owner credentials (or the demo ones printed by the seed).

### Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm run verify` | typecheck + lint + build |
| `npm run seed:demo` | Create the owner and seed demo data |
| `npm run generate:icons` | Regenerate PWA icons from the SVG mark |
| `npm run test:db` | Run the database logic suite (needs Docker) |
| `npm run db:types` | Regenerate `database.types.ts` from a linked project |

---

## Deploying to Vercel

1. Push this repository to GitHub/GitLab and **import it into Vercel**. The
   framework preset is detected automatically (Next.js).
2. In **Vercel → Project → Settings → Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` → your production domain, e.g. `https://aurelia.example.com`

   Do **not** add `SUPABASE_SERVICE_ROLE_KEY` unless you intend to run the seed
   from that environment — it is a server‑only secret used by local scripts.
3. In **Supabase → Authentication → URL Configuration**, set the **Site URL** to
   your Vercel domain and add `https://<domain>/auth/callback` to the redirect
   allow‑list, so password‑reset links resolve correctly.
4. Deploy. The service worker and manifest are served from `/public` with the
   correct cache headers (see `next.config.ts`).

Because every table is protected by Row Level Security, the publishable anon key
is safe in the browser.

---

## Security notes

- **RLS on every business table**, scoped to `auth.uid()`. Financial tables
  (sales, sale items, purchase batches, stock movements, price history) are
  **read‑only to the client** — all writes go through `SECURITY DEFINER` RPCs
  that recalculate the money server‑side.
- **No hard deletes of financial history.** Corrections use void / return /
  reversal workflows, preserving the audit trail.
- Database constraints guarantee inventory can't go negative, sale quantities
  are positive, invoice totals always satisfy
  `total = subtotal − discount − returns` and `gross_profit = total − cost`, and
  a duplicate submission (same `client_request_id`) can never post twice.
- Uploads are constrained by type and size at both the client and the Storage
  bucket. Receipts live in a **private** bucket accessed via short‑lived signed
  URLs.
- Secrets are never committed; see `.env.example`.

## Project structure

```
aurelia/
├── src/
│   ├── app/
│   │   ├── (auth)/            login · forgot-password · reset-password
│   │   ├── (app)/             dashboard · products · purchases · sell · sales
│   │   │                      movements · suppliers · expenses · reports · settings · more
│   │   └── auth/              callback · signout route handlers
│   ├── components/            ui · common · shell · product · purchase · sell · sale
│   │                          expense · supplier · movement · reports · charts · scan
│   └── lib/                   supabase clients + types · money · format · pricing
│                              schemas (zod) · csv · errors · cart-store · actions
├── supabase/
│   ├── migrations/            schema · rls · bootstrap · inventory · sales · reporting · storage
│   └── tests/                 self-contained Postgres logic suite (Docker)
├── scripts/                   seed-demo.ts · generate-icons.ts
└── public/                    manifest · service worker · offline page · icons
```

## Testing the database logic

The transactional core (FIFO allocation, cost snapshots, returns/voids, the
reporting periods and RLS) has a self‑contained test suite that spins up
PostgreSQL, applies the real migrations, and runs ~160 assertions:

```bash
npm run test:db      # requires Docker
```

---

Built with care for correctness, speed at the till, and a finish worthy of the
products it sells.
