-- ===========================================================================
-- Aurelia — first-run detection
-- ---------------------------------------------------------------------------
-- Lets the sign-in screen offer a one-time "Create your shop" step when the
-- deployment has no owner yet, so setting up never requires the Supabase
-- dashboard or a service-role key.
--
-- Returns only a boolean — it never exposes who the owner is. Once an owner
-- exists it returns true forever and the app becomes sign-in only.
-- ===========================================================================
create or replace function public.owner_exists()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles);
$$;

revoke all on function public.owner_exists() from public;
-- Callable before sign-in, so `anon` needs it too.
grant execute on function public.owner_exists() to anon, authenticated;
