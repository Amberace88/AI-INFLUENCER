import sharp from "sharp";
import { config } from "./config";

/**
 * Automatic quality check of every generated image before the client sees it.
 * Default: Mistral Small 3.1 (Apache 2.0, vision) on Cloudflare Workers AI through the
 * OpenAI-compatible endpoint. NOTE: Llama 3.2 Vision is NOT used — its licence grants no
 * rights for multimodal models to individuals/companies based in the EU.
 */
const MODEL = process.env.QA_MODEL || "@cf/mistralai/mistral-small-3.1-24b-instruct";

export type QaResult = {
  verdict: "pass" | "fail" | "skipped";
  reason: string;
  people?: number;
  hands?: number;
  arms?: number;
};

export function qaEnabled() {
  return Boolean(config.cloudflare.accountId && config.cloudflare.token && process.env.QA_DISABLED !== "1");
}

async function ask(prompt: string, imageDataUri: string) {
  const { accountId, token, apiBase } = config.cloudflare;
  const res = await fetch(`${apiBase}/accounts/${accountId}/ai/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 220,
      temperature: 0,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageDataUri } }] }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`QA model HTTP ${res.status}: ${JSON.stringify(json?.errors ?? json?.error ?? json).slice(0, 200)}`);
  return (json?.choices?.[0]?.message?.content as string | undefined) ?? "";
}

const PROMPT = `You are a strict quality inspector for AI-generated advertising photos.
Look carefully at the image and count what you actually see.
Reply with ONE JSON object only:
{"people": <number of people>, "hands": <number of visible hands>, "arms": <number of visible arms>,
 "extra_limbs": <true if any person has more than two arms or hands, or a hand/arm with no body>,
 "deformed_hands": <true if any hand has wrong finger count, fused or melted fingers>,
 "deformed_face": <true if a face is distorted, has extra eyes, or is badly asymmetric>,
 "reason": "<short description of the most serious defect, or 'ok'>"}`;

export function judge(raw: string): QaResult {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { verdict: "skipped", reason: "QA reply was not JSON" };
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]); } catch { return { verdict: "skipped", reason: "QA reply was not valid JSON" }; }
  const people = Number(j.people ?? 0);
  const hands = Number(j.hands ?? 0);
  const arms = Number(j.arms ?? 0);
  const maxLimbs = Math.max(1, people) * 2;
  const problems: string[] = [];
  if (j.extra_limbs === true) problems.push("extra arms or hands");
  if (hands > maxLimbs) problems.push(`${hands} hands for ${people || 1} person(s)`);
  if (arms > maxLimbs) problems.push(`${arms} arms for ${people || 1} person(s)`);
  if (j.deformed_hands === true) problems.push("deformed hands");
  if (j.deformed_face === true) problems.push("deformed face");
  return problems.length
    ? { verdict: "fail", reason: problems.join(", ") + (typeof j.reason === "string" && j.reason !== "ok" ? ` (${String(j.reason).slice(0, 120)})` : ""), people, hands, arms }
    : { verdict: "pass", reason: "ok", people, hands, arms };
}

export async function inspect(image: Buffer): Promise<QaResult> {
  const small = await sharp(image).resize(768, 768, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  const raw = await ask(PROMPT, `data:image/jpeg;base64,${small.toString("base64")}`);
  return judge(raw);
}
