/**
 * Database behaviour suite — the checks that matter for money.
 *
 * Run with:  npm run test:db     (requires the throwaway PostgreSQL to be up:
 *                                 bash supabase/tests/pg-up.sh)
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
  throwsWithCode,
} from "./harness.js";

type Json = Record<string, unknown>;

async function newProduct(
  owner: string,
  name: string,
  recommended: number,
  minimum: number,
  extra: Partial<{ brand: string; shade: string; barcode: string; threshold: number }> = {},
): Promise<string> {
  const row = await one<{ id: string }>(
    `insert into public.products
       (user_id, name, brand, shade_or_variant, manufacturer_barcode,
        recommended_selling_price, minimum_selling_price, low_stock_threshold)
     values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 5))
     returning id`,
    [
      owner,
      name,
      extra.brand ?? "Aurelia",
      extra.shade ?? null,
      extra.barcode ?? null,
      recommended,
      minimum,
      extra.threshold ?? null,
    ],
  );
  return row.id;
}

async function purchase(
  lines: Array<{ product_id: string; quantity: number; unit_cost: number; expiry_date?: string }>,
  opts: { date?: string; supplier?: string | null } = {},
): Promise<Json> {
  const row = await one<{ record_purchase: Json }>(
    `select public.record_purchase($1::jsonb, $2::uuid, $3::date, null, null) as record_purchase`,
    [JSON.stringify(lines), opts.supplier ?? null, opts.date ?? null],
  );
  return row.record_purchase;
}

async function sell(
  items: Array<{ product_id: string; quantity: number; unit_selling_price: number; line_discount?: number }>,
  opts: {
    orderDiscount?: number;
    paymentMethod?: string;
    saleDate?: string;
    confirmLoss?: boolean;
    confirmBreakeven?: boolean;
    requestId?: string | null;
    notes?: string | null;
  } = {},
): Promise<Json> {
  const row = await one<{ complete_sale: Json }>(
    `select public.complete_sale(
        $1::jsonb, $2::public.payment_method, $3::bigint, $4, $5::uuid,
        $6::timestamptz, $7::boolean, $8::boolean
     ) as complete_sale`,
    [
      JSON.stringify(items),
      opts.paymentMethod ?? "cash",
      opts.orderDiscount ?? 0,
      opts.notes ?? null,
      opts.requestId ?? null,
      opts.saleDate ?? null,
      opts.confirmLoss ?? false,
      opts.confirmBreakeven ?? false,
    ],
  );
  return row.complete_sale;
}

async function main(): Promise<void> {
  await client.connect();
  await migrate();

  const owner = await createOwner("owner@test.local");
  const other = await createOwner("intruder@test.local");

  // =========================================================================
  suite("Owner bootstrap");
  // =========================================================================
  {
    const profile = await one<{ shop_name: string; currency_code: string; timezone: string }>(
      `select shop_name, currency_code, timezone from public.profiles where id = $1`,
      [owner],
    );
    eq(profile.shop_name, "Test Boutique", "profile is created from auth metadata");
    eq(profile.currency_code, "INR", "currency defaults to INR");

    const cats = await one<{ n: number }>(
      `select count(*)::int as n from public.categories where user_id = $1`,
      [owner],
    );
    eq(cats.n, 7, "default product categories are seeded");

    const ecats = await q<{ name: string }>(
      `select name from public.expense_categories where user_id = $1 order by name`,
      [owner],
    );
    ok(ecats.some((c) => c.name === "Rent"), "default expense categories include Rent");
    ok(ecats.some((c) => c.name === "Packaging"), "default expense categories include Packaging");
    eq(ecats.length, 9, "nine default expense categories");
  }

  // =========================================================================
  suite("Internal product codes");
  // =========================================================================
  const lipstick = await newProduct(owner, "Luxury Matte Lipstick", inr(300), inr(250), {
    shade: "Ruby Rose",
    barcode: "8901234567890",
  });
  const foundation = await newProduct(owner, "Silk Serum Foundation", inr(900), inr(780), {
    shade: "Warm Ivory 210",
  });
  {
    const codes = await q<{ internal_code: string }>(
      `select internal_code from public.products where user_id = $1 order by created_at`,
      [owner],
    );
    eq(
      codes.map((c) => c.internal_code),
      ["COS-000001", "COS-000002"],
      "internal codes are generated sequentially in COS-000000 form",
    );
  }

  // =========================================================================
  suite("Price history is recorded automatically");
  // =========================================================================
  {
    await client.query(
      `update public.products set recommended_selling_price = $2 where id = $1`,
      [lipstick, inr(320)],
    );
    const history = await q<{ previous_selling_price: number | null; new_selling_price: number }>(
      `select previous_selling_price, new_selling_price
         from public.product_price_history where product_id = $1 order by changed_at`,
      [lipstick],
    );
    eq(history.length, 2, "creation and the price change are both recorded");
    eq(history[0]?.previous_selling_price, null, "the first entry has no previous price");
    eq(history[1]?.new_selling_price, inr(320), "the change captures the new price");
    await client.query(
      `update public.products set recommended_selling_price = $2 where id = $1`,
      [lipstick, inr(300)],
    );
  }

  // =========================================================================
  suite("Purchases: batches, not duplicated products");
  // =========================================================================
  await asOwner(owner, async () => {
    const result = await purchase(
      [{ product_id: lipstick, quantity: 100, unit_cost: inr(200) }],
      { date: "2026-01-10" },
    );
    eq(result.total_units, 100, "100 identical items are one purchase line");
    eq(result.total_investment, inr(20000), "total investment is ₹20,000");

    const batches = await q<{ quantity_purchased: number; quantity_remaining: number; unit_cost: number }>(
      `select quantity_purchased, quantity_remaining, unit_cost
         from public.purchase_batches where product_id = $1`,
      [lipstick],
    );
    eq(batches.length, 1, "exactly ONE batch row is created for 100 items");
    eq(batches[0]?.quantity_purchased, 100, "the batch carries quantity_purchased = 100");
    eq(batches[0]?.quantity_remaining, 100, "all 100 units are available");

    const products = await one<{ n: number }>(
      `select count(*)::int as n from public.products where user_id = $1`,
      [owner],
    );
    eq(products.n, 2, "no extra product records were created");

    // A second purchase of the SAME product at a DIFFERENT cost.
    await purchase([{ product_id: lipstick, quantity: 50, unit_cost: inr(220) }], {
      date: "2026-02-05",
    });
    const costs = await q<{ unit_cost: number }>(
      `select unit_cost from public.purchase_batches where product_id = $1 order by purchase_date`,
      [lipstick],
    );
    eq(costs.map((c) => c.unit_cost), [inr(200), inr(220)], "a different cost creates a separate batch");

    const movements = await q<{ movement_type: string; quantity: number }>(
      `select movement_type, quantity from public.stock_movements
        where product_id = $1 order by created_at`,
      [lipstick],
    );
    eq(movements.length, 2, "each batch writes a stock movement");
    ok(movements.every((m) => m.movement_type === "purchase" && m.quantity > 0), "purchases add stock");
  });

  // =========================================================================
  suite("Projected profit across multiple purchase costs");
  // =========================================================================
  await asOwner(owner, async () => {
    const view = await one<{
      quantity_on_hand: number;
      inventory_cost: number;
      projected_revenue: number;
      projected_gross_profit: number;
      expected_margin_pct: number;
      fifo_unit_cost: number;
      latest_unit_cost: number;
      max_open_batch_cost: number;
      average_unit_cost: number;
      price_status: string;
      has_batch_below_price: boolean;
    }>(`select * from public.product_overview where id = $1`, [lipstick]);

    // Batch 1: 100 @ ₹200, Batch 2: 50 @ ₹220, price ₹300
    eq(view.quantity_on_hand, 150, "total quantity is 150");
    eq(view.inventory_cost, inr(31000), "inventory investment is ₹31,000");
    eq(view.projected_revenue, inr(45000), "projected revenue is ₹45,000");
    eq(view.projected_gross_profit, inr(14000), "projected gross profit is ₹14,000");
    eq(view.expected_margin_pct, 33.33, "expected per-unit margin at the FIFO cost is 33.33%");
    eq(view.fifo_unit_cost, inr(200), "the FIFO cost is the oldest open batch");
    eq(view.latest_unit_cost, inr(220), "the latest cost is the newest batch");
    eq(view.max_open_batch_cost, inr(220), "the dearest open batch cost is exposed for warnings");
    eq(view.average_unit_cost, inr(206.67), "weighted average cost of stock on hand");
    eq(view.price_status, "profit", "₹300 against a ₹200 FIFO cost is a profit");
    eq(view.has_batch_below_price, false, "₹300 clears every open batch cost");

    const projectedMargin = Math.round((14000 / 45000) * 10000) / 100;
    eq(projectedMargin, 31.11, "projected margin on the whole holding is 31.11%");
  });

  // =========================================================================
  suite("Price status thresholds");
  // =========================================================================
  {
    const s = await one<{ a: string; b: string; c: string; d: string; e: string }>(
      `select
         public.price_status($1, $2, 10) as a,
         public.price_status($3, $2, 10) as b,
         public.price_status($2, $2, 10) as c,
         public.price_status($4, $2, 10) as d,
         public.price_status($5, $2, 10) as e`,
      [inr(300), inr(200), inr(215), inr(150), inr(222.23)],
    );
    eq(s.a, "profit", "₹300 on ₹200 cost is PROFIT");
    eq(s.b, "low_profit", "₹215 on ₹200 cost (6.98% margin) is LOW PROFIT");
    eq(s.c, "breakeven", "price equal to cost is BREAK-EVEN");
    eq(s.d, "loss", "price below cost is LOSS");
    eq(s.e, "profit", "₹222.23 on ₹200 cost (10.00%+) clears the low-margin threshold");
  }

  // =========================================================================
  suite("FIFO allocation across batches");
  // =========================================================================
  const eyeliner = await newProduct(owner, "Precision Gel Eyeliner", inr(450), inr(380), {
    shade: "Onyx",
  });
  await asOwner(owner, async () => {
    // Oldest batch deliberately holds only 3 units.
    await purchase([{ product_id: eyeliner, quantity: 3, unit_cost: inr(250) }], { date: "2026-01-15" });
    await purchase([{ product_id: eyeliner, quantity: 20, unit_cost: inr(300) }], { date: "2026-02-15" });

    const preview = await one<{ preview_sale: Json }>(
      `select public.preview_sale($1::jsonb) as preview_sale`,
      [JSON.stringify([{ product_id: eyeliner, quantity: 8, unit_selling_price: inr(450) }])],
    );
    const line = (preview.preview_sale.lines as Json[])[0] as Json;
    eq(line.allocated_qty, 8, "the preview allocates all 8 units");
    eq(line.line_cost, inr(3 * 250 + 5 * 300), "preview cost is 3×₹250 + 5×₹300 = ₹2,250");

    const sale = await sell([{ product_id: eyeliner, quantity: 8, unit_selling_price: inr(450) }], {
      saleDate: "2026-03-01T10:00:00+05:30",
    });

    const items = await q<{ quantity: number; unit_cost_snapshot: number }>(
      `select quantity, unit_cost_snapshot from public.sale_items
        where sale_id = $1 order by unit_cost_snapshot`,
      [sale.sale_id],
    );
    eq(items.length, 2, "the line is split across two cost layers");
    eq(items[0]?.quantity, 3, "three units come from the oldest batch");
    eq(items[0]?.unit_cost_snapshot, inr(250), "at the oldest batch's cost");
    eq(items[1]?.quantity, 5, "five units come from the next batch");
    eq(items[1]?.unit_cost_snapshot, inr(300), "at the next batch's cost");

    eq(sale.total_cost, inr(2250), "recorded COGS is ₹2,250");
    eq(sale.total, inr(3600), "revenue is 8 × ₹450 = ₹3,600");
    eq(sale.gross_profit, inr(1350), "gross profit is ₹1,350");

    const remaining = await q<{ unit_cost: number; quantity_remaining: number }>(
      `select unit_cost, quantity_remaining from public.purchase_batches
        where product_id = $1 order by purchase_date`,
      [eyeliner],
    );
    eq(remaining[0]?.quantity_remaining, 0, "the oldest batch is emptied first");
    eq(remaining[1]?.quantity_remaining, 15, "the newer batch absorbs the rest");
  });

  // =========================================================================
  suite("Cost snapshots freeze historical profit");
  // =========================================================================
  await asOwner(owner, async () => {
    const before = await one<{ gross_profit: number }>(
      `select gross_profit from public.sales where user_id = $1 order by created_at limit 1`,
      [owner],
    );
    // A much dearer restock must not rewrite what already happened.
    await purchase([{ product_id: eyeliner, quantity: 10, unit_cost: inr(400) }], { date: "2026-03-02" });
    const after = await one<{ gross_profit: number }>(
      `select gross_profit from public.sales where user_id = $1 order by created_at limit 1`,
      [owner],
    );
    eq(after.gross_profit, before.gross_profit, "a later, dearer purchase leaves historical profit untouched");
  });

  // =========================================================================
  suite("Loss, break-even and below-cost policy");
  // =========================================================================
  const mascara = await newProduct(owner, "Volume Couture Mascara", inr(500), inr(420));
  await asOwner(owner, async () => {
    await purchase([{ product_id: mascara, quantity: 30, unit_cost: inr(400) }], { date: "2026-03-05" });

    await throwsWithCode(
      () => sell([{ product_id: mascara, quantity: 1, unit_selling_price: inr(350) }]),
      "AU001",
      "a below-cost price is refused until the loss is confirmed",
    );
    await throwsWithCode(
      () => sell([{ product_id: mascara, quantity: 1, unit_selling_price: inr(400) }]),
      "AU002",
      "a break-even price is refused until it is confirmed",
    );

    // A discount that turns a profit into a loss must also be caught.
    await throwsWithCode(
      () => sell([{ product_id: mascara, quantity: 2, unit_selling_price: inr(450) }], { orderDiscount: inr(200) }),
      "AU001",
      "a discount that converts profit into loss requires confirmation",
    );

    const confirmed = await sell(
      [{ product_id: mascara, quantity: 1, unit_selling_price: inr(350) }],
      { confirmLoss: true, saleDate: "2026-03-06T12:00:00+05:30" },
    );
    eq(confirmed.gross_profit, inr(-50), "the confirmed loss is recorded as −₹50");

    const breakeven = await sell(
      [{ product_id: mascara, quantity: 1, unit_selling_price: inr(400) }],
      { confirmBreakeven: true, saleDate: "2026-03-06T12:05:00+05:30" },
    );
    eq(breakeven.gross_profit, 0, "the confirmed break-even records zero profit");
  });

  await asOwner(owner, async () => {
    await client.query(`update public.profiles set below_cost_sale_behavior = 'block' where id = $1`, [owner]);
    await throwsWithCode(
      () => sell([{ product_id: mascara, quantity: 1, unit_selling_price: inr(350) }], { confirmLoss: true }),
      "AU003",
      "the 'block' setting refuses below-cost sales even when confirmed",
    );
    await client.query(`update public.profiles set below_cost_sale_behavior = 'warn' where id = $1`, [owner]);
  });

  // =========================================================================
  suite("Inventory safety");
  // =========================================================================
  await asOwner(owner, async () => {
    await throwsWithCode(
      () => sell([{ product_id: mascara, quantity: 9999, unit_selling_price: inr(500) }]),
      "AU004",
      "selling more than is in stock is refused",
    );
    await throwsWithCode(
      () => sell([{ product_id: mascara, quantity: 0, unit_selling_price: inr(500) }]),
      "AU005",
      "a zero quantity is refused",
    );
    await throwsWithCode(
      () => sell([{ product_id: mascara, quantity: -3, unit_selling_price: inr(500) }]),
      "AU005",
      "a negative quantity is refused",
    );
    await throwsWithCode(() => sell([]), "AU005", "an empty cart is refused");

    const negative = await one<{ n: number }>(
      `select count(*)::int as n from public.purchase_batches where quantity_remaining < 0`,
    );
    eq(negative.n, 0, "no batch can ever hold negative stock");
  });

  // =========================================================================
  suite("Duplicate submission protection");
  // =========================================================================
  await asOwner(owner, async () => {
    const requestId = "11111111-2222-3333-4444-555555555555";
    const first = await sell([{ product_id: mascara, quantity: 1, unit_selling_price: inr(500) }], {
      requestId,
      saleDate: "2026-03-07T09:00:00+05:30",
    });
    const second = await sell([{ product_id: mascara, quantity: 1, unit_selling_price: inr(500) }], {
      requestId,
      saleDate: "2026-03-07T09:00:00+05:30",
    });
    eq(second.sale_id, first.sale_id, "resubmitting the same request returns the original sale");
    eq(second.duplicate, true, "the retry is reported as a duplicate");

    const count = await one<{ n: number }>(
      `select count(*)::int as n from public.sales where client_request_id = $1`,
      [requestId],
    );
    eq(count.n, 1, "only one sale was posted");
  });

  // =========================================================================
  suite("Discount proration is exact to the paisa");
  // =========================================================================
  await asOwner(owner, async () => {
    // 7 units spanning two cost layers, with an order discount that does not
    // divide evenly — the per-line integers must still re-sum to the invoice.
    const sale = await sell(
      [
        { product_id: eyeliner, quantity: 7, unit_selling_price: inr(450), line_discount: inr(33.33) },
        { product_id: mascara, quantity: 3, unit_selling_price: inr(500) },
      ],
      { orderDiscount: inr(101.01), saleDate: "2026-03-08T11:00:00+05:30" },
    );
    const agg = await one<{ line_total: number; line_profit: number; line_discount: number }>(
      `select sum(line_total)::bigint as line_total,
              sum(line_profit)::bigint as line_profit,
              sum(line_discount)::bigint as line_discount
         from public.sale_items where sale_id = $1`,
      [sale.sale_id],
    );
    eq(agg.line_total, sale.total, "line totals sum exactly to the invoice total");
    eq(agg.line_profit, sale.gross_profit, "line profits sum exactly to the invoice profit");
    eq(agg.line_discount, sale.discount, "allocated discounts sum exactly to the invoice discount");

    const header = await one<{ subtotal: number; discount: number; total: number; total_cost: number; gross_profit: number }>(
      `select subtotal, discount, total, total_cost, gross_profit from public.sales where id = $1`,
      [sale.sale_id],
    );
    eq(header.total, header.subtotal - header.discount, "total = subtotal − discount");
    eq(header.gross_profit, header.total - header.total_cost, "gross profit = total − cost");
  });

  // =========================================================================
  suite("Returns");
  // =========================================================================
  await asOwner(owner, async () => {
    const sale = await sell([{ product_id: mascara, quantity: 4, unit_selling_price: inr(500) }], {
      saleDate: "2026-03-09T10:00:00+05:30",
    });
    const item = await one<{ id: string; purchase_batch_id: string }>(
      `select id, purchase_batch_id from public.sale_items where sale_id = $1`,
      [sale.sale_id],
    );
    const stockBefore = await one<{ quantity_on_hand: number }>(
      `select quantity_on_hand from public.product_inventory where product_id = $1`,
      [mascara],
    );

    await client.query(`select public.return_sale_items($1::uuid, $2::jsonb, $3)`, [
      sale.sale_id,
      JSON.stringify([{ sale_item_id: item.id, quantity: 1 }]),
      "Customer changed her mind",
    ]);

    const after = await one<{
      status: string;
      return_amount: number;
      total: number;
      total_cost: number;
      gross_profit: number;
      subtotal: number;
      discount: number;
    }>(`select status, return_amount, total, total_cost, gross_profit, subtotal, discount
          from public.sales where id = $1`, [sale.sale_id]);

    eq(after.status, "partially_returned", "the sale becomes partially returned");
    eq(after.return_amount, inr(500), "one unit of ₹500 is credited back");
    eq(after.total, after.subtotal - after.discount - after.return_amount, "net sales drops by the return");
    eq(after.total_cost, inr(1200), "COGS now covers only the 3 retained units");
    eq(after.gross_profit, inr(300), "retained profit is 3 × (₹500 − ₹400)");

    const stockAfter = await one<{ quantity_on_hand: number }>(
      `select quantity_on_hand from public.product_inventory where product_id = $1`,
      [mascara],
    );
    eq(stockAfter.quantity_on_hand, stockBefore.quantity_on_hand + 1, "the returned unit goes back on the shelf");

    const movement = await one<{ movement_type: string; quantity: number }>(
      `select movement_type, quantity from public.stock_movements
        where reference_id = $1 and movement_type = 'sale_return'`,
      [sale.sale_id],
    );
    eq(movement.quantity, 1, "a sale_return movement is logged");

    await throwsWithCode(
      () =>
        client.query(`select public.return_sale_items($1::uuid, $2::jsonb, $3)`, [
          sale.sale_id,
          JSON.stringify([{ sale_item_id: item.id, quantity: 99 }]),
          "too many",
        ]),
      "AU005",
      "returning more units than were sold is refused",
    );

    // Full return of the remainder flips the status.
    await client.query(`select public.return_sale_items($1::uuid, $2::jsonb, $3)`, [
      sale.sale_id,
      JSON.stringify([{ sale_item_id: item.id, quantity: 3 }]),
      "Full return",
    ]);
    const full = await one<{ status: string; total: number; gross_profit: number }>(
      `select status, total, gross_profit from public.sales where id = $1`,
      [sale.sale_id],
    );
    eq(full.status, "returned", "a fully returned sale is marked returned");
    eq(full.total, 0, "net sales for a fully returned invoice is zero");
    eq(full.gross_profit, 0, "and it contributes no profit");
  });

  // =========================================================================
  suite("Voiding is a reversal, not a delete");
  // =========================================================================
  let voidedTotal = 0;
  await asOwner(owner, async () => {
    const sale = await sell([{ product_id: mascara, quantity: 2, unit_selling_price: inr(500) }], {
      saleDate: "2026-03-10T10:00:00+05:30",
    });
    voidedTotal = sale.total as number;
    const before = await one<{ quantity_on_hand: number }>(
      `select quantity_on_hand from public.product_inventory where product_id = $1`,
      [mascara],
    );
    await client.query(`select public.void_sale($1::uuid, $2)`, [sale.sale_id, "Entered by mistake"]);

    const row = await one<{ status: string }>(`select status from public.sales where id = $1`, [sale.sale_id]);
    eq(row.status, "voided", "the sale is marked voided");

    const stillThere = await one<{ n: number }>(
      `select count(*)::int as n from public.sales where id = $1`,
      [sale.sale_id],
    );
    eq(stillThere.n, 1, "the record is kept for audit, not deleted");

    const after = await one<{ quantity_on_hand: number }>(
      `select quantity_on_hand from public.product_inventory where product_id = $1`,
      [mascara],
    );
    eq(after.quantity_on_hand, before.quantity_on_hand + 2, "voiding returns the stock");
  });

  // =========================================================================
  suite("Drafts and voids are invisible to the P&L");
  // =========================================================================
  {
    // Drafts cannot be created through the RPC at all, so one is planted
    // directly (as superuser) to prove reporting ignores it.
    await client.query(
      `insert into public.sales (user_id, invoice_number, status, sale_date, subtotal, discount,
                                 return_amount, total, total_cost, gross_profit)
       values ($1, 'DRAFT-0001', 'draft', '2026-03-10T10:00:00+05:30', 999999, 0, 0, 999999, 0, 999999)`,
      [owner],
    );
    const pl = await asOwner(owner, () =>
      one<{ gross_sales: number; realized_gross_profit: number }>(
        `select gross_sales, realized_gross_profit
           from public.report_pl_summary('custom', '2026-03-10', '2026-03-10')`,
      ),
    );
    ok(pl.gross_sales < 999999, "the draft's revenue is excluded");
    ok(
      pl.gross_sales === voidedTotal - voidedTotal, // the only other sale that day was voided
      "the voided sale contributes nothing either",
    );
    eq(pl.realized_gross_profit, 0, "10 March shows no realized profit at all");
  }

  // =========================================================================
  suite("Stock adjustments require a reason");
  // =========================================================================
  await asOwner(owner, async () => {
    await throwsWithCode(
      () =>
        client.query(`select public.adjust_stock($1::uuid, 'damaged', -2, $2, null)`, [mascara, "   "]),
      "22023",
      "an adjustment without a reason is refused",
    );

    const before = await one<{ quantity_on_hand: number }>(
      `select quantity_on_hand from public.product_inventory where product_id = $1`,
      [mascara],
    );
    await client.query(`select public.adjust_stock($1::uuid, 'damaged', -2, $2, null)`, [
      mascara,
      "Two tubes crushed in transit",
    ]);
    const after = await one<{ quantity_on_hand: number }>(
      `select quantity_on_hand from public.product_inventory where product_id = $1`,
      [mascara],
    );
    eq(after.quantity_on_hand, before.quantity_on_hand - 2, "damaged units leave inventory");

    await throwsWithCode(
      () =>
        client.query(`select public.adjust_stock($1::uuid, 'damaged', -99999, $2, null)`, [
          mascara,
          "impossible",
        ]),
      "22023",
      "an adjustment cannot drive stock negative",
    );
  });

  // =========================================================================
  suite("Expenses reduce net profit");
  // =========================================================================
  await asOwner(owner, async () => {
    const cat = await one<{ id: string }>(
      `select id from public.expense_categories where user_id = $1 and name = 'Packaging'`,
      [owner],
    );
    await client.query(
      `insert into public.expenses (user_id, expense_category_id, title, amount, expense_date)
       values ($1, $2, 'Gift boxes', $3, '2026-03-08')`,
      [owner, cat.id, inr(750)],
    );

    const pl = await one<{
      realized_gross_profit: number;
      operating_expenses: number;
      net_profit: number;
      status: string;
    }>(`select realized_gross_profit, operating_expenses, net_profit, status
          from public.report_pl_summary('custom', '2026-03-08', '2026-03-08')`);

    eq(pl.operating_expenses, inr(750), "the expense lands on its expense_date");
    eq(
      pl.net_profit,
      pl.realized_gross_profit - pl.operating_expenses,
      "net profit = realized gross profit − operating expenses",
    );

    const inventoryPurchase = await one<{ inventory_purchased: number; operating_expenses: number }>(
      `select inventory_purchased, operating_expenses
         from public.report_pl_summary('custom', '2026-03-02', '2026-03-02')`,
    );
    eq(inventoryPurchase.inventory_purchased, inr(4000), "stock bought on 2 March is inventory investment");
    eq(inventoryPurchase.operating_expenses, 0, "buying stock is NOT an operating expense");
  });

  // =========================================================================
  suite("Shop timezone drives every calendar boundary");
  // =========================================================================
  await asOwner(owner, async () => {
    // 19:00 UTC is already the next day in Asia/Kolkata (+05:30).
    await purchase([{ product_id: foundation, quantity: 10, unit_cost: inr(700) }], { date: "2026-04-01" });
    await sell([{ product_id: foundation, quantity: 1, unit_selling_price: inr(900) }], {
      saleDate: "2026-04-10T19:00:00Z",
    });

    const kolkata = await q<{ day: string; net_sales: number }>(
      `select day, net_sales from public.report_daily_series('custom', '2026-04-10', '2026-04-11')`,
    );
    eq(kolkata.find((r) => r.day === "2026-04-11")?.net_sales, inr(900),
      "a 19:00 UTC sale belongs to 11 April in Asia/Kolkata");
    eq(kolkata.find((r) => r.day === "2026-04-10")?.net_sales, 0,
      "and contributes nothing to 10 April");
  });

  await asOwner(owner, async () => {
    await client.query(`update public.profiles set timezone = 'UTC' where id = $1`, [owner]);
    const utc = await q<{ day: string; net_sales: number }>(
      `select day, net_sales from public.report_daily_series('custom', '2026-04-10', '2026-04-11')`,
    );
    eq(utc.find((r) => r.day === "2026-04-10")?.net_sales, inr(900),
      "the same sale moves to 10 April when the shop timezone is UTC");
    await client.query(`update public.profiles set timezone = 'Asia/Kolkata' where id = $1`, [owner]);
  });

  // =========================================================================
  suite("Quick date filters");
  // =========================================================================
  await asOwner(owner, async () => {
    const today = await one<{ period_start: string; period_end: string }>(
      `select period_start, period_end from public.report_period('today')`,
    );
    const shopToday = await one<{ d: string }>(`select today as d from public.shop_context()`);
    eq(today.period_start, shopToday.d, "Today starts on the shop's current calendar day");
    eq(today.period_end, shopToday.d, "…and ends on the same day");

    const yesterday = await one<{ period_start: string; period_end: string }>(
      `select period_start, period_end from public.report_period('yesterday')`,
    );
    const expectedYesterday = await one<{ d: string }>(
      `select (today - 1)::date as d from public.shop_context()`,
    );
    eq(yesterday.period_start, expectedYesterday.d, "Yesterday is the previous complete day");
    eq(yesterday.period_end, expectedYesterday.d, "Yesterday is exactly one day long");

    for (const [key, days] of [
      ["last_5_days", 5],
      ["last_10_days", 10],
      ["last_20_days", 20],
      ["last_30_days", 30],
    ] as const) {
      const rows = await q<{ day: string }>(`select day from public.report_daily_series($1)`, [key]);
      eq(rows.length, days, `${key} spans exactly ${days} calendar days`);
      eq(rows[rows.length - 1]?.day, shopToday.d, `${key} includes today as its last day`);
    }

    const thisMonth = await one<{ period_start: string; period_end: string }>(
      `select period_start, period_end from public.report_period('this_month')`,
    );
    ok(thisMonth.period_start.endsWith("-01"), "This Month starts on the 1st");

    const lastMonth = await one<{ period_start: string; period_end: string }>(
      `select period_start, period_end from public.report_period('last_month')`,
    );
    ok(lastMonth.period_start.endsWith("-01"), "Last Month starts on the 1st");
    ok(lastMonth.period_end < thisMonth.period_start, "Last Month ends before This Month begins");

    const allTime = await one<{ period_start: string; period_end: string; label: string }>(
      `select period_start, period_end, label from public.report_period('all_time')`,
    );
    eq(allTime.period_start, "2026-01-10", "All Time reaches back to the very first purchase");
    eq(allTime.period_end, shopToday.d, "All Time runs through today");

    await throwsWithCode(
      () => q(`select * from public.report_period('custom', '2026-05-01', '2026-04-01')`),
      "22023",
      "a custom range with an inverted order is refused",
    );
    await throwsWithCode(
      () => q(`select * from public.report_period('nonsense')`),
      "22023",
      "an unknown period key is refused",
    );
  });

  // =========================================================================
  suite("Zero-value periods still appear");
  // =========================================================================
  await asOwner(owner, async () => {
    const days = await q<{ day: string; net_sales: number; order_count: number }>(
      `select day, net_sales, order_count
         from public.report_daily_series('custom', '2026-03-11', '2026-03-20')`,
    );
    eq(days.length, 10, "every day in the range is present");
    ok(days.every((d) => d.net_sales === 0 && d.order_count === 0), "quiet days are reported as zero, not skipped");

    const months = await q<{ month: string; net_sales: number }>(
      `select month, net_sales from public.report_monthly_series('2026-01-01', '2026-12-31')`,
    );
    eq(months.length, 12, "a full year yields twelve months");
    ok(months.some((m) => m.net_sales === 0), "months with no trade are present with zero values");
    eq(months[0]?.month, "2026-01-01", "months are keyed to the first of the month");

    const years = await q<{ year: number; net_sales: number }>(
      `select year, net_sales from public.report_yearly_series()`,
    );
    ok(years.length >= 1, "the yearly series covers every year of use");
    eq(years[0]?.year, 2026, "history begins in the first year of use");

    const bounds = await one<{ earliest_date: string; latest_date: string }>(
      `select earliest_date, latest_date from public.report_bounds()`,
    );
    eq(bounds.earliest_date, "2026-01-10", "month/year selectors are derived from the first record");
  });

  // =========================================================================
  suite("P&L arithmetic ties out");
  // =========================================================================
  await asOwner(owner, async () => {
    const pl = await one<{
      gross_sales: number;
      discounts: number;
      returns_amount: number;
      net_sales: number;
      cost_of_goods_sold: number;
      realized_gross_profit: number;
      operating_expenses: number;
      net_profit: number;
      gross_margin_pct: number;
      order_count: number;
      units_sold: number;
      average_order_value: number;
      status: string;
    }>(`select * from public.report_pl_summary('all_time')`);

    eq(
      pl.net_sales,
      pl.gross_sales - pl.discounts - pl.returns_amount,
      "net sales = gross sales − discounts − returns",
    );
    eq(
      pl.realized_gross_profit,
      pl.net_sales - pl.cost_of_goods_sold,
      "realized gross profit = net sales − FIFO cost of goods sold",
    );
    eq(pl.net_profit, pl.realized_gross_profit - pl.operating_expenses, "net profit = gross profit − expenses");
    eq(
      pl.average_order_value,
      Math.round(pl.net_sales / pl.order_count),
      "average order value = net sales ÷ completed orders",
    );
    ok(pl.units_sold > 0, "units sold is counted net of returns");
    ok(["net_profit", "net_loss", "breakeven"].includes(pl.status), "a net status is always resolved");

    // The daily series must reconcile with the summary for the same window.
    const daily = await q<{ net_sales: number; realized_gross_profit: number; operating_expenses: number }>(
      `select net_sales, realized_gross_profit, operating_expenses
         from public.report_daily_series('all_time')`,
    );
    const sum = (k: "net_sales" | "realized_gross_profit" | "operating_expenses"): number =>
      daily.reduce((acc, r) => acc + r[k], 0);
    eq(sum("net_sales"), pl.net_sales, "daily net sales reconcile with the summary");
    eq(sum("realized_gross_profit"), pl.realized_gross_profit, "daily gross profit reconciles");
    eq(sum("operating_expenses"), pl.operating_expenses, "daily expenses reconcile");

    const monthly = await q<{ net_sales: number }>(`select net_sales from public.report_monthly_series()`);
    eq(
      monthly.reduce((a, r) => a + r.net_sales, 0),
      pl.net_sales,
      "monthly history reconciles with all-time net sales",
    );
    const yearly = await q<{ net_sales: number }>(`select net_sales from public.report_yearly_series()`);
    eq(
      yearly.reduce((a, r) => a + r.net_sales, 0),
      pl.net_sales,
      "yearly history reconciles with all-time net sales",
    );
  });

  // =========================================================================
  suite("Supporting report functions");
  // =========================================================================
  await asOwner(owner, async () => {
    const products = await q<{ name: string; net_profit: number; units_sold: number }>(
      `select name, net_profit, units_sold from public.report_product_profitability('all_time')`,
    );
    ok(products.length > 0, "product profitability returns aggregated rows");
    for (let i = 1; i < products.length; i += 1) {
      ok(
        (products[i - 1]?.net_profit ?? 0) >= (products[i]?.net_profit ?? 0),
        "products are ordered most to least profitable",
      );
      break;
    }

    const methods = await q<{ payment_method: string; net_sales: number }>(
      `select payment_method, net_sales from public.report_payment_methods('all_time')`,
    );
    ok(methods.length > 0, "sales are grouped by payment method");

    const expenses = await q<{ name: string; total_amount: number; share_pct: number }>(
      `select name, total_amount, share_pct from public.report_expenses_by_category('all_time')`,
    );
    eq(expenses[0]?.share_pct, 100, "a single expense category accounts for 100% of spend");

    const losses = await q<{ invoice_number: string; gross_profit: number }>(
      `select invoice_number, gross_profit from public.report_loss_making_sales('all_time')`,
    );
    ok(losses.length > 0, "loss-making invoices are listed");
    ok(losses.every((l) => l.gross_profit <= 0), "…and only loss or break-even invoices appear");

    const projected = await q<{ name: string; projected_gross_profit: number }>(
      `select name, projected_gross_profit from public.report_projected_by_category()`,
    );
    ok(projected.length > 0, "projected profit is broken down by category");

    const snapshot = await one<{ dashboard_snapshot: Json }>(`select public.dashboard_snapshot()`);
    const snap = snapshot.dashboard_snapshot;
    ok(snap.today !== undefined && snap.yesterday !== undefined, "the dashboard returns today and yesterday");
    const comparison = snap.comparison as Json;
    eq(comparison.net_sales_pct, null, "a zero baseline yields null, never an infinite percentage");
    const inventory = snap.inventory as Json;
    ok((inventory.investment as number) > 0, "current inventory investment is reported");
    const alerts = snap.alerts as Json;
    ok(typeof alerts.low_stock === "number", "stock alerts are counted");
  });

  // =========================================================================
  suite("Row Level Security");
  // =========================================================================
  await asOwner(other, async () => {
    const products = await q(`select id from public.products`);
    eq(products.length, 0, "another signed-in user sees none of the owner's products");
    const sales = await q(`select id from public.sales`);
    eq(sales.length, 0, "…nor any of their sales");
    const batches = await q(`select id from public.purchase_batches`);
    eq(batches.length, 0, "…nor any purchase batches");
    const movements = await q(`select id from public.stock_movements`);
    eq(movements.length, 0, "…nor any stock movements");
    const expenses = await q(`select id from public.expenses`);
    eq(expenses.length, 0, "…nor any expenses");
    const profiles = await q(`select id from public.profiles`);
    eq(profiles.length, 1, "each owner sees only their own profile");

    const pl = await one<{ gross_sales: number }>(`select gross_sales from public.report_pl_summary('all_time')`);
    eq(pl.gross_sales, 0, "reporting RPCs are scoped to the caller, not the database");

    // RLS filters the row out of the UPDATE's scope, so the statement is a
    // no-op rather than an error — the row must be untouched either way.
    const attempt = await client.query(
      `update public.products set recommended_selling_price = 1 where id = $1`,
      [lipstick],
    );
    eq(attempt.rowCount, 0, "an update aimed at another owner's product matches no rows");
  });

  {
    const untouched = await one<{ recommended_selling_price: number }>(
      `select recommended_selling_price from public.products where id = $1`,
      [lipstick],
    );
    eq(untouched.recommended_selling_price, inr(300), "…and the price is genuinely unchanged");
  }

  await asOwner(owner, async () => {
    await throwsWithCode(
      () =>
        client.query(
          `insert into public.sales (user_id, invoice_number, subtotal, discount, return_amount, total, total_cost, gross_profit)
           values ($1, 'HAND-0001', 100000, 0, 0, 100000, 0, 100000)`,
          [owner],
        ),
      "42501",
      "a browser cannot insert a sale directly — only the RPC can",
    );
    await throwsWithCode(
      () =>
        client.query(
          `insert into public.purchase_batches (user_id, product_id, quantity_purchased, quantity_remaining, unit_cost)
           values ($1, $2, 5, 5, 1)`,
          [owner, mascara],
        ),
      "42501",
      "…nor a purchase batch",
    );
    await throwsWithCode(
      () =>
        client.query(
          `insert into public.stock_movements (user_id, product_id, movement_type, quantity)
           values ($1, $2, 'purchase', 500)`,
          [owner, mascara],
        ),
      "42501",
      "…nor a stock movement",
    );
    await throwsWithCode(
      () => client.query(`delete from public.sales where user_id = $1`, [owner]),
      "42501",
      "completed financial records cannot be hard-deleted",
    );
  });

  {
    const anonRows = await (async () => {
      await client.query("set role anon");
      try {
        return await q(`select id from public.products`);
      } catch (error) {
        return error as Error;
      } finally {
        await client.query("reset role");
      }
    })();
    ok(anonRows instanceof Error, "an anonymous visitor is denied outright");
  }

  {
    const tables = await q<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables
        where schemaname = 'public' order by tablename`,
    );
    ok(tables.length === 11, `all eleven business tables exist (found ${tables.length})`);
    ok(tables.every((t) => t.rowsecurity), "row level security is enabled on every one of them");
  }

  await client.end();
  finish();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
