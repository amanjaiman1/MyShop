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
