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
