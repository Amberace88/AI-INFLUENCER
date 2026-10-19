// Tests the Cloudflare Workers AI adapter against a local mock. Run: npm run test:worker
import { createServer } from "node:http";
import assert from "node:assert/strict";

async function main() {
  // 2x2 PNG header is enough for imageSize; reuse a 1x1 PNG
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  let lastBody: Record<string, unknown> = {};
  let lastAuth = "";
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    lastAuth = String(req.headers.authorization);
    const json = (o: unknown, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url?.includes("/ai/models/search")) return json({ success: true, result: [] });
    if (req.url?.endsWith("/ai/run/@cf/black-forest-labs/flux-1-schnell")) {
      lastBody = JSON.parse(Buffer.concat(chunks).toString());
      if (String(lastBody.prompt).includes("FAIL400")) return json({ success: false, errors: [{ message: "bad" }] }, 400);
      return json({ success: true, result: { image: PNG } });
    }
    json({ success: false }, 404);
  });
  await new Promise<void>((r) => server.listen(18787, r));

  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://unused";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unused";
  process.env.CLOUDFLARE_ACCOUNT_ID = "acc123";
  process.env.CLOUDFLARE_API_TOKEN = "tok";
  process.env.CF_API_BASE = "http://127.0.0.1:18787/client/v4";
  const { cloudflareProvider, estimateNeurons } = await import("./providers/cloudflare");
  const { PermanentError } = await import("./types");

  console.log(await cloudflareProvider.healthCheck());
  const job = {
    id: "j1", owner_id: "u", persona_id: null, kind: "image_fast", provider: "cloudflare" as const,
    workflow: "cf_flux_schnell", prompt: "portrait of Lucía", negative_prompt: "blurry",
    params: { steps: 20, seed: 5 }, attempts: 1, max_attempts: 2,
  };
  const r = await cloudflareProvider.run(job, { references: [], onProgress: () => {}, log: () => {} });
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].mime, "image/png");
  assert.equal(lastAuth, "Bearer tok");
  assert.deepEqual(Object.keys(lastBody).sort(), ["prompt", "steps"], "only allowed fields are sent (no seed)");
  assert.equal(lastBody.steps, 8, "steps clamped to 8");
  assert.match(String(lastBody.prompt), /Avoid: blurry/);
  assert.ok((r.costUsd ?? 1) < 0.002, "cost per image is fractions of a cent");
  assert.equal(Math.round(estimateNeurons({ model: "", maxSteps: 8, tileNeurons: 4.8, stepNeurons: 9.6 }, 1024, 1024, 4) * 10) / 10, 57.6);
  console.log("✓ cloudflare flux schnell");

  await assert.rejects(cloudflareProvider.run({ ...job, prompt: "FAIL400" }, { references: [], onProgress: () => {}, log: () => {} }), PermanentError);
  await assert.rejects(cloudflareProvider.run({ ...job, workflow: "nope" }, { references: [], onProgress: () => {}, log: () => {} }), PermanentError);
  console.log("✓ cloudflare error handling");
  server.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
