-- Unit economics: what each action really costs us, what a credit is worth to us after VAT
-- and card fees, the margin per action, and a daily spend limit the worker obeys.

insert into public.app_settings (key, value) values
  ('daily_cost_limit_usd', '5'::jsonb),   -- worker pauses paid providers above this per UTC day
  ('min_margin_multiple', '3'::jsonb),    -- every action must earn at least 3x its real cost
  ('vat_rate', '0.21'::jsonb),            -- Spanish IVA; plan prices include it
  ('card_fee_pct', '0.015'::jsonb),       -- Stripe EU cards
  ('card_fee_fixed_eur', '0.25'::jsonb),
  ('eur_per_usd', '0.86'::jsonb)          -- update when the rate moves
on conflict (key) do nothing;

-- our estimated provider cost per action (USD), incl. one quality check where it runs
alter table public.generation_costs add column if not exists usd_estimate numeric(10,4) not null default 0;
update public.generation_costs set usd_estimate = v.usd from (values
  ('image_fast',   0.0011),  -- FLUX.1 schnell + QA
  ('image_ref',    0.0170),  -- FLUX.2 klein 9B + QA (4B would be ~0.0025)
  ('text_persona', 0.0040),  -- Llama 3.3 70B
  ('text_posts',   0.0060),
  ('image_sd',     0.0000),  -- local ComfyUI
  ('image_hd',     0.0000)
) as v(kind, usd) where generation_costs.kind = v.kind;

-- worker only (service role): today's spend and the limit
create or replace function public.worker_spend_today()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'spent_usd', coalesce((select sum(provider_cost_usd) from jobs
                            where finished_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'), 0),
    'limit_usd', coalesce((select (value)::text::numeric from app_settings where key = 'daily_cost_limit_usd'), 5)
  );
$$;
revoke all on function public.worker_spend_today() from public, anon, authenticated;
grant execute on function public.worker_spend_today() to service_role;

-- admin: credit value floor, margin per action, today's and 30-day money picture
create or replace function public.admin_economics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  vat numeric; fee_pct numeric; fee_fix numeric; fx numeric; min_mult numeric; lim numeric;
  floor_eur numeric; floor_src text; r jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select (value)::text::numeric into vat     from app_settings where key = 'vat_rate';
  select (value)::text::numeric into fee_pct from app_settings where key = 'card_fee_pct';
  select (value)::text::numeric into fee_fix from app_settings where key = 'card_fee_fixed_eur';
  select (value)::text::numeric into fx      from app_settings where key = 'eur_per_usd';
  select (value)::text::numeric into min_mult from app_settings where key = 'min_margin_multiple';
  select (value)::text::numeric into lim     from app_settings where key = 'daily_cost_limit_usd';

  -- cheapest net euro we ever receive per credit (plans and packs), after VAT and card fees
  select src, eur into floor_src, floor_eur from (
    select 'plan ' || name as src, (price_eur_incl_vat / (1 + vat) - (price_eur_incl_vat * fee_pct + fee_fix)) / monthly_credits as eur
      from plans where monthly_credits > 0 and price_eur_incl_vat > 0
    union all
    select 'pack ' || id, (price_eur_incl_vat / (1 + vat) - (price_eur_incl_vat * fee_pct + fee_fix)) / credits
      from credit_packs where active
  ) x order by eur asc limit 1;

  select jsonb_build_object(
    'credit_floor_eur', round(floor_eur, 4),
    'credit_floor_source', floor_src,
    'eur_per_usd', fx,
    'min_margin_multiple', min_mult,
    'daily_limit_usd', lim,
    'actions', (select coalesce(jsonb_agg(a order by a->>'kind'), '[]'::jsonb) from (
      select jsonb_build_object(
        'kind', g.kind, 'label', g.label, 'credits', g.credits,
        'usd_estimate', g.usd_estimate,
        'usd_actual_30d', (select round(avg(j.provider_cost_usd), 4) from jobs j
                            where j.kind = g.kind and j.status = 'succeeded' and j.provider_cost_usd is not null
                              and j.finished_at > now() - interval '30 days'),
        'revenue_eur', round(g.credits * floor_eur, 4),
        'multiple', case when g.usd_estimate > 0 then round(g.credits * floor_eur / (g.usd_estimate * fx), 1) end,
        'ok', g.usd_estimate = 0 or g.credits * floor_eur >= g.usd_estimate * fx * min_mult
      ) as a from generation_costs g where g.active
    ) t),
    'today', jsonb_build_object(
      'cost_usd', (select coalesce(sum(provider_cost_usd), 0) from jobs
                    where finished_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
      'credits_spent', (select coalesce(-sum(delta), 0) from credit_ledger
                         where delta < 0 and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
      'jobs', (select count(*) from jobs where finished_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
      'waiting', (select count(*) from jobs where status = 'queued')
    ),
    'last_30d', jsonb_build_object(
      'cost_usd', (select coalesce(sum(provider_cost_usd), 0) from jobs where finished_at > now() - interval '30 days'),
      'credits_spent', (select coalesce(-sum(delta), 0) from credit_ledger where delta < 0 and created_at > now() - interval '30 days')
    )
  ) into r;
  return r;
end $$;
revoke all on function public.admin_economics() from public, anon;
grant execute on function public.admin_economics() to authenticated;

-- admin can change the daily limit from the panel
create or replace function public.admin_set_daily_limit(p_usd numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_usd is null or p_usd < 0 or p_usd > 1000 then raise exception 'bad_limit'; end if;
  insert into app_settings (key, value, updated_at) values ('daily_cost_limit_usd', to_jsonb(p_usd), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;
revoke all on function public.admin_set_daily_limit(numeric) from public, anon;
grant execute on function public.admin_set_daily_limit(numeric) to authenticated;
