"use client";

import { useState, useTransition } from "react";
import { WORKFLOWS } from "@/lib/catalog";
import { BENCHMARK_SCENES } from "@/lib/benchmark";
import { runBenchmark } from "../../actions";

export function BenchmarkLauncher({ personaId }: { personaId: string }) {
  const [wf, setWf] = useState(WORKFLOWS[0].id);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="bench-wf">Workflow to test</label>
        <select id="bench-wf" className="field" value={wf} onChange={(e) => setWf(e.target.value)}>
          {WORKFLOWS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </div>
      <button
        className="btn btn-ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await runBenchmark(personaId, wf);
            setMsg(r.ok ? { ok: true, text: r.message ?? "Queued." } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? "Queuing…" : `Run ${BENCHMARK_SCENES.length}-scene benchmark`}
      </button>
      {msg && <p role="status" className={`w-full text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
