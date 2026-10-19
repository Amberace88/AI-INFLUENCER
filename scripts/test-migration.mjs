// Runs the Supabase migrations against an in-memory Postgres (PGlite) with
process.on("unhandledRejection", (e) => { console.error("FAIL:", e?.message, e?.where ?? "", e?.position ?? ""); process.exit(1); });
// minimal stand-ins for Supabase's auth/storage schemas, then exercises the
// credit + job lifecycle and the RLS isolation between two users.
//   npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`);

const dir = new URL("../supabase/migrations/", import.meta.url);
for (const f of readdirSync(dir).sort()) {
  await db.exec(readFileSync(new URL(f, dir), "utf8"));
  console.log("applied", f);
}
await db.exec(`
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant select on all tables in schema public to anon;
  revoke update on public.assets from authenticated;
  grant update (review_status, scores, notes) on public.assets to authenticated;
  revoke update on public.profiles from authenticated;
  grant update (display_name) on public.profiles to authenticated;
`);

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users (id, email) values ('${A}','a@test.dev'), ('${B}','b@test.dev')`);

async function as(uid, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await db.query(sql, params); }
  finally { await db.exec(`reset role;`); }
}
async function asService(sql, params) {
  await db.exec(`set role service_role;`);
  try { return await db.query(sql, params); } finally { await db.exec(`reset role;`); }
}
const balance = async (uid) =>
  (await as(uid, `select balance from credit_balances where owner_id = $1`, [uid])).rows[0]?.balance ?? 0;

// signup bonus
assert.equal(await balance(A), 30, "signup bonus");

// persona + RLS isolation
const p = await as(A, `insert into personas (name) values ('Lucía') returning id`);
const personaId = p.rows[0].id;
assert.equal((await as(B, `select * from personas`)).rows.length, 0, "B cannot see A's persona");

// B cannot enqueue on A's persona
await assert.rejects(as(B, `select enqueue_job($1,'image_sd','comfyui','sdxl_basic','hello world')`, [personaId]), /persona_not_found/);

// A enqueues → charged
const j = await as(A, `select enqueue_job($1,'image_hd','comfyui','sdxl_basic','portrait of Lucía') as id`, [personaId]);
const jobId = j.rows[0].id;
assert.equal(await balance(A), 27, "charged 3 credits");
assert.equal((await as(B, `select * from jobs`)).rows.length, 0, "B cannot see A's jobs");

// users cannot call worker RPCs
await assert.rejects(as(A, `select * from claim_next_job('w', array['comfyui'])`), /permission denied/);

// worker claims, fails with retry → requeued, then final failure → refund
let claimed = await asService(`select * from claim_next_job('mac-1', array['comfyui'])`);
assert.equal(claimed.rows[0].id, jobId);
await asService(`select finish_job_failed($1, 'comfy offline', true)`, [jobId]);
assert.equal((await asService(`select status from jobs where id=$1`, [jobId])).rows[0].status, "queued");
claimed = await asService(`select * from claim_next_job('mac-1', array['comfyui'])`);
assert.equal(claimed.rows[0].attempts, 2);
await asService(`select finish_job_failed($1, 'comfy offline', true)`, [jobId]);
assert.equal((await asService(`select status from jobs where id=$1`, [jobId])).rows[0].status, "failed");
assert.equal(await balance(A), 30, "refunded after technical failure");
// no double refund
await asService(`select finish_job_failed($1, 'again', false)`, [jobId]);
assert.equal(await balance(A), 30, "no double refund");

// provider filter: a fal job isn't claimed by comfyui-only worker
await as(A, `select enqueue_job($1,'image_sd','fal','flux_kontext','scene two')`, [personaId]);
assert.equal((await asService(`select * from claim_next_job('mac-1', array['comfyui'])`)).rows.length, 0);

// cancel → refund
const j2 = await as(A, `select enqueue_job($1,'image_sd','comfyui','sdxl_basic','scene three') as id`, [personaId]);
const before = await balance(A);
await as(A, `select cancel_job($1)`, [j2.rows[0].id]);
assert.equal(await balance(A), before + 1, "cancel refunds");

// insufficient credits
for (let i = 0; i < 9; i++) await as(A, `select enqueue_job($1,'image_hd','comfyui','sdxl_basic','burn credits')`, [personaId]);
await assert.rejects(as(A, `select enqueue_job($1,'image_hd','comfyui','sdxl_basic','one too many')`, [personaId]), /insufficient_credits/);

// asset review: users may change review columns only
const aJob = (await asService(`select * from claim_next_job('mac-1', array['comfyui'])`)).rows[0];
const asset = await asService(
  `insert into assets (job_id, owner_id, persona_id, storage_path) values ($1,$2,$3,'x/y.png') returning id`,
  [aJob.id, A, personaId]);
await as(A, `update assets set review_status='accepted', scores='{"identity":4}' where id=$1`, [asset.rows[0].id]);
await assert.rejects(as(A, `update assets set storage_path='hack' where id=$1`, [asset.rows[0].id]), /permission denied/);
const bUpd = await as(B, `update assets set review_status='rejected' where id=$1 returning id`, [asset.rows[0].id]);
assert.equal(bUpd.rows.length, 0, "B cannot review A's asset");

// role escalation blocked
await assert.rejects(as(A, `update profiles set role='admin' where id=$1`, [A]), /permission denied/);

console.log("✓ all database checks passed");

// ---- migration 2: plans, persona limit, spend/refund, posts ----
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  revoke update on public.profiles from authenticated; grant update (display_name) on public.profiles to authenticated;`);
const C = "33333333-3333-3333-3333-333333333333";
await db.exec(`insert into auth.users (id, email) values ('${C}','c@test.dev')`);
assert.equal((await as(C, `select plan_id from profiles where id=$1`, [C])).rows[0].plan_id, "free");
await as(C, `insert into personas (name) values ('One')`);
await assert.rejects(as(C, `insert into personas (name) values ('Two')`), /persona_limit_reached/);
await asService(`update profiles set plan_id='pro' where id=$1`, [C]);
for (let i = 2; i <= 5; i++) await as(C, `insert into personas (name) values ('P${i}')`);
await assert.rejects(as(C, `insert into personas (name) values ('P6')`), /persona_limit_reached/);
// users cannot upgrade themselves
await assert.rejects(as(C, `update profiles set plan_id='business' where id=$1`, [C]), /permission denied/);
console.log("✓ persona limits per plan");

const b0 = await balance(C);
const spend = await as(C, `select spend_credits('text_persona') as id`);
assert.equal(await balance(C), b0 - 2);
await as(C, `select refund_spend($1)`, [spend.rows[0].id]);
await as(C, `select refund_spend($1)`, [spend.rows[0].id]); // idempotent
assert.equal(await balance(C), b0, "refund once");
await assert.rejects(as(B, `select refund_spend($1)`, [spend.rows[0].id]), /spend_not_found/);
console.log("✓ spend / refund credits");

const pc = (await as(C, `select id from personas limit 1`)).rows[0].id;
await as(C, `insert into posts (persona_id, caption) values ($1, 'Hola!')`, [pc]);
assert.equal((await as(B, `select * from posts`)).rows.length, 0, "B cannot see C's posts");
await assert.rejects(as(B, `insert into posts (persona_id, caption) values ($1, 'hack')`, [pc]), /row-level security/);
await as(C, `select enqueue_job($1,'image_fast','cloudflare','cf_flux_schnell','a cloud job')`, [pc]);
console.log("✓ posts RLS + cloudflare provider");
console.log("✓ migration 2 checks passed");

// ---- migration 3: admin ----
await assert.rejects(as(A, `select admin_overview()`), /not_admin/);
await asService(`update profiles set role='admin' where id=$1`, [A]);
await assert.rejects(asService(`update profiles set role='admin' where id=$1`, [B]), /duplicate key|unique/);
const ov = (await as(A, `select admin_overview() as o`)).rows[0].o;
assert.ok(ov.users >= 3 && ov.personas >= 1, "overview counts");
const users = (await as(A, `select * from admin_list_users()`)).rows;
assert.ok(users.some((u) => u.email === "b@test.dev"), "admin sees emails");
await as(A, `select admin_set_plan($1, 'business')`, [B]);
assert.equal((await asService(`select plan_id from profiles where id=$1`, [B])).rows[0].plan_id, "business");
const bb = await balance(B);
await as(A, `select admin_grant_credits($1, 100, 'pilot')`, [B]);
assert.equal(await balance(B), bb + 100);
await assert.rejects(as(B, `select admin_grant_credits($1, 100)`, [B]), /not_admin/);
await assert.rejects(as(B, `select * from admin_list_users()`), /not_admin/);
assert.ok((await as(A, `select count(*)::int c from personas`)).rows[0].c >= 6, "admin reads all personas");
console.log("✓ admin: single admin, overview, users, plans, credits");

// ---- migration 4: twin + face cost ----
const D = "44444444-4444-4444-4444-444444444444";
await db.exec(`insert into auth.users (id, email) values ('${D}','d@test.dev')`);
await assert.rejects(as(D, `insert into personas (name, likeness) values ('Me', 'self')`), /twin_needs_paid_plan/);
await asService(`update profiles set plan_id='starter' where id=$1`, [D]);
const twin = (await as(D, `insert into personas (name, likeness) values ('Me', 'self') returning id, is_fictional, consent_confirmed`)).rows[0];
assert.equal(twin.is_fictional, false);
assert.equal(twin.consent_confirmed, true);
await as(D, `insert into likeness_consents (persona_id, kind, statement) values ($1, 'self', 'These photos are of me')`, [twin.id]);
assert.equal((await as(B, `select * from likeness_consents`)).rows.length, 0, "consents private");
await asService(`update profiles set plan_id='pro' where id=$1`, [D]);
await assert.rejects(as(D, `insert into personas (name, likeness) values ('Me again', 'self')`), /twin_already_exists/);
assert.equal((await as(D, `select credits from generation_costs where kind='image_ref'`)).rows[0].credits, 2);
console.log("✓ twin: paid plan only, one per account, consent stored");

// ---- migration 5: defect reports ----
{
  const E = "55555555-5555-5555-5555-555555555555";
  await db.exec(`insert into auth.users (id, email) values ('${E}','e@test.dev')`);
  const pe = (await as(E, `insert into personas (name) values ('P') returning id`)).rows[0].id;
  const jid = (await as(E, `select enqueue_job($1,'image_ref','cloudflare','cf_klein_text','a scene') as id`, [pe])).rows[0].id;
  await asService(`update jobs set status='succeeded' where id=$1`, [jid]);
  const aid = (await asService(`insert into assets (job_id, owner_id, persona_id, storage_path) values ($1,$2,$3,'x') returning id`, [jid, E, pe])).rows[0].id;
  const before = await balance(E);
  assert.equal((await as(E, `select report_defect($1, 'four hands') as r`, [aid])).rows[0].r, 2);
  assert.equal(await balance(E), before + 2, "defect refunded");
  assert.equal((await as(E, `select report_defect($1, 'again') as r`, [aid])).rows[0].r, 0, "no double refund");
  await assert.rejects(as(B, `select report_defect($1, 'x')`, [aid]), /asset_not_found/);
  assert.equal((await as(E, `select review_status from assets where id=$1`, [aid])).rows[0].review_status, "rejected");
  console.log("✓ defect reports refund once, own assets only");
}

// ---- migration 6: economics ----
{
  await assert.rejects(as(B, `select admin_economics()`), /not_admin/);
  await assert.rejects(as(B, `select admin_set_daily_limit(100)`), /not_admin/);
  const ec = (await as(A, `select admin_economics() as e`)).rows[0].e;
  // Pro: 69.99 / 1.21 - (69.99*0.015 + 0.25) = 56.5426 / 1200 ≈ 0.0471 — the lowest net € per credit
  assert.equal(ec.credit_floor_source, "plan Pro");
  assert.ok(Math.abs(ec.credit_floor_eur - 0.0471) < 0.0002, `credit floor ${ec.credit_floor_eur}`);
  const ref = ec.actions.find((a) => a.kind === "image_ref");
  assert.ok(ref.ok && ref.multiple > 5, `image_ref margin ${ref.multiple}x`);
  assert.ok(ec.actions.every((a) => a.ok), "every action meets the 3x rule");
  await as(A, `select admin_set_daily_limit(12.5)`);
  await assert.rejects(as(A, `select admin_set_daily_limit(-1)`), /bad_limit/);
  await asService(`update jobs set status='succeeded', finished_at=now(), provider_cost_usd=0.5 where id = (select id from jobs limit 1)`);
  const sp = (await asService(`select worker_spend_today() as s`)).rows[0].s;
  assert.equal(Number(sp.limit_usd), 12.5);
  assert.ok(Number(sp.spent_usd) >= 0.5, "today's spend counted");
  await assert.rejects(as(A, `select worker_spend_today()`), /permission denied/);
  console.log("✓ economics: credit floor after VAT + fees, margin rule, daily limit");
}
