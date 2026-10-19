import { requireUser } from "@/lib/supabase/server";
import { WORKFLOWS, workflowById } from "@/lib/catalog";

type Row = {
  id: string; status: string; workflow: string; provider: string; attempts: number; duration_ms: number | null;
  provider_cost_usd: number | null; error: string | null; queued_at: string; started_at: string | null; credits_charged: number; credits_refunded: boolean;
};

function pct(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}
const secs = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);

export default async function JobsPage() {
  const { supabase, user } = await requireUser();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: jobs }, { data: assets }] = await Promise.all([
    supabase.from("jobs")
      .select("id, status, workflow, provider, attempts, duration_ms, provider_cost_usd, error, queued_at, started_at, credits_charged, credits_refunded")
      .eq("owner_id", user.id).gte("queued_at", since).order("queued_at", { ascending: false }).limit(2000),
    supabase.from("assets").select("job_id, review_status").eq("owner_id", user.id).gte("created_at", since).limit(5000),
  ]);
  const rows = (jobs ?? []) as Row[];
  const reviewByJob = new Map((assets ?? []).map((a) => [a.job_id, a.review_status]));

  const stats = (list: Row[]) => {
    const finished = list.filter((j) => j.status === "succeeded" || j.status === "failed");
    const ok = list.filter((j) => j.status === "succeeded");
    const durations = ok.map((j) => j.duration_ms ?? 0).sort((a, b) => a - b);
    const reviewed = ok.filter((j) => reviewByJob.get(j.id) && reviewByJob.get(j.id) !== "pending");
    const accepted = ok.filter((j) => reviewByJob.get(j.id) === "accepted");
    const cost = ok.reduce((s, j) => s + Number(j.provider_cost_usd ?? 0), 0);
    return {
      total: list.length,
      success: finished.length ? ok.length / finished.length : null,
      p50: pct(durations, 50),
      p90: pct(durations, 90),
      retries: finished.length ? finished.reduce((s, j) => s + Math.max(0, j.attempts - 1), 0) / finished.length : null,
      acceptRate: reviewed.length ? accepted.length / reviewed.length : null,
      reviewed: reviewed.length,
      accepted: accepted.length,
      cost,
      costPerAccepted: accepted.length ? cost / accepted.length : null,
    };
  };

  const all = stats(rows);
  const perWorkflow = WORKFLOWS.map((w) => ({ w, s: stats(rows.filter((r) => r.workflow === w.id)) })).filter((x) => x.s.total);
  const failures = rows.filter((r) => r.status === "failed").slice(0, 15);
  const fmtPct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);

  const tiles: [string, string, string][] = [
    ["Jobs, last 30 days", String(all.total), ""],
    ["Succeeded", fmtPct(all.success), "of finished jobs"],
    ["Median time", secs(all.p50), `90% under ${secs(all.p90)}`],
    ["Kept", fmtPct(all.acceptRate), `${all.accepted} of ${all.reviewed} reviewed`],
    ["Cost per kept frame", all.costPerAccepted == null ? "–" : `$${all.costPerAccepted.toFixed(3)}`, `$${all.cost.toFixed(2)} cloud spend`],
  ];

  return (
    <div className="max-w-6xl">
      <h1 className="condensed text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold">Jobs & metrics</h1>
      <p className="mt-2 max-w-2xl text-muted">
        What a usable frame really costs: failed runs and retries count. Local ComfyUI runs show as $0; add your Mac&apos;s time when comparing with cloud.
      </p>

      <dl className="mt-8 grid gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map(([k, v, sub]) => (
          <div key={k} className="bg-paper p-4">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="mt-1 text-3xl font-bold tabular-nums">{v}</dd>
            {sub && <dd className="text-xs text-muted">{sub}</dd>}
          </div>
        ))}
      </dl>

      <h2 className="mt-12 text-2xl font-bold">By workflow</h2>
      {perWorkflow.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm tabular-nums">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                {["Workflow", "Jobs", "Succeeded", "Median", "p90", "Retries/job", "Kept", "Cost/kept"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {perWorkflow.map(({ w, s }) => (
                <tr key={w.id} className="border-b border-line/70">
                  <td className="py-2 pr-4 font-semibold">{w.label}</td>
                  <td className="py-2 pr-4">{s.total}</td>
                  <td className="py-2 pr-4">{fmtPct(s.success)}</td>
                  <td className="py-2 pr-4">{secs(s.p50)}</td>
                  <td className="py-2 pr-4">{secs(s.p90)}</td>
                  <td className="py-2 pr-4">{s.retries == null ? "–" : s.retries.toFixed(2)}</td>
                  <td className="py-2 pr-4">{fmtPct(s.acceptRate)}</td>
                  <td className="py-2 pr-4">{s.costPerAccepted == null ? (w.provider === "comfyui" ? "local" : "–") : `$${s.costPerAccepted.toFixed(3)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-muted">No jobs yet.</p>
      )}

      <h2 className="mt-12 text-2xl font-bold">Recent failures</h2>
      {failures.length ? (
        <ul className="mt-4 space-y-2 text-sm">
          {failures.map((f) => (
            <li key={f.id} className="rounded-lg bg-paper p-3 ring-1 ring-line">
              <div className="flex justify-between gap-3 text-xs text-muted">
                <span>{workflowById(f.workflow)?.label ?? f.workflow} · {f.attempts} attempt{f.attempts === 1 ? "" : "s"}{f.credits_refunded ? " · credits returned" : ""}</span>
                <time>{new Date(f.queued_at).toLocaleString()}</time>
              </div>
              <p className="mt-1 break-words text-bad">{f.error}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-muted">None in the last 30 days.</p>
      )}
    </div>
  );
}
