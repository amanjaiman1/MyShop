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
