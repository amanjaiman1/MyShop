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

## Setup — three steps

You need a **Supabase** project and (optionally) **Vercel**. There is no
service-role key to wrangle and no dashboard user-creation step.

### 1. Create the database

Supabase Dashboard → **SQL Editor** → **New query** → paste the entire contents
of **`supabase/schema.sql`** → **Run**.

You should see *"Success. No rows returned."* That single file creates all 11
tables, Row Level Security on every one, the FIFO sale transaction, the
reporting functions and the Storage buckets. It is safe to re-run at any time —
re-running only fills in anything missing, so it doubles as a repair step.

### 2. Set two environment variables

Both come from Supabase → **Project Settings → API**.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR-PROJECT-REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your **anon / public** key |

**Locally:** `cp .env.example .env.local` and fill them in.

**On Vercel:** Project → **Settings → Environment Variables** → add both, ticked
for **Production, Preview and Development** → then **Redeploy**.

> The `NEXT_PUBLIC_` prefix is required. Next.js inlines these at build time and
> the browser cannot read server-only variables — this is why the Supabase↔Vercel
> integration alone (which creates `SUPABASE_URL` / `SUPABASE_ANON_KEY`) isn't
> sufficient on its own. These are public values; your data is protected by Row
> Level Security, not by hiding the anon key.

### 3. Open the app and claim your shop

Install dependencies and start the dev server (`npm install`, then
`npm run dev`) and open <http://localhost:3000> — or just open your Vercel URL.

On first visit the sign-in screen shows **"Create your shop"** — enter your email
and password once and you're in. The database seeds your profile and default
product/expense categories automatically. After that, this screen is sign-in
only; there is no ongoing public registration.

> **If Supabase asks you to confirm your email**, either click the link in the
> email, or turn confirmation off first: Supabase → **Authentication → Providers
> → Email** → uncheck **Confirm email**.

That's it. You're ready to add products, record a purchase and start selling.

---

## Optional: load demo data

Want a shop already full of realistic products, purchases, sales and expenses
spanning every reporting period?

Add these to `.env.local` (the service-role key is a **secret** — local only,
never in Vercel, never committed):

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEMO_OWNER_EMAIL=owner@yourshop.com
DEMO_OWNER_PASSWORD=choose-a-strong-password
```

Then run `npm run seed:demo`. It creates the owner account and drives the real
purchase/sale functions, so it doubles as an end-to-end check of FIFO costing.

---

## Deploying to Vercel

1. **Import** the repository in Vercel — the Next.js preset is detected
   automatically.
2. Add the **two environment variables** from step 2 above, then **Deploy**.
3. So password-reset emails link back correctly, go to Supabase →
   **Authentication → URL Configuration** and set:
   - **Site URL** → your Vercel domain, e.g. `https://your-shop.vercel.app`
   - **Redirect URLs** → add `https://your-shop.vercel.app/auth/callback`

Optionally set `NEXT_PUBLIC_SITE_URL` to your domain; if you leave it out,
Aurelia falls back to the Vercel deployment URL.

---

## Troubleshooting

| Symptom | Cause & fix |
| --- | --- |
| Build fails with *"Supabase is not configured"* | The two `NEXT_PUBLIC_` variables aren't set in Vercel. Add them and redeploy. |
| *"Something went wrong"* after signing in | The schema wasn't fully applied. Re-run `supabase/schema.sql` (safe to re-run), then reload. |
| Sign-in rejects you on a brand-new project | No owner exists yet — the screen should offer **"Create your shop"**. If it doesn't, the schema hasn't been applied. |
| Stuck on *"Confirm your email"* | Click the emailed link, or disable **Confirm email** in Supabase → Authentication → Providers → Email. |
| Product image upload fails | The Storage buckets are missing — re-run `supabase/schema.sql`. |
| A CSP / `antd` stylesheet error in the browser console while on the Vercel dashboard | That's Vercel's own UI, not this app. Harmless — ignore it. |

To see the real cause of any server-side error, open **Vercel → your deployment
→ Logs** and look for lines prefixed `[aurelia]`.

---

## Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm run verify` | typecheck + lint + build |
| `npm run seed:demo` | Create the owner and seed demo data |
| `npm run generate:icons` | Regenerate PWA icons from the SVG mark |
| `npm run test:db` | Run the database logic suites (needs Docker) |

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
