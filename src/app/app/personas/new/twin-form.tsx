"use client";

import { useActionState, useEffect, useState } from "react";
import { LANGUAGES, ROLES } from "@/lib/catalog";
import { createTwin, type ActionResult } from "../../actions";

const TIPS = ["Face clearly visible, looking at the camera", "Even daylight, no sunglasses or heavy filters", "Only you in the photo", "2–4 photos from slightly different angles work best"];

export function TwinForm({ allowed, aiConfigured, cost }: { allowed: boolean; aiConfigured: boolean; cost: number }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createTwin, null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [brief, setBrief] = useState("");
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  if (!allowed) {
    return (
      <div className="rounded-xl border border-line bg-paper p-6">
        <h2 className="text-2xl font-bold">Your own digital twin</h2>
        <p className="mt-2 max-w-xl text-muted">
          Creating a persona of yourself is part of the Starter, Pro and Business plans. It needs your photos and your consent, so we keep it to verified paying accounts.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-7">
      <div className="grid gap-6 rounded-2xl bg-paper p-5 ring-1 ring-line md:grid-cols-[1fr_260px]">
        <div>
          <h2 className="text-2xl font-bold">Your photos</h2>
          <p className="mt-1 text-sm text-muted">They stay private and are used only to keep your face in your own generations.</p>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-8 text-center hover:border-accent">
            <span className="font-semibold text-accent">Choose 1–4 photos of yourself</span>
            <span className="text-xs text-muted">PNG, JPEG or WebP, up to 10 MB each</span>
            <input type="file" name="files" accept="image/png,image/jpeg,image/webp" multiple required className="sr-only"
              onChange={(e) => setPreviews(Array.from(e.currentTarget.files ?? []).slice(0, 4).map((f) => URL.createObjectURL(f)))} />
          </label>
          {!!previews.length && (
            <ul className="mt-4 flex gap-3">
              {previews.map((u, i) => (
                <li key={u} className="relative w-24">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Photo ${i + 1}`} className="panel-in aspect-[3/4] w-full rounded-lg object-cover ring-1 ring-line" />
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-accent px-1.5 text-[10px] font-semibold text-white">Main</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <ul className="space-y-2 self-center text-sm text-muted">
          {TIPS.map((t) => <li key={t} className="flex gap-2"><span className="text-ok" aria-hidden>✓</span>{t}</li>)}
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="tw-name">Name your persona uses</label>
          <input id="tw-name" name="name" required maxLength={80} className="field text-lg font-semibold" placeholder="Eddie" />
        </div>
        <div>
          <label className="label" htmlFor="tw-brand">Represents a brand (optional)</label>
          <input id="tw-brand" name="brand_name" className="field" placeholder="Your company" />
        </div>
        <div>
          <label className="label" htmlFor="tw-role">Job</label>
          <select id="tw-role" name="role" className="field" defaultValue="representative">
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tw-lang">Writes in</label>
          <select id="tw-lang" name="language" className="field" defaultValue="es">
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="tw-brief">About you, so the AI writes like you (optional)</label>
        <textarea id="tw-brief" name="brief" rows={4} className="field" value={brief} onChange={(e) => setBrief(e.target.value)}
          placeholder="I run a web studio on the Costa Blanca. I write short, direct and a bit ironic. I talk about websites, small business tips and life in Spain." />
        <p className="mt-1 text-xs text-muted">{brief.trim().length >= 15 && aiConfigured ? `The AI writes your bio, voice and topics: ${cost} credits.` : "Leave empty to fill in the profile yourself later."}</p>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-warn/40 bg-paper p-5">
        <legend className="px-1 font-semibold">Your consent</legend>
        {[
          ["consent_self", "Every uploaded photo shows me, and nobody else."],
          ["consent_age", "I am 18 or older."],
          ["consent_label", "I agree that AI images and texts of me are created, and I will label them as AI-generated when I publish."],
        ].map(([n, t]) => (
          <label key={n} className="flex items-start gap-3 text-sm">
            <input type="checkbox" name={n} required className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>{t}</span>
          </label>
        ))}
        <p className="text-xs text-muted">We store this confirmation with the date. Using someone else&apos;s photos here breaks our terms and closes the account.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button className="btn btn-primary px-6 py-3 text-base" disabled={pending}>{pending ? "Creating your twin…" : "Create my digital twin"}</button>
        {state && !state.ok && <p role="alert" className="text-sm text-bad">{state.error}</p>}
      </div>
    </form>
  );
}
