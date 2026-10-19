"use client";

import { useActionState, useState } from "react";
import { LANGUAGES, ROLES } from "@/lib/catalog";
import { createPersonaWithAi, type ActionResult } from "../../actions";

const EXAMPLES = [
  "Sporty woman around 30 from Alicante who loves paddle surf and healthy breakfasts; promotes a local surf school.",
  "Calm, trustworthy man in his 40s who explains home renovation tips for expats on the Costa Blanca.",
  "Young tech-savvy guide who reviews budget gadgets with dry humour, for Spanish students.",
];

export function AiPersonaForm({ cost, configured }: { cost: number; configured: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createPersonaWithAi, null);
  const [brief, setBrief] = useState("");
  const [role, setRole] = useState<string>("influencer");

  return (
    <form action={action} className="space-y-6">
      <div>
        <label className="mb-2 block text-lg font-bold" htmlFor="brief">Who do you need?</label>
        <textarea id="brief" name="brief" rows={4} required minLength={15} maxLength={2000} className="field text-lg"
          value={brief} onChange={(e) => setBrief(e.target.value)}
          placeholder="Who is this person, what do they do, who do they talk to, what should they promote?" />
        <p className="mt-3 text-xs text-muted">Or start from an example:</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setBrief(ex)}
              className="rounded-full bg-paper px-3 py-1 text-left text-xs text-muted ring-1 ring-line hover:text-ink hover:ring-ink">
              {ex.split(";")[0]}
            </button>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-lg font-bold">Their job</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => (
            <label key={r.id} className={`cursor-pointer rounded-xl p-3.5 transition-shadow ${role === r.id ? "bg-paper ring-2 ring-accent" : "bg-paper/60 ring-1 ring-line hover:ring-ink"}`}>
              <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
              <span className="font-semibold">{r.label}</span>
              <span className="mt-0.5 block text-sm text-muted">{r.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="language">Writes in</label>
          <select id="language" name="language" className="field" defaultValue="es">
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="brand_name">Represents a brand (optional)</label>
          <input id="brand_name" name="brand_name" className="field" placeholder="Surf Escuela Benidorm" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button className="btn btn-primary px-6 py-3 text-base" disabled={pending || !configured || brief.trim().length < 15}>
          {pending ? "Writing the persona…" : "Create persona with AI"}
        </button>
        <span className="text-sm tabular-nums text-muted">{cost} credits</span>
        {pending && <span className="flex items-center gap-2 text-sm text-muted"><span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />Writing name, voice, look and rules. Usually 10–30 seconds.</span>}
      </div>
      {!configured && (
        <p className="text-sm text-warn">AI text is not connected yet. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to .env.local (see README).</p>
      )}
      {state && !state.ok && <p role="alert" className="text-sm text-bad">{state.error}</p>}
    </form>
  );
}
