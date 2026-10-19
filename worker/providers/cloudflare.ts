import { config } from "../config";
import { imageSize } from "../image-size";
import { Job, PermanentError, Provider, ProviderResult, RunContext } from "../types";

/**
 * Cloudflare Workers AI adapter (free 10,000 neurons/day, then $0.011 per 1,000 neurons).
 * flux-1-schnell accepts only { prompt, steps<=8 } — no seed, no size (square output).
 * Pricing per Cloudflare docs: 4.80 neurons per 512×512 tile + 9.60 neurons per step.
 */
type Preset = { model: string; maxSteps: number; tileNeurons: number; stepNeurons: number };

const PRESETS: Record<string, Preset> = {
  cf_flux_schnell: { model: "@cf/black-forest-labs/flux-1-schnell", maxSteps: 8, tileNeurons: 4.8, stepNeurons: 9.6 },
};
const USD_PER_NEURON = 0.011 / 1000;

export function estimateNeurons(p: Preset, width: number, height: number, steps: number) {
  const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  return tiles * p.tileNeurons + steps * p.stepNeurons;
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
    const { accountId, token, apiBase } = config.cloudflare;
    if (!accountId || !token) throw new PermanentError("Cloudflare Workers AI is not configured on the worker");
    const preset = PRESETS[job.workflow];
    if (!preset) throw new PermanentError(`Unknown Cloudflare preset: ${job.workflow}`);

    const steps = Math.min(Math.max(1, job.params?.steps ?? 4), preset.maxSteps);
    // the model has no negative prompt input; fold the most important "avoid" terms into the prompt
    const prompt = (job.negative_prompt ? `${job.prompt}. Avoid: ${job.negative_prompt}` : job.prompt).slice(0, 2048);
    ctx.onProgress(0.2);

    const res = await fetch(`${apiBase}/accounts/${accountId}/ai/run/${preset.model}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt, steps }),
      signal: AbortSignal.timeout(120_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new PermanentError("Cloudflare token rejected (needs Workers AI permission)");
    if (res.status === 400) throw new PermanentError(`Cloudflare rejected input: ${JSON.stringify(body?.errors ?? body).slice(0, 400)}`);
    if (res.status === 429) throw new Error("Cloudflare daily free limit or rate limit reached — will retry");
    if (!res.ok || body.success === false) throw new Error(`Cloudflare AI HTTP ${res.status}: ${JSON.stringify(body?.errors ?? body).slice(0, 300)}`);

    const b64 = body?.result?.image;
    if (typeof b64 !== "string" || !b64) throw new Error("Cloudflare returned no image");
    const data = Buffer.from(b64, "base64");
    const sz = imageSize(data);
    ctx.onProgress(1);

    const neurons = estimateNeurons(preset, sz.width ?? 1024, sz.height ?? 1024, steps);
    return {
      images: [{ data, mime: sz.mime === "application/octet-stream" ? "image/jpeg" : sz.mime, width: sz.width, height: sz.height }],
      costUsd: Math.round(neurons * USD_PER_NEURON * 1e6) / 1e6,
      meta: { model: preset.model, steps, neurons: Math.round(neurons * 10) / 10, seed: null },
    };
  },
};
