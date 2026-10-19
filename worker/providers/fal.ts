import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config";
import { imageSize } from "../image-size";
import { fillTemplate } from "./comfyui";
import { Job, OutputImage, PermanentError, Provider, ProviderResult, RunContext } from "../types";

/**
 * fal.ai adapter (paid cloud API, needs FAL_KEY).
 * Uses fal's queue API: submit → poll status_url → fetch response_url.
 * Presets live in worker/workflows/fal.json.
 */
type Preset = {
  model: string;
  needs_reference: boolean;
  usd_per_megapixel: number | null;
  input: Record<string, unknown>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadPresets(): Record<string, Preset> {
  return JSON.parse(readFileSync(join(process.cwd(), "worker", "workflows", "fal.json"), "utf8"));
}

async function falFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Key ${config.fal.key}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  if (res.status === 401 || res.status === 403) throw new PermanentError(`fal.ai auth failed (check FAL_KEY): ${text.slice(0, 300)}`);
  if (res.status === 422 || res.status === 400) throw new PermanentError(`fal.ai rejected input: ${text.slice(0, 600)}`);
  if (!res.ok) throw new Error(`fal.ai HTTP ${res.status}: ${text.slice(0, 300)}`);
  return body;
}

export const falProvider: Provider = {
  name: "fal",

  async healthCheck() {
    if (!config.fal.key) throw new Error("FAL_KEY not set");
    return `fal.ai key present, presets: ${Object.keys(loadPresets()).filter((k) => !k.startsWith("_")).join(", ")}`;
  },

  async run(job: Job, ctx: RunContext): Promise<ProviderResult> {
    if (!config.fal.key) throw new PermanentError("FAL_KEY is not configured on the worker");
    const preset = loadPresets()[job.workflow];
    if (!preset || job.workflow.startsWith("_")) throw new PermanentError(`Unknown fal preset: ${job.workflow}`);
    if (preset.needs_reference && !ctx.references.length) {
      throw new PermanentError("This preset needs a persona reference image — upload one first.");
    }

    const p = job.params ?? {};
    const seed = p.seed ?? Math.floor(Math.random() * 2 ** 31);
    const width = p.width ?? 768;
    const height = p.height ?? 1152;
    const input = fillTemplate(preset.input, {
      prompt: job.prompt,
      negative: job.negative_prompt || "",
      seed,
      width,
      height,
      steps: p.steps ?? 28,
      cfg: p.cfg ?? 3.5,
      reference_url: ctx.references[0]?.signedUrl ?? "",
    });

    const submit = await falFetch(`https://queue.fal.run/${preset.model}`, { method: "POST", body: JSON.stringify(input) });
    const requestId = String(submit.request_id ?? "");
    const statusUrl = String(submit.status_url ?? "");
    const responseUrl = String(submit.response_url ?? "");
    if (!statusUrl || !responseUrl) throw new Error(`fal.ai unexpected submit response: ${JSON.stringify(submit).slice(0, 300)}`);
    ctx.log(`fal request ${requestId} (${preset.model})`);

    const deadline = Date.now() + config.fal.timeoutMs;
    let status = "";
    while (Date.now() < deadline) {
      await sleep(1500);
      const s = await falFetch(statusUrl);
      status = String(s.status ?? "");
      if (status === "IN_PROGRESS") ctx.onProgress(0.5);
      if (status === "COMPLETED") break;
    }
    if (status !== "COMPLETED") throw new Error(`fal.ai timed out (last status: ${status || "unknown"})`);

    const result = await falFetch(responseUrl);
    const list = (result.images as { url: string; width?: number; height?: number; content_type?: string }[]) ?? [];
    if (!list.length) throw new Error(`fal.ai returned no images: ${JSON.stringify(result).slice(0, 300)}`);

    const images: OutputImage[] = [];
    for (const img of list) {
      const r = await fetch(img.url);
      if (!r.ok) throw new Error(`Download of fal result failed: HTTP ${r.status}`);
      const data = Buffer.from(await r.arrayBuffer());
      const sz = imageSize(data);
      images.push({ data, mime: img.content_type || sz.mime, width: img.width ?? sz.width, height: img.height ?? sz.height });
    }

    const mp = images.reduce((s, i) => s + ((i.width ?? width) * (i.height ?? height)) / 1_000_000, 0);
    const costUsd = preset.usd_per_megapixel != null ? Math.round(mp * preset.usd_per_megapixel * 10000) / 10000 : undefined;
    return { images, requestId, costUsd, meta: { seed, model: preset.model } };
  },
};
