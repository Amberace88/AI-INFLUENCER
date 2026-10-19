"use client";

import { useActionState, useMemo, useState } from "react";
import { APPEARANCE_FIELDS, LANGUAGES, ROLES, identityFromAppearance, type Persona } from "@/lib/catalog";
import { savePersona, type ActionResult } from "../actions";

export function PersonaForm({ persona }: { persona?: Persona }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(savePersona, null);
  const [appearance, setAppearance] = useState<Record<string, string>>(persona?.appearance ?? {});
  const [fictional, setFictional] = useState(persona?.is_fictional ?? true);
  const auto = useMemo(() => identityFromAppearance(appearance), [appearance]);
  const [customIdentity, setCustomIdentity] = useState(
    persona && persona.identity_prompt !== identityFromAppearance(persona.appearance ?? {}) ? persona.identity_prompt : "",
  );

  return (
    <form action={action} className="space-y-8">
      {persona && <input type="hidden" name="id" value={persona.id} />}
      {persona?.likeness && <input type="hidden" name="likeness" value={persona.likeness} />}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required maxLength={80} defaultValue={persona?.name} className="field text-lg font-semibold" placeholder="Lucía" />
        </div>
        <div>
          <label className="label" htmlFor="tagline">Who she or he is, in one line</label>
          <input id="tagline" name="tagline" defaultValue={persona?.tagline ?? ""} className="field" placeholder="Valencia-based yoga teacher who loves slow mornings" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="role">Job</label>
          <select id="role" name="role" defaultValue={persona?.role ?? "influencer"} className="field">
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="language">Writes in</label>
          <select id="language" name="language" defaultValue={persona?.language ?? "es"} className="field">
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="brand_name">Represents a brand</label>
          <input id="brand_name" name="brand_name" defaultValue={persona?.brand_name ?? ""} className="field" placeholder="optional" />
        </div>
      </div>

      <fieldset>
        <legend className="text-xl font-bold">Character</legend>
        <p className="mt-1 max-w-2xl text-sm text-muted">This is what makes every post sound like the same person.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {([
            ["bio", "Public bio (first person)", 3, "Soy Lucía, profe de yoga en Valencia…"],
            ["backstory", "Backstory", 3, "Grew up in a fishing village, moved to the city at 20…"],
            ["voice", "How they write", 3, "Short sentences, warm, one emoji max, ends with a question"],
            ["values_text", "What they stand for", 3, "Slow living, local products, honesty over hype"],
            ["audience", "Who follows them", 2, "Women 25–40 in Spain who want calmer mornings"],
            ["locations", "Recurring places", 2, "Her balcony with plants, Malvarrosa beach, a corner café"],
            ["dos", "Always", 2, "Shares one practical tip per post"],
            ["donts", "Never", 2, "Never gives medical advice, never mocks beginners"],
          ] as const).map(([k, label, rows, ph]) => (
            <div key={k}>
              <label className="label" htmlFor={k}>{label}</label>
              <textarea id={k} name={k} rows={rows} className="field" placeholder={ph}
                defaultValue={(persona?.[k as keyof Persona] as string | null) ?? ""} />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="label" htmlFor="topics">Content topics (comma separated)</label>
            <input id="topics" name="topics" className="field" defaultValue={(persona?.topics ?? []).join(", ")}
              placeholder="morning routines, local food, beginner yoga, mindful travel" />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xl font-bold">Appearance</legend>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Be concrete. These details are added to every prompt, so they are what keeps the face the same.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {APPEARANCE_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`a_${f.key}`}>{f.label}</label>
              <input
                id={`a_${f.key}`}
                name={`a_${f.key}`}
                className="field"
                placeholder={f.placeholder}
                value={appearance[f.key] ?? ""}
                onChange={(e) => setAppearance({ ...appearance, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-3 text-xl font-bold">Voice and style</legend>
        <div>
          <label className="label" htmlFor="personality">Personality</label>
          <textarea id="personality" name="personality" rows={3} defaultValue={persona?.personality ?? ""} className="field" placeholder="Warm, curious, a bit of dry humour. Never preachy." />
        </div>
        <div>
          <label className="label" htmlFor="style_notes">Photo style added to every prompt</label>
          <textarea id="style_notes" name="style_notes" rows={3} defaultValue={persona?.style_notes ?? ""} className="field" placeholder="natural light, 35mm photo, soft film grain, candid" />
        </div>
      </fieldset>

      <details className="rounded-lg border border-line bg-paper p-4" open={Boolean(customIdentity)}>
        <summary className="cursor-pointer font-semibold">Prompt the generator receives</summary>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="identity_prompt">Identity prompt (leave empty to build it from Appearance)</label>
            <textarea id="identity_prompt" name="identity_prompt" rows={3} className="field" value={customIdentity}
              onChange={(e) => setCustomIdentity(e.target.value)} placeholder={auto || "Fill in Appearance above"} />
          </div>
          <div>
            <label className="label" htmlFor="negative_prompt">Avoid in every image</label>
            <input id="negative_prompt" name="negative_prompt" defaultValue={persona?.negative_prompt ?? "blurry, deformed hands, extra fingers, watermark, text"} className="field" />
          </div>
        </div>
      </details>

      {persona?.likeness === "self" ? (
        <p className="rounded-lg border border-line bg-paper p-4 text-sm">This is your digital twin. Your consent is on file; the face comes from your reference photos.</p>
      ) : (
      <fieldset className="rounded-lg border border-line bg-paper p-4">
        <legend className="px-1 font-semibold">Likeness</legend>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="is_fictional" checked={fictional} onChange={(e) => setFictional(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
          <span>This persona is fictional and not modelled on a real, identifiable person.</span>
        </label>
        {!fictional && (
          <label className="mt-3 flex items-start gap-3 text-warn">
            <input type="checkbox" name="consent_confirmed" defaultChecked={persona?.consent_confirmed} className="mt-1 size-4" />
            <span>I have the person&apos;s written consent to create and publish AI images of them.</span>
          </label>
        )}
      </fieldset>
      )}

      <div className="flex items-center gap-4">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : persona ? "Save persona" : "Create persona"}</button>
        {state && !state.ok && <p role="alert" className="text-sm text-bad">{state.error}</p>}
        {state?.ok && state.message && <p role="status" className="text-sm text-ok">{state.message}</p>}
      </div>
    </form>
  );
}
