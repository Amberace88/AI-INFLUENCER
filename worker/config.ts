import { readFileSync, existsSync } from "node:fs";
import { hostname } from "node:os";

// Minimal .env loader so the worker runs with `npm run worker` and no extra deps.
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} — see .env.example`);
  return v;
}

export const config = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  workerId: process.env.WORKER_ID || `worker-${hostname()}`,
  providers: (process.env.WORKER_PROVIDERS || "comfyui")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  pollMs: Number(process.env.WORKER_POLL_MS || 2000),
  comfy: {
    // ComfyUI Desktop default is 8000; portable/manual installs often use 8188.
    url: (process.env.COMFYUI_URL || "http://127.0.0.1:8000").replace(/\/$/, ""),
    checkpoint: process.env.COMFYUI_CHECKPOINT || "", // empty → first checkpoint ComfyUI reports
    timeoutMs: Number(process.env.COMFYUI_TIMEOUT_MS || 10 * 60 * 1000),
  },
  fal: {
    key: process.env.FAL_KEY || "",
    timeoutMs: Number(process.env.FAL_TIMEOUT_MS || 5 * 60 * 1000),
  },
};
