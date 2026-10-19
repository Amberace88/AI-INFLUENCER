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
}
main().catch((e) => { console.error(e); process.exit(1); });
