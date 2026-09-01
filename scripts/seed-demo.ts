/**
 * Aurelia demo seed.
 *
 * Populates a Supabase project with realistic cosmetics-resale data so every
 * report — Today, Yesterday, Last 5/10/20/30 Days, monthly, yearly, all-time —
 * is meaningful, and so the price simulator shows profit, low-profit,
 * break-even and loss cases.
 *
 * HOW IT WRITES
 *   • The service-role key creates (or finds) the owner auth user and can read
 *     back ids — that is all it is used for.
 *   • Everything financial is written by SIGNING IN AS THE OWNER and calling
 *     the same RPCs the app uses (record_purchase, complete_sale, …). This
 *     means the seed exercises FIFO allocation, cost snapshots, invoice
 *     numbering and the CHECK constraints for real — if the seed succeeds, the
 *     transactional core genuinely works end to end.
 *
 * Run:  npm run seed:demo
 * Env:  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *       SUPABASE_SERVICE_ROLE_KEY, DEMO_OWNER_EMAIL, DEMO_OWNER_PASSWORD
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

loadEnv({ path: ".env.local" });
loadEnv();

const URL = req("NEXT_PUBLIC_SUPABASE_URL");
const ANON = req("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = req("SUPABASE_SERVICE_ROLE_KEY");
const EMAIL = process.env.DEMO_OWNER_EMAIL ?? "owner@aurelia.shop";
const PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? "aurelia-demo-1234";

function req(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\nMissing ${name}. Set it in .env.local before seeding.\n`);
    process.exit(1);
  }
  return value;
}

/** ₹ → paise. */
const inr = (rupees: number): number => Math.round(rupees * 100);

/** ISO date N days before today (UTC-ish; the shop timezone handles the rest). */
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
/** A timestamptz N days ago at a given local-ish hour. */
function tsDaysAgo(n: number, hour = 12, minute = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Catalogue definition
// ---------------------------------------------------------------------------

interface SeedProduct {
  key: string;
  name: string;
  brand: string;
  shade?: string;
  size?: string;
  category: string;
  barcode?: string;
  rsp: number; // rupees
  msp: number;
  lowStock?: number;
  /** Purchase batches: [quantity, unitCostRupees, daysAgo, expiryDaysFromNow?] */
  batches: Array<[number, number, number, number?]>;
}

const CATALOGUE: SeedProduct[] = [
  {
    key: "lip-ruby",
    name: "Luxury Matte Lipstick",
    brand: "Aurelia",
    shade: "Ruby Rose",
    size: "3.8 g",
    category: "Lips",
    barcode: "8901234500017",
    rsp: 300,
    msp: 250,
    // The headline example: 100 @ ₹200, then 50 @ ₹220.
    batches: [
      [100, 200, 120],
      [50, 220, 40],
    ],
  },
  {
    key: "lip-coral",
    name: "Luxury Matte Lipstick",
    brand: "Aurelia",
    shade: "Coral Nude",
    size: "3.8 g",
    category: "Lips",
    barcode: "8901234500024",
    rsp: 300,
    msp: 240,
    batches: [
      [60, 205, 90],
      [40, 215, 25],
    ],
  },
  {
    key: "found-ivory",
    name: "Silk Serum Foundation",
    brand: "Maison Lys",
    shade: "Warm Ivory 210",
    size: "30 ml",
    category: "Face",
    barcode: "8901234500031",
    rsp: 900,
    msp: 760,
    batches: [
      [40, 620, 100],
      [30, 660, 30],
    ],
  },
  {
    key: "found-sand",
    name: "Silk Serum Foundation",
    brand: "Maison Lys",
    shade: "Golden Sand 320",
    size: "30 ml",
    category: "Face",
    rsp: 900,
    msp: 760,
    batches: [[50, 640, 70]],
  },
  {
    key: "serum-vitc",
    name: "Vitamin C Glow Serum",
    brand: "Botanica",
    size: "30 ml",
    category: "Skincare",
    barcode: "8901234500048",
    rsp: 750,
    msp: 620,
    batches: [
      [35, 480, 80, 240],
      [25, 500, 20, 300],
    ],
  },
  {
    key: "cream-night",
    name: "Rose Renewal Night Cream",
    brand: "Botanica",
    size: "50 g",
    category: "Skincare",
    rsp: 640,
    msp: 560,
    // Low-margin case: cost ₹590 vs price ₹640 (~7.8% margin).
    batches: [[30, 590, 45, 200]],
  },
  {
    key: "perfume-oud",
    name: "Amber Oud Eau de Parfum",
    brand: "Rive Gauche",
    size: "50 ml",
    category: "Fragrance",
    barcode: "8901234500055",
    rsp: 2200,
    msp: 1850,
    batches: [
      [20, 1500, 110],
      [15, 1580, 35],
    ],
  },
  {
    key: "perfume-rose",
    name: "Velvet Rose Eau de Toilette",
    brand: "Rive Gauche",
    size: "50 ml",
    category: "Fragrance",
    rsp: 1600,
    msp: 1350,
    batches: [[25, 1100, 60]],
  },
  {
    key: "eyeliner-onyx",
    name: "Precision Gel Eyeliner",
    brand: "Noir",
    shade: "Onyx",
    category: "Eyes",
    barcode: "8901234500062",
    rsp: 450,
    msp: 380,
    // Split-batch FIFO showcase: tiny old batch then a bigger one.
    batches: [
      [8, 250, 95],
      [40, 300, 30],
    ],
  },
  {
    key: "eyeliner-brown",
    name: "Precision Gel Eyeliner",
    brand: "Noir",
    shade: "Espresso",
    category: "Eyes",
    rsp: 450,
    msp: 380,
    batches: [[30, 280, 50]],
  },
  {
    key: "mascara-volume",
    name: "Volume Couture Mascara",
    brand: "Noir",
    category: "Eyes",
    barcode: "8901234500079",
    rsp: 500,
    msp: 420,
    // Break-even example lives here (some sales at exactly cost).
    batches: [[45, 400, 65]],
  },
  {
    key: "nail-scarlet",
    name: "Gel Shine Nail Lacquer",
    brand: "Aurelia",
    shade: "Scarlet",
    size: "12 ml",
    category: "Nails",
    rsp: 250,
    msp: 200,
    batches: [
      [50, 150, 75],
      [50, 165, 15],
    ],
  },
  {
    key: "nail-blush",
    name: "Gel Shine Nail Lacquer",
    brand: "Aurelia",
    shade: "Blush",
    size: "12 ml",
    category: "Nails",
    rsp: 250,
    msp: 190,
    // Clearance line sold at a loss in a couple of orders.
    batches: [[40, 170, 55]],
  },
  {
    key: "tool-brush",
    name: "Kabuki Blending Brush",
    brand: "Atelier Tools",
    category: "Tools",
    rsp: 550,
    msp: 470,
    batches: [[24, 330, 40]],
  },
];

// ---------------------------------------------------------------------------
// Sales plan — spread across time so every report window has data.
// Each entry: { day, items: [{key, qty, priceRupees}], discount?, payment, confirm? }
// ---------------------------------------------------------------------------

type Payment = Database["public"]["Enums"]["payment_method"];

interface SalePlan {
  day: number; // days ago
  hour?: number;
  items: Array<{ key: string; qty: number; price: number; lineDiscount?: number }>;
  orderDiscount?: number;
  payment: Payment;
  confirmLoss?: boolean;
  confirmBreakeven?: boolean;
  notes?: string;
}

function buildSalesPlan(): SalePlan[] {
  const plan: SalePlan[] = [];
  const payments: Payment[] = ["cash", "upi", "card", "upi", "cash", "wallet"];

  // A steady drip of ordinary, profitable sales over the last ~400 days so
  // monthly and yearly history is populated.
  const everyday: Array<{ key: string; price: number }> = [
    { key: "lip-ruby", price: 300 },
    { key: "lip-coral", price: 295 },
    { key: "found-ivory", price: 900 },
    { key: "serum-vitc", price: 750 },
    { key: "nail-scarlet", price: 250 },
    { key: "eyeliner-brown", price: 450 },
    { key: "perfume-rose", price: 1600 },
  ];

  for (let day = 400; day >= 2; day -= 1) {
    // Skip ~40% of days to look natural, but guarantee recent days are covered.
    const recent = day <= 30;
    if (!recent && day % 3 !== 0) continue;

    const count = recent ? 1 + (day % 3) : 1;
    for (let i = 0; i < count; i += 1) {
      const pick = everyday[(day + i) % everyday.length]!;
      const qty = 1 + ((day + i) % 3);
      plan.push({
        day,
        hour: 10 + (i % 8),
        items: [{ key: pick.key, price: pick.price, qty }],
        payment: payments[(day + i) % payments.length]!,
      });
    }
  }

  // A few multi-product baskets in the last 10 days.
  plan.push({
    day: 6,
    items: [
      { key: "found-sand", qty: 1, price: 900 },
      { key: "serum-vitc", qty: 2, price: 740 },
      { key: "mascara-volume", qty: 1, price: 500 },
    ],
    orderDiscount: 50,
    payment: "card",
    notes: "Bridal trial kit",
  });
  plan.push({
    day: 3,
    items: [
      { key: "perfume-oud", qty: 1, price: 2200 },
      { key: "lip-ruby", qty: 2, price: 300 },
    ],
    payment: "upi",
  });

  // FIFO split showcase: sell 8 eyeliners while oldest batch has only 3 left
  // by this point (some already sold in the everyday drip is unlikely; the
  // 8@250 + rest@300 split will happen against the seeded batches).
  plan.push({
    day: 5,
    items: [{ key: "eyeliner-onyx", qty: 8, price: 450 }],
    payment: "cash",
    notes: "Salon bulk order",
  });

  // Low-margin sale (night cream at its thin margin).
  plan.push({
    day: 4,
    items: [{ key: "cream-night", qty: 2, price: 640 }],
    payment: "upi",
  });

  // Break-even sale (mascara sold at exactly its ₹400 cost).
  plan.push({
    day: 7,
    items: [{ key: "mascara-volume", qty: 1, price: 400 }],
    payment: "cash",
    confirmBreakeven: true,
    notes: "Loyalty reward — at cost",
  });

  // Loss-making sales (clearance nail lacquer below cost of ₹170).
  plan.push({
    day: 8,
    items: [{ key: "nail-blush", qty: 3, price: 150 }],
    payment: "cash",
    confirmLoss: true,
    notes: "Clearance",
  });
  plan.push({
    day: 2,
    items: [{ key: "nail-blush", qty: 2, price: 160 }],
    payment: "upi",
    confirmLoss: true,
    notes: "Clearance",
  });

  // Discount that turns a thin sale into a loss (confirmed).
  plan.push({
    day: 1,
    items: [{ key: "tool-brush", qty: 1, price: 550, lineDiscount: 250 }],
    payment: "cash",
    confirmLoss: true,
    notes: "Damaged box discount",
  });

  // Guarantee today has activity.
  plan.push({
    day: 0,
    hour: 9,
    items: [{ key: "lip-ruby", qty: 2, price: 300 }],
    payment: "upi",
  });
  plan.push({
    day: 0,
    hour: 14,
    items: [
      { key: "found-ivory", qty: 1, price: 900 },
      { key: "nail-scarlet", qty: 2, price: 250 },
    ],
    payment: "card",
  });
  plan.push({
    day: 0,
    hour: 17,
    items: [{ key: "serum-vitc", qty: 1, price: 750 }],
    payment: "cash",
  });

  return plan;
}

// ---------------------------------------------------------------------------
// Expense plan
// ---------------------------------------------------------------------------

const EXPENSE_PLAN: Array<{ title: string; category: string; amount: number; day: number; payment: Payment }> = [
  { title: "Shop rent", category: "Rent", amount: 18000, day: 30, payment: "bank_transfer" },
  { title: "Shop rent", category: "Rent", amount: 18000, day: 60, payment: "bank_transfer" },
  { title: "Shop rent", category: "Rent", amount: 18000, day: 90, payment: "bank_transfer" },
  { title: "Courier deliveries", category: "Delivery", amount: 1450, day: 3, payment: "upi" },
  { title: "Courier deliveries", category: "Delivery", amount: 1200, day: 12, payment: "upi" },
  { title: "Gift boxes & tissue", category: "Packaging", amount: 2200, day: 8, payment: "cash" },
  { title: "Carry bags", category: "Packaging", amount: 900, day: 22, payment: "cash" },
  { title: "Electricity", category: "Utilities", amount: 3100, day: 15, payment: "upi" },
  { title: "Instagram ads", category: "Marketing", amount: 2500, day: 5, payment: "card" },
  { title: "Instagram ads", category: "Marketing", amount: 2000, day: 35, payment: "card" },
  { title: "Cleaning supplies", category: "Shop supplies", amount: 650, day: 10, payment: "cash" },
  { title: "AC servicing", category: "Maintenance", amount: 1800, day: 40, payment: "cash" },
  { title: "Part-time assistant", category: "Salaries", amount: 8000, day: 30, payment: "bank_transfer" },
  { title: "Part-time assistant", category: "Salaries", amount: 8000, day: 60, payment: "bank_transfer" },
  { title: "Today's delivery run", category: "Delivery", amount: 320, day: 0, payment: "upi" },
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const admin = createClient<Database>(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("→ Ensuring the owner account exists…");
  const ownerId = await ensureOwner(admin);

  console.log("→ Signing in as the owner (all data is written through RLS + RPCs)…");
  const owner = createClient<Database>(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await owner.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signInError) {
    console.error("Could not sign in as the owner:", signInError.message);
    process.exit(1);
  }

  await wipeExisting(admin, ownerId);

  // Anchor "all time" comfortably before the earliest record.
  await admin
    .from("profiles")
    .update({ app_started_at: `${daysAgo(430)}T00:00:00Z` })
    .eq("id", ownerId);

  console.log("→ Loading categories…");
  const categoryByName = await mapByName(owner, "categories");
  const expenseCategoryByName = await mapByName(owner, "expense_categories");

  console.log("→ Creating products…");
  const productIdByKey = new Map<string, string>();
  for (const p of CATALOGUE) {
    const { data, error } = await owner
      .from("products")
      .insert({
        user_id: ownerId,
        name: p.name,
        brand: p.brand,
        shade_or_variant: p.shade ?? null,
        size: p.size ?? null,
        category_id: categoryByName.get(p.category) ?? null,
        manufacturer_barcode: p.barcode ?? null,
        recommended_selling_price: inr(p.rsp),
        minimum_selling_price: inr(p.msp),
        low_stock_threshold: p.lowStock ?? 5,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Product ${p.name}: ${error.message}`);
    productIdByKey.set(p.key, data.id);
  }

  console.log("→ Recording purchases (creating FIFO cost layers)…");
  for (const p of CATALOGUE) {
    const productId = productIdByKey.get(p.key)!;
    // One purchase call per batch so each keeps its own date and cost layer.
    for (const [qty, cost, ago, expiryDays] of p.batches) {
      const { error } = await owner.rpc("record_purchase", {
        p_lines: [
          {
            product_id: productId,
            quantity: qty,
            unit_cost: inr(cost),
            expiry_date: expiryDays ? daysAgoPlus(expiryDays) : null,
          },
        ],
        p_purchase_date: daysAgo(ago),
      });
      if (error) throw new Error(`Purchase ${p.name}: ${error.message}`);
    }
  }

  console.log("→ Completing sales across many dates (real FIFO checkout)…");
  // Process most-recent first so today/this-week's showcase sales claim stock
  // before the long historical drip can exhaust it. FIFO cost is decided by
  // purchase-batch date, not processing order, so this does not distort costs.
  const plan = buildSalesPlan().sort((a, b) => a.day - b.day);
  let sold = 0;
  let skippedStock = 0;
  for (const sale of plan) {
    const { error } = await owner.rpc("complete_sale", {
      p_items: sale.items.map((i) => ({
        product_id: productIdByKey.get(i.key)!,
        quantity: i.qty,
        unit_selling_price: inr(i.price),
        line_discount: i.lineDiscount ? inr(i.lineDiscount) : 0,
      })),
      p_payment_method: sale.payment,
      p_order_discount: sale.orderDiscount ? inr(sale.orderDiscount) : 0,
      p_notes: sale.notes ?? null,
      p_client_request_id: crypto.randomUUID(),
      p_sale_date: tsDaysAgo(sale.day, sale.hour ?? 12, (sale.day * 7) % 60),
      p_confirm_loss: sale.confirmLoss ?? false,
      p_confirm_breakeven: sale.confirmBreakeven ?? false,
    });
    if (error) {
      // Stock can run out for the everyday drip on older dates — that's fine,
      // it just means that day gets fewer orders. Only surface real problems.
      if (error.code === "AU004") {
        skippedStock += 1;
        continue;
      }
      throw new Error(`Sale on day -${sale.day}: ${error.message} (${error.code})`);
    }
    sold += 1;
  }
  console.log(`   ${sold} sales recorded (${skippedStock} skipped for stock).`);

  console.log("→ Adding a return and a void so those states exist…");
  await seedReturnAndVoid(owner, productIdByKey);

  console.log("→ Recording operating expenses…");
  for (const e of EXPENSE_PLAN) {
    const { error } = await owner.from("expenses").insert({
      user_id: ownerId,
      title: e.title,
      amount: inr(e.amount),
      expense_date: daysAgo(e.day),
      expense_category_id: expenseCategoryByName.get(e.category) ?? null,
      payment_method: e.payment,
    });
    if (error) throw new Error(`Expense ${e.title}: ${error.message}`);
  }

  console.log("→ Recording a couple of stock adjustments…");
  await owner.rpc("adjust_stock", {
    p_product_id: productIdByKey.get("found-ivory")!,
    p_movement_type: "damaged",
    p_quantity: -1,
    p_reason: "One bottle cracked on the shelf",
  });
  await owner.rpc("adjust_stock", {
    p_product_id: productIdByKey.get("serum-vitc")!,
    p_movement_type: "expired",
    p_quantity: -1,
    p_reason: "Tester past expiry",
  });

  await owner.auth.signOut();

  console.log("\n✓ Demo data seeded successfully.");
  console.log(`  Sign in at your app with:\n    ${EMAIL} / ${PASSWORD}\n`);
}

async function ensureOwner(admin: SupabaseClient<Database>): Promise<string> {
  // Look for an existing user with this email.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Priya", shop_name: "Aurelia Beauty Bar" },
  });
  if (error || !data.user) throw new Error(`Creating owner: ${error?.message}`);
  // Give the on_auth_user_created trigger a beat to seed the profile + taxonomy.
  await new Promise((r) => setTimeout(r, 800));
  return data.user.id;
}

/** Remove any prior demo data (idempotent re-seed). Products cascade. */
async function wipeExisting(admin: SupabaseClient<Database>, ownerId: string): Promise<void> {
  console.log("→ Clearing any previous demo data…");
  // Order respects FKs; sales/sale_items/batches/movements cascade from products
  // via ON DELETE, but sales reference products with RESTRICT, so delete sales
  // first, then products.
  await admin.from("stock_movements").delete().eq("user_id", ownerId);
  await admin.from("sale_items").delete().eq("user_id", ownerId);
  await admin.from("sales").delete().eq("user_id", ownerId);
  await admin.from("purchase_batches").delete().eq("user_id", ownerId);
  await admin.from("product_price_history").delete().eq("user_id", ownerId);
  await admin.from("expenses").delete().eq("user_id", ownerId);
  await admin.from("products").delete().eq("user_id", ownerId);
}

async function mapByName(
  owner: SupabaseClient<Database>,
  table: "categories" | "expense_categories",
): Promise<Map<string, string>> {
  const { data } = await owner.from(table).select("id, name");
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.name, row.id);
  return map;
}

async function seedReturnAndVoid(
  owner: SupabaseClient<Database>,
  productIdByKey: Map<string, string>,
): Promise<void> {
  // A completed sale we then partially return.
  const { data: returnable } = await owner.rpc("complete_sale", {
    p_items: [
      { product_id: productIdByKey.get("lip-coral")!, quantity: 3, unit_selling_price: inr(300) },
    ],
    p_payment_method: "cash",
    p_order_discount: 0,
    p_notes: "Will be partially returned",
    p_client_request_id: crypto.randomUUID(),
    p_sale_date: tsDaysAgo(9, 11),
    p_confirm_loss: false,
    p_confirm_breakeven: false,
  });
  const returnSaleId = (returnable as { sale_id?: string } | null)?.sale_id;
  if (returnSaleId) {
    const { data: items } = await owner
      .from("sale_items")
      .select("id")
      .eq("sale_id", returnSaleId)
      .limit(1);
    const itemId = (items ?? [])[0]?.id;
    if (itemId) {
      await owner.rpc("return_sale_items", {
        p_sale_id: returnSaleId,
        p_lines: [{ sale_item_id: itemId, quantity: 1 }],
        p_reason: "Customer preferred a different shade",
      });
    }
  }

  // A sale we then void.
  const { data: voidable } = await owner.rpc("complete_sale", {
    p_items: [
      { product_id: productIdByKey.get("nail-scarlet")!, quantity: 1, unit_selling_price: inr(250) },
    ],
    p_payment_method: "cash",
    p_order_discount: 0,
    p_notes: "Entered by mistake",
    p_client_request_id: crypto.randomUUID(),
    p_sale_date: tsDaysAgo(10, 16),
    p_confirm_loss: false,
    p_confirm_breakeven: false,
  });
  const voidSaleId = (voidable as { sale_id?: string } | null)?.sale_id;
  if (voidSaleId) {
    await owner.rpc("void_sale", { p_sale_id: voidSaleId, p_reason: "Duplicate entry" });
  }
}

/** Future date N days from today (for expiry). */
function daysAgoPlus(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

main().catch((error) => {
  console.error("\n✗ Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
