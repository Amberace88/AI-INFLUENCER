-- AI Influencer Studio — initial schema
-- Phase A/B foundation: personas, generation jobs, assets, reviews, credits.
-- All user data is protected with Row Level Security. The generation worker
-- uses the service_role key and the security-definer functions below.

-- gen_random_uuid() is built into Postgres 13+

-- ---------------------------------------------------------------------------
-- Config (kept in the DB so prices/credits are never hard-coded in the app)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('signup_bonus_credits', '30'::jsonb),
  ('job_timeout_seconds', '600'::jsonb);

create table public.plans (
  id text primary key,
  name text not null,
  price_eur_incl_vat numeric(10,2) not null,
  monthly_credits integer not null,
  active boolean not null default true,
  sort integer not null default 0
);

-- Unvalidated pricing hypotheses from the brief (see docs). Edit freely.
insert into public.plans (id, name, price_eur_incl_vat, monthly_credits, sort) values
  ('starter', 'Starter', 29.99, 150, 1),
  ('creator', 'Creator', 69.99, 400, 2),
  ('studio',  'Studio', 109.99, 750, 3);

create table public.generation_costs (
  kind text primary key,          -- e.g. image_sd, image_hd, video_5s
  label text not null,
  credits integer not null check (credits >= 0),
  active boolean not null default true
);

insert into public.generation_costs (kind, label, credits) values
  ('image_sd', 'Attēls (standarta)', 1),
  ('image_hd', 'Attēls (HD)', 3);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Personas
-- ---------------------------------------------------------------------------
create table public.personas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  tagline text,
  -- structured appearance: age_range, gender_presentation, hair, eyes, skin,
  -- build, distinctive_features, wardrobe ...
  appearance jsonb not null default '{}'::jsonb,
  personality text,
  style_notes text,
  identity_prompt text not null default '',   -- prepended to every prompt
  negative_prompt text not null default '',
  is_fictional boolean not null default true, -- consent guard for real people
  consent_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.personas (owner_id);

create table public.persona_references (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  storage_path text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.persona_references (persona_id);

-- ---------------------------------------------------------------------------
-- Benchmark runs (persona consistency protocol, brief §6)
-- ---------------------------------------------------------------------------
create table public.benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  persona_id uuid not null references public.personas(id) on delete cascade,
  name text not null,
  provider text not null,
  workflow text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  persona_id uuid references public.personas(id) on delete set null,
  benchmark_run_id uuid references public.benchmark_runs(id) on delete set null,
  scene_key text,
  kind text not null references public.generation_costs(kind),
  provider text not null check (provider in ('comfyui','fal')),
  workflow text not null,
  prompt text not null,
  negative_prompt text not null default '',
  params jsonb not null default '{}'::jsonb,   -- width, height, steps, cfg, seed, use_references
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','canceled')),
  progress real,
  attempts integer not null default 0,
  max_attempts integer not null default 2,
  error text,
  credits_charged integer not null default 0,
  credits_refunded boolean not null default false,
  provider_cost_usd numeric(10,4),
  provider_request_id text,
  worker_id text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer
);
create index on public.jobs (owner_id, queued_at desc);
create index on public.jobs (status, queued_at) where status in ('queued','running');

-- ---------------------------------------------------------------------------
-- Assets + review (accept/reject + consistency scores)
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  persona_id uuid references public.personas(id) on delete set null,
  storage_path text not null,
  mime text not null default 'image/png',
  width integer,
  height integer,
  review_status text not null default 'pending'
    check (review_status in ('pending','accepted','rejected')),
  -- 1..5 per criterion: identity, features, body, hands, realism, adherence, product, ad_suitability
  scores jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.assets (owner_id, created_at desc);
create index on public.assets (persona_id);

-- ---------------------------------------------------------------------------
-- Credits (append-only ledger)
-- ---------------------------------------------------------------------------
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,  -- signup_bonus | job_charge | job_refund | admin_grant | plan_renewal
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.credit_ledger (owner_id);

create or replace view public.credit_balances with (security_invoker = true) as
  select owner_id, coalesce(sum(delta),0)::integer as balance
  from public.credit_ledger group by owner_id;

-- ---------------------------------------------------------------------------
-- New user bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare bonus integer;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  select (value)::text::integer into bonus from public.app_settings where key = 'signup_bonus_credits';
  if coalesce(bonus,0) > 0 then
    insert into public.credit_ledger (owner_id, delta, reason) values (new.id, bonus, 'signup_bonus');
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPC: enqueue a job (charges credits atomically)
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_job(
  p_persona_id uuid,
  p_kind text,
  p_provider text,
  p_workflow text,
  p_prompt text,
  p_negative_prompt text default '',
  p_params jsonb default '{}'::jsonb,
  p_benchmark_run_id uuid default null,
  p_scene_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cost integer;
  bal integer;
  new_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if char_length(coalesce(p_prompt,'')) < 3 then raise exception 'prompt_too_short'; end if;
  if char_length(p_prompt) > 4000 then raise exception 'prompt_too_long'; end if;

  if p_persona_id is not null and not exists
    (select 1 from personas where id = p_persona_id and owner_id = uid) then
    raise exception 'persona_not_found';
  end if;

  select credits into cost from generation_costs where kind = p_kind and active;
  if cost is null then raise exception 'unknown_kind'; end if;

  -- serialize per user to avoid double-spend
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select coalesce(sum(delta),0) into bal from credit_ledger where owner_id = uid;
  if bal < cost then raise exception 'insufficient_credits'; end if;

  -- simple rate limit: max 20 open jobs per user
  if (select count(*) from jobs where owner_id = uid and status in ('queued','running')) >= 20 then
    raise exception 'too_many_open_jobs';
  end if;

  insert into jobs (owner_id, persona_id, kind, provider, workflow, prompt, negative_prompt,
                    params, credits_charged, benchmark_run_id, scene_key)
  values (uid, p_persona_id, p_kind, p_provider, p_workflow, p_prompt, coalesce(p_negative_prompt,''),
          coalesce(p_params,'{}'::jsonb), cost, p_benchmark_run_id, p_scene_key)
  returning id into new_id;

  if cost > 0 then
    insert into credit_ledger (owner_id, delta, reason, job_id) values (uid, -cost, 'job_charge', new_id);
  end if;
  return new_id;
end $$;

-- User cancels a queued job → refund
create or replace function public.cancel_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare j jobs%rowtype;
begin
  select * into j from jobs where id = p_job_id and owner_id = auth.uid() for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.status <> 'queued' then raise exception 'job_not_cancelable'; end if;
  update jobs set status = 'canceled', finished_at = now() where id = j.id;
  if j.credits_charged > 0 and not j.credits_refunded then
    insert into credit_ledger (owner_id, delta, reason, job_id) values (j.owner_id, j.credits_charged, 'job_refund', j.id);
    update jobs set credits_refunded = true where id = j.id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Worker RPCs (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.claim_next_job(p_worker_id text, p_providers text[])
returns setof public.jobs
language plpgsql security definer set search_path = public as $$
declare timeout_s integer;
begin
  -- requeue / fail jobs whose worker died
  select (value)::text::integer into timeout_s from app_settings where key = 'job_timeout_seconds';
  update jobs set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
                  error = 'worker_timeout', worker_id = null
   where status = 'running' and started_at < now() - make_interval(secs => coalesce(timeout_s,600));

  return query
  update jobs set status = 'running', attempts = attempts + 1, worker_id = p_worker_id,
                  started_at = now(), progress = 0, error = null
   where id = (
     select id from jobs
      where status = 'queued' and provider = any(p_providers)
      order by queued_at
      for update skip locked
      limit 1)
  returning *;
end $$;

create or replace function public.finish_job_failed(p_job_id uuid, p_error text, p_retry boolean)
returns void language plpgsql security definer set search_path = public as $$
declare j jobs%rowtype;
begin
  select * into j from jobs where id = p_job_id for update;
  if not found then return; end if;
  if p_retry and j.attempts < j.max_attempts then
    update jobs set status = 'queued', error = left(p_error, 2000), worker_id = null, progress = null where id = j.id;
  else
    update jobs set status = 'failed', error = left(p_error, 2000), finished_at = now(),
                    duration_ms = (extract(epoch from (now() - j.started_at)) * 1000)::integer
     where id = j.id;
    -- technical failure → no charge (brief §5)
    if j.credits_charged > 0 and not j.credits_refunded then
      insert into credit_ledger (owner_id, delta, reason, job_id) values (j.owner_id, j.credits_charged, 'job_refund', j.id);
      update jobs set credits_refunded = true where id = j.id;
    end if;
  end if;
end $$;

revoke all on function public.claim_next_job(text, text[]) from public, anon, authenticated;
revoke all on function public.finish_job_failed(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_next_job(text, text[]) to service_role;
grant execute on function public.finish_job_failed(uuid, text, boolean) to service_role;
revoke all on function public.enqueue_job(uuid,text,text,text,text,text,jsonb,uuid,text) from public, anon;
grant execute on function public.enqueue_job(uuid,text,text,text,text,text,jsonb,uuid,text) to authenticated;
revoke all on function public.cancel_job(uuid) from public, anon;
grant execute on function public.cancel_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.plans enable row level security;
alter table public.generation_costs enable row level security;
alter table public.profiles enable row level security;
alter table public.personas enable row level security;
alter table public.persona_references enable row level security;
alter table public.benchmark_runs enable row level security;
alter table public.jobs enable row level security;
alter table public.assets enable row level security;
alter table public.credit_ledger enable row level security;

create policy "read plans" on public.plans for select to authenticated, anon using (active);
create policy "read costs" on public.generation_costs for select to authenticated using (active);
create policy "admin settings" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "own profile update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- users may only change their display name, never their role
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "own personas" on public.personas for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own references" on public.persona_references for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.personas p where p.id = persona_id and p.owner_id = auth.uid()));
create policy "own benchmarks" on public.benchmark_runs for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "read own jobs" on public.jobs for select to authenticated using (owner_id = auth.uid() or public.is_admin());
-- jobs are inserted only through enqueue_job()

create policy "read own assets" on public.assets for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "review own assets" on public.assets for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete own assets" on public.assets for delete to authenticated using (owner_id = auth.uid());

create policy "read own ledger" on public.credit_ledger for select to authenticated using (owner_id = auth.uid() or public.is_admin());

-- Only review columns of assets may be changed by users
revoke update on public.assets from authenticated;
grant update (review_status, scores, notes) on public.assets to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private buckets, files live under <user_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('references', 'references', false, 10485760, array['image/png','image/jpeg','image/webp']),
  ('outputs', 'outputs', false, 52428800, array['image/png','image/jpeg','image/webp','video/mp4'])
on conflict (id) do nothing;

create policy "refs read own" on storage.objects for select to authenticated
  using (bucket_id = 'references' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "refs upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'references' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "refs delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'references' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "outputs read own" on storage.objects for select to authenticated
  using (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text);
-- outputs are written only by the worker (service_role bypasses RLS)

-- ---------------------------------------------------------------------------
-- Realtime: live job status in the UI
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.assets;

-- updated_at helper
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger personas_touch before update on public.personas for each row execute function public.touch_updated_at();
