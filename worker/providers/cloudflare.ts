import { createHash } from "node:crypto";
import sharp from "sharp";
import { config } from "../config";
import { Box, locateFace, qaEnabled } from "../qa";
import { imageSize } from "../image-size";
import { Job, PermanentError, Provider, ProviderResult, RunContext } from "../types";

/**
 * Cloudflare Workers AI adapter (free 10,000 neurons/day, then $0.011 per 1,000 neurons).
 *
 * cf_flux_schnell — flux-1-schnell, JSON { prompt, steps<=8 }, square output, no seed.
 *   Pricing: 4.80 neurons per 512×512 tile + 9.60 neurons per step (≈$0.0006 / image).
 * cf_klein_ref — flux-2-klein-9b, multipart form; up to 4 reference images (each < 512×512)
 *   keep the persona's face. Any size 256–1920. Pricing: $0.015 first MP, $0.002 per extra MP,
 *   $0.002 per input-image MP (≈$0.016 / image).
 */
type SchnellPreset = { kind: "schnell"; model: string; maxSteps: number; tileNeurons: number; stepNeurons: number };
type KleinPreset = { kind: "klein"; model: string; maxRefs: number; usdFirstMp: number; usdExtraMp: number; usdInputMp: number };

const PRESETS: Record<string, SchnellPreset | KleinPreset> = {
  cf_flux_schnell: { kind: "schnell", model: "@cf/black-forest-labs/flux-1-schnell", maxSteps: 8, tileNeurons: 4.8, stepNeurons: 9.6 },
  cf_klein_ref: { kind: "klein", model: "@cf/black-forest-labs/flux-2-klein-9b", maxRefs: 4, usdFirstMp: 0.015, usdExtraMp: 0.002, usdInputMp: 0.002 },
  cf_klein_text: { kind: "klein", model: "@cf/black-forest-labs/flux-2-klein-9b", maxRefs: 0, usdFirstMp: 0.015, usdExtraMp: 0.002, usdInputMp: 0.002 },
};
const USD_PER_NEURON = 0.011 / 1000;

export function estimateNeurons(p: { tileNeurons: number; stepNeurons: number }, width: number, height: number, steps: number) {
  const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  return tiles * p.tileNeurons + steps * p.stepNeurons;
}

export function estimateKleinUsd(p: KleinPreset, width: number, height: number, inputMp: number) {
  const mp = (width * height) / 1_000_000;
  return p.usdFirstMp + Math.max(0, mp - 1) * p.usdExtraMp + inputMp * p.usdInputMp;
}

/** Reference images must be smaller than 512×512 for klein. */
export async function shrinkReference(data: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const out = await sharp(data).rotate().resize(511, 511, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}

/**
 * Head-and-shoulders crop of a reference. Sending the whole photo makes FLUX.2 copy its room;
 * sending only the face keeps identity while the scene comes from the prompt.
 */
const cropCache = new Map<string, Buffer>();
export async function faceCrop(data: Buffer, log: (m: string) => void = () => {}): Promise<Buffer> {
  const key = createHash("sha1").update(data).digest("hex");
  const hit = cropCache.get(key);
  if (hit) return hit;
  const upright = await sharp(data).rotate().toBuffer();
  const { width: W = 0, height: H = 0 } = await sharp(upright).metadata();
  if (!W || !H) return data;

  let box: Box | null = null;
  if (qaEnabled()) {
    try { box = await locateFace(upright); } catch (e) { log(`face locate failed, using centre crop (${(e as Error).message.slice(0, 80)})`); }
  }
  // fallback: portraits have the head in the upper-middle
  const b = box ?? { x0: 0.32, y0: 0.06, x1: 0.68, y1: 0.36 };
  const fw = (b.x1 - b.x0) * W, fh = (b.y1 - b.y0) * H;
  const side = Math.min(W, H, Math.round(Math.max(fw, fh) * 1.9));
  const cx = ((b.x0 + b.x1) / 2) * W, cy = ((b.y0 + b.y1) / 2) * H + fh * 0.12; // a bit lower: hair + neck
  const left = Math.round(Math.min(Math.max(0, cx - side / 2), W - side));
  const top = Math.round(Math.min(Math.max(0, cy - side / 2), H - side));
  const out = await sharp(upright).extract({ left, top, width: side, height: side }).jpeg({ quality: 92 }).toBuffer();
  log(`reference face crop ${side}×${side} at ${left},${top}${box ? "" : " (centre fallback)"}`);
  if (cropCache.size > 200) cropCache.clear();
  cropCache.set(key, out);
  return out;
}

const clampSize =(v: number | undefined, d: number) => Math.min(1920, Math.max(256, Math.round((v ?? d) / 16) * 16));

async function call(model: string, init: RequestInit) {
  const { accountId, token, apiBase } = config.cloudflare;
  const res = await fetch(`${apiBase}/accounts/${accountId}/ai/run/${model}`, {
    method: "POST",
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new PermanentError("Cloudflare token rejected (needs Workers AI permission)");
  if (res.status === 400) throw new PermanentError(`Cloudflare rejected input: ${JSON.stringify(body?.errors ?? body).slice(0, 400)}`);
  if (res.status === 429) throw new Error("Cloudflare daily free limit or rate limit reached — will retry");
  if (!res.ok || body.success === false) throw new Error(`Cloudflare AI HTTP ${res.status}: ${JSON.stringify(body?.errors ?? body).slice(0, 300)}`);
  const b64 = body?.result?.image;
  if (typeof b64 !== "string" || !b64) throw new Error("Cloudflare returned no image");
  return Buffer.from(b64, "base64");
}

export const cloudflareProvider: Provider = {
  name: "cloudflare",

  async healthCheck() {
    if (!config.cloudflare.accountId || !config.cloudflare.token) throw new Error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set");
    const res = await fetch(`${config.cloudflare.apiBase}/accounts/${config.cloudflare.accountId}/ai/models/search?per_page=1`, {
      headers: { authorization: `Bearer ${config.cloudflare.token}` },
    });
    if (res.status === 401 || res.status === 403) throw new Error("Cloudflare token rejected — it needs Workers AI permission");
    if (!res.ok) throw new Error(`Cloudflare API HTTP ${res.status}`);
    return `Cloudflare Workers AI reachable, presets: ${Object.keys(PRESETS).join(", ")}`;
  },

  async run(job: Job, ctx: RunContext): Promise<ProviderResult> {
    if (!config.cloudflare.accountId || !config.cloudflare.token) throw new PermanentError("Cloudflare Workers AI is not configured on the worker");
    const preset = PRESETS[job.workflow];
    if (!preset) throw new PermanentError(`Unknown Cloudflare preset: ${job.workflow}`);
    ctx.onProgress(0.15);

    if (preset.kind === "schnell") {
      const steps = Math.min(Math.max(1, job.params?.steps ?? 4), preset.maxSteps);
      // no negative prompt input; fold the "avoid" terms into the prompt
      const prompt = (job.negative_prompt ? `${job.prompt}. Avoid: ${job.negative_prompt}` : job.prompt).slice(0, 2048);
      const data = await call(preset.model, { headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, steps }) });
      const sz = imageSize(data);
      ctx.onProgress(1);
      const neurons = estimateNeurons(preset, sz.width ?? 1024, sz.height ?? 1024, steps);
      return {
        images: [{ data, mime: sz.mime === "application/octet-stream" ? "image/jpeg" : sz.mime, width: sz.width, height: sz.height }],
        costUsd: Math.round(neurons * USD_PER_NEURON * 1e6) / 1e6,
        meta: { model: preset.model, steps, neurons: Math.round(neurons * 10) / 10, seed: null },
      };
    }

    // klein
    const width = clampSize(job.params?.width, 832);
    const height = clampSize(job.params?.height, 1248);
    const seed = job.params?.seed ?? Math.floor(Math.random() * 2 ** 31);
    const refs = preset.maxRefs ? ctx.references.slice(0, preset.maxRefs) : [];
    if (preset.maxRefs && !refs.length) throw new PermanentError("This workflow needs at least one reference photo of the persona.");

    const form = new FormData();
    let inputMp = 0;
    for (const [i, r] of refs.entries()) {
      const small = await shrinkReference(await faceCrop(r.data, ctx.log));
      inputMp += (small.width * small.height) / 1_000_000;
      form.append(`input_image_${i}`, new Blob([new Uint8Array(small.data)], { type: "image/jpeg" }), `ref${i}.jpg`);
    }
    const imgs = refs.length === 1 ? "image 0" : `images 0-${refs.length - 1}`;
    const avoid = job.negative_prompt ? ` Avoid: ${job.negative_prompt}.` : "";
    const prompt = refs.length
      ? `${job.prompt}. ` +
        `The person in this photo is the person whose face is shown in ${imgs} (a close-up face crop). ` +
        `Keep exactly that identity: same face, facial features, skin tone, hair and distinctive marks. ` +
        `Build the whole background, location, clothing, pose, framing and lighting from the scene description above, not from ${imgs}.${avoid}`
      : `${job.prompt}.${avoid}`;
    form.append("prompt", prompt.slice(0, 2048));
    form.append("width", String(width));
    form.append("height", String(height));
    form.append("seed", String(seed));
    ctx.onProgress(0.35);

    const data = await call(preset.model, { body: form });
    const sz = imageSize(data);
    ctx.onProgress(1);
    return {
      images: [{ data, mime: sz.mime === "application/octet-stream" ? "image/jpeg" : sz.mime, width: sz.width ?? width, height: sz.height ?? height }],
      costUsd: Math.round(estimateKleinUsd(preset, width, height, inputMp) * 1e5) / 1e5,
      meta: { model: preset.model, seed, references: refs.length },
    };
  },
};
