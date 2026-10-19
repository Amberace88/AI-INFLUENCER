"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { SIZES, WORKFLOWS, composePrompt, sizeFor, type Persona } from "@/lib/catalog";
import { BENCHMARK_SCENES } from "@/lib/benchmark";
import { generate } from "../actions";

const QUICK = BENCHMARK_SCENES.filter((s) => ["cafe_indoor", "beach_golden", "night_neon", "product_bottle", "selfie", "gym"].includes(s.key));

export function GenerateForm({
  personas, personasWithRefs, costs, initialPersona, initialScene,
}: { personas: Persona[]; personasWithRefs: string[]; costs: Record<string, number>; initialPersona: string; initialScene: string }) {
  const [personaId, setPersonaId] = useState(initialPersona);
  const [workflowId, setWorkflowId] = useState(WORKFLOWS[0].id);
  const [scene, setScene] = useState(initialScene.slice(0, 1500));
  const [negative, setNegative] = useState("");
  const [sizeId, setSizeId] = useState("portrait");
  const [count, setCount] = useState(1);
  const [seed, setSeed] = useState("");
  const [steps, setSteps] = useState("");
  const [cfg, setCfg] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const persona = personas.find((p) => p.id === personaId) ?? null;
  const wf = WORKFLOWS.find((w) => w.id === workflowId)!;
  const dims = sizeFor(wf, sizeId);
  const preview = useMemo(() => composePrompt(persona, scene || "…your scene…"), [persona, scene]);
  const missingRef = wf.needsReference && (!persona || !personasWithRefs.includes(persona.id));
  const credits = (costs[wf.kind] ?? 0) * count;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await generate({
        personaId: personaId || null, workflowId, scene, negative, sizeId, count,
        seed: seed ? Number(seed) : null, steps: steps ? Number(steps) : null, cfg: cfg ? Number(cfg) : null,
      });
      setMsg(r.ok ? { ok: true, text: r.message ?? "Queued." } : { ok: false, text: r.error });
    });
  };

  if (!personas.length) {
    return (
      <div className="max-w-lg rounded-xl border border-dashed border-line bg-paper p-8">
        <p className="text-lg">Create a persona first. Every shot in the studio is taken of one.</p>
        <Link href="/app/personas/new" className="btn btn-primary mt-5">Create a persona</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      <div>
        <span className="label">Persona</span>
        <div className="flex flex-wrap gap-2">
          {personas.map((p) => (
            <button type="button" key={p.id} onClick={() => setPersonaId(p.id)} aria-pressed={p.id === personaId}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${p.id === personaId ? "border-ink bg-ink text-paper" : "border-line bg-paper hover:border-ink"}`}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="scene">Scene</label>
        <textarea id="scene" rows={3} required minLength={3} maxLength={1500} className="field text-lg" value={scene}
          onChange={(e) => setScene(e.target.value)}
          placeholder="sitting on a terrace in Altea at sunset, sipping horchata, laughing at something off camera" />
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button type="button" key={q.key} onClick={() => setScene(q.prompt)} className="rounded-full bg-paper px-3 py-1 text-xs text-muted ring-1 ring-line hover:text-ink hover:ring-ink">
              {q.prompt.split(",")[0]}
            </button>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="label">Workflow</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {WORKFLOWS.map((w) => (
            <label key={w.id} className={`cursor-pointer rounded-lg border p-3 ${w.id === workflowId ? "border-accent bg-paper ring-1 ring-accent" : "border-line bg-paper/60 hover:border-ink"}`}>
              <input type="radio" name="workflow" value={w.id} checked={w.id === workflowId} onChange={() => setWorkflowId(w.id)} className="sr-only" />
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{w.label}</span>
                <span className="text-xs tabular-nums text-muted">{costs[w.kind] ?? "?"} cr</span>
              </span>
              <span className="mt-1 block text-sm text-muted">{w.hint}</span>
            </label>
          ))}
        </div>
        {missingRef && (
          <p className="mt-2 text-sm text-warn">
            {persona ? <>Add a reference photo to <Link className="underline" href={`/app/personas/${persona.id}`}>{persona.name}</Link> to use this workflow.</> : "Pick a persona."}
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-6">
        <fieldset>
          <legend className="label">Format</legend>
          <div className="flex flex-wrap gap-1 rounded-full border border-line bg-paper p-1 text-sm">
            {SIZES.map((s) => (
              <button type="button" key={s.id} onClick={() => setSizeId(s.id)} aria-pressed={s.id === sizeId}
                className={`rounded-full px-3 py-1 ${s.id === sizeId ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>{s.label}</button>
            ))}
          </div>
          <p className="mt-1 text-xs tabular-nums text-muted">{dims.width} × {dims.height} px</p>
        </fieldset>
        <fieldset>
          <legend className="label">Takes</legend>
          <div className="flex gap-1 rounded-full border border-line bg-paper p-1 text-sm">
            {[1, 2, 3, 4].map((n) => (
              <button type="button" key={n} onClick={() => setCount(n)} aria-pressed={n === count}
                className={`w-9 rounded-full py-1 tabular-nums ${n === count ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>{n}</button>
            ))}
          </div>
        </fieldset>
      </div>

      <details className="rounded-lg border border-line bg-paper p-4">
        <summary className="cursor-pointer font-semibold">Advanced</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="seed">Seed (blank = random)</label><input id="seed" inputMode="numeric" className="field" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))} /></div>
          <div><label className="label" htmlFor="steps">Steps ({wf.defaults.steps})</label><input id="steps" inputMode="numeric" className="field" value={steps} onChange={(e) => setSteps(e.target.value.replace(/\D/g, ""))} /></div>
          <div><label className="label" htmlFor="cfg">Guidance ({wf.defaults.cfg})</label><input id="cfg" inputMode="decimal" className="field" value={cfg} onChange={(e) => setCfg(e.target.value.replace(/[^\d.]/g, ""))} /></div>
          <div className="sm:col-span-3"><label className="label" htmlFor="neg">Avoid in this shot</label><input id="neg" className="field" value={negative} onChange={(e) => setNegative(e.target.value)} /></div>
        </div>
        <p className="mt-4 text-sm text-muted">Prompt sent to the generator:</p>
        <p className="mt-1 rounded bg-backdrop p-3 text-sm">{preview}</p>
      </details>

      <div className="flex flex-wrap items-center gap-4">
        <button className="btn btn-primary px-6 py-3 text-base" disabled={pending || missingRef || scene.trim().length < 3}>
          {pending ? "Queuing…" : count === 1 ? "Shoot" : `Shoot ${count} takes`}
        </button>
        <span className="text-sm tabular-nums text-muted">{credits} credit{credits === 1 ? "" : "s"}</span>
        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
