-- Face-keeping generation cost + "digital twin" personas (a persona of the user themselves).

insert into public.generation_costs (kind, label, credits) values
  ('image_ref', 'Attēls ar sejas atsauci', 2)
on conflict (kind) do update set credits = excluded.credits, label = excluded.label;

-- Only paid plans may create a twin (keeps abuse traceable to a paying customer)
alter table public.plans add column if not exists allow_twin boolean not null default false;
update public.plans set allow_twin = (id <> 'free');

-- likeness: fictional (default) | self (the account holder) | consented (another real person, written consent)
alter table public.personas add column if not exists likeness text not null default 'fictional'
  check (likeness in ('fictional','self','consented'));
update public.personas set likeness = case when is_fictional then 'fictional' else 'consented' end where likeness = 'fictional' and not is_fictional;

-- Audit trail of likeness consent
create table if not exists public.likeness_consents (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  persona_id uuid not null references public.personas(id) on delete cascade,
  kind text not null check (kind in ('self','consented')),
  statement text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.likeness_consents enable row level security;
create policy "own consents read" on public.likeness_consents for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "own consents insert" on public.likeness_consents for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from public.personas p where p.id = persona_id and p.owner_id = auth.uid()));

-- Enforce: a twin needs a plan that allows it; only one twin per account
create or replace function public.enforce_twin_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare allowed boolean;
begin
  if new.likeness = 'self' and (tg_op = 'INSERT' or old.likeness is distinct from 'self') then
    select p.allow_twin into allowed from profiles pr join plans p on p.id = pr.plan_id where pr.id = new.owner_id;
    if not coalesce(allowed, false) then raise exception 'twin_needs_paid_plan'; end if;
    if exists (select 1 from personas where owner_id = new.owner_id and likeness = 'self' and id <> new.id) then
      raise exception 'twin_already_exists';
    end if;
    new.is_fictional := false;
    new.consent_confirmed := true;
  end if;
  return new;
end $$;

drop trigger if exists personas_twin on public.personas;
create trigger personas_twin before insert or update on public.personas
  for each row execute function public.enforce_twin_rules();
