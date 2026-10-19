// What the Studio can run. Keep in sync with worker/workflows/*.
// "kind" maps to public.generation_costs (credit price lives in the DB).
export type Workflow = {
  id: string;
  provider: "comfyui" | "fal" | "cloudflare";
  kind: "image_sd" | "image_hd" | "image_fast";
  label: string;
  hint: string;
  needsReference: boolean;
  defaults: { width: number; height: number; steps: number; cfg: number };
};

export const WORKFLOWS: Workflow[] = [
  {
    id: "cf_flux_schnell",
    provider: "cloudflare",
    kind: "image_fast",
    label: "Cloud · fast draft (FLUX schnell)",
    hint: "Cloudflare Workers AI. Seconds per image, ~150 free a day. Square 1024 px only; identity from the description, no fixed seed.",
    needsReference: false,
    defaults: { width: 1024, height: 1024, steps: 4, cfg: 0 },
  },
  {
    id: "txt2img_basic",
    provider: "comfyui",
    kind: "image_sd",
    label: "Local · text to image",
    hint: "Runs in ComfyUI on your Mac. Identity comes only from the persona description.",
    needsReference: false,
    defaults: { width: 512, height: 768, steps: 25, cfg: 6.5 },
  },
  {
    id: "img2img_reference",
    provider: "comfyui",
    kind: "image_sd",
    label: "Local · from reference photo",
    hint: "Starts from the persona's main reference. Keeps composition and colours, not a reliable face match.",
    needsReference: true,
    defaults: { width: 512, height: 768, steps: 25, cfg: 6.5 },
  },
  {
    id: "fal_flux_dev",
    provider: "fal",
    kind: "image_hd",
    label: "Cloud · FLUX text to image",
    hint: "fal.ai, paid per image. Higher quality, no reference.",
    needsReference: false,
    defaults: { width: 768, height: 1152, steps: 28, cfg: 3.5 },
  },
  {
    id: "fal_instant_character",
    provider: "fal",
    kind: "image_hd",
    label: "Cloud · keep face from reference",
    hint: "fal.ai Instant Character. Uses the persona's main reference to hold the identity. ~$0.10 per megapixel.",
    needsReference: true,
    defaults: { width: 768, height: 1152, steps: 28, cfg: 3.5 },
  },
];

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

export function composePrompt(persona: Pick<Persona, "identity_prompt" | "style_notes"> | null, scene: string) {
  return [persona?.identity_prompt, scene.trim(), persona?.style_notes].filter((s) => s && s.trim()).join(", ");
}
