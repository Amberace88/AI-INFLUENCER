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
import { cloudflareProvider } from "./providers/cloudflare";
import { Job, PermanentError, Provider, ProviderResult, ReferenceImage } from "./types";
import { acceptVisionLicence, inspect, qaEnabled, type QaResult } from "./qa";

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

let stopping = false;
process.on("SIGINT", () => { if (stopping) process.exit(1); stopping = true; log("stopping after current job… (Ctrl+C again to force)"); });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  if (process.env.CF_VISION_LICENSE_ACCEPTED === "1") await acceptVisionLicence();
  const ok = await check();
  log(qaEnabled() ? "✓ quality check on (Llama 3.2 Vision)" : "! quality check off: set CF_VISION_LICENSE_ACCEPTED=1 to enable");
  if (process.argv.includes("--check")) process.exit(ok ? 0 : 1);
  log("waiting for jobs…");
  while (!stopping) {
    const { data, error } = await db.rpc("claim_next_job", { p_worker_id: config.workerId, p_providers: config.providers });
    if (error) { log(`claim error: ${error.message}`); await sleep(config.pollMs * 3); continue; }
    const job = (data as Job[] | null)?.[0];
    if (!job) { await sleep(config.pollMs); continue; }
    await processJob(job);
  }
  log("worker stopped");
}

main().catch((e) => { console.error(e); process.exit(1); });
