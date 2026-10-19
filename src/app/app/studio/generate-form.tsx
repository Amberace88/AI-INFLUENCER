"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { SIZES, WORKFLOWS, composePrompt, sizeFor, type Persona } from "@/lib/catalog";
import { BENCHMARK_SCENES } from "@/lib/benchmark";
import { generate } from "../actions";

const QUICK = BENCHMARK_SCENES.filter((s) => ["cafe_indoor", "beach_golden", "night_neon", "product_bottle", "selfie", "gym"].includes(s.key));

const Ratio = ({ w, h, on }: { w: number; h: number; on: boolean }) => {
  const k = 16 / Math.max(w, h);
  return <span aria-hidden className={`inline-block rounded-[2px] border-[1.5px] ${on ? "border-paper" : "border-current"}`} style={{ width: w * k, height: h * k }} />;
};

function Face({ url, name, size = 28 }: { url?: string; name: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-backdrop text-xs font-bold text-muted" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="h-full w-full object-cover object-top" /> : name[0]}
    </span>
  );
}

export function GenerateForm({
  personas, personasWithRefs, costs, initialPersona, initialScene, avatars = {},
}: { personas: Persona[]; personasWithRefs: string[]; costs: Record<string, number>; initialPersona: string; initialScene: string; avatars?: Record<string, string> }) {
  const [personaId, setPersonaId] = useState(initialPersona);
  const hasRefs = (id: string) => personasWithRefs.includes(id);
  const bestWorkflow = (id: string) => (hasRefs(id) ? "cf_klein_ref" : "cf_klein_text");
  const [workflowId, setWorkflowId] = useState(bestWorkflow(initialPersona));
  const [realism, setRealism] = useState(true);
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
  const preview = useMemo(() => composePrompt(persona, scene || "…your scene…", realism, wf.needsReference), [persona, scene, realism, wf.needsReference]);
  const missingRef = wf.needsReference && (!persona || !personasWithRefs.includes(persona.id));
  const credits = (costs[wf.kind] ?? 0) * count;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await generate({
        personaId: personaId || null, workflowId, scene, negative, sizeId, count,
        seed: seed ? Number(seed) : null, steps: steps ? Number(steps) : null, cfg: cfg ? Number(cfg) : null, realism,
      });
      setMsg(r.ok ? { ok: true, text: r.message ?? "Queued." } : { ok: false, text: r.error });
    });
  };

  const WorkflowCard = ({ w }: { w: (typeof WORKFLOWS)[number] }) => {
    const blocked = w.needsReference && (!persona || !hasRefs(persona.id));
    return (
      <label className={`relative cursor-pointer rounded-xl p-3.5 transition-shadow ${w.id === workflowId ? "bg-paper ring-2 ring-accent" : "bg-paper/60 ring-1 ring-line hover:ring-ink"}`}>
        <input type="radio" name="workflow" value={w.id} checked={w.id === workflowId} onChange={() => setWorkflowId(w.id)} className="sr-only" />
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{w.label}</span>
          <span className="whitespace-nowrap text-xs tabular-nums text-muted">{costs[w.kind] ?? "?"} cr</span>
        </span>
        <span className="mt-1 block text-sm text-muted">{w.hint}</span>
        {blocked && <span className="mt-1 block text-xs text-warn">Needs a reference photo</span>}
      </label>
    );
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
        <span className="mb-2 block font-semibold">Who</span>
        <div className="flex flex-wrap gap-2">
          {personas.map((p) => (
            <button type="button" key={p.id} onClick={() => { setPersonaId(p.id); setWorkflowId(bestWorkflow(p.id)); }} aria-pressed={p.id === personaId}
              className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-4 text-sm font-semibold transition-colors ${p.id === personaId ? "bg-ink text-paper" : "bg-paper ring-1 ring-line hover:ring-ink"}`}>
              <Face url={avatars[p.id]} name={p.name} />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block font-semibold" htmlFor="scene">Scene</label>
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
        <legend className="mb-2 font-semibold">How to shoot</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {WORKFLOWS.filter((w) => w.primary).map((w) => <WorkflowCard key={w.id} w={w} />)}
        </div>
        <details className="mt-2" open={!WORKFLOWS.find((w) => w.id === workflowId)?.primary}>
          <summary className="cursor-pointer text-sm text-muted hover:text-ink">More engines (test models, ComfyUI, fal.ai)</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {WORKFLOWS.filter((w) => !w.primary).map((w) => <WorkflowCard key={w.id} w={w} />)}
          </div>
        </details>
        {missingRef && (
          <p className="mt-2 text-sm text-warn">
            {persona ? <>{persona.name} has no reference photo yet. Shoot a portrait with &ldquo;Photo from description&rdquo;, then open it in the{" "}
              <Link className="underline" href="/app/sheet">contact sheet</Link> and choose &ldquo;Use as reference&rdquo;, or{" "}
              <Link className="underline" href={`/app/personas/${persona.id}`}>upload photos</Link>.</> : "Pick a persona."}
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-6">
        <fieldset>
          <legend className="mb-2 font-semibold">Format</legend>
          <div className={`flex flex-wrap gap-1 rounded-2xl bg-paper p-1 text-sm ring-1 ring-line ${wf.squareOnly ? "pointer-events-none opacity-40" : ""}`}>
            {SIZES.map((s) => (
              <button type="button" key={s.id} onClick={() => setSizeId(s.id)} aria-pressed={s.id === sizeId} disabled={wf.squareOnly}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 ${s.id === sizeId ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>
                <Ratio w={s.w} h={s.h} on={s.id === sizeId} />{s.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs tabular-nums text-muted">{wf.squareOnly ? "Quick sketch is always square, 1024 × 1024 px" : `${dims.width} × ${dims.height} px`}</p>
        </fieldset>
        <fieldset>
          <legend className="mb-2 font-semibold">Takes</legend>
          <div className="flex gap-1 rounded-2xl bg-paper p-1 text-sm ring-1 ring-line">
            {[1, 2, 3, 4].map((n) => (
              <button type="button" key={n} onClick={() => setCount(n)} aria-pressed={n === count}
                className={`w-10 rounded-xl py-2 tabular-nums ${n === count ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>{n}</button>
            ))}
          </div>
        </fieldset>
      </div>

      <details className="rounded-2xl bg-paper p-4 ring-1 ring-line">
        <summary className="cursor-pointer font-semibold">Advanced <span className="font-normal text-muted">natural look, seed, what to avoid, full prompt</span></summary>
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input type="checkbox" checked={realism} onChange={(e) => setRealism(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span><span className="font-semibold">Natural photo look</span> <span className="text-muted">(recommended): candid expression, real skin texture, no stock-photo poses</span></span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="seed">Seed (blank = random)</label><input id="seed" inputMode="numeric" className="field" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))} /></div>
          <div><label className="label" htmlFor="steps">Steps ({wf.defaults.steps})</label><input id="steps" inputMode="numeric" className="field" value={steps} onChange={(e) => setSteps(e.target.value.replace(/\D/g, ""))} /></div>
          <div><label className="label" htmlFor="cfg">Guidance ({wf.defaults.cfg})</label><input id="cfg" inputMode="decimal" className="field" value={cfg} onChange={(e) => setCfg(e.target.value.replace(/[^\d.]/g, ""))} /></div>
          <div className="sm:col-span-3"><label className="label" htmlFor="neg">Avoid in this shot</label><input id="neg" className="field" value={negative} onChange={(e) => setNegative(e.target.value)} /></div>
        </div>
        <p className="mt-4 text-sm text-muted">Prompt sent to the generator:</p>
        <p className="mt-1 rounded bg-backdrop p-3 text-sm">{preview}</p>
      </details>

      {/* The slate: what is about to be shot, always in reach */}
      <div className="sticky bottom-4 z-10 rounded-2xl bg-ink p-2.5 text-paper shadow-[0_20px_50px_-20px_rgba(23,32,43,.85)]">
        <div className="flex flex-wrap items-center gap-3">
          {persona && <Face url={avatars[persona.id]} name={persona.name} size={40} />}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold">{persona?.name ?? "No persona"}<span className="font-normal text-white/60"> in “{scene.trim() ? scene.trim().slice(0, 60) + (scene.trim().length > 60 ? "…" : "") : "no scene yet"}”</span></p>
            <p className="truncate text-xs text-white/60">{wf.label}, {wf.squareOnly ? "1:1" : SIZES.find((x) => x.id === sizeId)?.label.split(" ")[1]}, {count} take{count === 1 ? "" : "s"}</p>
          </div>
          <span className="text-sm tabular-nums text-safelight">{credits} credit{credits === 1 ? "" : "s"}</span>
          <button className="btn btn-primary px-6 py-3 text-base" disabled={pending || missingRef || scene.trim().length < 3}>
            {pending ? "Queuing…" : count === 1 ? "Shoot" : `Shoot ${count} takes`}
          </button>
        </div>
        {msg && <p role="status" className={`px-2 pb-1 pt-2 text-sm ${msg.ok ? "text-[#8fe0b7]" : "text-[#ff9b8f]"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
