-- Client can report a defective frame (extra limbs, broken hands…) and get the credits back.
-- Capped per 30 days so it cannot be used as free generation.

insert into public.app_settings (key, value) values ('defect_refunds_per_30d', '20'::jsonb)
on conflict (key) do nothing;

create table if not exists public.defect_reports (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  reason text not null,
  credits_refunded integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.defect_reports enable row level security;
create policy "own reports read" on public.defect_reports for select to authenticated using (owner_id = auth.uid() or public.is_admin());

create or replace function public.report_defect(p_asset_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  a assets%rowtype;
  j jobs%rowtype;
  cap integer;
  used integer;
  refund integer := 0;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into a from assets where id = p_asset_id and owner_id = uid;
  if not found then raise exception 'asset_not_found'; end if;
  select * into j from jobs where id = a.job_id for update;

  perform pg_advisory_xact_lock(hashtext(uid::text));
  select (value)::text::integer into cap from app_settings where key = 'defect_refunds_per_30d';
  select count(*) into used from defect_reports where owner_id = uid and credits_refunded > 0 and created_at > now() - interval '30 days';

  if found and j.credits_charged > 0 and not j.credits_refunded and used < coalesce(cap, 20) then
    refund := j.credits_charged;
    insert into credit_ledger (owner_id, delta, reason, job_id) values (uid, refund, 'defect_refund', j.id);
    update jobs set credits_refunded = true where id = j.id;
  end if;

  insert into defect_reports (owner_id, asset_id, job_id, reason, credits_refunded)
  values (uid, a.id, a.job_id, left(coalesce(nullif(p_reason, ''), 'defect'), 300), refund);
  update assets set review_status = 'rejected', notes = coalesce(notes || ' · ', '') || 'Defect: ' || left(coalesce(p_reason, ''), 200) where id = a.id;
  return refund;
end $$;

revoke all on function public.report_defect(uuid, text) from public, anon;
grant execute on function public.report_defect(uuid, text) to authenticated;
