import sharp from "sharp";
import { config } from "./config";

/**
 * Automatic quality check of every generated image before the client sees it.
 * Uses Cloudflare Workers AI Llama 3.2 Vision (needs Meta's licence accepted once:
 * set CF_VISION_LICENSE_ACCEPTED=1 and the worker sends "agree" on start).
 */
const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

export type QaResult = {
  verdict: "pass" | "fail" | "skipped";
  reason: string;
  people?: number;
  hands?: number;
  arms?: number;
};

export function qaEnabled() {
  return Boolean(config.cloudflare.accountId && config.cloudflare.token && process.env.CF_VISION_LICENSE_ACCEPTED === "1" && process.env.QA_DISABLED !== "1");
}

async function run(body: Record<string, unknown>) {
  const { accountId, token, apiBase } = config.cloudflare;
  const res = await fetch(`${apiBase}/accounts/${accountId}/ai/run/${MODEL}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(`QA model HTTP ${res.status}: ${JSON.stringify(json?.errors ?? json).slice(0, 200)}`);
  return json?.result?.response as string | undefined;
}

/** Sends the one-time licence acceptance (only when the owner opted in via env). */
export async function acceptVisionLicence() {
  try { await run({ prompt: "agree" }); } catch { /* already accepted or harmless */ }
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
  const raw = await run({
    messages: [{ role: "user", content: PROMPT }],
    image: `data:image/jpeg;base64,${small.toString("base64")}`,
    max_tokens: 200,
    temperature: 0,
  });
  return judge(raw ?? "");
}
