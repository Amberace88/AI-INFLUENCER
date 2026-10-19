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
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
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
