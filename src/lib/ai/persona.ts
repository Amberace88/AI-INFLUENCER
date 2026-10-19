import "server-only";
import { chat } from "./text";
import { parseJson } from "./json";
import { ROLES, LANGUAGES, type Persona } from "@/lib/catalog";

export type PersonaDraft = {
  name: string;
  tagline: string;
  bio: string;
  backstory: string;
  personality: string;
  voice: string;
  values_text: string;
  topics: string[];
  audience: string;
  dos: string;
  donts: string;
  locations: string;
  style_notes: string;
  appearance: Record<string, string>;
};

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function draftPersona(input: { brief: string; role: string; language: string; brandName?: string; twin?: boolean }): Promise<PersonaDraft> {
  const role = ROLES.find((r) => r.id === input.role) ?? ROLES[0];
  const lang = LANGUAGES.find((l) => l.id === input.language) ?? LANGUAGES[0];

  const system = input.twin
    ? `You write the public persona profile of a REAL person who is creating an AI "digital twin" of themselves.
Use only what their brief says about them; do not invent biographical facts, credentials, family or numbers.
Keep the given name exactly if they mention one. Appearance comes from their photos, so return empty strings for "appearance".
Write every text field in ${(LANGUAGES.find((l) => l.id === input.language) ?? LANGUAGES[0]).label}, except "style_notes" in English. Reply with ONE JSON object only, no commentary.`
    : `You design fictional AI personas for brands and creators. The persona must be clearly fictional,
not based on any real or famous person. Write every text field in ${lang.label}, except "appearance" and
"style_notes" which must be in English because they are fed to an image model. Appearance must be very
concrete and visual (age range, hair, eyes, skin, build, 2-3 distinctive features, signature wardrobe) so the
same face can be reproduced. Reply with ONE JSON object only, no commentary.`;

  const user = `Brief from the client: """${input.brief.slice(0, 2000)}"""
Persona role: ${role.label} — ${role.hint}
${input.brandName ? `Represents the company/brand: ${input.brandName}` : ""}

Return JSON with exactly these keys:
{
 "name": "first name (+ optional surname), fits the market",
 "tagline": "one line, who they are",
 "bio": "3-4 sentence public bio, first person",
 "backstory": "short private backstory that explains their interests",
 "personality": "traits, humour, quirks",
 "voice": "how they write: tone, sentence length, emoji use, catchphrases",
 "values_text": "what they stand for",
 "topics": ["5-8 recurring content topics"],
 "audience": "who follows them and why",
 "dos": "what they always do in content",
 "donts": "what they never say or do",
 "locations": "recurring places they are photographed in",
 "style_notes": "photo style in English, e.g. natural light, 35mm, candid",
 "appearance": {"age":"","presentation":"","hair":"","eyes":"","skin":"","build":"","features":"","wardrobe":""}
}`;

  const ask = () => chat([{ role: "system", content: system }, { role: "user", content: user }], { maxTokens: 1800, temperature: 0.9 });
  let j: Record<string, unknown>;
  try {
    j = parseJson<Record<string, unknown>>(await ask());
  } catch {
    j = parseJson<Record<string, unknown>>(await ask());
  }
  const appearanceIn = (j.appearance ?? {}) as Record<string, unknown>;
  const appearance: Record<string, string> = {};
  for (const k of ["age", "presentation", "hair", "eyes", "skin", "build", "features", "wardrobe"]) appearance[k] = str(appearanceIn[k], 200);

  const draft: PersonaDraft = {
    name: str(j.name, 80) || "Unnamed",
    tagline: str(j.tagline, 200),
    bio: str(j.bio, 1200),
    backstory: str(j.backstory, 1500),
    personality: str(j.personality, 800),
    voice: str(j.voice, 800),
    values_text: str(j.values_text, 800),
    topics: Array.isArray(j.topics) ? j.topics.map((t) => str(t, 80)).filter(Boolean).slice(0, 10) : [],
    audience: str(j.audience, 600),
    dos: str(j.dos, 800),
    donts: str(j.donts, 800),
    locations: str(j.locations, 600),
    style_notes: str(j.style_notes, 300),
    appearance,
  };
  if (!draft.bio && !draft.personality) throw new Error("AI returned an empty persona — try again with a longer brief");
  return draft;
}

export type PostDraft = { caption: string; hashtags: string[]; image_idea: string };

export const PLATFORMS = [
  { id: "instagram", label: "Instagram", hint: "caption 60-150 words, line breaks, 5-10 hashtags" },
  { id: "tiktok", label: "TikTok", hint: "hook in the first line, under 60 words, 3-5 hashtags" },
  { id: "linkedin", label: "LinkedIn", hint: "professional, 120-200 words, insight + question, 2-3 hashtags" },
  { id: "facebook", label: "Facebook", hint: "friendly, 50-120 words, 0-3 hashtags" },
  { id: "blog", label: "Blog intro", hint: "title line + 150-250 word intro, no hashtags" },
] as const;

export async function draftPosts(persona: Persona, input: { topic: string; platform: string; count: number }): Promise<PostDraft[]> {
  const lang = LANGUAGES.find((l) => l.id === persona.language) ?? LANGUAGES[0];
  const platform = PLATFORMS.find((p) => p.id === input.platform) ?? PLATFORMS[0];
  const count = Math.min(Math.max(1, input.count), 10);

  const system = `You are ${persona.name}, a fictional AI persona. Stay fully in character.
Write in ${lang.label}.
Who you are: ${persona.bio ?? persona.tagline ?? ""}
Personality: ${persona.personality ?? ""}
Voice: ${persona.voice ?? ""}
Values: ${persona.values_text ?? ""}
Audience: ${persona.audience ?? ""}
Always: ${persona.dos ?? ""}
Never: ${persona.donts ?? ""}
${persona.brand_name ? `You represent ${persona.brand_name}. Mention it naturally, never as a hard sell.` : ""}
Never claim to be a real human if asked; never invent prices, medical, legal or financial claims.
Reply with ONE valid JSON array only. Inside strings use \\n for line breaks.`;

  const user = `Write ${count} different ${platform.label} posts (${platform.hint}).
Topic or brief: """${input.topic.slice(0, 800) || (persona.topics ?? []).join(", ")}"""
Each item: {"caption":"...","hashtags":["..."],"image_idea":"one sentence in English describing the photo of you that goes with it"}`;

  const ask = () => chat([{ role: "system", content: system }, { role: "user", content: user }], { maxTokens: 400 * count + 200, temperature: 0.9 });
  let arr: unknown[];
  try {
    arr = parseJson<unknown[]>(await ask());
  } catch {
    arr = parseJson<unknown[]>(await ask()); // one retry: model output varies
  }
  const posts = (Array.isArray(arr) ? arr : [])
    .map((p) => p as Record<string, unknown>)
    .map((p) => ({
      caption: str(p.caption, 3000),
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.map((h) => str(h, 60).replace(/^#?/, "#")).filter((h) => h.length > 1).slice(0, 15) : [],
      image_idea: str(p.image_idea, 400),
    }))
    .filter((p) => p.caption);
  if (!posts.length) throw new Error("AI returned no posts — try again");
  return posts.slice(0, count);
}
