"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";
import { APPEARANCE_FIELDS, composePrompt, identityFromAppearance, sizeFor, workflowById, type Persona } from "@/lib/catalog";
import { BENCHMARK_BASE_SEED, BENCHMARK_SCENES } from "@/lib/benchmark";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const RPC_ERRORS: Record<string, string> = {
  insufficient_credits: "Not enough credits for this generation.",
  too_many_open_jobs: "You have 20 jobs waiting. Let some finish first.",
  persona_not_found: "That persona no longer exists.",
  prompt_too_short: "Describe the scene in a few more words.",
  prompt_too_long: "The prompt is too long (max 4,000 characters).",
  unknown_kind: "This generation type is not available.",
  job_not_cancelable: "Only waiting jobs can be cancelled.",
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
  if (!isFictional && !consent) {
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
  };

  if (id) {
    const { error } = await supabase.from("personas").update(row).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/app/personas/${id}`);
    return { ok: true, message: "Persona saved.", id };
  }
  const { data, error } = await supabase.from("personas").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/personas");
  redirect(`/app/personas/${data.id}`);
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
  const prompt = composePrompt(persona, input.scene);
  const negative = [persona?.negative_prompt, input.negative].filter((s) => s && s.trim()).join(", ");
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
      p_prompt: composePrompt(persona as Persona, scene.prompt),
      p_negative_prompt: (persona as Persona).negative_prompt,
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
