import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { imageSize } from "../image-size";
import { Job, OutputImage, PermanentError, Provider, ProviderResult, RunContext } from "../types";

/**
 * ComfyUI adapter.
 * Workflows live in worker/workflows/comfyui/<name>.json in ComfyUI "API format"
 * (in ComfyUI: Workflow → Export (API)). Placeholders are substituted:
 *   "{{prompt}}" "{{negative}}" "{{seed}}" "{{width}}" "{{height}}"
 *   "{{steps}}" "{{cfg}}" "{{checkpoint}}" "{{reference_image}}" "{{reference_strength}}"
 * A string that is exactly a numeric placeholder becomes a number.
 */
const WORKFLOW_DIR = join(process.cwd(), "worker", "workflows", "comfyui");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type HistoryEntry = {
  outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>;
  status?: { status_str?: string; completed?: boolean; messages?: [string, Record<string, unknown>][] };
};

export function loadWorkflow(name: string): Record<string, unknown> {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new PermanentError(`Invalid workflow name: ${name}`);
  const file = join(WORKFLOW_DIR, `${name}.json`);
  if (!existsSync(file)) throw new PermanentError(`ComfyUI workflow not found: ${name}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

export function fillTemplate(node: unknown, vars: Record<string, string | number>): unknown {
  if (typeof node === "string") {
    const exact = node.match(/^\{\{(\w+)\}\}$/);
    if (exact && exact[1] in vars) return vars[exact[1]];
    return node.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }
  if (Array.isArray(node)) return node.map((n) => fillTemplate(n, vars));
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fillTemplate(v, vars)]));
  }
  return node;
}

async function comfyFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${config.comfy.url}${path}`, init);
  } catch (e) {
    throw new Error(`ComfyUI not reachable at ${config.comfy.url} — is the ComfyUI app running? (${(e as Error).message})`);
  }
}

export async function listCheckpoints(): Promise<string[]> {
  const res = await comfyFetch("/object_info/CheckpointLoaderSimple");
  if (!res.ok) throw new Error(`ComfyUI object_info failed: HTTP ${res.status}`);
  const info = await res.json();
  const list = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
  return Array.isArray(list) ? list : [];
}

let cachedCheckpoint: string | null = null;
async function resolveCheckpoint(log: (m: string) => void): Promise<string> {
  if (config.comfy.checkpoint) return config.comfy.checkpoint;
  if (cachedCheckpoint) return cachedCheckpoint;
  const list = await listCheckpoints();
  if (!list.length) throw new PermanentError("ComfyUI has no checkpoints installed (models/checkpoints is empty).");
  cachedCheckpoint = list[0];
  log(`COMFYUI_CHECKPOINT not set — using "${cachedCheckpoint}"`);
  return cachedCheckpoint;
}

async function uploadReference(data: Buffer, filename: string, mime: string): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(data)], { type: mime }), filename);
  form.append("overwrite", "true");
  const res = await comfyFetch("/upload/image", { method: "POST", body: form });
  if (!res.ok) throw new Error(`ComfyUI image upload failed: HTTP ${res.status}`);
  const j = await res.json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

function watchProgress(clientId: string, promptId: () => string | null, onProgress: (f: number) => void) {
  const WS = (globalThis as { WebSocket?: new (url: string) => WebSocket }).WebSocket;
  if (!WS) return () => {};
  let ws: WebSocket | null = null;
  try {
    ws = new WS(`${config.comfy.url.replace(/^http/, "ws")}/ws?clientId=${clientId}`);
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== "string") return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "progress" && msg.data?.max && (!msg.data.prompt_id || msg.data.prompt_id === promptId())) {
          onProgress(msg.data.value / msg.data.max);
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => {};
  } catch { /* progress is optional */ }
  return () => { try { ws?.close(); } catch { /* ignore */ } };
}

export const comfyuiProvider: Provider = {
  name: "comfyui",

  async healthCheck() {
    const res = await comfyFetch("/system_stats");
    if (!res.ok) throw new Error(`ComfyUI /system_stats HTTP ${res.status}`);
    const s = await res.json();
    const ckpts = await listCheckpoints();
    return `ComfyUI ${s?.system?.comfyui_version ?? "?"} at ${config.comfy.url}, ${ckpts.length} checkpoint(s)`;
  },

  async run(job: Job, ctx: RunContext): Promise<ProviderResult> {
    const p = job.params ?? {};
    const template = loadWorkflow(job.workflow);
    const needsRef = JSON.stringify(template).includes("{{reference_image}}");

    let referenceName = "";
    if (needsRef) {
      if (!ctx.references.length) throw new PermanentError("This workflow needs a persona reference image — upload one first.");
      const ref = ctx.references[0];
      referenceName = await uploadReference(ref.data, `${job.id}-${ref.filename}`, ref.mime);
    } else if (p.use_references && ctx.references.length) {
      ctx.log(`workflow "${job.workflow}" has no {{reference_image}} slot — references ignored`);
    }

    const seed = p.seed ?? Math.floor(Math.random() * 2 ** 31);
    const vars: Record<string, string | number> = {
      prompt: job.prompt,
      negative: job.negative_prompt || "",
      seed,
      width: p.width ?? 512,
      height: p.height ?? 768,
      steps: p.steps ?? 25,
      cfg: p.cfg ?? 6.5,
      checkpoint: await resolveCheckpoint(ctx.log),
      reference_image: referenceName,
      reference_strength: p.reference_strength ?? 0.8,
    };
    const workflow = fillTemplate(template, vars);

    const clientId = randomUUID();
    let promptId: string | null = null;
    const stopWatch = watchProgress(clientId, () => promptId, ctx.onProgress);

    try {
      const res = await comfyFetch("/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        const detail = JSON.stringify(body.node_errors ?? body.error ?? body).slice(0, 800);
        // invalid workflow / missing model or node → retrying won't help
        throw new PermanentError(`ComfyUI rejected workflow: ${detail}`);
      }
      promptId = body.prompt_id as string;

      const deadline = Date.now() + config.comfy.timeoutMs;
      let entry: HistoryEntry | undefined;
      while (Date.now() < deadline) {
        await sleep(1500);
        const h = await comfyFetch(`/history/${promptId}`);
        if (!h.ok) continue;
        const hist = await h.json();
        entry = hist?.[promptId];
        if (entry?.status?.completed || entry?.status?.status_str === "error") break;
      }
      if (!entry?.status?.completed) {
        if (entry?.status?.status_str === "error") {
          const err = entry.status.messages?.find(([t]) => t === "execution_error")?.[1];
          throw new Error(`ComfyUI execution error: ${JSON.stringify(err ?? entry.status).slice(0, 800)}`);
        }
        await comfyFetch("/interrupt", { method: "POST" }).catch(() => {});
        throw new Error(`ComfyUI timed out after ${Math.round(config.comfy.timeoutMs / 1000)}s`);
      }

      const images: OutputImage[] = [];
      for (const out of Object.values(entry.outputs ?? {})) {
        for (const img of out.images ?? []) {
          if (img.type !== "output") continue;
          const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
          const r = await comfyFetch(`/view?${q}`);
          if (!r.ok) throw new Error(`ComfyUI /view failed: HTTP ${r.status}`);
          const data = Buffer.from(await r.arrayBuffer());
          images.push({ data, ...imageSize(data) });
        }
      }
      if (!images.length) throw new Error("ComfyUI finished but produced no output images (is there a SaveImage node?)");
      return { images, requestId: promptId, costUsd: 0, meta: { seed, checkpoint: vars.checkpoint } };
    } finally {
      stopWatch();
    }
  },
};
