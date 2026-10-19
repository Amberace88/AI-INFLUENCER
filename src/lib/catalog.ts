// What the Studio can run. Keep in sync with worker/workflows/*.
// "kind" maps to public.generation_costs (credit price lives in the DB).
export type Workflow = {
  id: string;
  provider: "comfyui" | "fal" | "cloudflare";
  kind: "image_sd" | "image_hd" | "image_fast" | "image_ref";
  label: string;
  hint: string;
  needsReference: boolean;
  /** main choices shown first; the rest sit under "More engines" */
  primary: boolean;
  /** output is always square, size options don't apply */
  squareOnly?: boolean;
  defaults: { width: number; height: number; steps: number; cfg: number };
};

export const WORKFLOWS: Workflow[] = [
  {
    id: "cf_klein_ref",
    provider: "cloudflare",
    kind: "image_ref",
    label: "Same face, new scene",
    hint: "FLUX.2 uses the persona's reference photos to keep the face. Best for publishing.",
    needsReference: true,
    primary: true,
    defaults: { width: 832, height: 1248, steps: 4, cfg: 0 },
  },
  {
    id: "cf_klein_text",
    provider: "cloudflare",
    kind: "image_ref",
    label: "Photo from description",
    hint: "FLUX.2, natural photo look. Use it for a first portrait, then make the best one the reference.",
    needsReference: false,
    primary: true,
    defaults: { width: 832, height: 1248, steps: 4, cfg: 0 },
  },
  {
    id: "cf_flux_schnell",
    provider: "cloudflare",
    kind: "image_fast",
    label: "Quick sketch",
    hint: "FLUX.1 schnell. Seconds and nearly free, but less natural. Good for trying ideas.",
    needsReference: false,
    primary: true,
    squareOnly: true,
    defaults: { width: 1024, height: 1024, steps: 8, cfg: 0 },
  },
  {
    id: "txt2img_basic",
    provider: "comfyui",
    kind: "image_sd",
    label: "Local · text to image",
    hint: "Runs in ComfyUI on your Mac. Identity comes only from the persona description.",
    needsReference: false,
    primary: false,
    defaults: { width: 512, height: 768, steps: 25, cfg: 6.5 },
  },
  {
    id: "img2img_reference",
    provider: "comfyui",
    kind: "image_sd",
    label: "Local · from reference photo",
    hint: "Starts from the persona's main reference. Keeps composition and colours, not a reliable face match.",
    needsReference: true,
    primary: false,
    defaults: { width: 512, height: 768, steps: 25, cfg: 6.5 },
  },
  {
    id: "fal_flux_dev",
    provider: "fal",
    kind: "image_hd",
    label: "fal.ai · FLUX dev",
    hint: "fal.ai, paid per image. Needs FAL_KEY on the worker.",
    needsReference: false,
    primary: false,
    defaults: { width: 768, height: 1152, steps: 28, cfg: 3.5 },
  },
  {
    id: "fal_instant_character",
    provider: "fal",
    kind: "image_hd",
    label: "fal.ai · Instant Character",
    hint: "fal.ai, keeps the face from one reference. ~$0.10 per megapixel. Needs FAL_KEY.",
    needsReference: true,
    primary: false,
    defaults: { width: 768, height: 1152, steps: 28, cfg: 3.5 },
  },
];

/** Added to every photo prompt so results look like real photos, not stock or CGI. */
export const REALISM =
  "candid natural photograph, relaxed genuine expression, believable everyday pose, anatomically correct with exactly two arms and two hands per person, natural hand positions, " +
  "real skin texture with visible pores, natural soft light, shot on a full-frame camera with a 35mm lens, shallow depth of field, subtle film grain";
export const REALISM_AVOID =
  "plastic or airbrushed skin, waxy face, exaggerated grin, stock-photo pose, extra arms, extra hands, duplicated limbs, extra fingers, CGI, 3D render, cartoon, oversaturated, HDR, watermark, text";

export const SIZES = [
  { id: "portrait", label: "Portrait 2:3", w: 2, h: 3 },
  { id: "story", label: "Story 9:16", w: 9, h: 16 },
  { id: "square", label: "Square 1:1", w: 1, h: 1 },
  { id: "landscape", label: "Landscape 3:2", w: 3, h: 2 },
];

/** Fit an aspect ratio to roughly the workflow's base pixel count, multiples of 64. */
export function sizeFor(wf: Workflow, sizeId: string) {
  const s = SIZES.find((x) => x.id === sizeId) ?? SIZES[0];
  const area = wf.defaults.width * wf.defaults.height;
  const unit = Math.sqrt(area / (s.w * s.h));
  const round = (v: number) => Math.max(256, Math.round(v / 64) * 64);
  return { width: round(unit * s.w), height: round(unit * s.h) };
}

export function workflowById(id: string) {
  return WORKFLOWS.find((w) => w.id === id);
}

export const SCORE_CRITERIA = [
  { key: "identity", label: "Face identity" },
  { key: "features", label: "Hair, skin, features" },
  { key: "body", label: "Body & clothing" },
  { key: "hands", label: "Hands & anatomy" },
  { key: "realism", label: "Scene realism" },
  { key: "adherence", label: "Follows the prompt" },
  { key: "product", label: "Product accuracy" },
  { key: "ad_suitability", label: "Usable in an ad" },
] as const;

export const ROLES = [
  { id: "influencer", label: "Influencer", hint: "lifestyle creator who recommends products to followers" },
  { id: "ambassador", label: "Brand ambassador", hint: "the recurring face of one brand across campaigns" },
  { id: "blogger", label: "Blogger", hint: "writes and shows expertise on a niche topic" },
  { id: "representative", label: "Company representative", hint: "speaks for a company: news, offers, behind the scenes" },
  { id: "educator", label: "Educator", hint: "explains and teaches, tutorials and tips" },
  { id: "support", label: "Customer helper", hint: "friendly face for FAQs, onboarding and how-to content" },
] as const;

export const LANGUAGES = [
  { id: "es", label: "Spanish" },
  { id: "en", label: "English" },
  { id: "lv", label: "Latvian" },
  { id: "ru", label: "Russian" },
  { id: "de", label: "German" },
  { id: "fr", label: "French" },
  { id: "it", label: "Italian" },
  { id: "pt", label: "Portuguese" },
] as const;

export type Persona = {
  id: string;
  name: string;
  tagline: string | null;
  role: string;
  language: string;
  bio: string | null;
  backstory: string | null;
  voice: string | null;
  values_text: string | null;
  topics: string[];
  audience: string | null;
  dos: string | null;
  donts: string | null;
  locations: string | null;
  brand_name: string | null;
  likeness?: "fictional" | "self" | "consented";
  appearance: Record<string, string>;
  personality: string | null;
  style_notes: string | null;
  identity_prompt: string;
  negative_prompt: string;
  is_fictional: boolean;
  consent_confirmed: boolean;
  created_at: string;
};

export const APPEARANCE_FIELDS = [
  { key: "age", label: "Age range", placeholder: "late 20s" },
  { key: "presentation", label: "Presentation", placeholder: "woman" },
  { key: "hair", label: "Hair", placeholder: "shoulder-length wavy chestnut hair, side part" },
  { key: "eyes", label: "Eyes", placeholder: "hazel, almond-shaped" },
  { key: "skin", label: "Skin", placeholder: "olive skin, light freckles across the nose" },
  { key: "build", label: "Build", placeholder: "athletic, 170 cm" },
  { key: "features", label: "Distinctive features", placeholder: "small mole above left lip, gap in front teeth" },
  { key: "wardrobe", label: "Signature wardrobe", placeholder: "linen shirts, gold hoop earrings" },
];

/** Builds the identity part of every prompt from the structured appearance. */
export function identityFromAppearance(a: Record<string, string>) {
  const parts = APPEARANCE_FIELDS.map((f) => a[f.key]?.trim()).filter(Boolean);
  return parts.join(", ");
}

/** With a face reference the identity comes from the photo, so the written appearance (which may describe an outfit) is left out. */
export function composePrompt(persona: Pick<Persona, "identity_prompt" | "style_notes"> | null, scene: string, realism = true, fromReference = false) {
  return [fromReference ? "" : persona?.identity_prompt, scene.trim(), persona?.style_notes, realism ? REALISM : ""].filter((s) => s && s.trim()).join(", ");
}

export function composeNegative(persona: Pick<Persona, "negative_prompt"> | null, extra: string, realism = true) {
  return [persona?.negative_prompt, extra, realism ? REALISM_AVOID : ""].filter((s) => s && s.trim()).join(", ");
}
