"use client";

import { useActionState, useMemo, useState } from "react";
import { APPEARANCE_FIELDS, identityFromAppearance, type Persona } from "@/lib/catalog";
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

      <div className="flex items-center gap-4">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : persona ? "Save persona" : "Create persona"}</button>
        {state && !state.ok && <p role="alert" className="text-sm text-bad">{state.error}</p>}
        {state?.ok && state.message && <p role="status" className="text-sm text-ok">{state.message}</p>}
      </div>
    </form>
  );
}
