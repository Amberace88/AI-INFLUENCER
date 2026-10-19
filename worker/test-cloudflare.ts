// Tests the Cloudflare Workers AI adapter against a local mock. Run: npm run test:worker
import { createServer } from "node:http";
import assert from "node:assert/strict";

async function main() {
  // 2x2 PNG header is enough for imageSize; reuse a 1x1 PNG
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  let lastBody: Record<string, unknown> = {};
  let lastAuth = "";
  let faceCalls = 0;
  let lastModel = "";
  let lastForm: { contentType: string; fields: string[]; prompt: string } = { contentType: "", fields: [], prompt: "" };
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    lastAuth = String(req.headers.authorization);
    const json = (o: unknown, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url?.includes("/ai/models/search")) return json({ success: true, result: [] });
    if (req.url?.endsWith("/ai/v1/chat/completions")) {
      faceCalls++;
      return json({ choices: [{ message: { content: 'Here: {"x0": 400, "y0": 100, "x1": 600, "y1": 300}' } }] });
    }
    if (req.url?.endsWith("/ai/run/@cf/black-forest-labs/flux-2-klein-9b") || req.url?.endsWith("/ai/run/@cf/black-forest-labs/flux-2-klein-4b")) {
      lastModel = String(req.url).split("/").pop() ?? "";
      const raw = Buffer.concat(chunks).toString("latin1");
      lastForm = {
        contentType: String(req.headers["content-type"]),
        fields: [...raw.matchAll(/; name="([^"]+)"/g)].map((m) => m[1]),
        prompt: (raw.match(/name="prompt"\r\n\r\n([^\r]*)/) ?? [])[1] ?? "",
      };
      return json({ success: true, result: { image: PNG } });
    }
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
  assert.equal(Math.round(estimateNeurons({ tileNeurons: 4.8, stepNeurons: 9.6 }, 1024, 1024, 4) * 10) / 10, 57.6);
  console.log("✓ cloudflare flux schnell");

  await assert.rejects(cloudflareProvider.run({ ...job, prompt: "FAIL400" }, { references: [], onProgress: () => {}, log: () => {} }), PermanentError);
  await assert.rejects(cloudflareProvider.run({ ...job, workflow: "nope" }, { references: [], onProgress: () => {}, log: () => {} }), PermanentError);
  console.log("✓ cloudflare error handling");
  // klein with references: references are shrunk below 512px and sent as multipart
  const sharp = (await import("sharp")).default;
  const big = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: "#c99272" } }).jpeg().toBuffer();
  const { shrinkReference } = await import("./providers/cloudflare");
  const small = await shrinkReference(big);
  assert.ok(small.width < 512 && small.height < 512, `ref shrunk (${small.width}x${small.height})`);
  const refs = [0, 1].map((i) => ({ filename: `r${i}.jpg`, mime: "image/jpeg", data: big, signedUrl: "" }));
  const k = await cloudflareProvider.run({ ...job, workflow: "cf_klein_ref", params: { width: 832, height: 1248, seed: 7 } }, { references: refs, onProgress: () => {}, log: () => {} });
  assert.match(lastForm.contentType, /multipart\/form-data/);
  assert.deepEqual(lastForm.fields.sort(), ["height", "input_image_0", "input_image_1", "prompt", "seed", "width"]);
  assert.match(lastForm.prompt, /^portrait of Luc\S+a\. The person/, "scene comes first");
  assert.match(lastForm.prompt, /face is shown in images 0-1/);
  assert.match(lastForm.prompt, /not from images 0-1/);
  assert.equal(faceCalls, 1, "face located once, second identical reference served from cache");
  const { faceCrop } = await import("./providers/cloudflare");
  const { parseBox } = await import("./qa");
  const crop = await sharp(await faceCrop(big)).metadata();
  assert.equal(crop.width, crop.height, "face crop is square");
  assert.ok((crop.width ?? 0) < 1200, `face crop smaller than the photo (${crop.width})`);
  assert.equal(parseBox('{"x0": 10, "y0": 10, "x1": 5, "y1": 900}'), null, "bad box rejected");
  assert.equal(parseBox("no face"), null);
  console.log("✓ reference face crop");
  assert.ok((k.costUsd ?? 0) > 0.014 && (k.costUsd ?? 1) < 0.02, `klein cost ${k.costUsd}`);
  await assert.rejects(cloudflareProvider.run({ ...job, workflow: "cf_klein_ref" }, { references: [], onProgress: () => {}, log: () => {} }), PermanentError);
  console.log("✓ cloudflare klein with references");

  // klein 4B: same request shape, tile pricing (6 output tiles + 1 input tile per reference)
  const k4 = await cloudflareProvider.run({ ...job, workflow: "cf_klein4_ref", params: { width: 832, height: 1248, seed: 7 } }, { references: refs, onProgress: () => {}, log: () => {} });
  assert.equal(lastModel, "flux-2-klein-4b");
  assert.deepEqual(lastForm.fields.sort(), ["height", "input_image_0", "input_image_1", "prompt", "seed", "width"]);
  assert.ok((k4.costUsd ?? 1) < 0.003, `4B cost ${k4.costUsd}`);
  assert.ok((k.costUsd ?? 0) / (k4.costUsd ?? 1) > 5, "4B is several times cheaper");
  console.log(`✓ cloudflare klein 4B ($${k4.costUsd} vs 9B $${k.costUsd})`);
  server.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
