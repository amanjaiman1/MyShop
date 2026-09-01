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
