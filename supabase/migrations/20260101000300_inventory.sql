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
