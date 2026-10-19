import assert from "node:assert/strict";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://unused";
process.env.SUPABASE_SERVICE_ROLE_KEY = "unused";
async function main() {
  const { judge } = await import("./qa");
  assert.equal(judge('{"people":1,"hands":4,"arms":4,"extra_limbs":true,"deformed_hands":false,"deformed_face":false,"reason":"two extra hands"}').verdict, "fail");
  assert.equal(judge('Sure: {"people":1,"hands":3,"arms":2,"extra_limbs":false,"deformed_hands":false,"deformed_face":false,"reason":"ok"}').verdict, "fail");
  assert.equal(judge('{"people":2,"hands":4,"arms":4,"extra_limbs":false,"deformed_hands":false,"deformed_face":false,"reason":"ok"}').verdict, "pass");
  assert.equal(judge('{"people":1,"hands":2,"arms":2,"extra_limbs":false,"deformed_hands":true,"deformed_face":false,"reason":"six fingers"}').verdict, "fail");
  assert.equal(judge("no json").verdict, "skipped");
  console.log("✓ QA verdicts");

  // request shape against a mock OpenAI-compatible endpoint
  const { createServer } = await import("node:http");
  let seen: Record<string, unknown> = {};
  let url = "";
  const server = createServer(async (req, res) => {
    const c: Buffer[] = []; for await (const x of req) c.push(x as Buffer);
    url = req.url ?? ""; seen = JSON.parse(Buffer.concat(c).toString());
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"people":1,"hands":4,"arms":4,"extra_limbs":true,"deformed_hands":false,"deformed_face":false,"reason":"two extra hands"}' } }] }));
  });
  await new Promise<void>((r) => server.listen(18799, r));
  process.env.CLOUDFLARE_ACCOUNT_ID = "acc"; process.env.CLOUDFLARE_API_TOKEN = "tok"; process.env.CF_API_BASE = "http://127.0.0.1:18799/client/v4";
  const { config } = await import("./config");
  Object.assign(config.cloudflare, { accountId: "acc", token: "tok", apiBase: "http://127.0.0.1:18799/client/v4" });
  const { inspect, qaEnabled } = await import("./qa");
  assert.ok(qaEnabled());
  const sharp = (await import("sharp")).default;
  const img = await sharp({ create: { width: 900, height: 1300, channels: 3, background: "#888" } }).jpeg().toBuffer();
  const r = await inspect(img);
  assert.equal(url, "/client/v4/accounts/acc/ai/v1/chat/completions");
  assert.equal(seen.model, "@cf/mistralai/mistral-small-3.1-24b-instruct");
  const content = (seen.messages as { content: { type: string }[] }[])[0].content;
  assert.deepEqual(content.map((p) => p.type), ["text", "image_url"]);
  assert.equal(r.verdict, "fail");
  server.close();
  console.log("✓ QA request format (OpenAI-compatible, image_url)");
}
main().catch((e) => { console.error(e); process.exit(1); });
