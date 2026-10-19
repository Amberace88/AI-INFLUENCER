"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { TWIN_STATEMENT } from "@/lib/consent";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";
import { APPEARANCE_FIELDS, composeNegative, composePrompt, identityFromAppearance, sizeFor, workflowById, type Persona } from "@/lib/catalog";
import { BENCHMARK_BASE_SEED, BENCHMARK_SCENES } from "@/lib/benchmark";
import { draftPersona, draftPosts } from "@/lib/ai/persona";
import { AiConfigError } from "@/lib/ai/text";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const RPC_ERRORS: Record<string, string> = {
  insufficient_credits: "Not enough credits for this generation.",
  too_many_open_jobs: "You have 20 jobs waiting. Let some finish first.",
  persona_not_found: "That persona no longer exists.",
  prompt_too_short: "Describe the scene in a few more words.",
  prompt_too_long: "The prompt is too long (max 4,000 characters).",
  unknown_kind: "This generation type is not available.",
  job_not_cancelable: "Only waiting jobs can be cancelled.",
  persona_limit_reached: "Your plan's persona limit is reached. Upgrade the plan or delete a persona.",
  twin_needs_paid_plan: "A persona of yourself is available on Starter, Pro and Business plans.",
  twin_already_exists: "You already have a persona of yourself. Edit that one instead.",
};
function friendly(msg: string) {
  const key = Object.keys(RPC_ERRORS).find((k) => msg.includes(k));
  return key ? RPC_ERRORS[key] : msg;
}

// ---------------------------------------------------------------- personas
export async function savePersona(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const id = String(form.get("id") || "");
  const appearance: Record<string, string> = {};
  for (const f of APPEARANCE_FIELDS) appearance[f.key] = String(form.get(`a_${f.key}`) || "").trim();

  const name = String(form.get("name") || "").trim();
  if (!name) return { ok: false, error: "Give the persona a name." };
  const isFictional = form.get("is_fictional") === "on";
  const consent = form.get("consent_confirmed") === "on";
  const editingTwin = id
    ? (await supabase.from("personas").select("likeness").eq("id", id).maybeSingle()).data?.likeness === "self"
    : false;
  if (!editingTwin && !isFictional && !consent) {
    return { ok: false, error: "A persona based on a real person needs their documented consent." };
  }

  const customIdentity = String(form.get("identity_prompt") || "").trim();
  const row = {
    name,
    tagline: String(form.get("tagline") || "").trim() || null,
    appearance,
    personality: String(form.get("personality") || "").trim() || null,
    style_notes: String(form.get("style_notes") || "").trim() || null,
    identity_prompt: customIdentity || identityFromAppearance(appearance),
    negative_prompt: String(form.get("negative_prompt") || "").trim(),
    is_fictional: isFictional,
    consent_confirmed: consent,
    role: String(form.get("role") || "influencer"),
    language: String(form.get("language") || "es"),
    brand_name: String(form.get("brand_name") || "").trim() || null,
    bio: String(form.get("bio") || "").trim() || null,
    backstory: String(form.get("backstory") || "").trim() || null,
    voice: String(form.get("voice") || "").trim() || null,
    values_text: String(form.get("values_text") || "").trim() || null,
    topics: String(form.get("topics") || "").split(/[,\n]/).map((t) => t.trim()).filter(Boolean).slice(0, 12),
    audience: String(form.get("audience") || "").trim() || null,
    dos: String(form.get("dos") || "").trim() || null,
    donts: String(form.get("donts") || "").trim() || null,
    locations: String(form.get("locations") || "").trim() || null,
  };

  if (id) {
    const patch: Record<string, unknown> = { ...row };
    if (editingTwin) { delete patch.is_fictional; delete patch.consent_confirmed; }
    const { error } = await supabase.from("personas").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/app/personas/${id}`);
    return { ok: true, message: "Persona saved.", id };
  }
  const { data, error } = await supabase.from("personas").insert(row).select("id").single();
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/app/personas");
  redirect(`/app/personas/${data.id}`);
}

// ------------------------------------------------------ AI persona + posts
async function withCredits<T>(kind: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const { supabase } = await requireUser();
  const { data: ledgerId, error } = await supabase.rpc("spend_credits", { p_kind: kind });
  if (error) return { ok: false, error: friendly(error.message) };
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    await supabase.rpc("refund_spend", { p_ledger_id: ledgerId });
    const msg = (e as Error).message;
    return { ok: false, error: e instanceof AiConfigError ? msg : `${msg} (credits returned)` };
  }
}

export async function createPersonaWithAi(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const brief = String(form.get("brief") || "").trim();
  const role = String(form.get("role") || "influencer");
  const language = String(form.get("language") || "es");
  const brandName = String(form.get("brand_name") || "").trim();
  if (brief.length < 15) return { ok: false, error: "Describe the persona in at least one full sentence." };

  // check the plan limit before spending credits
  const { count } = await supabase.from("personas").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  const { data: me } = await supabase.from("profiles").select("plan:plans(max_personas)").eq("id", user.id).single();
  const limit = (me?.plan as unknown as { max_personas: number } | null)?.max_personas ?? 1;
  if ((count ?? 0) >= limit) return { ok: false, error: RPC_ERRORS.persona_limit_reached };

  const r = await withCredits("text_persona", () => draftPersona({ brief, role, language, brandName }));
  if (!r.ok) return r;
  const d = r.value;
  const { data, error } = await supabase
    .from("personas")
    .insert({
      name: d.name, tagline: d.tagline, bio: d.bio, backstory: d.backstory, personality: d.personality,
      voice: d.voice, values_text: d.values_text, topics: d.topics, audience: d.audience, dos: d.dos,
      donts: d.donts, locations: d.locations, style_notes: d.style_notes, appearance: d.appearance,
      identity_prompt: identityFromAppearance(d.appearance),
      negative_prompt: "blurry, deformed hands, extra fingers, watermark, text",
      role, language, brand_name: brandName || null, is_fictional: true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/app/personas");
  redirect(`/app/personas/${data.id}?created=ai`);
}

export async function generatePosts(personaId: string, input: { topic: string; platform: string; count: number }): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: persona } = await supabase.from("personas").select("*").eq("id", personaId).single();
  if (!persona) return { ok: false, error: "Persona not found." };
  const r = await withCredits("text_posts", () => draftPosts(persona as Persona, input));
  if (!r.ok) return r;
  const { error } = await supabase.from("posts").insert(
    r.value.map((p) => ({ persona_id: personaId, platform: input.platform, topic: input.topic || null, caption: p.caption, hashtags: p.hashtags, image_idea: p.image_idea })),
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/app/personas/${personaId}/posts`);
  return { ok: true, message: `${r.value.length} posts written.` };
}

export async function updatePost(postId: string, patch: { caption?: string; status?: "draft" | "approved" | "published" | "discarded" }): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("posts").update(patch).eq("id", postId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deletePost(postId: string, personaId: string) {
  const { supabase } = await requireUser();
  await supabase.from("posts").delete().eq("id", postId);
  revalidatePath(`/app/personas/${personaId}/posts`);
}

export async function deletePersona(id: string) {
  const { supabase, user } = await requireUser();
  const { data: refs } = await supabase.from("persona_references").select("storage_path").eq("persona_id", id);
  if (refs?.length) await supabase.storage.from("references").remove(refs.map((r) => r.storage_path));
  await supabase.from("personas").delete().eq("id", id).eq("owner_id", user.id);
  revalidatePath("/app/personas");
  redirect("/app/personas");
}

// -------------------------------------------------------------- references
const ALLOWED = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);
const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadReferences(personaId: string, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "Choose at least one image." };

  const { count } = await supabase.from("persona_references").select("id", { count: "exact", head: true }).eq("persona_id", personaId);
  let first = !count;
  for (const file of files.slice(0, 8)) {
    const ext = ALLOWED.get(file.type);
    if (!ext) return { ok: false, error: `${file.name}: use PNG, JPEG or WebP.` };
    if (file.size > MAX_BYTES) return { ok: false, error: `${file.name}: larger than 10 MB.` };
    const path = `${user.id}/${personaId}/${randomUUID()}.${ext}`;
    const up = await supabase.storage.from("references").upload(path, file, { contentType: file.type });
    if (up.error) return { ok: false, error: up.error.message };
    const ins = await supabase.from("persona_references").insert({ persona_id: personaId, storage_path: path, is_primary: first });
    if (ins.error) return { ok: false, error: ins.error.message };
    first = false;
  }
  revalidatePath(`/app/personas/${personaId}`);
  return { ok: true, message: `${Math.min(files.length, 8)} reference image(s) added.` };
}

export async function setPrimaryReference(personaId: string, refId: string) {
  const { supabase } = await requireUser();
  await supabase.from("persona_references").update({ is_primary: false }).eq("persona_id", personaId);
  await supabase.from("persona_references").update({ is_primary: true }).eq("id", refId);
  revalidatePath(`/app/personas/${personaId}`);
}

export async function deleteReference(personaId: string, refId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("persona_references").select("storage_path").eq("id", refId).single();
  if (data) await supabase.storage.from("references").remove([data.storage_path]);
  await supabase.from("persona_references").delete().eq("id", refId);
  revalidatePath(`/app/personas/${personaId}`);
}

// --------------------------------------------------------------- generate
export type GenerateInput = {
  personaId: string | null;
  workflowId: string;
  scene: string;
  negative: string;
  sizeId: string;
  count: number;
  seed: number | null;
  steps: number | null;
  cfg: number | null;
  realism?: boolean;
};

export async function generate(input: GenerateInput): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const wf = workflowById(input.workflowId);
  if (!wf) return { ok: false, error: "Unknown workflow." };

  let persona: Persona | null = null;
  if (input.personaId) {
    const { data } = await supabase.from("personas").select("*").eq("id", input.personaId).single();
    persona = data as Persona | null;
    if (!persona) return { ok: false, error: "Persona not found." };
  }
  if (wf.needsReference) {
    if (!persona) return { ok: false, error: "This workflow needs a persona with a reference image." };
    const { count } = await supabase.from("persona_references").select("id", { count: "exact", head: true }).eq("persona_id", persona.id);
    if (!count) return { ok: false, error: `Upload a reference image for ${persona.name} first.` };
  }

  const { width, height } = sizeFor(wf, input.sizeId);
  const realism = input.realism !== false;
  const prompt = composePrompt(persona, input.scene, realism, wf.needsReference);
  const negative = composeNegative(persona, input.negative, realism);
  const count = Math.min(Math.max(1, Math.round(input.count)), 4);
  const baseSeed = input.seed ?? Math.floor(Math.random() * 2 ** 31 - 10);

  for (let i = 0; i < count; i++) {
    const { error } = await supabase.rpc("enqueue_job", {
      p_persona_id: persona?.id ?? null,
      p_kind: wf.kind,
      p_provider: wf.provider,
      p_workflow: wf.id,
      p_prompt: prompt,
      p_negative_prompt: negative,
      p_params: {
        width,
        height,
        seed: baseSeed + i,
        steps: input.steps ?? wf.defaults.steps,
        cfg: input.cfg ?? wf.defaults.cfg,
        use_references: wf.needsReference,
        scene: input.scene.trim(),
      },
    });
    if (error) {
      revalidatePath("/app/studio");
      return { ok: false, error: i === 0 ? friendly(error.message) : `Queued ${i} of ${count}: ${friendly(error.message)}` };
    }
  }
  revalidatePath("/app/studio");
  return { ok: true, message: count === 1 ? "Queued." : `${count} images queued.` };
}

export async function runBenchmark(personaId: string, workflowId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const wf = workflowById(workflowId);
  if (!wf) return { ok: false, error: "Unknown workflow." };
  const { data: persona } = await supabase.from("personas").select("*").eq("id", personaId).single();
  if (!persona) return { ok: false, error: "Persona not found." };

  const { data: run, error } = await supabase
    .from("benchmark_runs")
    .insert({ persona_id: personaId, name: `${wf.label} · ${new Date().toISOString().slice(0, 10)}`, provider: wf.provider, workflow: wf.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { width, height } = sizeFor(wf, "portrait");
  for (const [i, scene] of BENCHMARK_SCENES.entries()) {
    const res = await supabase.rpc("enqueue_job", {
      p_persona_id: personaId,
      p_kind: wf.kind,
      p_provider: wf.provider,
      p_workflow: wf.id,
      p_prompt: composePrompt(persona as Persona, scene.prompt, true, wf.needsReference),
      p_negative_prompt: composeNegative(persona as Persona, ""),
      p_params: { width, height, seed: BENCHMARK_BASE_SEED + i, steps: wf.defaults.steps, cfg: wf.defaults.cfg, use_references: wf.needsReference, scene: scene.prompt },
      p_benchmark_run_id: run.id,
      p_scene_key: scene.key,
    });
    if (res.error) return { ok: false, error: `Queued ${i} of ${BENCHMARK_SCENES.length} scenes: ${friendly(res.error.message)}` };
  }
  revalidatePath(`/app/personas/${personaId}`);
  return { ok: true, message: `${BENCHMARK_SCENES.length} benchmark scenes queued. Score them on the contact sheet.` };
}

export async function cancelJob(jobId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("cancel_job", { p_job_id: jobId });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/app/studio");
  return { ok: true, message: "Cancelled, credits returned." };
}

// ----------------------------------------------------------------- review
export async function reviewAsset(
  assetId: string,
  patch: { review_status?: "pending" | "accepted" | "rejected"; scores?: Record<string, number>; notes?: string },
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (patch.scores) {
    for (const v of Object.values(patch.scores)) if (!(v >= 1 && v <= 5)) return { ok: false, error: "Scores are 1 to 5." };
  }
  const { error } = await supabase.from("assets").update(patch).eq("id", assetId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAsset(assetId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("assets").select("storage_path").eq("id", assetId).single();
  await supabase.from("assets").delete().eq("id", assetId);
  // storage object stays; outputs are written by the worker (service role). Cleaned by retention job later.
  void data;
  revalidatePath("/app/sheet");
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/login");
}

// ------------------------------------------------------------------ admin
export async function adminSetPlan(userId: string, planId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("admin_set_plan", { p_user: userId, p_plan: planId });
  if (error) return { ok: false, error: error.message.includes("not_admin") ? "Admin only." : error.message };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Plan updated." };
}

export async function adminGrantCredits(userId: string, amount: number, note: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!Number.isInteger(amount) || amount === 0) return { ok: false, error: "Enter a whole number, e.g. 100 or -50." };
  const { error } = await supabase.rpc("admin_grant_credits", { p_user: userId, p_amount: amount, p_note: note || null });
  if (error) return { ok: false, error: error.message.includes("not_admin") ? "Admin only." : error.message };
  revalidatePath("/app", "layout");
  return { ok: true, message: `${amount > 0 ? "Added" : "Removed"} ${Math.abs(amount)} credits.` };
}

export async function adminSetDailyLimit(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const usd = Number(String(form.get("usd") ?? "").replace(",", "."));
  if (!Number.isFinite(usd) || usd < 0 || usd > 1000) return { ok: false, error: "Enter dollars between 0 and 1000." };
  const { error } = await supabase.rpc("admin_set_daily_limit", { p_usd: usd });
  if (error) return { ok: false, error: error.message.includes("not_admin") ? "Admin only." : error.message };
  revalidatePath("/app/admin");
  return { ok: true, message: `Daily limit set to $${usd}. The worker picks it up within 30 seconds.` };
}

// A generated frame becomes the persona's main reference photo.
export async function setAssetAsReference(assetId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data: asset } = await supabase.from("assets").select("storage_path, persona_id, mime").eq("id", assetId).eq("owner_id", user.id).maybeSingle();
  if (!asset?.persona_id) return { ok: false, error: "This frame has no persona." };
  const dl = await supabase.storage.from("outputs").download(asset.storage_path);
  if (dl.error) return { ok: false, error: dl.error.message };
  const ext = asset.mime === "image/png" ? "png" : asset.mime === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/${asset.persona_id}/${randomUUID()}.${ext}`;
  const up = await supabase.storage.from("references").upload(path, dl.data, { contentType: asset.mime });
  if (up.error) return { ok: false, error: up.error.message };
  await supabase.from("persona_references").update({ is_primary: false }).eq("persona_id", asset.persona_id);
  const ins = await supabase.from("persona_references").insert({ persona_id: asset.persona_id, storage_path: path, is_primary: true });
  if (ins.error) return { ok: false, error: ins.error.message };
  await supabase.from("assets").update({ review_status: "accepted" }).eq("id", assetId);
  revalidatePath(`/app/personas/${asset.persona_id}`);
  revalidatePath("/app/studio");
  return { ok: true, message: "Now the main reference. New shots keep this face." };
}

// ------------------------------------------------- digital twin (yourself)

export async function createTwin(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (form.get("consent_self") !== "on" || form.get("consent_age") !== "on" || form.get("consent_label") !== "on") {
    return { ok: false, error: "Please confirm all three statements." };
  }
  const name = String(form.get("name") || "").trim();
  if (!name) return { ok: false, error: "Enter the name your persona should use." };
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4);
  if (!files.length) return { ok: false, error: "Add at least one clear photo of your face." };
  for (const f of files) {
    if (!ALLOWED.has(f.type)) return { ok: false, error: `${f.name}: use PNG, JPEG or WebP.` };
    if (f.size > MAX_BYTES) return { ok: false, error: `${f.name}: larger than 10 MB.` };
  }

  const { data: me } = await supabase.from("profiles").select("plan:plans(allow_twin, max_personas)").eq("id", user.id).single();
  const plan = me?.plan as unknown as { allow_twin: boolean; max_personas: number } | null;
  if (!plan?.allow_twin) return { ok: false, error: RPC_ERRORS.twin_needs_paid_plan };
  const { count } = await supabase.from("personas").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  if ((count ?? 0) >= plan.max_personas) return { ok: false, error: RPC_ERRORS.persona_limit_reached };

  const role = String(form.get("role") || "influencer");
  const language = String(form.get("language") || "es");
  const brandName = String(form.get("brand_name") || "").trim();
  const brief = String(form.get("brief") || "").trim();

  let profile: Partial<Awaited<ReturnType<typeof draftPersona>>> = {};
  if (brief.length >= 15) {
    const r = await withCredits("text_persona", () => draftPersona({ brief: `My name is ${name}. ${brief}`, role, language, brandName, twin: true }));
    if (!r.ok) return r;
    profile = r.value;
  }

  const { data: persona, error } = await supabase
    .from("personas")
    .insert({
      name, likeness: "self", role, language, brand_name: brandName || null,
      tagline: profile.tagline || null, bio: profile.bio || null, backstory: profile.backstory || null,
      personality: profile.personality || null, voice: profile.voice || null, values_text: profile.values_text || null,
      topics: profile.topics ?? [], audience: profile.audience || null, dos: profile.dos || null, donts: profile.donts || null,
      locations: profile.locations || null, style_notes: profile.style_notes || null,
      identity_prompt: "", negative_prompt: "blurry, deformed hands, extra fingers, watermark, text",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendly(error.message) };

  for (const [i, file] of files.entries()) {
    const path = `${user.id}/${persona.id}/${randomUUID()}.${ALLOWED.get(file.type)}`;
    const up = await supabase.storage.from("references").upload(path, file, { contentType: file.type });
    if (up.error) return { ok: false, error: up.error.message };
    await supabase.from("persona_references").insert({ persona_id: persona.id, storage_path: path, is_primary: i === 0 });
  }
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await supabase.from("likeness_consents").insert({ persona_id: persona.id, kind: "self", statement: TWIN_STATEMENT, user_agent: ua });

  revalidatePath("/app/personas");
  redirect(`/app/personas/${persona.id}?created=twin`);
}

export async function reportDefect(assetId: string, reason: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("report_defect", { p_asset_id: assetId, p_reason: reason });
  if (error) return { ok: false, error: error.message.includes("asset_not_found") ? "Frame not found." : error.message };
  revalidatePath("/app", "layout");
  return { ok: true, message: data > 0 ? `Thanks. ${data} credit${data === 1 ? "" : "s"} returned.` : "Thanks, reported. (Credits for this frame were already returned or your monthly defect refunds are used up.)" };
}
