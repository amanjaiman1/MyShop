-- ===========================================================================
-- Aurelia — self-healing owner setup
-- ---------------------------------------------------------------------------
-- The on_auth_user_created trigger seeds a profile + default taxonomies at
-- sign-up. But if an owner account was created BEFORE this schema existed
-- (a common order-of-operations slip), that row is missing and the app can't
-- load. This idempotent function backfills it for the calling user, so the
-- app can heal itself on first load instead of dead-ending.
-- ===========================================================================
create or replace function public.ensure_owner_setup()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.require_owner();
  v_profile public.profiles;
begin
  insert into public.profiles (id, display_name, shop_name)
  values (v_user, 'Owner', 'My Beauty Shop')
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, color) values
    (v_user, 'Lips',       '#9E1F47'),
    (v_user, 'Face',       '#C9648A'),
    (v_user, 'Eyes',       '#5B2A4A'),
    (v_user, 'Skincare',   '#1C7A58'),
    (v_user, 'Fragrance',  '#B08A4D'),
    (v_user, 'Nails',      '#A86910'),
    (v_user, 'Tools',      '#6D5F59')
  on conflict do nothing;

  insert into public.expense_categories (user_id, name, color) values
    (v_user, 'Rent',          '#9E1F47'),
    (v_user, 'Delivery',      '#2C5F8A'),
    (v_user, 'Packaging',     '#B08A4D'),
    (v_user, 'Utilities',     '#5B2A4A'),
    (v_user, 'Marketing',     '#C9648A'),
    (v_user, 'Shop supplies', '#1C7A58'),
    (v_user, 'Maintenance',   '#A86910'),
    (v_user, 'Salaries',      '#6D5F59'),
    (v_user, 'Other',         '#796C66')
  on conflict do nothing;

  select * into v_profile from public.profiles where id = v_user;
  return v_profile;
end;
$$;

-- Also backfill any EXISTING auth users that predate the schema, right now.
-- (Runs as the migration role, which can see auth.users.)
insert into public.profiles (id, display_name, shop_name)
select u.id,
       coalesce(nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''), 'Owner'),
       coalesce(nullif(btrim(u.raw_user_meta_data ->> 'shop_name'), ''), 'My Beauty Shop')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

revoke all on function public.ensure_owner_setup() from public;
grant execute on function public.ensure_owner_setup() to authenticated;
