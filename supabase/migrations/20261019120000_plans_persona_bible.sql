-- Plans with persona limits, credit spending for text features,
-- persona "bible" fields, posts written in the persona's voice,
-- and the Cloudflare Workers AI provider.

-- ---------------------------------------------------------------------------
-- Plans: Starter / Pro / Business (unvalidated pricing hypotheses)
-- ---------------------------------------------------------------------------
alter table public.plans add column if not exists max_personas integer not null default 1;
alter table public.plans add column if not exists video_enabled boolean not null default true;

delete from public.plans;
insert into public.plans (id, name, price_eur_incl_vat, monthly_credits, max_personas, sort) values
  ('free',     'Free',       0.00,    0,  1, 0),
  ('starter',  'Starter',   29.99,  400,  1, 1),
  ('pro',      'Pro',       69.99, 1200,  5, 2),
  ('business', 'Business', 109.99, 1800, 10, 3);

-- top-up packs (sold later through Stripe; price per credit never below the plan's)
create table if not exists public.credit_packs (
  id text primary key,
  credits integer not null check (credits > 0),
  price_eur_incl_vat numeric(10,2) not null,
  valid_months integer not null default 12,
  active boolean not null default true
);
insert into public.credit_packs (id, credits, price_eur_incl_vat) values
  ('pack_200', 200, 14.99),
  ('pack_600', 600, 39.99)
on conflict (id) do nothing;
alter table public.credit_packs enable row level security;
create policy "read packs" on public.credit_packs for select to authenticated, anon using (active);

-- every user is on a plan; only service role / admin changes it (Stripe webhook later)
alter table public.profiles add column if not exists plan_id text not null default 'free' references public.plans(id);
alter table public.profiles add column if not exists plan_renews_at timestamptz;

-- ---------------------------------------------------------------------------
-- Persona limit per plan
-- ---------------------------------------------------------------------------
create or replace function public.enforce_persona_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer; cnt integer;
begin
  select p.max_personas into lim
    from profiles pr join plans p on p.id = pr.plan_id where pr.id = new.owner_id;
  select count(*) into cnt from personas where owner_id = new.owner_id;
  if cnt >= coalesce(lim, 1) then
    raise exception 'persona_limit_reached' using detail = format('limit %s', coalesce(lim, 1));
  end if;
  return new;
end $$;

drop trigger if exists personas_limit on public.personas;
create trigger personas_limit before insert on public.personas
  for each row execute function public.enforce_persona_limit();

-- ---------------------------------------------------------------------------
-- Credit costs for text features
-- ---------------------------------------------------------------------------
insert into public.generation_costs (kind, label, credits) values
  ('text_persona', 'AI personas izveide', 2),
  ('text_posts',   'Ieraksti personas balsī', 2),
  ('image_fast',   'Attēls (ātrais, mākonis)', 1)
on conflict (kind) do nothing;

-- Charge credits for a synchronous action (text generation). Returns ledger id.
create or replace function public.spend_credits(p_kind text, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cost integer; bal integer; lid bigint;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select credits into cost from generation_costs where kind = p_kind and active;
  if cost is null then raise exception 'unknown_kind'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select coalesce(sum(delta),0) into bal from credit_ledger where owner_id = uid;
  if bal < cost then raise exception 'insufficient_credits'; end if;
  insert into credit_ledger (owner_id, delta, reason) values (uid, -cost, coalesce('spend:' || p_kind, 'spend'))
  returning id into lid;
  return lid;
end $$;

-- Refund a spend made by the same user if the action failed technically.
create or replace function public.refund_spend(p_ledger_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare l credit_ledger%rowtype;
begin
  select * into l from credit_ledger where id = p_ledger_id and owner_id = auth.uid() and delta < 0 and reason like 'spend:%';
  if not found then raise exception 'spend_not_found'; end if;
  if exists (select 1 from credit_ledger where reason = 'refund:' || p_ledger_id) then return; end if;
  insert into credit_ledger (owner_id, delta, reason) values (l.owner_id, -l.delta, 'refund:' || p_ledger_id);
end $$;

revoke all on function public.spend_credits(text, text) from public, anon;
grant execute on function public.spend_credits(text, text) to authenticated;
revoke all on function public.refund_spend(bigint) from public, anon;
grant execute on function public.refund_spend(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Persona bible
-- ---------------------------------------------------------------------------
alter table public.personas add column if not exists role text not null default 'influencer'
  check (role in ('influencer','ambassador','blogger','representative','educator','support'));
alter table public.personas add column if not exists language text not null default 'es';
alter table public.personas add column if not exists bio text;
alter table public.personas add column if not exists backstory text;
alter table public.personas add column if not exists voice text;          -- tone, vocabulary, emoji use
alter table public.personas add column if not exists values_text text;    -- what they stand for
alter table public.personas add column if not exists topics text[] not null default '{}';
alter table public.personas add column if not exists audience text;
alter table public.personas add column if not exists dos text;
alter table public.personas add column if not exists donts text;
alter table public.personas add column if not exists locations text;      -- recurring places
alter table public.personas add column if not exists brand_name text;     -- company they represent, if any

-- ---------------------------------------------------------------------------
-- Posts written in the persona's voice
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  persona_id uuid not null references public.personas(id) on delete cascade,
  platform text not null default 'instagram',
  topic text,
  caption text not null,
  hashtags text[] not null default '{}',
  image_idea text,
  status text not null default 'draft' check (status in ('draft','approved','published','discarded')),
  asset_id uuid references public.assets(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists posts_persona_idx on public.posts (persona_id, created_at desc);
alter table public.posts enable row level security;
create policy "own posts" on public.posts for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.personas p where p.id = persona_id and p.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Cloudflare Workers AI as a generation provider
-- ---------------------------------------------------------------------------
alter table public.jobs drop constraint if exists jobs_provider_check;
alter table public.jobs add constraint jobs_provider_check check (provider in ('comfyui','fal','cloudflare'));
