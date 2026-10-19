import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { SCORE_CRITERIA, workflowById, type Persona } from "@/lib/catalog";
import { BENCHMARK_SCENES } from "@/lib/benchmark";
import { PersonaForm } from "../persona-form";
import { References } from "./references";
import { BenchmarkLauncher } from "./benchmark-launcher";
import { deletePersona } from "../../actions";

export default async function PersonaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: persona } = await supabase.from("personas").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
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

  const notice =
    sp.created === "twin"
      ? "Your digital twin is ready. Open the Studio and choose “Same face, new scene”: every shot uses your photos as the face reference."
      : sp.created === "ai"
        ? `${persona.name} is ready. Read the profile and change anything that does not fit, then shoot a first portrait.`
        : null;
  const rules: [string, string | null][] = [["Always", persona.dos], ["Never", persona.donts]];

  return (
    <div className="space-y-14">
      {notice && <p role="status" className="panel-in rounded-xl bg-ok/10 p-4 text-sm text-ok ring-1 ring-ok/30">{notice}</p>}

      {persona.bio || persona.voice ? (
        <section aria-labelledby="words" className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 id="words" className="text-sm text-muted">In their own words</h2>
            <blockquote className="mt-3 border-l-[3px] border-accent pl-5 text-[1.35rem] leading-relaxed text-ink">{persona.bio}</blockquote>
          </div>
          <dl className="space-y-5 text-sm">
            {persona.voice && <div><dt className="text-xs text-muted">How they write</dt><dd className="mt-1 leading-relaxed">{persona.voice}</dd></div>}
            {!!persona.topics?.length && (
              <div>
                <dt className="text-xs text-muted">Talks about</dt>
                <dd className="mt-2 flex flex-wrap gap-1.5">{persona.topics.map((t: string) => <span key={t} className="rounded-full bg-paper px-2.5 py-1 ring-1 ring-line">{t}</span>)}</dd>
              </div>
            )}
            {persona.audience && <div><dt className="text-xs text-muted">Who follows them</dt><dd className="mt-1 leading-relaxed">{persona.audience}</dd></div>}
          </dl>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-line p-6">
          <h2 className="text-xl font-bold">{persona.name} has no voice yet</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">Fill in the bio and how they write under “Edit the passport”, so every post sounds like the same person.</p>
        </section>
      )}

      {rules.some(([, v]) => v) && (
        <section aria-label="House rules" className="grid gap-4 md:grid-cols-2">
          {rules.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className={`rounded-2xl p-5 ring-1 ${k === "Never" ? "bg-bad/[.04] ring-bad/20" : "bg-ok/[.05] ring-ok/20"}`}>
              <h3 className={`text-sm font-semibold ${k === "Never" ? "text-bad" : "text-ok"}`}>{k}</h3>
              <p className="mt-2 text-sm leading-relaxed">{v}</p>
            </div>
          ))}
        </section>
      )}

      <References
        personaId={id}
        refs={(refs ?? []).map((r, i) => ({ id: r.id, isPrimary: r.is_primary, url: signed[i]?.signedUrl ?? "" }))}
      />

      <details className="group rounded-2xl bg-paper ring-1 ring-line" open={!persona.bio || sp.created === "ai"}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 md:p-6 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-xl font-bold">Edit the passport</span>
            <span className="text-sm text-muted">Name, character, appearance and photo style. Appearance is added to every photo prompt.</span>
          </span>
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full ring-1 ring-line transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="border-t border-line p-5 md:p-6">
          <PersonaForm persona={persona as Persona} />
        </div>
      </details>

      <details className="group rounded-2xl ring-1 ring-line">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 md:p-6 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-xl font-bold">Consistency test</span>
            <span className="text-sm text-muted">Shoot {persona.name} in {BENCHMARK_SCENES.length} fixed scenes to compare engines fairly.{runs?.length ? ` ${runs.length} run${runs.length === 1 ? "" : "s"} so far.` : ""}</span>
          </span>
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full ring-1 ring-line transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="border-t border-line p-5 md:p-6">
          <p className="max-w-[64ch] text-sm text-muted">Each run uses the same scenes and seeds. Score the frames on the contact sheet; the averages appear in this table.</p>
          <BenchmarkLauncher personaId={id} />
          {!!runs?.length && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-3 font-medium">Run</th>
                    <th className="py-2 pr-3 font-medium">Frames</th>
                    <th className="py-2 pr-3 font-medium">Kept</th>
                    {SCORE_CRITERIA.slice(0, 6).map((c) => <th key={c.key} className="py-2 pr-3 font-medium">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {runs.map((r) => {
                    const s = summary(r.id);
                    return (
                      <tr key={r.id} className="border-b border-line/70">
                        <td className="py-2 pr-3">
                          <Link className="font-semibold hover:text-accent" href={`/app/sheet?run=${r.id}`}>{workflowById(r.workflow)?.label ?? r.workflow}</Link>
                          <div className="text-xs text-muted">{new Date(r.created_at).toLocaleString("en-GB")}</div>
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
        </div>
      </details>

      <form action={deletePersona.bind(null, id)} className="border-t border-line pt-6">
        <button className="text-sm text-muted hover:text-bad hover:underline">Delete {persona.name} and all reference photos</button>
      </form>
    </div>
  );
}
