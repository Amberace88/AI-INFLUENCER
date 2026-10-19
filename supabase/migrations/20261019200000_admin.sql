-- Single admin account + admin functions.
-- The admin uses the app like any client (own personas, own plan) and
-- additionally sees the admin panel. Only one admin can exist.

create unique index if not exists profiles_single_admin on public.profiles ((true)) where role = 'admin';

-- Overview numbers for the admin dashboard
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select jsonb_build_object(
    'users', (select count(*) from profiles),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'by_plan', (select coalesce(jsonb_object_agg(plan_id, n), '{}'::jsonb) from (select plan_id, count(*) n from profiles group by plan_id) x),
    'personas', (select count(*) from personas),
    'posts', (select count(*) from posts),
    'jobs_30d', (select count(*) from jobs where queued_at > now() - interval '30 days'),
    'jobs_failed_30d', (select count(*) from jobs where status = 'failed' and queued_at > now() - interval '30 days'),
    'jobs_open', (select count(*) from jobs where status in ('queued','running')),
    'assets', (select count(*) from assets),
    'assets_accepted', (select count(*) from assets where review_status = 'accepted'),
    'cost_usd_30d', (select coalesce(sum(provider_cost_usd), 0) from jobs where queued_at > now() - interval '30 days'),
    'credits_spent_30d', (select coalesce(-sum(delta), 0) from credit_ledger where delta < 0 and created_at > now() - interval '30 days'),
    'mrr_eur_incl_vat', (select coalesce(sum(p.price_eur_incl_vat), 0) from profiles pr join plans p on p.id = pr.plan_id where pr.role <> 'admin')
  ) into r;
  return r;
end $$;

-- User list with email, plan, balance and activity
create or replace function public.admin_list_users()
returns table (
  id uuid, email text, display_name text, role text, plan_id text, balance integer,
  personas bigint, jobs_30d bigint, created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return query
    select pr.id, u.email::text, pr.display_name, pr.role, pr.plan_id,
           coalesce((select sum(l.delta) from credit_ledger l where l.owner_id = pr.id), 0)::integer,
           (select count(*) from personas pe where pe.owner_id = pr.id),
           (select count(*) from jobs j where j.owner_id = pr.id and j.queued_at > now() - interval '30 days'),
           u.created_at, u.last_sign_in_at
      from profiles pr join auth.users u on u.id = pr.id
     order by u.created_at desc;
end $$;

create or replace function public.admin_set_plan(p_user uuid, p_plan text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if not exists (select 1 from plans where id = p_plan) then raise exception 'unknown_plan'; end if;
  update profiles set plan_id = p_plan where id = p_user;
end $$;

create or replace function public.admin_grant_credits(p_user uuid, p_amount integer, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_amount = 0 or abs(p_amount) > 100000 then raise exception 'invalid_amount'; end if;
  insert into credit_ledger (owner_id, delta, reason) values (p_user, p_amount, 'admin_grant' || coalesce(': ' || left(p_note, 120), ''));
end $$;

revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_plan(uuid, text) from public, anon;
revoke all on function public.admin_grant_credits(uuid, integer, text) from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_plan(uuid, text) to authenticated;
grant execute on function public.admin_grant_credits(uuid, integer, text) to authenticated;

-- Admin can read every job, asset and persona for support (already true for jobs/assets)
create policy "admin reads personas" on public.personas for select to authenticated using (public.is_admin());
