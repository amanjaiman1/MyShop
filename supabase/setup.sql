-- ===========================================================================
-- Aurelia — COMPLETE DATABASE SETUP (single file)
-- ---------------------------------------------------------------------------
-- This is all 7 migrations from supabase/migrations/ concatenated in order,
-- so you can set up the whole database in ONE paste into the Supabase SQL
-- Editor. It is safe to run once on a fresh project.
--
-- HOW TO USE:
--   1. Supabase dashboard -> SQL Editor -> New query
--   2. Paste this entire file
--   3. Click "Run"
--   4. You should see "Success. No rows returned."
--
-- (Advanced users can instead use the Supabase CLI: `supabase db push`,
--  which applies the individual files in supabase/migrations/.)
-- ===========================================================================


-- ###########################################################################
-- ##  20260101000000_schema.sql
-- ###########################################################################

-- ===========================================================================
-- Aurelia — core schema
-- ---------------------------------------------------------------------------
-- MONEY REPRESENTATION
--   Every monetary column is BIGINT holding *integer minor currency units*
--   (paise for INR, cents for USD). There is no floating-point money anywhere
--   in this database or in the application. Percentages are NUMERIC and are
--   only ever derived for display.
--
-- OWNERSHIP
--   Every business row carries user_id -> auth.users(id). RLS (next migration)
--   restricts all access to `auth.uid()`. The schema already supports several
--   users per deployment even though the product ships single-owner.
-- ===========================================================================

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.sale_status as enum (
  'draft',
  'completed',
  'partially_returned',
  'returned',
  'voided'
);

create type public.stock_movement_type as enum (
  'purchase',
  'sale',
  'sale_return',
  'purchase_return',
  'damaged',
  'expired',
  'manual_adjustment'
);

create type public.movement_reference_type as enum (
  'purchase_batch',
  'sale',
  'adjustment'
);

create type public.payment_method as enum (
  'cash',
  'upi',
  'card',
  'bank_transfer',
  'wallet',
  'credit',
  'other'
);

create type public.below_cost_behavior as enum (
  'allow',      -- record silently (still shows analysis)
  'warn',       -- require explicit confirmation  (default)
  'block'       -- refuse the sale in the database
);

-- ---------------------------------------------------------------------------
-- Timezone validation.
-- Marked IMMUTABLE so it can be used in a CHECK constraint; the IANA database
-- is effectively static for the lifetime of a row, and an invalid shop
-- timezone would silently corrupt every date-based report, so validating at
-- write time is worth it.
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_timezone(p_tz text)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_tz is null or btrim(p_tz) = '' then
    return false;
  end if;
  perform now() at time zone p_tz;
  return true;
exception
  when others then
    return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ===========================================================================
-- profiles — one row per owner; holds shop-wide settings
-- ===========================================================================
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  display_name          text        not null default 'Owner',
  shop_name             text        not null default 'My Beauty Shop',
  phone                 text,
  currency_code         text        not null default 'INR',
  currency_symbol       text        not null default '₹',
  timezone              text        not null default 'Asia/Kolkata',
  -- Margin the shop aims for, e.g. 30.00 (%)
  target_profit_margin  numeric(5, 2) not null default 30.00,
  -- At or below this margin (%) a price is flagged LOW PROFIT
  low_margin_threshold  numeric(5, 2) not null default 10.00,
  below_cost_sale_behavior public.below_cost_behavior not null default 'warn',
  -- Anchor for "All Time" reporting
  app_started_at        timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint profiles_display_name_len check (char_length(trim(display_name)) between 1 and 120),
  constraint profiles_shop_name_len    check (char_length(trim(shop_name)) between 1 and 160),
  constraint profiles_currency_code_fmt check (currency_code ~ '^[A-Z]{3}$'),
  constraint profiles_currency_symbol_len check (char_length(currency_symbol) between 1 and 8),
  constraint profiles_timezone_valid check (public.is_valid_timezone(timezone)),
  constraint profiles_target_margin_range check (target_profit_margin >= 0 and target_profit_margin < 100),
  constraint profiles_low_margin_range check (low_margin_threshold >= 0 and low_margin_threshold < 100),
  constraint profiles_margin_ordering check (low_margin_threshold <= target_profit_margin)
);

comment on table public.profiles is
  'Shop owner profile and shop-wide settings. timezone drives every date-based report.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- categories
-- ===========================================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default '#9E1F47',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint categories_name_len check (char_length(trim(name)) between 1 and 80),
  constraint categories_color_fmt check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index categories_user_name_key
  on public.categories (user_id, lower(trim(name)));

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- suppliers
-- ===========================================================================
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint suppliers_name_len check (char_length(trim(name)) between 1 and 160),
  constraint suppliers_email_fmt check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint suppliers_phone_len check (phone is null or char_length(phone) between 4 and 32)
);

create unique index suppliers_user_name_key
  on public.suppliers (user_id, lower(trim(name)));

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- products
-- ---------------------------------------------------------------------------
-- One row per *distinct sellable variant*. A lipstick in Ruby Rose and the
-- same lipstick in Coral Nude are two products. Quantity is NEVER stored here:
-- it always derives from purchase_batches so FIFO costing stays authoritative.
-- ===========================================================================
create table public.products (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users (id) on delete cascade,
  category_id               uuid references public.categories (id) on delete set null,
  sku                       text,
  manufacturer_barcode      text,
  -- Human-readable internal code, e.g. COS-000120. Generated, never blank.
  internal_code             text not null,
  name                      text not null,
  brand                     text,
  shade_or_variant          text,
  size                      text,
  description               text,
  image_url                 text,
  recommended_selling_price bigint not null default 0,   -- minor units
  minimum_selling_price     bigint not null default 0,   -- minor units
  low_stock_threshold       integer not null default 5,
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Fast, accent-insensitive-enough search surface for the POS
  search_document text generated always as (
    lower(
      coalesce(name, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(shade_or_variant, '') || ' ' ||
      coalesce(size, '') || ' ' ||
      coalesce(sku, '') || ' ' ||
      coalesce(internal_code, '') || ' ' ||
      coalesce(manufacturer_barcode, '')
    )
  ) stored,

  constraint products_name_len check (char_length(trim(name)) between 1 and 200),
  constraint products_internal_code_fmt check (internal_code ~ '^[A-Z0-9][A-Z0-9\-]{2,31}$'),
  constraint products_sku_len check (sku is null or char_length(trim(sku)) between 1 and 64),
  constraint products_barcode_len check (manufacturer_barcode is null or char_length(trim(manufacturer_barcode)) between 4 and 64),
  constraint products_rsp_nonneg check (recommended_selling_price >= 0),
  constraint products_msp_nonneg check (minimum_selling_price >= 0),
  constraint products_threshold_nonneg check (low_stock_threshold >= 0),
  constraint products_image_url_scheme check (image_url is null or image_url ~ '^https?://')
);

comment on column public.products.recommended_selling_price is 'Integer minor currency units.';
comment on column public.products.minimum_selling_price is 'Integer minor currency units. Floor price the owner refuses to go below.';

create unique index products_user_internal_code_key
  on public.products (user_id, internal_code);
create unique index products_user_sku_key
  on public.products (user_id, lower(trim(sku))) where sku is not null;
create unique index products_user_barcode_key
  on public.products (user_id, trim(manufacturer_barcode)) where manufacturer_barcode is not null;

create index products_user_active_name_idx
  on public.products (user_id, is_active, name);
create index products_user_category_idx
  on public.products (user_id, category_id);
create index products_search_trgm_idx
  on public.products using gin (search_document gin_trgm_ops);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- product_price_history — automatic audit of selling-price decisions
-- ===========================================================================
create table public.product_price_history (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  product_id              uuid not null references public.products (id) on delete cascade,
  previous_selling_price  bigint,
  new_selling_price       bigint,
  previous_minimum_price  bigint,
  new_minimum_price       bigint,
  changed_at              timestamptz not null default now(),

  constraint pph_prices_nonneg check (
    coalesce(previous_selling_price, 0) >= 0 and
    coalesce(new_selling_price, 0) >= 0 and
    coalesce(previous_minimum_price, 0) >= 0 and
    coalesce(new_minimum_price, 0) >= 0
  )
);

create index pph_product_changed_idx
  on public.product_price_history (product_id, changed_at desc);
create index pph_user_changed_idx
  on public.product_price_history (user_id, changed_at desc);

-- Record every change to either price, automatically.
create or replace function public.tg_record_price_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recommended_selling_price is distinct from old.recommended_selling_price
     or new.minimum_selling_price is distinct from old.minimum_selling_price then
    insert into public.product_price_history (
      user_id, product_id,
      previous_selling_price, new_selling_price,
      previous_minimum_price, new_minimum_price
    ) values (
      new.user_id, new.id,
      old.recommended_selling_price, new.recommended_selling_price,
      old.minimum_selling_price, new.minimum_selling_price
    );
  end if;
  return new;
end;
$$;

create trigger products_record_price_history
  after update of recommended_selling_price, minimum_selling_price on public.products
  for each row execute function public.tg_record_price_history();

-- Seed the history with the price the product was created at, so the timeline
-- has a genuine origin point rather than starting at the first edit.
create or replace function public.tg_seed_price_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.product_price_history (
    user_id, product_id,
    previous_selling_price, new_selling_price,
    previous_minimum_price, new_minimum_price, changed_at
  ) values (
    new.user_id, new.id,
    null, new.recommended_selling_price,
    null, new.minimum_selling_price, new.created_at
  );
  return new;
end;
$$;

create trigger products_seed_price_history
  after insert on public.products
  for each row execute function public.tg_seed_price_history();

-- ===========================================================================
-- purchase_batches — the FIFO cost layer
-- ---------------------------------------------------------------------------
-- Buying 100 identical items at one cost creates ONE row with
-- quantity_purchased = 100. Re-buying the same product at a different cost
-- creates a SECOND row. quantity_remaining is the live stock for that layer.
-- ===========================================================================
create table public.purchase_batches (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  product_id          uuid not null references public.products (id) on delete restrict,
  supplier_id         uuid references public.suppliers (id) on delete set null,
  quantity_purchased  integer not null,
  quantity_remaining  integer not null,
  unit_cost           bigint  not null,          -- minor units
  purchase_date       date    not null default current_date,
  lot_number          text,
  expiry_date         date,
  reference_number    text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint pb_qty_purchased_positive check (quantity_purchased > 0),
  constraint pb_qty_remaining_range check (quantity_remaining >= 0 and quantity_remaining <= quantity_purchased),
  constraint pb_unit_cost_nonneg check (unit_cost >= 0),
  constraint pb_expiry_after_purchase check (expiry_date is null or expiry_date >= purchase_date),
  constraint pb_lot_len check (lot_number is null or char_length(trim(lot_number)) between 1 and 64)
);

comment on table public.purchase_batches is
  'FIFO cost layers. Never merge batches with different unit_cost.';

-- FIFO consumption order and reporting
create index pb_fifo_idx
  on public.purchase_batches (user_id, product_id, purchase_date, created_at, id)
  where quantity_remaining > 0;
create index pb_product_idx
  on public.purchase_batches (product_id, purchase_date desc, created_at desc);
create index pb_user_date_idx
  on public.purchase_batches (user_id, purchase_date);
create index pb_supplier_idx
  on public.purchase_batches (user_id, supplier_id);
create index pb_expiry_idx
  on public.purchase_batches (user_id, expiry_date)
  where expiry_date is not null and quantity_remaining > 0;

create trigger purchase_batches_set_updated_at
  before update on public.purchase_batches
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- sales
-- ---------------------------------------------------------------------------
-- Financial invariants are enforced by CHECK constraints so no code path —
-- not even a future one — can persist an inconsistent total.
--   total        = subtotal - discount - return_amount
--   gross_profit = total - total_cost
-- ===========================================================================
create table public.sales (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  invoice_number     text not null,
  status             public.sale_status not null default 'completed',
  sale_date          timestamptz not null default now(),
  subtotal           bigint not null default 0,   -- sum(unit_selling_price * qty)
  discount           bigint not null default 0,   -- line + order discounts
  return_amount      bigint not null default 0,   -- value of returned units
  total              bigint not null default 0,   -- net sales for this invoice
  total_cost         bigint not null default 0,   -- FIFO COGS actually retained
  gross_profit       bigint not null default 0,   -- total - total_cost
  payment_method     public.payment_method not null default 'cash',
  notes              text,
  -- Idempotency key supplied by the client so a double-tap or a retried
  -- request can never post the same sale twice.
  client_request_id  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint sales_invoice_len check (char_length(trim(invoice_number)) between 3 and 40),
  constraint sales_amounts_nonneg check (
    subtotal >= 0 and discount >= 0 and return_amount >= 0 and total_cost >= 0
  ),
  constraint sales_discount_within_subtotal check (discount <= subtotal),
  -- Guarantees total can never go negative.
  constraint sales_return_within_net check (return_amount <= subtotal - discount),
  constraint sales_total_identity check (total = subtotal - discount - return_amount),
  constraint sales_profit_identity check (gross_profit = total - total_cost)
);

create unique index sales_user_invoice_key
  on public.sales (user_id, invoice_number);
create unique index sales_user_client_request_key
  on public.sales (user_id, client_request_id) where client_request_id is not null;

-- Reporting: only statuses that count towards revenue are indexed, keeping the
-- index small and every P&L range scan cheap.
create index sales_reportable_date_idx
  on public.sales (user_id, sale_date)
  where status in ('completed', 'partially_returned', 'returned');
create index sales_user_status_date_idx
  on public.sales (user_id, status, sale_date desc);

create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- sale_items — one row per (product, purchase batch) allocation
-- ---------------------------------------------------------------------------
-- unit_cost_snapshot freezes the FIFO cost at the moment of sale. Later
-- purchases at different costs can never rewrite historical profit.
-- ===========================================================================
create table public.sale_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  sale_id            uuid not null references public.sales (id) on delete cascade,
  product_id         uuid not null references public.products (id) on delete restrict,
  purchase_batch_id  uuid references public.purchase_batches (id) on delete set null,
  quantity           integer not null,
  quantity_returned  integer not null default 0,
  unit_cost_snapshot bigint  not null,   -- minor units, frozen forever
  unit_selling_price bigint  not null,   -- minor units
  line_discount      bigint  not null default 0,
  line_total         bigint  not null,   -- net of line + prorated order discount
  line_profit        bigint  not null,   -- line_total - cost of retained units
  created_at         timestamptz not null default now(),

  constraint si_quantity_positive check (quantity > 0),
  constraint si_returned_range check (quantity_returned >= 0 and quantity_returned <= quantity),
  constraint si_cost_nonneg check (unit_cost_snapshot >= 0),
  constraint si_price_nonneg check (unit_selling_price >= 0),
  constraint si_discount_range check (line_discount >= 0 and line_discount <= unit_selling_price * quantity)
);

create index si_sale_idx on public.sale_items (sale_id);
create index si_user_product_idx on public.sale_items (user_id, product_id);
create index si_batch_idx on public.sale_items (purchase_batch_id);

-- ===========================================================================
-- stock_movements — append-only inventory ledger
-- ===========================================================================
create table public.stock_movements (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  product_id         uuid not null references public.products (id) on delete restrict,
  purchase_batch_id  uuid references public.purchase_batches (id) on delete set null,
  movement_type      public.stock_movement_type not null,
  -- Signed: positive adds stock, negative removes it.
  quantity           integer not null,
  reference_type     public.movement_reference_type,
  reference_id       uuid,
  notes              text,
  created_at         timestamptz not null default now(),

  constraint sm_quantity_nonzero check (quantity <> 0),
  -- Direction must agree with the movement's meaning.
  constraint sm_direction check (
    (movement_type in ('purchase', 'sale_return') and quantity > 0)
    or (movement_type in ('sale', 'purchase_return', 'damaged', 'expired') and quantity < 0)
    or (movement_type = 'manual_adjustment')
  )
);

create index sm_user_created_idx on public.stock_movements (user_id, created_at desc);
create index sm_product_created_idx on public.stock_movements (product_id, created_at desc);
create index sm_reference_idx on public.stock_movements (reference_type, reference_id);
create index sm_user_type_created_idx on public.stock_movements (user_id, movement_type, created_at desc);

-- ===========================================================================
-- expense_categories
-- ===========================================================================
create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default '#B08A4D',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint ec_name_len check (char_length(trim(name)) between 1 and 80),
  constraint ec_color_fmt check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index ec_user_name_key
  on public.expense_categories (user_id, lower(trim(name)));

create trigger expense_categories_set_updated_at
  before update on public.expense_categories
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- expenses — operating expenses only.
-- Buying inventory is NOT an expense here; it is inventory investment and
-- becomes cost of goods sold when the item sells.
-- ===========================================================================
create table public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  expense_category_id  uuid references public.expense_categories (id) on delete set null,
  title                text not null,
  amount               bigint not null,             -- minor units
  expense_date         date not null default current_date,
  payment_method       public.payment_method not null default 'cash',
  reference_number     text,
  receipt_url          text,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint expenses_title_len check (char_length(trim(title)) between 1 and 200),
  constraint expenses_amount_positive check (amount > 0),
  -- Receipts live in a PRIVATE bucket, so this holds the storage object path
  -- (`<user_id>/<file>`) and the app mints a short-lived signed URL to display
  -- it. Storing a signed URL would simply expire.
  constraint expenses_receipt_path check (
    receipt_url is null or char_length(receipt_url) between 1 and 500
  )
);

create index expenses_user_date_idx on public.expenses (user_id, expense_date);
create index expenses_user_category_date_idx on public.expenses (user_id, expense_category_id, expense_date);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.tg_set_updated_at();


-- ###########################################################################
-- ##  20260101000100_rls.sql
-- ###########################################################################

-- ===========================================================================
-- Aurelia — Row Level Security
-- ---------------------------------------------------------------------------
-- Every business table is owner-scoped. Two layers of defence:
--
--   1. RLS policies restrict rows to `auth.uid()`.
--   2. Table privileges are revoked for the write paths that must go through a
--      SECURITY DEFINER RPC (sales, sale items, purchase batches, stock
--      movements, price history). Financial rows can therefore only be created
--      by code that recalculates the money server-side — never by a browser
--      INSERT, even one crafted by hand with a valid session.
--
-- Financial history is never hard-deleted: there is no DELETE policy on sales,
-- sale_items, purchase_batches, stock_movements or product_price_history.
-- Reversal is done with void / return workflows.
-- ===========================================================================

alter table public.profiles              enable row level security;
alter table public.categories            enable row level security;
alter table public.suppliers             enable row level security;
alter table public.products              enable row level security;
alter table public.product_price_history enable row level security;
alter table public.purchase_batches      enable row level security;
alter table public.sales                 enable row level security;
alter table public.sale_items            enable row level security;
alter table public.stock_movements       enable row level security;
alter table public.expense_categories    enable row level security;
alter table public.expenses              enable row level security;

-- ---------------------------------------------------------------------------
-- profiles — the owner may read and update their own profile. Rows are created
-- by the auth bootstrap trigger, never by the client.
-- ---------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Fully owner-managed reference data
-- ---------------------------------------------------------------------------
create policy categories_all_own on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy suppliers_all_own on public.suppliers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy expense_categories_all_own on public.expense_categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy expenses_all_own on public.expenses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- products — the owner creates and edits products directly. Deletion is
-- allowed only when nothing references the product; the ON DELETE RESTRICT
-- foreign keys from purchase_batches / sale_items enforce that, which is what
-- makes "archive" the normal path for anything ever stocked or sold.
-- ---------------------------------------------------------------------------
create policy products_select_own on public.products
  for select to authenticated using (user_id = (select auth.uid()));

create policy products_insert_own on public.products
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy products_update_own on public.products
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy products_delete_own on public.products
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Read-only-to-the-client financial tables.
-- Writes happen exclusively inside SECURITY DEFINER functions.
-- ---------------------------------------------------------------------------
create policy price_history_select_own on public.product_price_history
  for select to authenticated using (user_id = (select auth.uid()));

create policy purchase_batches_select_own on public.purchase_batches
  for select to authenticated using (user_id = (select auth.uid()));

create policy sales_select_own on public.sales
  for select to authenticated using (user_id = (select auth.uid()));

create policy sale_items_select_own on public.sale_items
  for select to authenticated using (user_id = (select auth.uid()));

create policy stock_movements_select_own on public.stock_movements
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privilege hardening. `anon` gets nothing at all; `authenticated` gets write
-- access only where a direct write is safe.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.categories, public.suppliers,
  public.products, public.product_price_history, public.purchase_batches,
  public.sales, public.sale_items, public.stock_movements,
  public.expense_categories, public.expenses
  from anon;

revoke insert, update, delete on
  public.product_price_history,
  public.purchase_batches,
  public.sales,
  public.sale_items,
  public.stock_movements
  from authenticated;

revoke insert, delete on public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- Reporting/mutation RPCs are for signed-in owners only.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public;


-- ###########################################################################
-- ##  20260101000200_bootstrap.sql
-- ###########################################################################

-- ===========================================================================
-- Aurelia — owner bootstrap & shared helpers
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- require_owner(): the single authentication gate used by every RPC.
-- SECURITY DEFINER functions bypass RLS, so each one must assert identity
-- itself. Centralising it means the check cannot be forgotten inconsistently.
-- ---------------------------------------------------------------------------
create or replace function public.require_owner()
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- shop_timezone(): the owner's configured IANA timezone. Every date boundary
-- in the reporting layer is derived from this, never from the browser.
-- ---------------------------------------------------------------------------
create or replace function public.shop_timezone(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select timezone from public.profiles where id = p_user),
    'Asia/Kolkata'
  );
$$;

-- ---------------------------------------------------------------------------
-- shop_today(): the current calendar day in the shop's timezone.
-- ---------------------------------------------------------------------------
create or replace function public.shop_today(p_user uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone public.shop_timezone(p_user))::date;
$$;

-- ---------------------------------------------------------------------------
-- shop_context(): the caller's own calendar context.
-- The internal helpers above take a user id and are therefore never granted to
-- clients; this argument-free wrapper can only ever describe the caller.
-- The app uses it for form defaults so "today" agrees with the reports.
-- ---------------------------------------------------------------------------
create or replace function public.shop_context()
returns table (today date, timezone text, now_local timestamp)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.require_owner();
begin
  timezone  := public.shop_timezone(v_user);
  today     := (now() at time zone timezone)::date;
  now_local := (now() at time zone timezone);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inclusive local date range -> half-open timestamptz range.
-- Keeps range scans index-friendly (`sale_date >= lo and sale_date < hi`)
-- instead of wrapping the indexed column in a timezone conversion.
-- ---------------------------------------------------------------------------
create or replace function public.local_day_bounds(
  p_user  uuid,
  p_start date,
  p_end   date,
  out lo  timestamptz,
  out hi  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := public.shop_timezone(p_user);
begin
  lo := (p_start::timestamp) at time zone v_tz;
  hi := ((p_end + 1)::timestamp) at time zone v_tz;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal product codes, e.g. COS-000120.
-- The owner's profile row is locked so two concurrent inserts cannot pick the
-- same number.
-- ---------------------------------------------------------------------------
create or replace function public.next_internal_code(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  perform 1 from public.profiles where id = p_user for update;

  select coalesce(max((regexp_match(internal_code, '^COS-([0-9]+)$'))[1]::integer), 0) + 1
    into v_next
    from public.products
   where user_id = p_user;

  return 'COS-' || lpad(v_next::text, 6, '0');
end;
$$;

-- Fill internal_code automatically when the client leaves it blank.
create or replace function public.tg_products_assign_internal_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.internal_code is null or btrim(new.internal_code) = '' then
    new.internal_code := public.next_internal_code(new.user_id);
  else
    new.internal_code := upper(btrim(new.internal_code));
  end if;
  return new;
end;
$$;

create trigger products_assign_internal_code
  before insert on public.products
  for each row execute function public.tg_products_assign_internal_code();

-- ---------------------------------------------------------------------------
-- Next invoice number: INV-YYYYMMDD-NNN, sequential per shop day.
-- ---------------------------------------------------------------------------
create or replace function public.next_invoice_number(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_next   integer;
begin
  perform 1 from public.profiles where id = p_user for update;

  v_prefix := 'INV-' || to_char(public.shop_today(p_user), 'YYYYMMDD');

  select coalesce(max((regexp_match(invoice_number, '-([0-9]+)$'))[1]::integer), 0) + 1
    into v_next
    from public.sales
   where user_id = p_user
     and invoice_number like v_prefix || '-%';

  return v_prefix || '-' || lpad(v_next::text, 3, '0');
end;
$$;

-- ===========================================================================
-- New-owner bootstrap: profile + sensible default taxonomies, so the very
-- first session is never an empty configuration screen.
-- ===========================================================================
create or replace function public.tg_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, shop_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Owner'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'shop_name'), ''), 'My Beauty Shop')
  )
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, color) values
    (new.id, 'Lips',       '#9E1F47'),
    (new.id, 'Face',       '#C9648A'),
    (new.id, 'Eyes',       '#5B2A4A'),
    (new.id, 'Skincare',   '#1C7A58'),
    (new.id, 'Fragrance',  '#B08A4D'),
    (new.id, 'Nails',      '#A86910'),
    (new.id, 'Tools',      '#6D5F59')
  on conflict do nothing;

  insert into public.expense_categories (user_id, name, color) values
    (new.id, 'Rent',          '#9E1F47'),
    (new.id, 'Delivery',      '#2C5F8A'),
    (new.id, 'Packaging',     '#B08A4D'),
    (new.id, 'Utilities',     '#5B2A4A'),
    (new.id, 'Marketing',     '#C9648A'),
    (new.id, 'Shop supplies', '#1C7A58'),
    (new.id, 'Maintenance',   '#A86910'),
    (new.id, 'Salaries',      '#6D5F59'),
    (new.id, 'Other',         '#796C66')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_on_auth_user_created();

-- ---------------------------------------------------------------------------
-- Grants for helpers the app calls directly.
-- ---------------------------------------------------------------------------
revoke all on function public.require_owner() from public;
revoke all on function public.shop_timezone(uuid) from public;
revoke all on function public.shop_today(uuid) from public;
revoke all on function public.local_day_bounds(uuid, date, date) from public;
revoke all on function public.next_internal_code(uuid) from public;
revoke all on function public.next_invoice_number(uuid) from public;

revoke all on function public.shop_context() from public;

grant execute on function public.require_owner() to authenticated;
grant execute on function public.shop_context() to authenticated;


-- ###########################################################################
-- ##  20260101000300_inventory.sql
-- ###########################################################################

-- ===========================================================================
-- Aurelia — inventory: derived stock views, purchase recording, adjustments
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- price_status(): the single source of truth for PROFIT / LOW PROFIT /
-- BREAK-EVEN / LOSS. Used by views, RPCs and (mirrored) by the UI so the badge
-- the owner sees while typing always matches what the database will decide.
-- ---------------------------------------------------------------------------
create or replace function public.price_status(
  p_price       bigint,
  p_cost        bigint,
  p_low_margin  numeric default 10.00
)
returns text
language plpgsql
immutable
as $$
declare
  v_margin numeric;
begin
  if p_price is null or p_cost is null then
    return 'unknown';
  end if;
  if p_price < p_cost then
    return 'loss';
  end if;
  if p_price = p_cost then
    return 'breakeven';
  end if;
  -- p_price > p_cost >= 0, so p_price > 0: division is safe.
  v_margin := ((p_price - p_cost)::numeric / p_price::numeric) * 100;
  if v_margin <= coalesce(p_low_margin, 10.00) then
    return 'low_profit';
  end if;
  return 'profit';
end;
$$;

-- ---------------------------------------------------------------------------
-- safe_margin_pct / safe_markup_pct — division-by-zero-proof percentages.
-- ---------------------------------------------------------------------------
create or replace function public.safe_margin_pct(p_profit bigint, p_revenue bigint)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_revenue, 0) = 0 then 0::numeric
    else round((p_profit::numeric / p_revenue::numeric) * 100, 2)
  end;
$$;

create or replace function public.safe_markup_pct(p_profit bigint, p_cost bigint)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_cost, 0) = 0 then 0::numeric
    else round((p_profit::numeric / p_cost::numeric) * 100, 2)
  end;
$$;

-- ===========================================================================
-- product_inventory — live stock and cost basis, derived purely from the FIFO
-- cost layers so it can never drift from the batches.
-- security_invoker makes the view obey the caller's RLS policies.
-- ===========================================================================
create view public.product_inventory
with (security_invoker = true)
as
select
  p.id                                        as product_id,
  p.user_id,
  coalesce(sum(b.quantity_remaining), 0)::integer                     as quantity_on_hand,
  coalesce(sum(b.quantity_remaining::bigint * b.unit_cost), 0)::bigint as inventory_cost,
  count(b.id) filter (where b.quantity_remaining > 0)::integer        as open_batch_count,
  -- Weighted average cost of what is still on the shelf (display only).
  case
    when coalesce(sum(b.quantity_remaining), 0) = 0 then null
    else round(
      sum(b.quantity_remaining::bigint * b.unit_cost)::numeric
      / sum(b.quantity_remaining)::numeric
    )::bigint
  end                                                                 as average_unit_cost,
  -- Cost of the batch FIFO will consume next: the number that actually decides
  -- whether the next sale makes money.
  (
    select b2.unit_cost from public.purchase_batches b2
     where b2.product_id = p.id and b2.quantity_remaining > 0
     order by b2.purchase_date asc, b2.created_at asc, b2.id asc
     limit 1
  )                                                                   as fifo_unit_cost,
  (
    select b3.unit_cost from public.purchase_batches b3
     where b3.product_id = p.id
     order by b3.purchase_date desc, b3.created_at desc, b3.id desc
     limit 1
  )                                                                   as latest_unit_cost,
  -- Highest cost still on hand: if the selling price sits below this, at least
  -- one remaining batch loses money even when the blended result is positive.
  max(b.unit_cost) filter (where b.quantity_remaining > 0)            as max_open_batch_cost,
  min(b.expiry_date) filter (where b.quantity_remaining > 0)          as nearest_expiry,
  max(b.purchase_date)                                                as last_purchase_date
from public.products p
left join public.purchase_batches b on b.product_id = p.id
group by p.id, p.user_id;

comment on view public.product_inventory is
  'Live quantity and cost basis per product, derived from purchase_batches.';

-- ===========================================================================
-- product_overview — everything the product list / detail pages need in one
-- round trip, including the projected-profit analysis at the saved price.
-- ===========================================================================
create view public.product_overview
with (security_invoker = true)
as
select
  p.id,
  p.user_id,
  p.category_id,
  c.name  as category_name,
  c.color as category_color,
  p.sku,
  p.manufacturer_barcode,
  p.internal_code,
  p.name,
  p.brand,
  p.shade_or_variant,
  p.size,
  p.description,
  p.image_url,
  p.recommended_selling_price,
  p.minimum_selling_price,
  p.low_stock_threshold,
  p.is_active,
  p.created_at,
  p.updated_at,
  inv.quantity_on_hand,
  inv.inventory_cost,
  inv.open_batch_count,
  inv.average_unit_cost,
  inv.fifo_unit_cost,
  inv.latest_unit_cost,
  inv.max_open_batch_cost,
  inv.nearest_expiry,
  inv.last_purchase_date,
  -- Expected result of selling one unit at the recommended price, costed FIFO.
  (p.recommended_selling_price - coalesce(inv.fifo_unit_cost, 0))::bigint as expected_unit_profit,
  public.safe_margin_pct(
    p.recommended_selling_price - coalesce(inv.fifo_unit_cost, 0),
    p.recommended_selling_price
  ) as expected_margin_pct,
  public.safe_markup_pct(
    p.recommended_selling_price - coalesce(inv.fifo_unit_cost, 0),
    coalesce(inv.fifo_unit_cost, 0)
  ) as expected_markup_pct,
  (p.recommended_selling_price * inv.quantity_on_hand)::bigint as projected_revenue,
  (p.recommended_selling_price * inv.quantity_on_hand - inv.inventory_cost)::bigint
    as projected_gross_profit,
  case
    when inv.quantity_on_hand = 0 then 'out_of_stock'
    when inv.quantity_on_hand <= p.low_stock_threshold then 'low_stock'
    else 'in_stock'
  end as stock_status,
  case
    when inv.fifo_unit_cost is null then 'unknown'
    else public.price_status(
      p.recommended_selling_price,
      inv.fifo_unit_cost,
      coalesce(pr.low_margin_threshold, 10.00)
    )
  end as price_status,
  -- True when the saved price would lose money on at least one open batch.
  (inv.max_open_batch_cost is not null
    and p.recommended_selling_price < inv.max_open_batch_cost) as has_batch_below_price
from public.products p
join public.product_inventory inv on inv.product_id = p.id
left join public.categories c on c.id = p.category_id
left join public.profiles pr on pr.id = p.user_id;

-- ===========================================================================
-- next_purchase_reference() — groups the batches created by one "Record
-- Purchase" submission into a single, human-meaningful purchase document.
-- ===========================================================================
create or replace function public.next_purchase_reference(p_user uuid, p_date date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_next   integer;
begin
  perform 1 from public.profiles where id = p_user for update;
  v_prefix := 'PO-' || to_char(p_date, 'YYYYMMDD');

  select coalesce(max((regexp_match(reference_number, '-([0-9]+)$'))[1]::integer), 0) + 1
    into v_next
    from public.purchase_batches
   where user_id = p_user
     and reference_number like v_prefix || '-%';

  return v_prefix || '-' || lpad(v_next::text, 3, '0');
end;
$$;

-- ===========================================================================
-- record_purchase() — atomic multi-line purchase.
--
--   * one batch row per line (100 identical items = quantity_purchased 100)
--   * a second purchase of the same product at another cost = a second batch
--   * every batch writes a matching +quantity stock movement
--   * totals are computed here, never accepted from the browser
--
-- p_lines: [{ "product_id": uuid, "quantity": int, "unit_cost": bigint,
--             "lot_number": text?, "expiry_date": "YYYY-MM-DD"? }, ...]
-- ===========================================================================
create or replace function public.record_purchase(
  p_lines            jsonb,
  p_supplier_id      uuid    default null,
  p_purchase_date    date    default null,
  p_reference_number text    default null,
  p_notes            text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := public.require_owner();
  v_date        date;
  v_reference   text;
  v_line        jsonb;
  v_product_id  uuid;
  v_quantity    integer;
  v_unit_cost   bigint;
  v_expiry      date;
  v_lot         text;
  v_batch_id    uuid;
  v_total_units integer := 0;
  v_total_cost  bigint := 0;
  v_batch_ids   uuid[] := '{}';
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A purchase needs at least one line' using errcode = '22023';
  end if;

  v_date := coalesce(p_purchase_date, public.shop_today(v_user));
  if v_date > public.shop_today(v_user) then
    raise exception 'Purchase date cannot be in the future' using errcode = '22023';
  end if;

  if p_supplier_id is not null
     and not exists (select 1 from public.suppliers
                      where id = p_supplier_id and user_id = v_user) then
    raise exception 'Unknown supplier' using errcode = '23503';
  end if;

  v_reference := coalesce(
    nullif(btrim(p_reference_number), ''),
    public.next_purchase_reference(v_user, v_date)
  );

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line ->> 'product_id')::uuid;
    v_quantity   := (v_line ->> 'quantity')::integer;
    v_unit_cost  := (v_line ->> 'unit_cost')::bigint;
    v_expiry     := nullif(v_line ->> 'expiry_date', '')::date;
    v_lot        := nullif(btrim(coalesce(v_line ->> 'lot_number', '')), '');

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Purchase quantity must be greater than zero' using errcode = '22023';
    end if;
    if v_unit_cost is null or v_unit_cost < 0 then
      raise exception 'Unit cost cannot be negative' using errcode = '22023';
    end if;
    if not exists (select 1 from public.products
                    where id = v_product_id and user_id = v_user) then
      raise exception 'Unknown product in purchase line' using errcode = '23503';
    end if;

    insert into public.purchase_batches (
      user_id, product_id, supplier_id,
      quantity_purchased, quantity_remaining, unit_cost,
      purchase_date, lot_number, expiry_date, reference_number, notes
    ) values (
      v_user, v_product_id, p_supplier_id,
      v_quantity, v_quantity, v_unit_cost,
      v_date, v_lot, v_expiry, v_reference, nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning id into v_batch_id;

    insert into public.stock_movements (
      user_id, product_id, purchase_batch_id, movement_type,
      quantity, reference_type, reference_id, notes
    ) values (
      v_user, v_product_id, v_batch_id, 'purchase',
      v_quantity, 'purchase_batch', v_batch_id,
      'Purchase ' || v_reference
    );

    v_batch_ids   := v_batch_ids || v_batch_id;
    v_total_units := v_total_units + v_quantity;
    v_total_cost  := v_total_cost + (v_quantity::bigint * v_unit_cost);
  end loop;

  return jsonb_build_object(
    'reference_number', v_reference,
    'purchase_date', v_date,
    'batch_ids', to_jsonb(v_batch_ids),
    'total_units', v_total_units,
    'total_investment', v_total_cost
  );
end;
$$;

-- ===========================================================================
-- adjust_stock() — damage, expiry, supplier returns and manual corrections.
-- A reason is mandatory: unexplained inventory movement is how stock records
-- stop being trustworthy.
-- ===========================================================================
create or replace function public.adjust_stock(
  p_product_id    uuid,
  p_movement_type public.stock_movement_type,
  p_quantity      integer,
  p_reason        text,
  p_batch_id      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := public.require_owner();
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
  v_remaining integer;
  v_take      integer;
  v_batch     record;
  v_target    uuid;
  v_moved     integer := 0;
begin
  if v_reason is null then
    raise exception 'A reason is required for every stock adjustment' using errcode = '22023';
  end if;
  if p_movement_type not in ('damaged', 'expired', 'purchase_return', 'manual_adjustment') then
    raise exception 'Movement type % cannot be recorded as an adjustment', p_movement_type
      using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'Adjustment quantity cannot be zero' using errcode = '22023';
  end if;
  if not exists (select 1 from public.products where id = p_product_id and user_id = v_user) then
    raise exception 'Unknown product' using errcode = '23503';
  end if;

  -- ---------- Increase: correct an under-recorded purchase --------------
  if p_quantity > 0 then
    if p_movement_type <> 'manual_adjustment' then
      raise exception 'Only a manual adjustment can increase stock' using errcode = '22023';
    end if;

    select id into v_target
      from public.purchase_batches
     where user_id = v_user
       and product_id = p_product_id
       and (p_batch_id is null or id = p_batch_id)
     order by purchase_date desc, created_at desc, id desc
     limit 1
     for update;

    if v_target is null then
      raise exception 'Record a purchase first: an increase needs a cost layer to attach to'
        using errcode = '22023';
    end if;

    -- Raising both figures keeps quantity_remaining <= quantity_purchased true
    -- and preserves a defensible cost basis for the extra units.
    update public.purchase_batches
       set quantity_purchased = quantity_purchased + p_quantity,
           quantity_remaining = quantity_remaining + p_quantity
     where id = v_target;

    insert into public.stock_movements (
      user_id, product_id, purchase_batch_id, movement_type,
      quantity, reference_type, reference_id, notes
    ) values (
      v_user, p_product_id, v_target, 'manual_adjustment',
      p_quantity, 'adjustment', v_target, v_reason
    );

    return jsonb_build_object('adjusted', p_quantity, 'batch_id', v_target);
  end if;

  -- ---------- Decrease: consume FIFO (oldest layer first) ---------------
  v_remaining := abs(p_quantity);

  select coalesce(sum(quantity_remaining), 0) into v_take
    from public.purchase_batches
   where user_id = v_user
     and product_id = p_product_id
     and (p_batch_id is null or id = p_batch_id)
     and quantity_remaining > 0;

  if v_take < v_remaining then
    raise exception 'Only % unit(s) available; cannot remove %', v_take, v_remaining
      using errcode = '22023';
  end if;

  for v_batch in
    select id, quantity_remaining
      from public.purchase_batches
     where user_id = v_user
       and product_id = p_product_id
       and (p_batch_id is null or id = p_batch_id)
       and quantity_remaining > 0
     order by purchase_date asc, created_at asc, id asc
     for update
  loop
    exit when v_remaining = 0;
    v_take := least(v_batch.quantity_remaining, v_remaining);

    update public.purchase_batches
       set quantity_remaining = quantity_remaining - v_take
     where id = v_batch.id;

    insert into public.stock_movements (
      user_id, product_id, purchase_batch_id, movement_type,
      quantity, reference_type, reference_id, notes
    ) values (
      v_user, p_product_id, v_batch.id, p_movement_type,
      -v_take, 'adjustment', v_batch.id, v_reason
    );

    v_remaining := v_remaining - v_take;
    v_moved := v_moved + v_take;
  end loop;

  return jsonb_build_object('adjusted', -v_moved);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.product_inventory, public.product_overview to authenticated;

revoke all on function public.record_purchase(jsonb, uuid, date, text, text) from public;
revoke all on function public.adjust_stock(uuid, public.stock_movement_type, integer, text, uuid) from public;
revoke all on function public.next_purchase_reference(uuid, date) from public;

grant execute on function public.record_purchase(jsonb, uuid, date, text, text) to authenticated;
grant execute on function public.adjust_stock(uuid, public.stock_movement_type, integer, text, uuid) to authenticated;
grant execute on function public.price_status(bigint, bigint, numeric) to authenticated;
grant execute on function public.safe_margin_pct(bigint, bigint) to authenticated;
grant execute on function public.safe_markup_pct(bigint, bigint) to authenticated;


-- ###########################################################################
-- ##  20260101000400_sales.sql
-- ###########################################################################

-- ===========================================================================
-- Aurelia — sales: FIFO checkout, returns, voids
-- ---------------------------------------------------------------------------
-- Custom SQLSTATEs the application maps to specific UI prompts:
--   AU001  a line or the order loses money — explicit confirmation required
--   AU002  the order breaks even — explicit confirmation required
--   AU003  selling below cost is blocked by the shop setting
--   AU004  insufficient stock
--   AU005  nothing to sell / invalid payload
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- sale_item_financials — current (post-return) position of every sale line.
--
-- sale_items.line_total / line_profit deliberately keep the ORIGINAL terms of
-- the sale so the invoice can always be reproduced exactly. What is still
-- retained after returns is derived here, using a cumulative-floor split so
-- the per-line integers always re-sum to the invoice total with no rounding
-- drift.
-- ---------------------------------------------------------------------------
create view public.sale_item_financials
with (security_invoker = true)
as
select
  si.id,
  si.user_id,
  si.sale_id,
  si.product_id,
  si.purchase_batch_id,
  si.quantity,
  si.quantity_returned,
  (si.quantity - si.quantity_returned)                     as quantity_retained,
  si.unit_cost_snapshot,
  si.unit_selling_price,
  si.line_discount,
  si.line_total                                            as original_line_total,
  si.line_profit                                           as original_line_profit,
  si.created_at,
  -- Revenue still recognised for this line.
  floor(
    si.line_total::numeric * (si.quantity - si.quantity_returned)::numeric
    / si.quantity::numeric
  )::bigint                                                as net_revenue,
  (si.line_total - floor(
    si.line_total::numeric * (si.quantity - si.quantity_returned)::numeric
    / si.quantity::numeric
  )::bigint)                                               as returned_revenue,
  (si.unit_cost_snapshot * (si.quantity - si.quantity_returned))::bigint as net_cost,
  (
    floor(
      si.line_total::numeric * (si.quantity - si.quantity_returned)::numeric
      / si.quantity::numeric
    )::bigint
    - (si.unit_cost_snapshot * (si.quantity - si.quantity_returned))::bigint
  )                                                        as net_profit
from public.sale_items si;

comment on view public.sale_item_financials is
  'Sale lines with post-return revenue, cost and profit. Reporting reads this, never sale_items directly.';

-- ===========================================================================
-- complete_sale() — the single write path for a sale.
--
-- Everything financial is recalculated here. The browser sends only what the
-- owner actually chose: which product, how many, at what price, what discount.
-- Totals, costs, FIFO allocation and profit are derived server-side.
--
-- p_items: [{ "product_id": uuid, "quantity": int,
--             "unit_selling_price": bigint, "line_discount": bigint? }, ...]
-- ===========================================================================
create or replace function public.complete_sale(
  p_items             jsonb,
  p_payment_method    public.payment_method default 'cash',
  p_order_discount    bigint  default 0,
  p_notes             text    default null,
  p_client_request_id uuid    default null,
  p_sale_date         timestamptz default null,
  p_confirm_loss      boolean default false,
  p_confirm_breakeven boolean default false
)
returns jsonb
language plpgsql
security definer
-- pg_temp is listed last so the function's scratch tables resolve while real
-- tables can never be shadowed by a session-created temp object.
set search_path = public, pg_temp
as $$
declare
  v_user          uuid := public.require_owner();
  v_behavior      public.below_cost_behavior;
  v_existing      uuid;
  v_sale_id       uuid;
  v_invoice       text;
  v_sale_date     timestamptz;
  v_line          jsonb;
  v_line_no       integer := 0;
  v_product_id    uuid;
  v_quantity      integer;
  v_price         bigint;
  v_line_discount bigint;
  v_needed        integer;
  v_available     integer;
  v_batch         record;
  v_take          integer;
  v_product_name  text;
  v_subtotal      bigint;
  v_discount_sum  bigint;
  v_total         bigint;
  v_total_cost    bigint;
  v_gross_profit  bigint;
  v_loss_lines    integer;
  v_below_cost    integer;
begin
  -- ---- 0. Idempotency: a retried or double-tapped submit must not post twice
  if p_client_request_id is not null then
    select id into v_existing
      from public.sales
     where user_id = v_user and client_request_id = p_client_request_id;
    if v_existing is not null then
      return jsonb_build_object(
        'sale_id', v_existing,
        'invoice_number', (select invoice_number from public.sales where id = v_existing),
        'duplicate', true
      );
    end if;
  end if;

  -- ---- 1. Validate the payload shape
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product before completing the sale'
      using errcode = 'AU005';
  end if;
  if coalesce(p_order_discount, 0) < 0 then
    raise exception 'Order discount cannot be negative' using errcode = 'AU005';
  end if;

  v_sale_date := coalesce(p_sale_date, now());
  if v_sale_date > now() + interval '1 minute' then
    raise exception 'A sale cannot be dated in the future' using errcode = 'AU005';
  end if;

  select below_cost_sale_behavior into v_behavior
    from public.profiles where id = v_user;
  v_behavior := coalesce(v_behavior, 'warn');

  -- ---- 2. Scratch space (dropped automatically at commit)
  create temp table if not exists tmp_sale_line (
    line_no       integer primary key,
    product_id    uuid    not null,
    quantity      integer not null,
    unit_price    bigint  not null,
    line_discount bigint  not null
  ) on commit drop;

  create temp table if not exists tmp_batch_pool (
    batch_id   uuid primary key,
    product_id uuid   not null,
    unit_cost  bigint not null,
    available  integer not null
  ) on commit drop;

  create temp table if not exists tmp_alloc (
    rowid               bigserial primary key,
    line_no             integer not null,
    product_id          uuid    not null,
    batch_id            uuid,
    qty                 integer not null,
    unit_cost           bigint  not null,
    unit_price          bigint  not null,
    gross_alloc         bigint  not null default 0,
    alloc_line_discount bigint  not null default 0,
    net_after_line      bigint  not null default 0,
    alloc_order_discount bigint not null default 0,
    line_total          bigint  not null default 0,
    line_profit         bigint  not null default 0
  ) on commit drop;

  delete from tmp_sale_line;
  delete from tmp_batch_pool;
  delete from tmp_alloc;

  -- ---- 3. Normalise the requested lines
  for v_line in select * from jsonb_array_elements(p_items)
  loop
    v_line_no       := v_line_no + 1;
    v_product_id    := (v_line ->> 'product_id')::uuid;
    v_quantity      := (v_line ->> 'quantity')::integer;
    v_price         := (v_line ->> 'unit_selling_price')::bigint;
    v_line_discount := coalesce((v_line ->> 'line_discount')::bigint, 0);

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be at least 1' using errcode = 'AU005';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'Selling price cannot be negative' using errcode = 'AU005';
    end if;
    if v_line_discount < 0 or v_line_discount > v_price * v_quantity then
      raise exception 'Line discount cannot exceed the line value' using errcode = 'AU005';
    end if;
    if not exists (select 1 from public.products
                    where id = v_product_id and user_id = v_user) then
      raise exception 'Unknown product' using errcode = '23503';
    end if;

    insert into tmp_sale_line (line_no, product_id, quantity, unit_price, line_discount)
    values (v_line_no, v_product_id, v_quantity, v_price, v_line_discount);
  end loop;

  -- ---- 4. Lock every candidate cost layer in one deterministic pass.
  --         Ordering by product_id first means two concurrent checkouts always
  --         take locks in the same sequence, so they queue instead of deadlock.
  insert into tmp_batch_pool (batch_id, product_id, unit_cost, available)
  select b.id, b.product_id, b.unit_cost, b.quantity_remaining
    from public.purchase_batches b
   where b.user_id = v_user
     and b.product_id in (select distinct product_id from tmp_sale_line)
     and b.quantity_remaining > 0
   order by b.product_id, b.purchase_date, b.created_at, b.id
     for update;

  -- ---- 5. Stock sufficiency, checked per product against the whole order
  for v_batch in
    select l.product_id, sum(l.quantity)::integer as needed
      from tmp_sale_line l group by l.product_id
  loop
    select coalesce(sum(available), 0) into v_available
      from tmp_batch_pool where product_id = v_batch.product_id;
    if v_available < v_batch.needed then
      select name into v_product_name from public.products where id = v_batch.product_id;
      raise exception 'Not enough stock for %: % in stock, % requested',
        coalesce(v_product_name, 'product'), v_available, v_batch.needed
        using errcode = 'AU004';
    end if;
  end loop;

  -- ---- 6. FIFO allocation: oldest cost layer first, splitting across layers
  for v_line in
    select to_jsonb(l) from tmp_sale_line l order by l.line_no
  loop
    v_line_no    := (v_line ->> 'line_no')::integer;
    v_product_id := (v_line ->> 'product_id')::uuid;
    v_needed     := (v_line ->> 'quantity')::integer;
    v_price      := (v_line ->> 'unit_price')::bigint;

    for v_batch in
      select bp.batch_id, bp.unit_cost, bp.available
        from tmp_batch_pool bp
        join public.purchase_batches b on b.id = bp.batch_id
       where bp.product_id = v_product_id and bp.available > 0
       order by b.purchase_date asc, b.created_at asc, b.id asc
    loop
      exit when v_needed = 0;
      v_take := least(v_batch.available, v_needed);

      insert into tmp_alloc (line_no, product_id, batch_id, qty, unit_cost, unit_price)
      values (v_line_no, v_product_id, v_batch.batch_id, v_take, v_batch.unit_cost, v_price);

      update tmp_batch_pool set available = available - v_take
       where batch_id = v_batch.batch_id;

      v_needed := v_needed - v_take;
    end loop;

    if v_needed > 0 then
      raise exception 'Stock changed while completing the sale — please rescan'
        using errcode = 'AU004';
    end if;
  end loop;

  -- ---- 7. Money. Discounts are split with a cumulative-floor allocation:
  --         alloc_i = floor(D * cum_i / W) - floor(D * cum_(i-1) / W)
  --         which distributes proportionally AND sums back to D exactly, so no
  --         paisa is invented or lost.
  update tmp_alloc set gross_alloc = unit_price * qty;

  with ordered as (
    select
      a.rowid,
      a.line_no,
      l.line_discount as d,
      sum(a.gross_alloc) over (
        partition by a.line_no order by a.rowid
        rows between unbounded preceding and current row
      ) as cum,
      a.gross_alloc,
      sum(a.gross_alloc) over (partition by a.line_no) as w
    from tmp_alloc a
    join tmp_sale_line l on l.line_no = a.line_no
  )
  update tmp_alloc a
     set alloc_line_discount = case
           when o.w = 0 then 0
           else floor(o.d::numeric * o.cum / o.w)
              - floor(o.d::numeric * (o.cum - o.gross_alloc) / o.w)
         end
    from ordered o
   where o.rowid = a.rowid;

  update tmp_alloc set net_after_line = gross_alloc - alloc_line_discount;

  if coalesce(p_order_discount, 0) > (select coalesce(sum(net_after_line), 0) from tmp_alloc) then
    raise exception 'Order discount cannot exceed the order value' using errcode = 'AU005';
  end if;

  with ordered as (
    select
      a.rowid,
      sum(a.net_after_line) over (
        order by a.rowid rows between unbounded preceding and current row
      ) as cum,
      a.net_after_line,
      sum(a.net_after_line) over () as w
    from tmp_alloc a
  )
  update tmp_alloc a
     set alloc_order_discount = case
           when o.w = 0 then 0
           else floor(coalesce(p_order_discount, 0)::numeric * o.cum / o.w)
              - floor(coalesce(p_order_discount, 0)::numeric * (o.cum - o.net_after_line) / o.w)
         end
    from ordered o
   where o.rowid = a.rowid;

  update tmp_alloc
     set line_total  = net_after_line - alloc_order_discount,
         line_profit = (net_after_line - alloc_order_discount) - (unit_cost * qty);

  select
    coalesce(sum(gross_alloc), 0),
    coalesce(sum(alloc_line_discount), 0) + coalesce(p_order_discount, 0),
    coalesce(sum(line_total), 0),
    coalesce(sum(unit_cost * qty), 0),
    count(*) filter (where line_profit < 0),
    count(*) filter (where unit_price < unit_cost)
  into v_subtotal, v_discount_sum, v_total, v_total_cost, v_loss_lines, v_below_cost
  from tmp_alloc;

  v_gross_profit := v_total - v_total_cost;

  -- ---- 8. Loss policy. The shop setting can forbid below-cost sales outright;
  --         otherwise a loss or a break-even needs a deliberate confirmation.
  if v_below_cost > 0 and v_behavior = 'block' then
    raise exception 'This sale is below cost and below-cost sales are blocked in Settings'
      using errcode = 'AU003';
  end if;

  if (v_loss_lines > 0 or v_gross_profit < 0) and not coalesce(p_confirm_loss, false) then
    raise exception 'This sale loses money and must be confirmed explicitly'
      using errcode = 'AU001';
  end if;

  if v_gross_profit = 0 and v_total > 0 and not coalesce(p_confirm_breakeven, false)
     and not coalesce(p_confirm_loss, false) then
    raise exception 'This sale only breaks even and must be confirmed explicitly'
      using errcode = 'AU002';
  end if;

  -- ---- 9. Persist: sale header, allocations, batch depletion, ledger
  v_invoice := public.next_invoice_number(v_user);

  insert into public.sales (
    user_id, invoice_number, status, sale_date,
    subtotal, discount, return_amount, total, total_cost, gross_profit,
    payment_method, notes, client_request_id
  ) values (
    v_user, v_invoice, 'completed', v_sale_date,
    v_subtotal, v_discount_sum, 0, v_total, v_total_cost, v_gross_profit,
    coalesce(p_payment_method, 'cash'), nullif(btrim(coalesce(p_notes, '')), ''),
    p_client_request_id
  )
  returning id into v_sale_id;

  insert into public.sale_items (
    user_id, sale_id, product_id, purchase_batch_id, quantity,
    unit_cost_snapshot, unit_selling_price, line_discount, line_total, line_profit
  )
  select
    v_user, v_sale_id, a.product_id, a.batch_id, a.qty,
    a.unit_cost, a.unit_price, a.alloc_line_discount + a.alloc_order_discount,
    a.line_total, a.line_profit
  from tmp_alloc a
  order by a.rowid;

  update public.purchase_batches b
     set quantity_remaining = b.quantity_remaining - agg.qty
    from (select batch_id, sum(qty)::integer as qty from tmp_alloc group by batch_id) agg
   where b.id = agg.batch_id;

  insert into public.stock_movements (
    user_id, product_id, purchase_batch_id, movement_type,
    quantity, reference_type, reference_id, notes
  )
  select
    v_user, a.product_id, a.batch_id, 'sale',
    -a.qty, 'sale', v_sale_id, 'Sale ' || v_invoice
  from tmp_alloc a
  order by a.rowid;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'duplicate', false,
    'subtotal', v_subtotal,
    'discount', v_discount_sum,
    'total', v_total,
    'total_cost', v_total_cost,
    'gross_profit', v_gross_profit,
    'margin_pct', public.safe_margin_pct(v_gross_profit, v_total),
    'status', public.price_status(v_total, v_total_cost,
      coalesce((select low_margin_threshold from public.profiles where id = v_user), 10.00))
  );

exception
  -- Two identical submissions racing each other: the unique index wins, and we
  -- hand back the sale that actually landed instead of an error.
  when unique_violation then
    if p_client_request_id is not null then
      select id into v_existing
        from public.sales
       where user_id = v_user and client_request_id = p_client_request_id;
      if v_existing is not null then
        return jsonb_build_object(
          'sale_id', v_existing,
          'invoice_number', (select invoice_number from public.sales where id = v_existing),
          'duplicate', true
        );
      end if;
    end if;
    raise;
end;
$$;

-- ===========================================================================
-- preview_sale() — read-only pricing analysis for the checkout screen.
-- Same FIFO walk and same money rules as complete_sale, but it writes nothing.
-- This is what makes the numbers the owner confirms identical to the numbers
-- that get recorded.
-- ===========================================================================
create or replace function public.preview_sale(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user       uuid := public.require_owner();
  v_low_margin numeric;
  v_result     jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('lines', '[]'::jsonb, 'subtotal', 0, 'total', 0,
                              'total_cost', 0, 'gross_profit', 0);
  end if;

  select low_margin_threshold into v_low_margin from public.profiles where id = v_user;
  v_low_margin := coalesce(v_low_margin, 10.00);

  with req as (
    select
      t.ord::integer                 as line_no,
      (t.item ->> 'product_id')::uuid  as product_id,
      (t.item ->> 'quantity')::integer as quantity,
      (t.item ->> 'unit_selling_price')::bigint as unit_price
    from jsonb_array_elements(p_items) with ordinality as t(item, ord)
  ),
  -- FIFO layers with a running total, so each line can claim its slice.
  layers as (
    select
      b.product_id, b.id as batch_id, b.unit_cost, b.quantity_remaining,
      sum(b.quantity_remaining) over (
        partition by b.product_id
        order by b.purchase_date, b.created_at, b.id
        rows between unbounded preceding and current row
      ) as cum_end
    from public.purchase_batches b
    where b.user_id = v_user
      and b.quantity_remaining > 0
      and b.product_id in (select product_id from req)
  ),
  -- Per product, how many units earlier lines already consumed.
  req_cum as (
    select r.*,
      coalesce(sum(r.quantity) over (
        partition by r.product_id order by r.line_no
        rows between unbounded preceding and 1 preceding
      ), 0) as offset_qty
    from req r
  ),
  alloc as (
    select
      rc.line_no, rc.product_id, rc.unit_price, l.batch_id, l.unit_cost,
      least(l.cum_end, rc.offset_qty + rc.quantity)
        - greatest(l.cum_end - l.quantity_remaining, rc.offset_qty) as qty
    from req_cum rc
    join layers l on l.product_id = rc.product_id
    where least(l.cum_end, rc.offset_qty + rc.quantity)
        > greatest(l.cum_end - l.quantity_remaining, rc.offset_qty)
  ),
  per_line as (
    select
      a.line_no,
      a.product_id,
      a.unit_price,
      sum(a.qty)::integer                      as allocated_qty,
      sum(a.qty * a.unit_cost)::bigint         as line_cost,
      min(a.unit_cost)::bigint                 as min_batch_cost,
      max(a.unit_cost)::bigint                 as max_batch_cost,
      jsonb_agg(jsonb_build_object(
        'batch_id', a.batch_id, 'quantity', a.qty, 'unit_cost', a.unit_cost
      ) order by a.batch_id)                   as allocations
    from alloc a
    group by a.line_no, a.product_id, a.unit_price
  ),
  enriched as (
    select
      r.line_no, r.product_id, r.quantity, r.unit_price,
      coalesce(pl.allocated_qty, 0)                        as allocated_qty,
      coalesce(pl.line_cost, 0)                            as line_cost,
      pl.min_batch_cost, pl.max_batch_cost,
      coalesce(pl.allocations, '[]'::jsonb)                as allocations,
      (r.unit_price * r.quantity - coalesce(pl.line_cost, 0))::bigint as line_profit
    from req r
    left join per_line pl on pl.line_no = r.line_no
  )
  select jsonb_build_object(
    'lines', coalesce(jsonb_agg(jsonb_build_object(
        'line_no', e.line_no,
        'product_id', e.product_id,
        'quantity', e.quantity,
        'allocated_qty', e.allocated_qty,
        'unit_selling_price', e.unit_price,
        'line_cost', e.line_cost,
        'fifo_unit_cost', case when e.allocated_qty > 0
                               then round(e.line_cost::numeric / e.allocated_qty)::bigint
                               else null end,
        'min_batch_cost', e.min_batch_cost,
        'max_batch_cost', e.max_batch_cost,
        'line_profit', e.line_profit,
        'margin_pct', public.safe_margin_pct(e.line_profit, e.unit_price * e.quantity),
        'markup_pct', public.safe_markup_pct(e.line_profit, e.line_cost),
        -- Compared at line level (revenue vs cost) rather than per unit, so a
        -- line split across batches with different costs is never mis-flagged
        -- by an averaged, rounded unit cost.
        'status', public.price_status(e.unit_price * e.quantity, e.line_cost, v_low_margin),
        'below_some_batch', (e.max_batch_cost is not null and e.unit_price < e.max_batch_cost),
        'insufficient_stock', (e.allocated_qty < e.quantity),
        'allocations', e.allocations
      ) order by e.line_no), '[]'::jsonb),
    'subtotal', coalesce(sum(e.unit_price * e.quantity), 0),
    'total_cost', coalesce(sum(e.line_cost), 0),
    'gross_profit', coalesce(sum(e.unit_price * e.quantity) - sum(e.line_cost), 0)
  )
  into v_result
  from enriched e;

  return v_result;
end;
$$;

-- ===========================================================================
-- return_sale_items() — partial or full return of a completed sale.
-- Restores the exact cost layers the units came from so FIFO stays truthful.
-- ===========================================================================
create or replace function public.return_sale_items(
  p_sale_id uuid,
  p_lines   jsonb,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := public.require_owner();
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status   public.sale_status;
  v_line     jsonb;
  v_item     record;
  v_qty      integer;
  v_subtotal bigint;
  v_discount bigint;
  v_returned bigint;
  v_cost     bigint;
  v_all_back boolean;
begin
  if v_reason is null then
    raise exception 'A reason is required for a return' using errcode = 'AU005';
  end if;

  select status into v_status
    from public.sales
   where id = p_sale_id and user_id = v_user
     for update;

  if v_status is null then
    raise exception 'Unknown sale' using errcode = '23503';
  end if;
  if v_status not in ('completed', 'partially_returned') then
    raise exception 'Only a completed sale can be returned (this one is %)', v_status
      using errcode = 'AU005';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Select at least one item to return' using errcode = 'AU005';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'quantity')::integer;

    select * into v_item
      from public.sale_items
     where id = (v_line ->> 'sale_item_id')::uuid
       and sale_id = p_sale_id
       and user_id = v_user
       for update;

    if v_item.id is null then
      raise exception 'Unknown sale line' using errcode = '23503';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Return quantity must be at least 1' using errcode = 'AU005';
    end if;
    if v_qty > v_item.quantity - v_item.quantity_returned then
      raise exception 'Cannot return % unit(s): only % remain returnable',
        v_qty, v_item.quantity - v_item.quantity_returned using errcode = 'AU005';
    end if;

    update public.sale_items
       set quantity_returned = quantity_returned + v_qty
     where id = v_item.id;

    if v_item.purchase_batch_id is not null then
      update public.purchase_batches
         set quantity_remaining = quantity_remaining + v_qty
       where id = v_item.purchase_batch_id
         and user_id = v_user;
    end if;

    insert into public.stock_movements (
      user_id, product_id, purchase_batch_id, movement_type,
      quantity, reference_type, reference_id, notes
    ) values (
      v_user, v_item.product_id, v_item.purchase_batch_id, 'sale_return',
      v_qty, 'sale', p_sale_id, v_reason
    );
  end loop;

  -- Recompute the invoice from its lines. Never trust an incremental delta.
  select
    coalesce(sum(f.original_line_total), 0),
    coalesce(sum(f.returned_revenue), 0),
    coalesce(sum(f.net_cost), 0),
    bool_and(f.quantity_retained = 0)
  into v_subtotal, v_returned, v_cost, v_all_back
  from public.sale_item_financials f
  where f.sale_id = p_sale_id;

  select discount into v_discount from public.sales where id = p_sale_id;

  update public.sales
     set return_amount = v_returned,
         total         = subtotal - discount - v_returned,
         total_cost    = v_cost,
         gross_profit  = (subtotal - discount - v_returned) - v_cost,
         status        = (case when v_all_back then 'returned' else 'partially_returned' end)::public.sale_status
   where id = p_sale_id;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'return_amount', v_returned,
    'status', case when v_all_back then 'returned' else 'partially_returned' end
  );
end;
$$;

-- ===========================================================================
-- void_sale() — reversal, not deletion. The invoice stays on record with its
-- original figures; reporting simply stops counting it.
-- ===========================================================================
create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := public.require_owner();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status public.sale_status;
  v_item   record;
  v_qty    integer;
begin
  if v_reason is null then
    raise exception 'A reason is required to void a sale' using errcode = 'AU005';
  end if;

  select status into v_status
    from public.sales where id = p_sale_id and user_id = v_user for update;

  if v_status is null then
    raise exception 'Unknown sale' using errcode = '23503';
  end if;
  if v_status = 'voided' then
    return jsonb_build_object('sale_id', p_sale_id, 'status', 'voided', 'already', true);
  end if;

  -- Put every unit that had not already been returned back on the shelf.
  for v_item in
    select id, product_id, purchase_batch_id, quantity, quantity_returned
      from public.sale_items
     where sale_id = p_sale_id and user_id = v_user
       for update
  loop
    v_qty := v_item.quantity - v_item.quantity_returned;
    if v_qty > 0 then
      if v_item.purchase_batch_id is not null then
        update public.purchase_batches
           set quantity_remaining = quantity_remaining + v_qty
         where id = v_item.purchase_batch_id and user_id = v_user;
      end if;

      insert into public.stock_movements (
        user_id, product_id, purchase_batch_id, movement_type,
        quantity, reference_type, reference_id, notes
      ) values (
        v_user, v_item.product_id, v_item.purchase_batch_id, 'sale_return',
        v_qty, 'sale', p_sale_id, 'Void: ' || v_reason
      );
    end if;
  end loop;

  update public.sales
     set status = 'voided',
         notes  = trim(both from coalesce(notes || E'\n', '') || 'VOIDED: ' || v_reason)
   where id = p_sale_id;

  return jsonb_build_object('sale_id', p_sale_id, 'status', 'voided', 'already', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.sale_item_financials to authenticated;

revoke all on function public.complete_sale(jsonb, public.payment_method, bigint, text, uuid, timestamptz, boolean, boolean) from public;
revoke all on function public.preview_sale(jsonb) from public;
revoke all on function public.return_sale_items(uuid, jsonb, text) from public;
revoke all on function public.void_sale(uuid, text) from public;

grant execute on function public.complete_sale(jsonb, public.payment_method, bigint, text, uuid, timestamptz, boolean, boolean) to authenticated;
grant execute on function public.preview_sale(jsonb) to authenticated;
grant execute on function public.return_sale_items(uuid, jsonb, text) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;


-- ###########################################################################
-- ##  20260101000500_reporting.sql
-- ###########################################################################

-- ===========================================================================
-- Aurelia — reporting
-- ---------------------------------------------------------------------------
-- Rules that every function here obeys:
--   * scoped to the authenticated owner, always
--   * only completed / partially_returned / returned sales count;
--     drafts and voids are invisible to the P&L
--   * cost of goods sold comes from the frozen unit_cost_snapshot
--   * expense reporting uses expense_date
--   * calendar boundaries come from profiles.timezone, never the browser
--   * missing days / months / years are emitted as explicit zero rows
--   * aggregation happens here; the browser receives totals, not ledgers
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- report_period() — resolves a named quick filter into inclusive local dates.
-- Centralising this is what guarantees "Today" means the same thing on the
-- dashboard, in the P&L, and in a CSV export.
-- ---------------------------------------------------------------------------
create or replace function public.report_period(
  p_period text,
  p_start  date default null,
  p_end    date default null
)
returns table (period_start date, period_end date, label text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user     uuid := public.require_owner();
  v_today    date := public.shop_today(v_user);
  v_tz       text := public.shop_timezone(v_user);
  v_earliest date;
begin
  case lower(coalesce(p_period, 'today'))
    when 'today' then
      period_start := v_today;             period_end := v_today;            label := 'Today';
    when 'yesterday' then
      period_start := v_today - 1;         period_end := v_today - 1;        label := 'Yesterday';
    -- "Last N days" includes today, so the window is N calendar days long.
    when 'last_5_days' then
      period_start := v_today - 4;         period_end := v_today;            label := 'Last 5 Days';
    when 'last_10_days' then
      period_start := v_today - 9;         period_end := v_today;            label := 'Last 10 Days';
    when 'last_20_days' then
      period_start := v_today - 19;        period_end := v_today;            label := 'Last 20 Days';
    when 'last_30_days' then
      period_start := v_today - 29;        period_end := v_today;            label := 'Last 30 Days';
    when 'this_month' then
      period_start := date_trunc('month', v_today)::date;
      period_end   := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
      label := 'This Month';
    when 'last_month' then
      period_start := (date_trunc('month', v_today) - interval '1 month')::date;
      period_end   := (date_trunc('month', v_today) - interval '1 day')::date;
      label := 'Last Month';
    when 'this_year' then
      period_start := date_trunc('year', v_today)::date;
      period_end   := (date_trunc('year', v_today) + interval '1 year - 1 day')::date;
      label := 'This Year';
    when 'all_time' then
      select least(
        (select min(purchase_date) from public.purchase_batches where user_id = v_user),
        (select min((sale_date at time zone v_tz)::date) from public.sales
          where user_id = v_user and status <> 'draft'),
        (select min(expense_date) from public.expenses where user_id = v_user),
        (select (app_started_at at time zone v_tz)::date from public.profiles where id = v_user)
      ) into v_earliest;
      period_start := coalesce(v_earliest, v_today);
      period_end   := v_today;
      label := 'All Time';
    when 'custom' then
      if p_start is null or p_end is null then
        raise exception 'A custom range needs both a start and an end date'
          using errcode = '22023';
      end if;
      if p_start > p_end then
        raise exception 'The start date must not be after the end date'
          using errcode = '22023';
      end if;
      period_start := p_start; period_end := p_end;
      label := to_char(p_start, 'DD Mon YYYY') || ' – ' || to_char(p_end, 'DD Mon YYYY');
    else
      raise exception 'Unknown reporting period: %', p_period using errcode = '22023';
  end case;

  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- report_bounds() — earliest business activity and today, used to build month
-- and year selectors dynamically. No year is ever hardcoded in the app.
-- ---------------------------------------------------------------------------
create or replace function public.report_bounds()
returns table (earliest_date date, latest_date date, app_started_on date)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user  uuid := public.require_owner();
  v_tz    text := public.shop_timezone(v_user);
  v_today date := public.shop_today(v_user);
  v_app   date;
begin
  select (app_started_at at time zone v_tz)::date into v_app
    from public.profiles where id = v_user;
  v_app := coalesce(v_app, v_today);

  earliest_date := least(
    coalesce((select min(purchase_date) from public.purchase_batches where user_id = v_user), v_app),
    coalesce((select min((sale_date at time zone v_tz)::date) from public.sales
               where user_id = v_user and status <> 'draft'), v_app),
    coalesce((select min(expense_date) from public.expenses where user_id = v_user), v_app),
    v_app
  );
  latest_date := v_today;
  app_started_on := v_app;
  return next;
end;
$$;

-- ===========================================================================
-- report_pl_summary() — the full profit & loss statement for a period.
-- ===========================================================================
create or replace function public.report_pl_summary(
  p_period text default 'today',
  p_start  date default null,
  p_end    date default null
)
returns table (
  period_start                  date,
  period_end                    date,
  period_label                  text,
  gross_sales                   bigint,
  discounts                     bigint,
  returns_amount                bigint,
  net_sales                     bigint,
  cost_of_goods_sold            bigint,
  realized_gross_profit         bigint,
  gross_margin_pct              numeric,
  operating_expenses            bigint,
  net_profit                    bigint,
  net_margin_pct                numeric,
  order_count                   integer,
  units_sold                    integer,
  average_order_value           bigint,
  inventory_purchased           bigint,
  inventory_units_purchased     integer,
  current_inventory_investment  bigint,
  projected_gross_profit        bigint,
  loss_making_order_count       integer,
  status                        text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.require_owner();
  v_lo   timestamptz;
  v_hi   timestamptz;
  v_p    record;
begin
  select * into v_p from public.report_period(p_period, p_start, p_end);
  select lo, hi into v_lo, v_hi from public.local_day_bounds(v_user, v_p.period_start, v_p.period_end);

  period_start := v_p.period_start;
  period_end   := v_p.period_end;
  period_label := v_p.label;

  select
    coalesce(sum(s.subtotal), 0),
    coalesce(sum(s.discount), 0),
    coalesce(sum(s.return_amount), 0),
    coalesce(sum(s.total), 0),
    coalesce(sum(s.total_cost), 0),
    coalesce(sum(s.gross_profit), 0),
    coalesce(count(*) filter (where s.status in ('completed', 'partially_returned')), 0),
    coalesce(count(*) filter (where s.gross_profit < 0), 0)
  into gross_sales, discounts, returns_amount, net_sales,
       cost_of_goods_sold, realized_gross_profit, order_count, loss_making_order_count
  from public.sales s
  where s.user_id = v_user
    and s.status in ('completed', 'partially_returned', 'returned')
    and s.sale_date >= v_lo and s.sale_date < v_hi;

  select coalesce(sum(f.quantity_retained), 0)::integer
  into units_sold
  from public.sales s
  join public.sale_item_financials f on f.sale_id = s.id
  where s.user_id = v_user
    and s.status in ('completed', 'partially_returned', 'returned')
    and s.sale_date >= v_lo and s.sale_date < v_hi;

  select coalesce(sum(e.amount), 0)
  into operating_expenses
  from public.expenses e
  where e.user_id = v_user
    and e.expense_date between v_p.period_start and v_p.period_end;

  select
    coalesce(sum(b.quantity_purchased::bigint * b.unit_cost), 0),
    coalesce(sum(b.quantity_purchased), 0)::integer
  into inventory_purchased, inventory_units_purchased
  from public.purchase_batches b
  where b.user_id = v_user
    and b.purchase_date between v_p.period_start and v_p.period_end;

  -- Position figures: always "as of now", never period-scoped, because unsold
  -- stock has no date. Kept in the same payload so the UI can show the
  -- realized result next to what is still on the shelf without confusing them.
  select coalesce(sum(b.quantity_remaining::bigint * b.unit_cost), 0)
  into current_inventory_investment
  from public.purchase_batches b
  where b.user_id = v_user and b.quantity_remaining > 0;

  select coalesce(sum(
    p.recommended_selling_price * inv.qty - inv.cost
  ), 0)
  into projected_gross_profit
  from public.products p
  join (
    select product_id,
           sum(quantity_remaining)::bigint as qty,
           sum(quantity_remaining::bigint * unit_cost) as cost
      from public.purchase_batches
     where user_id = v_user and quantity_remaining > 0
     group by product_id
  ) inv on inv.product_id = p.id
  where p.user_id = v_user;

  gross_margin_pct    := public.safe_margin_pct(realized_gross_profit, net_sales);
  net_profit          := realized_gross_profit - operating_expenses;
  net_margin_pct      := public.safe_margin_pct(net_profit, net_sales);
  average_order_value := case when order_count = 0 then 0
                              else round(net_sales::numeric / order_count)::bigint end;
  status := case
    when net_profit > 0 then 'net_profit'
    when net_profit < 0 then 'net_loss'
    else 'breakeven'
  end;

  return next;
end;
$$;

-- ===========================================================================
-- report_daily_series() — one row per calendar day in range, zero-filled, so a
-- chart's timeline is never silently compressed by days with no trade.
-- ===========================================================================
create or replace function public.report_daily_series(
  p_period text default 'last_30_days',
  p_start  date default null,
  p_end    date default null
)
returns table (
  day                   date,
  gross_sales           bigint,
  discounts             bigint,
  returns_amount        bigint,
  net_sales             bigint,
  cost_of_goods_sold    bigint,
  realized_gross_profit bigint,
  operating_expenses    bigint,
  net_profit            bigint,
  order_count           integer,
  units_sold            integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.require_owner();
  v_tz   text := public.shop_timezone(v_user);
  v_lo   timestamptz;
  v_hi   timestamptz;
  v_p    record;
begin
  select * into v_p from public.report_period(p_period, p_start, p_end);
  select lo, hi into v_lo, v_hi from public.local_day_bounds(v_user, v_p.period_start, v_p.period_end);

  return query
  with calendar as (
    select d::date as day
      from generate_series(v_p.period_start, v_p.period_end, interval '1 day') d
  ),
  sale_days as (
    select
      (s.sale_date at time zone v_tz)::date as day,
      sum(s.subtotal)      as gross_sales,
      sum(s.discount)      as discounts,
      sum(s.return_amount) as returns_amount,
      sum(s.total)         as net_sales,
      sum(s.total_cost)    as cogs,
      sum(s.gross_profit)  as gross_profit,
      count(*) filter (where s.status in ('completed', 'partially_returned'))::integer as orders
    from public.sales s
    where s.user_id = v_user
      and s.status in ('completed', 'partially_returned', 'returned')
      and s.sale_date >= v_lo and s.sale_date < v_hi
    group by 1
  ),
  unit_days as (
    select
      (s.sale_date at time zone v_tz)::date as day,
      sum(f.quantity_retained)::integer as units
    from public.sales s
    join public.sale_item_financials f on f.sale_id = s.id
    where s.user_id = v_user
      and s.status in ('completed', 'partially_returned', 'returned')
      and s.sale_date >= v_lo and s.sale_date < v_hi
    group by 1
  ),
  expense_days as (
    select e.expense_date as day, sum(e.amount) as expenses
    from public.expenses e
    where e.user_id = v_user
      and e.expense_date between v_p.period_start and v_p.period_end
    group by 1
  )
  select
    c.day,
    coalesce(sd.gross_sales, 0)::bigint,
    coalesce(sd.discounts, 0)::bigint,
    coalesce(sd.returns_amount, 0)::bigint,
    coalesce(sd.net_sales, 0)::bigint,
    coalesce(sd.cogs, 0)::bigint,
    coalesce(sd.gross_profit, 0)::bigint,
    coalesce(ed.expenses, 0)::bigint,
    (coalesce(sd.gross_profit, 0) - coalesce(ed.expenses, 0))::bigint,
    coalesce(sd.orders, 0)::integer,
    coalesce(ud.units, 0)::integer
  from calendar c
  left join sale_days sd    on sd.day = c.day
  left join unit_days ud    on ud.day = c.day
  left join expense_days ed on ed.day = c.day
  order by c.day;
end;
$$;

-- ===========================================================================
-- report_monthly_series() — zero-filled months between any two dates.
-- ===========================================================================
create or replace function public.report_monthly_series(
  p_from date default null,
  p_to   date default null
)
returns table (
  month                 date,
  gross_sales           bigint,
  discounts             bigint,
  returns_amount        bigint,
  net_sales             bigint,
  cost_of_goods_sold    bigint,
  realized_gross_profit bigint,
  operating_expenses    bigint,
  net_profit            bigint,
  gross_margin_pct      numeric,
  net_margin_pct        numeric,
  order_count           integer,
  units_sold            integer,
  inventory_purchased   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user  uuid := public.require_owner();
  v_tz    text := public.shop_timezone(v_user);
  v_from  date;
  v_to    date;
  v_lo    timestamptz;
  v_hi    timestamptz;
  v_b     record;
begin
  select * into v_b from public.report_bounds();
  v_from := date_trunc('month', coalesce(p_from, v_b.earliest_date))::date;
  v_to   := (date_trunc('month', coalesce(p_to, v_b.latest_date)) + interval '1 month - 1 day')::date;

  if v_from > v_to then
    v_from := date_trunc('month', v_to)::date;
  end if;

  select lo, hi into v_lo, v_hi from public.local_day_bounds(v_user, v_from, v_to);

  return query
  with calendar as (
    select d::date as month
      from generate_series(v_from, v_to, interval '1 month') d
  ),
  sale_months as (
    select
      date_trunc('month', (s.sale_date at time zone v_tz))::date as month,
      sum(s.subtotal)      as gross_sales,
      sum(s.discount)      as discounts,
      sum(s.return_amount) as returns_amount,
      sum(s.total)         as net_sales,
      sum(s.total_cost)    as cogs,
      sum(s.gross_profit)  as gross_profit,
      count(*) filter (where s.status in ('completed', 'partially_returned'))::integer as orders
    from public.sales s
    where s.user_id = v_user
      and s.status in ('completed', 'partially_returned', 'returned')
      and s.sale_date >= v_lo and s.sale_date < v_hi
    group by 1
  ),
  unit_months as (
    select
      date_trunc('month', (s.sale_date at time zone v_tz))::date as month,
      sum(f.quantity_retained)::integer as units
    from public.sales s
    join public.sale_item_financials f on f.sale_id = s.id
    where s.user_id = v_user
      and s.status in ('completed', 'partially_returned', 'returned')
      and s.sale_date >= v_lo and s.sale_date < v_hi
    group by 1
  ),
  expense_months as (
    select date_trunc('month', e.expense_date)::date as month, sum(e.amount) as expenses
    from public.expenses e
    where e.user_id = v_user and e.expense_date between v_from and v_to
    group by 1
  ),
  purchase_months as (
    select date_trunc('month', b.purchase_date)::date as month,
           sum(b.quantity_purchased::bigint * b.unit_cost) as invested
    from public.purchase_batches b
    where b.user_id = v_user and b.purchase_date between v_from and v_to
    group by 1
  )
  select
    c.month,
    coalesce(sm.gross_sales, 0)::bigint,
    coalesce(sm.discounts, 0)::bigint,
    coalesce(sm.returns_amount, 0)::bigint,
    coalesce(sm.net_sales, 0)::bigint,
    coalesce(sm.cogs, 0)::bigint,
    coalesce(sm.gross_profit, 0)::bigint,
    coalesce(em.expenses, 0)::bigint,
    (coalesce(sm.gross_profit, 0) - coalesce(em.expenses, 0))::bigint,
    public.safe_margin_pct(coalesce(sm.gross_profit, 0)::bigint, coalesce(sm.net_sales, 0)::bigint),
    public.safe_margin_pct(
      (coalesce(sm.gross_profit, 0) - coalesce(em.expenses, 0))::bigint,
      coalesce(sm.net_sales, 0)::bigint),
    coalesce(sm.orders, 0)::integer,
    coalesce(um.units, 0)::integer,
    coalesce(pm.invested, 0)::bigint
  from calendar c
  left join sale_months sm     on sm.month = c.month
  left join unit_months um     on um.month = c.month
  left join expense_months em  on em.month = c.month
  left join purchase_months pm on pm.month = c.month
  order by c.month;
end;
$$;

-- ===========================================================================
-- report_yearly_series() — zero-filled years from first use to now.
-- ===========================================================================
create or replace function public.report_yearly_series()
returns table (
  year                  integer,
  gross_sales           bigint,
  discounts             bigint,
  returns_amount        bigint,
  net_sales             bigint,
  cost_of_goods_sold    bigint,
  realized_gross_profit bigint,
  operating_expenses    bigint,
  net_profit            bigint,
  gross_margin_pct      numeric,
  net_margin_pct        numeric,
  order_count           integer,
  units_sold            integer,
  inventory_purchased   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.require_owner();
  v_tz   text := public.shop_timezone(v_user);
  v_from date;
  v_to   date;
  v_lo   timestamptz;
  v_hi   timestamptz;
  v_b    record;
begin
  select * into v_b from public.report_bounds();
  v_from := date_trunc('year', v_b.earliest_date)::date;
  v_to   := (date_trunc('year', v_b.latest_date) + interval '1 year - 1 day')::date;
  select lo, hi into v_lo, v_hi from public.local_day_bounds(v_user, v_from, v_to);

  return query
  with calendar as (
    select date_part('year', d)::integer as year
      from generate_series(v_from, v_to, interval '1 year') d
  ),
  sale_years as (
    select
      date_part('year', (s.sale_date at time zone v_tz))::integer as year,
      sum(s.subtotal) as gross_sales, sum(s.discount) as discounts,
      sum(s.return_amount) as returns_amount, sum(s.total) as net_sales,
      sum(s.total_cost) as cogs, sum(s.gross_profit) as gross_profit,
      count(*) filter (where s.status in ('completed', 'partially_returned'))::integer as orders
    from public.sales s
    where s.user_id = v_user
      and s.status in ('completed', 'partially_returned', 'returned')
      and s.sale_date >= v_lo and s.sale_date < v_hi
    group by 1
  ),
  unit_years as (
    select
      date_part('year', (s.sale_date at time zone v_tz))::integer as year,
      sum(f.quantity_retained)::integer as units
    from public.sales s
    join public.sale_item_financials f on f.sale_id = s.id
    where s.user_id = v_user
      and s.status in ('completed', 'partially_returned', 'returned')
      and s.sale_date >= v_lo and s.sale_date < v_hi
    group by 1
  ),
  expense_years as (
    select date_part('year', e.expense_date)::integer as year, sum(e.amount) as expenses
    from public.expenses e
    where e.user_id = v_user and e.expense_date between v_from and v_to
    group by 1
  ),
  purchase_years as (
    select date_part('year', b.purchase_date)::integer as year,
           sum(b.quantity_purchased::bigint * b.unit_cost) as invested
    from public.purchase_batches b
    where b.user_id = v_user and b.purchase_date between v_from and v_to
    group by 1
  )
  select
    c.year,
    coalesce(sy.gross_sales, 0)::bigint,
    coalesce(sy.discounts, 0)::bigint,
    coalesce(sy.returns_amount, 0)::bigint,
    coalesce(sy.net_sales, 0)::bigint,
    coalesce(sy.cogs, 0)::bigint,
    coalesce(sy.gross_profit, 0)::bigint,
    coalesce(ey.expenses, 0)::bigint,
    (coalesce(sy.gross_profit, 0) - coalesce(ey.expenses, 0))::bigint,
    public.safe_margin_pct(coalesce(sy.gross_profit, 0)::bigint, coalesce(sy.net_sales, 0)::bigint),
    public.safe_margin_pct(
      (coalesce(sy.gross_profit, 0) - coalesce(ey.expenses, 0))::bigint,
      coalesce(sy.net_sales, 0)::bigint),
    coalesce(sy.orders, 0)::integer,
    coalesce(uy.units, 0)::integer,
    coalesce(py.invested, 0)::bigint
  from calendar c
  left join sale_years sy     on sy.year = c.year
  left join unit_years uy     on uy.year = c.year
  left join expense_years ey  on ey.year = c.year
  left join purchase_years py on py.year = c.year
  order by c.year;
end;
$$;

-- ===========================================================================
-- report_product_profitability() — per-product realized result for a period.
-- Returns aggregates (one row per product sold), never raw sale lines.
-- ===========================================================================
create or replace function public.report_product_profitability(
  p_period text default 'this_month',
  p_start  date default null,
  p_end    date default null
)
returns table (
  product_id       uuid,
  name             text,
  brand            text,
  shade_or_variant text,
  internal_code    text,
  image_url        text,
  category_name    text,
  units_sold       integer,
  net_revenue      bigint,
  net_cost         bigint,
  net_profit       bigint,
  margin_pct       numeric,
  order_count      integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.require_owner();
  v_lo   timestamptz;
  v_hi   timestamptz;
  v_p    record;
begin
  select * into v_p from public.report_period(p_period, p_start, p_end);
  select lo, hi into v_lo, v_hi from public.local_day_bounds(v_user, v_p.period_start, v_p.period_end);

  return query
  select
    p.id,
    p.name,
    p.brand,
    p.shade_or_variant,
    p.internal_code,
    p.image_url,
    c.name,
    sum(f.quantity_retained)::integer,
    sum(f.net_revenue)::bigint,
    sum(f.net_cost)::bigint,
    sum(f.net_profit)::bigint,
    public.safe_margin_pct(sum(f.net_profit)::bigint, sum(f.net_revenue)::bigint),
    count(distinct f.sale_id)::integer
  from public.sale_item_financials f
  join public.sales s     on s.id = f.sale_id
  join public.products p  on p.id = f.product_id
  left join public.categories c on c.id = p.category_id
  where f.user_id = v_user
    and s.status in ('completed', 'partially_returned', 'returned')
    and s.sale_date >= v_lo and s.sale_date < v_hi
  group by p.id, p.name, p.brand, p.shade_or_variant, p.internal_code, p.image_url, c.name
  having sum(f.quantity_retained) > 0
  order by sum(f.net_profit) desc;
end;
$$;

-- ===========================================================================
-- report_payment_methods()
-- ===========================================================================
create or replace function public.report_payment_methods(
  p_period text default 'this_month',
  p_start  date default null,
  p_end    date default null
)
returns table (
  payment_method text,
  order_count    integer,
  net_sales      bigint,
  gross_profit   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.require_owner();
  v_lo   timestamptz;
  v_hi   timestamptz;
  v_p    record;
begin
  select * into v_p from public.report_period(p_period, p_start, p_end);
  select lo, hi into v_lo, v_hi from public.local_day_bounds(v_user, v_p.period_start, v_p.period_end);

  return query
  select
    s.payment_method::text,
    count(*)::integer,
    coalesce(sum(s.total), 0)::bigint,
    coalesce(sum(s.gross_profit), 0)::bigint
  from public.sales s
  where s.user_id = v_user
    and s.status in ('completed', 'partially_returned', 'returned')
    and s.sale_date >= v_lo and s.sale_date < v_hi
  group by s.payment_method
  order by 3 desc;
end;
$$;

-- ===========================================================================
-- report_expenses_by_category()
-- ===========================================================================
create or replace function public.report_expenses_by_category(
  p_period text default 'this_month',
  p_start  date default null,
  p_end    date default null
)
returns table (
  expense_category_id uuid,
  name                text,
  color               text,
  total_amount        bigint,
  entry_count         integer,
  share_pct           numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user  uuid := public.require_owner();
  v_p     record;
  v_total bigint;
begin
  select * into v_p from public.report_period(p_period, p_start, p_end);

  select coalesce(sum(amount), 0) into v_total
    from public.expenses
   where user_id = v_user and expense_date between v_p.period_start and v_p.period_end;

  return query
  select
    ec.id,
    coalesce(ec.name, 'Uncategorised'),
    coalesce(ec.color, '#796C66'),
    coalesce(sum(e.amount), 0)::bigint,
    count(*)::integer,
    case when v_total = 0 then 0::numeric
         else round((sum(e.amount)::numeric / v_total::numeric) * 100, 2) end
  from public.expenses e
  left join public.expense_categories ec on ec.id = e.expense_category_id
  where e.user_id = v_user
    and e.expense_date between v_p.period_start and v_p.period_end
  group by ec.id, ec.name, ec.color
  order by 4 desc;
end;
$$;

-- ===========================================================================
-- report_loss_making_sales() — invoices that lost money in the period.
-- ===========================================================================
create or replace function public.report_loss_making_sales(
  p_period text default 'this_month',
  p_start  date default null,
  p_end    date default null
)
returns table (
  sale_id        uuid,
  invoice_number text,
  sale_date      timestamptz,
  status         text,
  net_sales      bigint,
  total_cost     bigint,
  gross_profit   bigint,
  margin_pct     numeric,
  item_count     integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.require_owner();
  v_lo   timestamptz;
  v_hi   timestamptz;
  v_p    record;
begin
  select * into v_p from public.report_period(p_period, p_start, p_end);
  select lo, hi into v_lo, v_hi from public.local_day_bounds(v_user, v_p.period_start, v_p.period_end);

  return query
  select
    s.id, s.invoice_number, s.sale_date, s.status::text,
    s.total, s.total_cost, s.gross_profit,
    public.safe_margin_pct(s.gross_profit, s.total),
    (select count(*)::integer from public.sale_items si where si.sale_id = s.id)
  from public.sales s
  where s.user_id = v_user
    and s.status in ('completed', 'partially_returned', 'returned')
    and s.sale_date >= v_lo and s.sale_date < v_hi
    and s.gross_profit <= 0
  order by s.gross_profit asc, s.sale_date desc;
end;
$$;

-- ===========================================================================
-- report_projected_by_category() — where the unsold investment is parked and
-- what it could earn at current recommended prices.
-- ===========================================================================
create or replace function public.report_projected_by_category()
returns table (
  category_id            uuid,
  name                   text,
  color                  text,
  product_count          integer,
  quantity_on_hand       integer,
  inventory_investment   bigint,
  projected_revenue      bigint,
  projected_gross_profit bigint,
  projected_margin_pct   numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.require_owner();
begin
  return query
  with inv as (
    select b.product_id,
           sum(b.quantity_remaining)::integer as qty,
           sum(b.quantity_remaining::bigint * b.unit_cost) as cost
      from public.purchase_batches b
     where b.user_id = v_user and b.quantity_remaining > 0
     group by b.product_id
  )
  select
    c.id,
    coalesce(c.name, 'Uncategorised'),
    coalesce(c.color, '#796C66'),
    count(distinct p.id)::integer,
    coalesce(sum(inv.qty), 0)::integer,
    coalesce(sum(inv.cost), 0)::bigint,
    coalesce(sum(p.recommended_selling_price * inv.qty), 0)::bigint,
    coalesce(sum(p.recommended_selling_price * inv.qty - inv.cost), 0)::bigint,
    public.safe_margin_pct(
      coalesce(sum(p.recommended_selling_price * inv.qty - inv.cost), 0)::bigint,
      coalesce(sum(p.recommended_selling_price * inv.qty), 0)::bigint)
  from inv
  join public.products p on p.id = inv.product_id
  left join public.categories c on c.id = p.category_id
  where p.user_id = v_user
  group by c.id, c.name, c.color
  order by 8 desc;
end;
$$;

-- ===========================================================================
-- dashboard_snapshot() — everything the home screen needs in one round trip,
-- including the today-vs-yesterday comparison with safe percentages.
-- ===========================================================================
create or replace function public.dashboard_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user      uuid := public.require_owner();
  v_today     record;
  v_yesterday record;
  v_month     record;
  v_low       integer;
  v_out       integer;
  v_expiring  integer;
  v_loss      integer;
  v_breakeven integer;
  v_inv_cost  bigint;
  v_inv_units integer;
  v_proj_rev  bigint;
  v_horizon   date := public.shop_today(v_user) + 60;
begin
  select * into v_today     from public.report_pl_summary('today');
  select * into v_yesterday from public.report_pl_summary('yesterday');
  select * into v_month     from public.report_pl_summary('this_month');

  -- Inventory position and price-health counters, from live cost layers.
  with inv as (
    select b.product_id,
           sum(b.quantity_remaining)::integer as qty,
           sum(b.quantity_remaining::bigint * b.unit_cost) as cost,
           min(b.expiry_date) filter (where b.quantity_remaining > 0) as nearest_expiry,
           (array_agg(b.unit_cost order by b.purchase_date, b.created_at, b.id))[1] as fifo_cost
      from public.purchase_batches b
     where b.user_id = v_user and b.quantity_remaining > 0
     group by b.product_id
  ),
  joined as (
    select p.id, p.low_stock_threshold, p.recommended_selling_price,
           coalesce(inv.qty, 0) as qty,
           coalesce(inv.cost, 0) as cost,
           inv.nearest_expiry, inv.fifo_cost
      from public.products p
      left join inv on inv.product_id = p.id
     where p.user_id = v_user and p.is_active
  )
  select
    count(*) filter (where qty > 0 and qty <= low_stock_threshold),
    count(*) filter (where qty = 0),
    count(*) filter (where nearest_expiry is not null and nearest_expiry <= v_horizon),
    count(*) filter (where fifo_cost is not null and recommended_selling_price < fifo_cost),
    count(*) filter (where fifo_cost is not null and recommended_selling_price = fifo_cost),
    coalesce(sum(cost), 0),
    coalesce(sum(qty), 0),
    coalesce(sum(recommended_selling_price * qty), 0)
  into v_low, v_out, v_expiring, v_loss, v_breakeven, v_inv_cost, v_inv_units, v_proj_rev
  from joined;

  return jsonb_build_object(
    'today', row_to_json(v_today)::jsonb,
    'yesterday', row_to_json(v_yesterday)::jsonb,
    'this_month', row_to_json(v_month)::jsonb,
    'comparison', jsonb_build_object(
      'net_sales_delta', v_today.net_sales - v_yesterday.net_sales,
      'gross_profit_delta', v_today.realized_gross_profit - v_yesterday.realized_gross_profit,
      'net_profit_delta', v_today.net_profit - v_yesterday.net_profit,
      -- Null (not Infinity) when yesterday was zero: the UI shows "new activity"
      -- rather than a meaningless percentage.
      'net_sales_pct', case when v_yesterday.net_sales = 0 then null
        else round(((v_today.net_sales - v_yesterday.net_sales)::numeric
                    / abs(v_yesterday.net_sales)::numeric) * 100, 1) end,
      'gross_profit_pct', case when v_yesterday.realized_gross_profit = 0 then null
        else round(((v_today.realized_gross_profit - v_yesterday.realized_gross_profit)::numeric
                    / abs(v_yesterday.realized_gross_profit)::numeric) * 100, 1) end,
      'net_profit_pct', case when v_yesterday.net_profit = 0 then null
        else round(((v_today.net_profit - v_yesterday.net_profit)::numeric
                    / abs(v_yesterday.net_profit)::numeric) * 100, 1) end
    ),
    'inventory', jsonb_build_object(
      'investment', v_inv_cost,
      'units', v_inv_units,
      'projected_revenue', v_proj_rev,
      'projected_gross_profit', v_proj_rev - v_inv_cost,
      'projected_margin_pct', public.safe_margin_pct(v_proj_rev - v_inv_cost, v_proj_rev)
    ),
    'alerts', jsonb_build_object(
      'low_stock', v_low,
      'out_of_stock', v_out,
      'expiring_soon', v_expiring,
      'priced_at_loss', v_loss,
      'priced_at_breakeven', v_breakeven
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.report_period(text, date, date)',
    'public.report_bounds()',
    'public.report_pl_summary(text, date, date)',
    'public.report_daily_series(text, date, date)',
    'public.report_monthly_series(date, date)',
    'public.report_yearly_series()',
    'public.report_product_profitability(text, date, date)',
    'public.report_payment_methods(text, date, date)',
    'public.report_expenses_by_category(text, date, date)',
    'public.report_loss_making_sales(text, date, date)',
    'public.report_projected_by_category()',
    'public.dashboard_snapshot()'
  ]
  loop
    execute format('revoke all on function %s from public', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end;
$$;


-- ###########################################################################
-- ##  20260101000600_storage.sql
-- ###########################################################################

-- ===========================================================================
-- Aurelia — Supabase Storage
-- ---------------------------------------------------------------------------
--   product-images  public read (product photos are not sensitive), writes
--                   restricted to the owner's own folder
--   receipts        fully private; the app mints short-lived signed URLs
--
-- Both buckets constrain size and MIME type at the bucket level, so an
-- oversized or non-image upload is rejected by Storage itself rather than
-- relying on client-side validation.
--
-- Every object must be stored as `<auth.uid()>/<filename>`; the policies below
-- pin the first path segment to the caller's id.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'product-images', 'product-images', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  ),
  (
    'receipts', 'receipts', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- product-images
-- ---------------------------------------------------------------------------
create policy "product images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

create policy "owner uploads own product images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owner replaces own product images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owner deletes own product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- receipts — private in every direction
-- ---------------------------------------------------------------------------
create policy "owner reads own receipts"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owner uploads own receipts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owner deletes own receipts"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

