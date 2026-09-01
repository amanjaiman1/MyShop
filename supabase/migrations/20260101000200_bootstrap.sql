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
