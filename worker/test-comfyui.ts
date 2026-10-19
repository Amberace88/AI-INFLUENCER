// Tests the ComfyUI adapter against a local mock that implements the same
// HTTP endpoints as ComfyUI. Run: npm run test:worker
import { createServer } from "node:http";
import assert from "node:assert/strict";
async function main() {

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let lastPrompt: Record<string, { inputs: Record<string, unknown> }> | null = null;
let uploaded = "";
const server = createServer(async (req, res) => {
  const url = new URL(req.url!, "http://x");
  const body = await new Promise<Buffer>((r) => { const c: Buffer[] = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
  const json = (o: unknown, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (url.pathname === "/system_stats") return json({ system: { comfyui_version: "mock" } });
  if (url.pathname === "/object_info/CheckpointLoaderSimple")
    return json({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [["dreamshaper_8.safetensors"]] } } } });
  if (url.pathname === "/upload/image") { uploaded = body.includes("ref.png") ? "ok" : "bad"; return json({ name: "job-ref.png", subfolder: "", type: "input" }); }
  if (url.pathname === "/prompt") {
    lastPrompt = JSON.parse(body.toString()).prompt;
    if (lastPrompt?.["1"]?.inputs?.ckpt_name === "missing.safetensors") return json({ error: "bad", node_errors: { 1: "missing" } }, 400);
    return json({ prompt_id: "p1", number: 1 });
  }
  if (url.pathname === "/history/p1")
    return json({ p1: { status: { completed: true, status_str: "success" }, outputs: { 7: { images: [{ filename: "a.png", subfolder: "", type: "output" }] } } } });
  if (url.pathname === "/view") { res.writeHead(200, { "content-type": "image/png" }); return res.end(PNG); }
  json({ error: "not found" }, 404);
});
await new Promise<void>((r) => server.listen(18188, r));

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://unused";
process.env.SUPABASE_SERVICE_ROLE_KEY = "unused";
process.env.COMFYUI_URL = "http://127.0.0.1:18188";
const { comfyuiProvider } = await import("./providers/comfyui");
const { PermanentError } = await import("./types");

const baseJob = {
  id: "00000000-0000-0000-0000-000000000001", owner_id: "u", persona_id: null, kind: "image_sd",
  provider: "comfyui" as const, prompt: "portrait of Lucía, golden hour", negative_prompt: "blurry",
  params: { width: 512, height: 768, seed: 42, steps: 20 }, attempts: 1, max_attempts: 2,
};
const ctx = { references: [], onProgress: () => {}, log: () => {} };

console.log(await comfyuiProvider.healthCheck());

// txt2img
const r = await comfyuiProvider.run({ ...baseJob, workflow: "txt2img_basic" }, ctx);
assert.equal(r.images.length, 1);
assert.equal(r.images[0].width, 1);
assert.equal(r.images[0].mime, "image/png");
assert.equal(lastPrompt!["5"].inputs.seed, 42, "seed is a number");
assert.equal(lastPrompt!["4"].inputs.height, 768);
assert.equal(lastPrompt!["2"].inputs.text, "portrait of Lucía, golden hour");
assert.equal(lastPrompt!["1"].inputs.ckpt_name, "dreamshaper_8.safetensors", "auto-picked checkpoint");
console.log("✓ txt2img_basic");

// reference workflow without references → permanent error
await assert.rejects(comfyuiProvider.run({ ...baseJob, workflow: "img2img_reference" }, ctx), PermanentError);
// with reference
const ref = { filename: "ref.png", mime: "image/png", data: PNG, signedUrl: "" };
await comfyuiProvider.run({ ...baseJob, workflow: "img2img_reference", params: { ...baseJob.params, reference_strength: 0.6 } }, { ...ctx, references: [ref] });
assert.equal(uploaded, "ok");
assert.equal(lastPrompt!["8"].inputs.image, "job-ref.png");
assert.equal(lastPrompt!["5"].inputs.denoise, 0.6);
console.log("✓ img2img_reference");

// unknown / malicious workflow names
await assert.rejects(comfyuiProvider.run({ ...baseJob, workflow: "../../etc/passwd" }, ctx), PermanentError);
await assert.rejects(comfyuiProvider.run({ ...baseJob, workflow: "nope" }, ctx), PermanentError);
console.log("✓ workflow name validation");

server.close();
console.log("✓ all worker checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
