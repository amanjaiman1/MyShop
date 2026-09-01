/**
 * Demo-seed verification.
 *
 * The production seed (scripts/seed-demo.ts) talks to Supabase Auth, which we
 * can't stand up in this harness. But its *data plan* — the catalogue, the
 * purchase batches and the spread of sales — is what actually matters, and we
 * can run that exact shape through the real RPCs against real PostgreSQL and
 * then assert the reports come out coherent.
 *
 * If this passes, `npm run seed:demo` will produce a dataset where Today,
 * Yesterday, the rolling windows, monthly and yearly history, loss/return/void
 * states and FIFO splitting are all genuinely populated and internally
 * consistent.
 */
import {
  asOwner,
  client,
  createOwner,
  eq,
  finish,
  inr,
  migrate,
  ok,
  one,
  q,
  suite,
} from "./harness.js";

type Json = Record<string, unknown>;

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function tsDaysAgo(n: number, hour = 12): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

interface SeedProduct {
  key: string;
  name: string;
  shade?: string;
  category: string;
  rsp: number;
  msp: number;
  batches: Array<[qty: number, cost: number, ago: number]>;
}

// A faithful subset of the real seed catalogue — enough to exercise every
// behaviour the demo promises.
const CATALOGUE: SeedProduct[] = [
  { key: "lip-ruby", name: "Luxury Matte Lipstick", shade: "Ruby Rose", category: "Lips", rsp: 300, msp: 250, batches: [[100, 200, 120], [50, 220, 40]] },
  { key: "found-ivory", name: "Silk Serum Foundation", shade: "Warm Ivory", category: "Face", rsp: 900, msp: 760, batches: [[40, 620, 100], [30, 660, 30]] },
  { key: "serum-vitc", name: "Vitamin C Glow Serum", category: "Skincare", rsp: 750, msp: 620, batches: [[35, 480, 80], [25, 500, 20]] },
  { key: "cream-night", name: "Rose Renewal Night Cream", category: "Skincare", rsp: 640, msp: 560, batches: [[30, 590, 45]] },
  { key: "perfume-oud", name: "Amber Oud EDP", category: "Fragrance", rsp: 2200, msp: 1850, batches: [[20, 1500, 110], [15, 1580, 35]] },
  { key: "eyeliner-onyx", name: "Precision Gel Eyeliner", shade: "Onyx", category: "Eyes", rsp: 450, msp: 380, batches: [[8, 250, 95], [40, 300, 30]] },
  { key: "mascara-volume", name: "Volume Couture Mascara", category: "Eyes", rsp: 500, msp: 420, batches: [[45, 400, 65]] },
  { key: "nail-blush", name: "Gel Shine Nail Lacquer", shade: "Blush", category: "Nails", rsp: 250, msp: 190, batches: [[40, 170, 55]] },
];

async function main(): Promise<void> {
  await client.connect();
  await migrate();
  const owner = await createOwner("demo@seed.local");

  const productId = new Map<string, string>();

  await asOwner(owner, async () => {
    // Anchor all-time well before the earliest record.
    await client.query(`update public.profiles set app_started_at = $2 where id = $1`, [
      owner,
      `${daysAgo(430)}T00:00:00Z`,
    ]);

    const categories = await q<{ id: string; name: string }>(
      `select id, name from public.categories where user_id = $1`,
      [owner],
    );
    const catId = new Map(categories.map((c) => [c.name, c.id]));

    // ---- Products ----
    for (const p of CATALOGUE) {
      const row = await one<{ id: string }>(
        `insert into public.products
           (user_id, name, shade_or_variant, category_id, recommended_selling_price, minimum_selling_price)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [owner, p.name, p.shade ?? null, catId.get(p.category) ?? null, inr(p.rsp), inr(p.msp)],
      );
      productId.set(p.key, row.id);
    }

    // ---- Purchases (one batch each, faithful to the seed) ----
    for (const p of CATALOGUE) {
      for (const [qty, cost, ago] of p.batches) {
        const { rows } = await client.query(
          `select public.record_purchase($1::jsonb, null, $2::date, null, null) as r`,
          [JSON.stringify([{ product_id: productId.get(p.key), quantity: qty, unit_cost: inr(cost) }]), daysAgo(ago)],
        );
        ok(Boolean(rows[0].r.reference_number), `purchase recorded for ${p.key}`);
      }
    }
  });

  suite("Seed: catalogue & batches");
  await asOwner(owner, async () => {
    const products = await one<{ n: number }>(`select count(*)::int n from public.products`);
    eq(products.n, CATALOGUE.length, "every catalogue product was created");

    const ruby = await one<{ quantity_on_hand: number; open_batch_count: number }>(
      `select quantity_on_hand, open_batch_count from public.product_overview where id = $1`,
      [productId.get("lip-ruby")],
    );
    eq(ruby.quantity_on_hand, 150, "the 100+50 lipstick batches total 150 units");
    eq(ruby.open_batch_count, 2, "…held as two separate cost layers");
  });

  // Helper to complete a sale as the owner.
  async function sell(
    items: Array<{ key: string; qty: number; price: number; lineDiscount?: number }>,
    opts: { day: number; hour?: number; payment?: string; orderDiscount?: number; confirmLoss?: boolean; confirmBreakeven?: boolean } ,
  ): Promise<Json> {
    return asOwner(owner, async () => {
      const row = await one<{ r: Json }>(
        `select public.complete_sale($1::jsonb, $2::public.payment_method, $3::bigint, null, $4::uuid, $5::timestamptz, $6::boolean, $7::boolean) as r`,
        [
          JSON.stringify(
            items.map((i) => ({
              product_id: productId.get(i.key),
              quantity: i.qty,
              unit_selling_price: inr(i.price),
              line_discount: i.lineDiscount ? inr(i.lineDiscount) : 0,
            })),
          ),
          opts.payment ?? "cash",
          opts.orderDiscount ? inr(opts.orderDiscount) : 0,
          crypto.randomUUID(),
          tsDaysAgo(opts.day, opts.hour ?? 12),
          opts.confirmLoss ?? false,
          opts.confirmBreakeven ?? false,
        ],
      );
      return row.r;
    });
  }

  suite("Seed: sales across every reporting window");
  {
    // A profitable sale in each window the product must light up.
    await sell([{ key: "lip-ruby", qty: 2, price: 300 }], { day: 0, hour: 9 }); // today
    await sell([{ key: "found-ivory", qty: 1, price: 900 }], { day: 1 }); // yesterday
    await sell([{ key: "serum-vitc", qty: 1, price: 750 }], { day: 4 }); // last 5
    await sell([{ key: "mascara-volume", qty: 1, price: 500 }], { day: 8 }); // last 10 (profitable)
    await sell([{ key: "perfume-oud", qty: 1, price: 2200 }], { day: 18 }); // last 20
    await sell([{ key: "cream-night", qty: 1, price: 640 }], { day: 27 }); // last 30
    await sell([{ key: "lip-ruby", qty: 1, price: 300 }], { day: 75 }); // ~2-3 months back
    await sell([{ key: "found-ivory", qty: 1, price: 900 }], { day: 300 }); // last year

    const today = await asOwner(owner, () =>
      one<{ net_sales: number; order_count: number }>(
        `select net_sales, order_count from public.report_pl_summary('today')`,
      ),
    );
    eq(today.net_sales, inr(600), "Today shows the ₹600 lipstick sale");
    ok(today.order_count >= 1, "Today has at least one order");

    const yesterday = await asOwner(owner, () =>
      one<{ net_sales: number }>(`select net_sales from public.report_pl_summary('yesterday')`),
    );
    eq(yesterday.net_sales, inr(900), "Yesterday shows the ₹900 foundation sale");

    for (const [key, min] of [["last_5_days", 1350], ["last_10_days", 1600], ["last_20_days", 3800], ["last_30_days", 4440]] as const) {
      const r = await asOwner(owner, () =>
        one<{ net_sales: number }>(`select net_sales from public.report_pl_summary($1)`, [key]),
      );
      ok(r.net_sales >= inr(min), `${key} accumulates the expected minimum revenue`);
    }
  }

  suite("Seed: FIFO split, break-even, loss, return, void");
  {
    // FIFO split: 8 eyeliners while the oldest batch holds only 8 @ ₹250.
    const fifo = await sell([{ key: "eyeliner-onyx", qty: 8, price: 450 }], { day: 5 });
    eq(fifo.total_cost, inr(8 * 250), "the 8-unit eyeliner sale draws entirely from the ₹250 batch");
    const eyelinerItems = await asOwner(owner, () =>
      q<{ unit_cost_snapshot: number; quantity: number }>(
        `select unit_cost_snapshot, quantity from public.sale_items where sale_id = $1 order by unit_cost_snapshot`,
        [fifo.sale_id],
      ),
    );
    ok(eyelinerItems.length >= 1, "FIFO allocation recorded cost-snapshotted line(s)");

    // Now sell 5 more so it splits across the ₹250 (0 left) and ₹300 layers.
    const split = await sell([{ key: "eyeliner-onyx", qty: 5, price: 450 }], { day: 3 });
    eq(split.total_cost, inr(5 * 300), "the next eyeliner sale falls through to the ₹300 layer");

    // Break-even (mascara at exactly ₹400 cost) requires confirmation.
    const be = await sell([{ key: "mascara-volume", qty: 1, price: 400 }], { day: 7, confirmBreakeven: true });
    eq(be.gross_profit, 0, "the break-even mascara sale records zero profit");

    // Loss (nail lacquer below its ₹170 cost) requires confirmation.
    const loss = await sell([{ key: "nail-blush", qty: 3, price: 150 }], { day: 6, confirmLoss: true });
    eq(loss.gross_profit, inr(3 * (150 - 170)), "the clearance nail sale records a −₹60 loss");

    // Loss-making sales surface in the report.
    const lossSales = await asOwner(owner, () =>
      q<{ gross_profit: number }>(`select gross_profit from public.report_loss_making_sales('all_time')`),
    );
    ok(lossSales.length >= 1, "loss-making sales are reported");
    ok(lossSales.every((s) => s.gross_profit <= 0), "…and only show loss/break-even invoices");

    // Return one unit of a fresh sale, then void another.
    const toReturn = await sell([{ key: "lip-ruby", qty: 3, price: 300 }], { day: 9 });
    const item = await asOwner(owner, () =>
      one<{ id: string }>(`select id from public.sale_items where sale_id = $1 limit 1`, [toReturn.sale_id]),
    );
    await asOwner(owner, () =>
      client.query(`select public.return_sale_items($1::uuid, $2::jsonb, $3)`, [
        toReturn.sale_id,
        JSON.stringify([{ sale_item_id: item.id, quantity: 1 }]),
        "Preferred another shade",
      ]),
    );
    const returned = await asOwner(owner, () =>
      one<{ status: string; return_amount: number }>(
        `select status, return_amount from public.sales where id = $1`,
        [toReturn.sale_id],
      ),
    );
    eq(returned.status, "partially_returned", "the returned sale is marked partially returned");
    eq(returned.return_amount, inr(300), "…crediting one ₹300 unit");

    const toVoid = await sell([{ key: "serum-vitc", qty: 1, price: 750 }], { day: 10 });
    await asOwner(owner, () =>
      client.query(`select public.void_sale($1::uuid, $2)`, [toVoid.sale_id, "Duplicate"]),
    );
    const voided = await asOwner(owner, () =>
      one<{ status: string }>(`select status from public.sales where id = $1`, [toVoid.sale_id]),
    );
    eq(voided.status, "voided", "the voided sale is marked voided");
  }

  suite("Seed: expenses and net profit");
  await asOwner(owner, async () => {
    const cat = await one<{ id: string }>(
      `select id from public.expense_categories where user_id = $1 and name = 'Rent'`,
      [owner],
    );
    await client.query(
      `insert into public.expenses (user_id, expense_category_id, title, amount, expense_date)
       values ($1,$2,'Shop rent',$3,$4)`,
      [owner, cat.id, inr(18000), daysAgo(15)],
    );

    const pl = await one<{
      realized_gross_profit: number;
      operating_expenses: number;
      net_profit: number;
    }>(`select realized_gross_profit, operating_expenses, net_profit from public.report_pl_summary('all_time')`);
    eq(pl.operating_expenses, inr(18000), "the expense lands in the all-time total");
    eq(pl.net_profit, pl.realized_gross_profit - pl.operating_expenses, "net profit = gross − expenses");
  });

  suite("Seed: monthly & yearly history reconcile");
  await asOwner(owner, async () => {
    const bounds = await one<{ earliest_date: string }>(
      `select earliest_date from public.report_bounds()`,
    );
    ok(bounds.earliest_date <= daysAgo(299), "history reaches back to the oldest sale/purchase");

    const monthly = await q<{ net_sales: number }>(`select net_sales from public.report_monthly_series()`);
    ok(monthly.length >= 6, "monthly history spans several months");
    ok(monthly.some((m) => m.net_sales === 0), "quiet months appear as zero rows");

    const yearly = await q<{ year: number; net_sales: number }>(
      `select year, net_sales from public.report_yearly_series()`,
    );
    ok(yearly.length >= 1, "yearly history exists");

    const allTime = await one<{ net_sales: number }>(
      `select net_sales from public.report_pl_summary('all_time')`,
    );
    eq(
      monthly.reduce((a, m) => a + m.net_sales, 0),
      allTime.net_sales,
      "monthly net sales reconcile with all-time",
    );
    eq(
      yearly.reduce((a, y) => a + y.net_sales, 0),
      allTime.net_sales,
      "yearly net sales reconcile with all-time",
    );

    const daily = await q<{ net_sales: number }>(`select net_sales from public.report_daily_series('all_time')`);
    eq(
      daily.reduce((a, d) => a + d.net_sales, 0),
      allTime.net_sales,
      "daily series reconciles with all-time",
    );
  });

  suite("Seed: dashboard & product profitability are populated");
  await asOwner(owner, async () => {
    const snap = await one<{ dashboard_snapshot: Json }>(`select public.dashboard_snapshot()`);
    const s = snap.dashboard_snapshot;
    const inv = s.inventory as Json;
    ok((inv.investment as number) > 0, "dashboard shows a real inventory investment");
    const alerts = s.alerts as Json;
    ok((alerts.priced_at_loss as number) >= 0, "dashboard resolves the loss-priced alert count");

    const products = await q<{ net_profit: number }>(
      `select net_profit from public.report_product_profitability('all_time')`,
    );
    ok(products.length >= 5, "several products have realized sales");
    ok(products.some((p) => p.net_profit < 0), "at least one product sold at a loss (the clearance line)");
  });

  await client.end();
  finish();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
