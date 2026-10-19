-- Billing: monthly plan credits (use-it-or-lose-it, like Claude's limits), purchased packs that
-- never expire with the month, Stripe subscription state and an idempotent webhook log.
--
-- Ledger reasons used here:
--   plan_credits:<plan>  monthly allowance granted at the start of a period
--   plan_expire          unused allowance removed when the next period starts
--   pack:<pack_id>       purchased top-up credits (kept until used)
-- Spending always uses this month's plan credits first, then extra credits.

alter table public.profiles add column if not exists plan_status text not null default 'none'
  check (plan_status in ('none','manual','active','past_due','canceled'));
alter table public.profiles add column if not exists plan_period_start timestamptz;
alter table public.profiles add column if not exists stripe_customer_id text unique;
alter table public.profiles add column if not exists stripe_subscription_id text unique;

alter table public.plans add column if not exists stripe_price_id text;

create table if not exists public.billing_events (
  id text primary key,            -- Stripe event id; makes every webhook idempotent
  type text not null,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
create policy "admin reads billing events" on public.billing_events for select to authenticated using (public.is_admin());

-- How many of the current period's plan credits are still unused (and still in the balance).
create or replace function public.plan_unused(p_user uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare g record; used integer; bal integer;
begin
  select id, delta into g from credit_ledger
   where owner_id = p_user and reason like 'plan_credits:%' order by id desc limit 1;
  if not found then return 0; end if;
  if exists (select 1 from credit_ledger where owner_id = p_user and reason = 'plan_expire' and id > g.id) then return 0; end if;
  select coalesce(-sum(delta), 0) into used from credit_ledger
   where owner_id = p_user and id > g.id
     and (reason in ('job_charge', 'job_refund', 'defect_refund') or reason like 'spend:%' or reason like 'refund:%');
  select coalesce(sum(delta), 0) into bal from credit_ledger where owner_id = p_user;
  return greatest(0, least(g.delta - used, bal));
end $$;

-- Start a (new) plan period: expire last period's unused allowance, grant the new one.
create or replace function public.start_plan_period(p_user uuid, p_plan text, p_status text, p_renews_at timestamptz default null)
returns integer language plpgsql security definer set search_path = public as $$
declare unused integer; grant_c integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select monthly_credits into grant_c from plans where id = p_plan;
  if not found then raise exception 'unknown_plan'; end if;
  unused := plan_unused(p_user);
  if unused > 0 then
    insert into credit_ledger (owner_id, delta, reason) values (p_user, -unused, 'plan_expire');
  end if;
  update profiles set
    plan_id = p_plan,
    plan_status = case when p_plan = 'free' then 'none' else p_status end,
    plan_period_start = case when p_plan = 'free' then null else now() end,
    plan_renews_at = case when p_plan = 'free' then null else coalesce(p_renews_at, now() + interval '1 month') end
  where id = p_user;
  if grant_c > 0 then
    insert into credit_ledger (owner_id, delta, reason) values (p_user, grant_c, 'plan_credits:' || p_plan);
  end if;
  return grant_c;
end $$;
revoke all on function public.plan_unused(uuid) from public, anon, authenticated;
revoke all on function public.start_plan_period(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.plan_unused(uuid), public.start_plan_period(uuid, text, text, timestamptz) to service_role;

-- Admin plan switch now starts a real period with the plan's credits ("manual" = no card, renews monthly).
create or replace function public.admin_set_plan(p_user uuid, p_plan text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if not exists (select 1 from plans where id = p_plan) then raise exception 'unknown_plan'; end if;
  perform start_plan_period(p_user, p_plan, 'manual');
end $$;

-- Manual (admin-given) plans renew themselves; Stripe plans renew from the invoice webhook.
create or replace function public.renew_due_plans()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id, plan_id from profiles where plan_status = 'manual' and plan_renews_at <= now() loop
    perform start_plan_period(r.id, r.plan_id, 'manual');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.renew_due_plans() from public, anon, authenticated;
grant execute on function public.renew_due_plans() to service_role;

-- Client: own billing summary
create or replace function public.my_billing()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); p record; bal integer; left_plan integer;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select pr.plan_id, pr.plan_status, pr.plan_renews_at, pr.plan_period_start, pr.stripe_subscription_id is not null as has_sub,
         pl.name, pl.monthly_credits, pl.max_personas, pl.price_eur_incl_vat
    into p from profiles pr join plans pl on pl.id = pr.plan_id where pr.id = uid;
  select coalesce(sum(delta), 0) into bal from credit_ledger where owner_id = uid;
  left_plan := plan_unused(uid);
  return jsonb_build_object(
    'plan_id', p.plan_id, 'plan_name', p.name, 'status', p.plan_status, 'renews_at', p.plan_renews_at,
    'period_start', p.plan_period_start, 'has_subscription', p.has_sub,
    'monthly_credits', p.monthly_credits, 'max_personas', p.max_personas, 'price_eur', p.price_eur_incl_vat,
    'balance', bal, 'plan_left', left_plan, 'extra', greatest(0, bal - left_plan)
  );
end $$;
revoke all on function public.my_billing() from public, anon;
grant execute on function public.my_billing() to authenticated;

-- ---------------------------------------------------------------------------
-- Stripe webhook handlers (service role only). Each takes the Stripe event id and
-- returns false when that event was already processed.
-- ---------------------------------------------------------------------------
create or replace function public.billing_event_once(p_event text, p_type text, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into billing_events (id, type, owner_id) values (p_event, p_type, p_user) on conflict (id) do nothing;
  return found;
end $$;

-- new subscription, renewal, or plan change on an existing subscription
create or replace function public.billing_subscription_period(
  p_event text, p_user uuid, p_plan text, p_customer text, p_subscription text, p_period_end timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not billing_event_once(p_event, 'subscription_period', p_user) then return false; end if;
  update profiles set stripe_customer_id = coalesce(p_customer, stripe_customer_id),
                      stripe_subscription_id = p_subscription where id = p_user;
  perform start_plan_period(p_user, p_plan, 'active', p_period_end);
  return true;
end $$;

create or replace function public.billing_subscription_status(p_event text, p_subscription text, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from profiles where stripe_subscription_id = p_subscription;
  if uid is null then return false; end if;
  if not billing_event_once(p_event, 'subscription_status:' || p_status, uid) then return false; end if;
  if p_status in ('canceled', 'unpaid', 'incomplete_expired') then
    update profiles set stripe_subscription_id = null where id = uid;
    perform start_plan_period(uid, 'free', 'none');
  elsif p_status = 'past_due' then
    update profiles set plan_status = 'past_due' where id = uid;
  elsif p_status = 'active' then
    update profiles set plan_status = 'active' where id = uid and plan_status = 'past_due';
  end if;
  return true;
end $$;

create or replace function public.billing_pack_paid(p_event text, p_user uuid, p_pack text, p_customer text)
returns boolean language plpgsql security definer set search_path = public as $$
declare c integer;
begin
  select credits into c from credit_packs where id = p_pack;
  if not found then raise exception 'unknown_pack'; end if;
  if not billing_event_once(p_event, 'pack:' || p_pack, p_user) then return false; end if;
  update profiles set stripe_customer_id = coalesce(stripe_customer_id, p_customer) where id = p_user;
  insert into credit_ledger (owner_id, delta, reason) values (p_user, c, 'pack:' || p_pack);
  return true;
end $$;

create or replace function public.billing_set_customer(p_user uuid, p_customer text)
returns void language sql security definer set search_path = public as $$
  update profiles set stripe_customer_id = p_customer where id = p_user and stripe_customer_id is null;
$$;

revoke all on function public.billing_event_once(text, text, uuid) from public, anon, authenticated;
revoke all on function public.billing_subscription_period(text, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_subscription_status(text, text, text) from public, anon, authenticated;
revoke all on function public.billing_pack_paid(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.billing_set_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_event_once(text, text, uuid), public.billing_subscription_period(text, uuid, text, text, text, timestamptz),
  public.billing_subscription_status(text, text, text), public.billing_pack_paid(text, uuid, text, text),
  public.billing_set_customer(uuid, text) to service_role;

-- clients must not change their own plan or Stripe ids
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
