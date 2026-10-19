import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { ROLES, SCORE_CRITERIA, workflowById, type Persona } from "@/lib/catalog";
import { PersonaTabs } from "./tabs";
import { BENCHMARK_SCENES } from "@/lib/benchmark";
import { PersonaForm } from "../persona-form";
import { References } from "./references";
import { BenchmarkLauncher } from "./benchmark-launcher";
import { deletePersona } from "../../actions";

export default async function PersonaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { data: persona } = await supabase.from("personas").select("*").eq("id", id).maybeSingle();
  if (!persona) notFound();

  const { data: refs } = await supabase
    .from("persona_references").select("id, storage_path, is_primary")
    .eq("persona_id", id).order("is_primary", { ascending: false }).order("created_at");
  const signed = refs?.length
    ? (await supabase.storage.from("references").createSignedUrls(refs.map((r) => r.storage_path), 3600)).data ?? []
    : [];

  const { data: runs } = await supabase
    .from("benchmark_runs").select("id, name, workflow, created_at").eq("persona_id", id).order("created_at", { ascending: false });
  const runIds = (runs ?? []).map((r) => r.id);
  const { data: runJobs } = runIds.length
    ? await supabase.from("jobs").select("id, benchmark_run_id, status, duration_ms").in("benchmark_run_id", runIds)
    : { data: [] as { id: string; benchmark_run_id: string; status: string; duration_ms: number | null }[] };
  const jobIds = (runJobs ?? []).map((j) => j.id);
  const { data: runAssets } = jobIds.length
    ? await supabase.from("assets").select("job_id, review_status, scores").in("job_id", jobIds)
    : { data: [] as { job_id: string; review_status: string; scores: Record<string, number> }[] };

  const summary = (runId: string) => {
    const jobs = (runJobs ?? []).filter((j) => j.benchmark_run_id === runId);
    const ids = new Set(jobs.map((j) => j.id));
    const assets = (runAssets ?? []).filter((a) => ids.has(a.job_id));
    const scored = assets.filter((a) => Object.keys(a.scores ?? {}).length);
    const avg = (k: string) => {
      const v = scored.map((a) => a.scores?.[k]).filter((x): x is number => typeof x === "number");
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
    };
    return {
      done: jobs.filter((j) => j.status === "succeeded").length,
      failed: jobs.filter((j) => j.status === "failed").length,
      total: jobs.length,
      accepted: assets.filter((a) => a.review_status === "accepted").length,
      scored: scored.length,
      avg: Object.fromEntries(SCORE_CRITERIA.map((c) => [c.key, avg(c.key)])),
    };
  };

  return (
    <div className="max-w-5xl space-y-14">
      <div>
        <Link href="/app/personas" className="text-sm text-muted hover:text-ink">Personas</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-5xl font-extrabold">{persona.name}</h1>
          <Link href={`/app/studio?persona=${id}`} className="btn btn-primary">Shoot with {persona.name}</Link>
        </div>
        <p className="mt-2 text-muted">
          {ROLES.find((r) => r.id === persona.role)?.label ?? "Influencer"}
          {persona.brand_name ? ` for ${persona.brand_name}` : ""}
          {persona.tagline ? `. ${persona.tagline}` : ""}
        </p>
        <PersonaTabs id={id} />
        {sp.created === "twin" && (
          <p role="status" className="mt-4 rounded-lg bg-paper p-3 text-sm ring-1 ring-ok/40">
            Your digital twin is ready. Open the Studio and choose &ldquo;Same face, new scene&rdquo;: every shot uses your photos as the face reference.
          </p>
        )}
        {persona.likeness === "self" && <p className="mt-2 inline-block rounded bg-ink px-2 py-0.5 text-xs font-semibold text-[#e6c86e]">Digital twin of you · consent on file</p>}
        {sp.created === "ai" && (
          <p role="status" className="mt-4 rounded-lg bg-paper p-3 text-sm ring-1 ring-ok/40">
            {persona.name} is ready. Read the profile below and change anything that does not fit, then add a reference photo or shoot a first portrait.
          </p>
        )}
      </div>

      {(persona.bio || persona.voice) && (
        <section className="grid gap-6 rounded-xl bg-paper p-6 ring-1 ring-line md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-sm text-muted">In their words</h2>
            <p className="mt-2 text-xl leading-relaxed">{persona.bio}</p>
          </div>
          <dl className="space-y-3 text-sm">
            {persona.voice && (<div><dt className="text-muted">Voice</dt><dd>{persona.voice}</dd></div>)}
            {!!persona.topics?.length && (
              <div><dt className="text-muted">Talks about</dt>
                <dd className="mt-1 flex flex-wrap gap-1">{persona.topics.map((t: string) => <span key={t} className="rounded-full bg-backdrop px-2 py-0.5">{t}</span>)}</dd>
              </div>
            )}
            {persona.audience && (<div><dt className="text-muted">Audience</dt><dd>{persona.audience}</dd></div>)}
          </dl>
        </section>
      )}

      <References
        personaId={id}
        refs={(refs ?? []).map((r, i) => ({ id: r.id, isPrimary: r.is_primary, url: signed[i]?.signedUrl ?? "" }))}
      />

      <section>
        <h2 className="text-2xl font-bold">Consistency benchmark</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Shoots {persona.name} in {BENCHMARK_SCENES.length} fixed scenes with fixed seeds, so you can compare workflows fairly.
          Score each frame on the contact sheet; averages appear here.
        </p>
        <BenchmarkLauncher personaId={id} />
        {!!runs?.length && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Run</th>
                  <th className="py-2 pr-3 font-medium">Frames</th>
                  <th className="py-2 pr-3 font-medium">Accepted</th>
                  {SCORE_CRITERIA.slice(0, 6).map((c) => <th key={c.key} className="py-2 pr-3 font-medium">{c.label}</th>)}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {runs.map((r) => {
                  const s = summary(r.id);
                  return (
                    <tr key={r.id} className="border-b border-line/70">
                      <td className="py-2 pr-3">
                        <Link className="font-semibold hover:text-accent" href={`/app/sheet?run=${r.id}`}>
                          {workflowById(r.workflow)?.label ?? r.workflow}
                        </Link>
                        <div className="text-xs text-muted">{new Date(r.created_at).toLocaleString()}</div>
                      </td>
                      <td className="py-2 pr-3">{s.done}/{s.total}{s.failed ? <span className="text-bad"> ({s.failed} failed)</span> : null}</td>
                      <td className="py-2 pr-3">{s.accepted}</td>
                      {SCORE_CRITERIA.slice(0, 6).map((c) => (
                        <td key={c.key} className="py-2 pr-3">{s.avg[c.key] != null ? s.avg[c.key]!.toFixed(1) : "–"}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-bold">Profile</h2>
        <PersonaForm persona={persona as Persona} />
      </section>

      <form action={deletePersona.bind(null, id)} className="border-t border-line pt-6">
        <button className="text-sm text-bad hover:underline">Delete {persona.name} and all reference photos</button>
      </form>
    </div>
  );
}
