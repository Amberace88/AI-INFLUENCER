/**
 * Generation worker. Runs on the Mac (next to ComfyUI) or on any server.
 *   npm run worker          — process jobs forever
 *   npm run worker:check    — test connections and exit
 * It claims queued jobs from Supabase, runs them on a provider, uploads the
 * results to the private "outputs" bucket and records timing/cost/errors.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import { comfyuiProvider } from "./providers/comfyui";
import { falProvider } from "./providers/fal";
import { cloudflareProvider, VISION_CALL_USD } from "./providers/cloudflare";
import { Job, PermanentError, Provider, ProviderResult, ReferenceImage } from "./types";
import { inspect, qaEnabled, type QaResult } from "./qa";

const all: Record<string, Provider> = { comfyui: comfyuiProvider, fal: falProvider, cloudflare: cloudflareProvider };
const providers = config.providers.map((n) => {
  const p = all[n];
  if (!p) throw new Error(`Unknown provider "${n}" in WORKER_PROVIDERS (use comfyui,fal,cloudflare)`);
  return p;
});

const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ts = () => new Date().toISOString().slice(11, 19);
const log = (msg: string) => console.log(`[${ts()}] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const extFor = (mime: string) => ({ "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" } as Record<string, string>)[mime] ?? "png";

async function loadReferences(job: Job): Promise<ReferenceImage[]> {
  if (!job.persona_id) return [];
  const { data, error } = await db
    .from("persona_references")
    .select("storage_path")
    .eq("persona_id", job.persona_id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(4);
  if (error) throw new Error(`load references: ${error.message}`);
  const refs: ReferenceImage[] = [];
  for (const r of data ?? []) {
    const dl = await db.storage.from("references").download(r.storage_path);
    if (dl.error) throw new Error(`download reference: ${dl.error.message}`);
    const signed = await db.storage.from("references").createSignedUrl(r.storage_path, 600);
    refs.push({
      filename: r.storage_path.split("/").pop() || "ref.png",
      mime: dl.data.type || "image/png",
      data: Buffer.from(await dl.data.arrayBuffer()),
      signedUrl: signed.data?.signedUrl ?? "",
    });
  }
  return refs;
}

async function processJob(job: Job) {
  const provider = all[job.provider];
  const started = Date.now();
  log(`▶ job ${job.id.slice(0, 8)} ${job.provider}/${job.workflow} attempt ${job.attempts}/${job.max_attempts}`);

  let lastProgressWrite = 0;
  const onProgress = (f: number) => {
    const now = Date.now();
    if (now - lastProgressWrite < 1000) return;
    lastProgressWrite = now;
    void db.from("jobs").update({ progress: Math.max(0, Math.min(1, f)) }).eq("id", job.id).then(() => {});
  };

  try {
    const references = await loadReferences(job);
    // Generate, then let the QA model inspect. Defects are regenerated at our cost (new seed),
    // up to QA_MAX_RETRIES; if every try fails the job fails and the client's credits are refunded.
    const maxTries = 1 + Math.max(0, Number(process.env.QA_MAX_RETRIES ?? 2));
    let result: ProviderResult | null = null;
    let qa: QaResult = { verdict: "skipped", reason: qaEnabled() ? "" : "QA off" };
    let extraCost = 0;
    for (let t = 1; t <= maxTries; t++) {
      const attemptJob = t === 1 ? job : { ...job, params: { ...job.params, seed: undefined } };
      const r = await provider.run(attemptJob, { references, onProgress, log: (m) => log(`  ${m}`) });
      if (!qaEnabled()) { result = r; break; }
      try {
        extraCost += VISION_CALL_USD;
        qa = await inspect(r.images[0].data);
      } catch (e) {
        qa = { verdict: "skipped", reason: `QA error: ${(e as Error).message}` };
      }
      if (qa.verdict !== "fail") { result = r; break; }
      extraCost += r.costUsd ?? 0;
      log(`  ⚠ QA rejected try ${t}/${maxTries}: ${qa.reason}`);
      if (t === maxTries) throw new PermanentError(`Quality check rejected ${maxTries} tries (${qa.reason}). Credits returned.`);
    }
    if (!result) throw new Error("no result");
    result.costUsd = (result.costUsd ?? 0) + extraCost;
    result.meta = { ...(result.meta ?? {}), qa: { verdict: qa.verdict, reason: qa.reason } };

    const assets = [];
    for (const [i, img] of result.images.entries()) {
      const path = `${job.owner_id}/${job.id}/${i}.${extFor(img.mime)}`;
      const up = await db.storage.from("outputs").upload(path, img.data, { contentType: img.mime, upsert: true });
      if (up.error) throw new Error(`upload output: ${up.error.message}`);
      assets.push({
        job_id: job.id,
        owner_id: job.owner_id,
        persona_id: job.persona_id,
        storage_path: path,
        mime: img.mime,
        width: img.width ?? null,
        height: img.height ?? null,
      });
    }
    const ins = await db.from("assets").insert(assets);
    if (ins.error) throw new Error(`insert assets: ${ins.error.message}`);

    const duration = Date.now() - started;
    const upd = await db
      .from("jobs")
      .update({
        status: "succeeded",
        progress: 1,
        finished_at: new Date().toISOString(),
        duration_ms: duration,
        provider_cost_usd: result.costUsd ?? null,
        provider_request_id: result.requestId ?? null,
        params: { ...job.params, ...(result.meta ?? {}) },
        error: null,
      })
      .eq("id", job.id);
    if (upd.error) throw new Error(`update job: ${upd.error.message}`);
    log(`✓ job ${job.id.slice(0, 8)} done in ${(duration / 1000).toFixed(1)}s, ${assets.length} image(s)` +
      (result.costUsd != null ? `, ~$${result.costUsd}` : ""));
  } catch (e) {
    const err = e as Error;
    const retry = !(err instanceof PermanentError);
    log(`✗ job ${job.id.slice(0, 8)} ${retry ? "failed (will retry if attempts remain)" : "failed permanently"}: ${err.message}`);
    const { error } = await db.rpc("finish_job_failed", { p_job_id: job.id, p_error: err.message, p_retry: retry });
    if (error) log(`  could not record failure: ${error.message}`);
  }
}

async function check() {
  log(`worker ${config.workerId}, providers: ${config.providers.join(", ")}`);
  const { error } = await db.from("jobs").select("id", { head: true, count: "exact" });
  log(error ? `✗ Supabase: ${error.message}` : `✓ Supabase reachable (${config.supabaseUrl})`);
  let ok = !error;
  for (const p of providers) {
    try { log(`✓ ${p.name}: ${await p.healthCheck()}`); }
    catch (e) { ok = false; log(`✗ ${p.name}: ${(e as Error).message}`); }
  }
  return ok;
}

/**
 * Daily spend guard: if today's provider cost (UTC day) reaches the limit, the worker stops
 * claiming paid jobs until midnight UTC. Jobs stay queued, nothing is lost or charged twice.
 * Limit: app_settings.daily_cost_limit_usd (editable by admin), DAILY_COST_LIMIT_USD overrides.
 */
let guardCheckedAt = 0;
let guardBlocked = false;
async function spendGuardBlocks(): Promise<boolean> {
  if (Date.now() - guardCheckedAt < 30_000) return guardBlocked;
  guardCheckedAt = Date.now();
  const { data, error } = await db.rpc("worker_spend_today");
  if (error) { log(`spend guard unavailable: ${error.message}`); return (guardBlocked = false); }
  const row = data as { spent_usd: number; limit_usd: number } | null;
  const limit = Number(process.env.DAILY_COST_LIMIT_USD || row?.limit_usd || 5);
  const spent = Number(row?.spent_usd ?? 0);
  const blocked = spent >= limit;
  if (blocked && !guardBlocked) log(`⛔ daily spend limit reached ($${spent.toFixed(3)} of $${limit}) — paid jobs wait until 00:00 UTC`);
  if (!blocked && guardBlocked) log(`✓ spend limit OK again ($${spent.toFixed(3)} of $${limit})`);
  return (guardBlocked = blocked);
}

let stopping = false;
process.on("SIGINT", () => { if (stopping) process.exit(1); stopping = true; log("stopping after current job… (Ctrl+C again to force)"); });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  const ok = await check();
  if (qaEnabled()) {
    try {
      const sharp = (await import("sharp")).default;
      const probe = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#999" } }).jpeg().toBuffer();
      const r = await inspect(probe);
      log(`✓ quality check on (${process.env.QA_MODEL || "Mistral Small 3.1 vision"}) — probe: ${r.verdict}`);
    } catch (e) {
      log(`✗ quality check unavailable: ${(e as Error).message} — images will not be inspected`);
    }
  } else log("! quality check off");
  if (process.argv.includes("--check")) process.exit(ok ? 0 : 1);
  await spendGuardBlocks();
  log(`waiting for jobs… (daily spend so far ${guardBlocked ? "over limit" : "under limit"})`);
  while (!stopping) {
    // paid cloud providers pause when the daily limit is hit; local ComfyUI keeps working
    const blocked = await spendGuardBlocks();
    const usable = blocked ? config.providers.filter((p) => p === "comfyui") : config.providers;
    if (!usable.length) { await sleep(config.pollMs * 5); continue; }
    const { data, error } = await db.rpc("claim_next_job", { p_worker_id: config.workerId, p_providers: usable });
    if (error) { log(`claim error: ${error.message}`); await sleep(config.pollMs * 3); continue; }
    const job = (data as Job[] | null)?.[0];
    if (!job) { await sleep(config.pollMs); continue; }
    await processJob(job);
    guardCheckedAt = 0; // re-check spend after every paid job
  }
  log("worker stopped");
}

main().catch((e) => { console.error(e); process.exit(1); });
