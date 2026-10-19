import "server-only";

/**
 * Text generation through Cloudflare Workers AI (free daily allocation,
 * then pay per token). Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
 * (token permission: "Workers AI: Read" + "Workers AI: Edit").
 */
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export class AiConfigError extends Error {}

export function textAiConfigured() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function chat(messages: Msg[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new AiConfigError("AI text is not configured: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env.local");
  const model = process.env.CF_TEXT_MODEL || DEFAULT_MODEL;
  const base = process.env.CF_API_BASE || "https://api.cloudflare.com/client/v4";

  const res = await fetch(`${base}/accounts/${account}/ai/run/${model}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messages, max_tokens: opts.maxTokens ?? 1500, temperature: opts.temperature ?? 0.8 }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const msg = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(`Cloudflare AI: ${msg}`);
  }
  const out = body?.result?.response;
  if (typeof out === "string") return out;
  if (out && typeof out === "object") return JSON.stringify(out); // some models return parsed JSON
  throw new Error("Cloudflare AI returned no text");
}

export { parseJson } from "./json";
