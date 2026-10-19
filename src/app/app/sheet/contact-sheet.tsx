"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SCORE_CRITERIA, workflowById } from "@/lib/catalog";
import { reportDefect, reviewAsset, setAssetAsReference } from "../actions";

export type SheetAsset = {
  id: string;
  storage_path: string;
  url?: string;
  width: number | null;
  height: number | null;
  review_status: "pending" | "accepted" | "rejected";
  scores: Record<string, number>;
  notes: string | null;
  created_at: string;
  persona_id: string | null;
  job: {
    id: string; prompt: string; negative_prompt: string; workflow: string; provider: string;
    params: { seed?: number; scene?: string; steps?: number; cfg?: number; checkpoint?: string; model?: string };
    duration_ms: number | null; attempts: number; provider_cost_usd: number | null; scene_key: string | null; benchmark_run_id: string | null;
  } | null;
};

export function ContactSheet({ assets: initial, personaNames }: { assets: SheetAsset[]; personaNames: Record<string, string> }) {
  const [assets, setAssets] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => setAssets(initial), [initial]);
  const total = assets.length;
  const update = (id: string, patch: Partial<SheetAsset>) => setAssets((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const idx = assets.findIndex((a) => a.id === openId);

  return (
    <>
      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {assets.map((a, i) => (
          <li key={a.id}>
            <button onClick={() => setOpenId(a.id)} className="frame block w-full text-left" aria-label={`Open frame ${total - i}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.job?.params?.scene ?? ""} loading="lazy"
                className={`aspect-[2/3] w-full rounded-[2px] object-cover ${a.review_status === "rejected" ? "opacity-40 grayscale" : ""}`} />
              <span className="frame-no">
                {String(total - i).padStart(3, "0")} {a.persona_id ? personaNames[a.persona_id] ?? "" : ""}
              </span>
              {a.review_status !== "pending" && (
                <span className={`stamp ${a.review_status === "accepted" ? "text-ok" : "text-bad"}`}>
                  {a.review_status === "accepted" ? "KEEP" : "NO"}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {idx >= 0 && (
        <Review
          key={assets[idx].id}
          asset={assets[idx]}
          frameNo={total - idx}
          onClose={() => setOpenId(null)}
          onPrev={idx > 0 ? () => setOpenId(assets[idx - 1].id) : undefined}
          onNext={idx < total - 1 ? () => setOpenId(assets[idx + 1].id) : undefined}
          onChange={(p) => update(assets[idx].id, p)}
          personaName={assets[idx].persona_id ? personaNames[assets[idx].persona_id!] : undefined}
        />
      )}
    </>
  );
}

function Review({ asset, frameNo, onClose, onPrev, onNext, onChange, personaName }: {
  asset: SheetAsset; frameNo: number; onClose: () => void; onPrev?: () => void; onNext?: () => void;
  onChange: (p: Partial<SheetAsset>) => void; personaName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [scores, setScores] = useState<Record<string, number>>(asset.scores ?? {});
  const [notes, setNotes] = useState(asset.notes ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [refMsg, setRefMsg] = useState("");

  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
      if (e.key === "a") save("accepted");
      if (e.key === "r") save("rejected");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const save = (review_status?: SheetAsset["review_status"]) => {
    const patch = { ...(review_status ? { review_status } : {}), scores, notes };
    onChange(patch);
    start(async () => {
      const r = await reviewAsset(asset.id, patch);
      setErr(r.ok ? "" : r.error);
    });
  };

  const j = asset.job;
  const meta: [string, string][] = [
    ["Workflow", j ? workflowById(j.workflow)?.label ?? j.workflow : "–"],
    ["Model", String(j?.params?.checkpoint ?? j?.params?.model ?? "–")],
    ["Seed", String(j?.params?.seed ?? "–")],
    ["Size", asset.width ? `${asset.width} × ${asset.height}` : "–"],
    ["Time", j?.duration_ms ? `${(j.duration_ms / 1000).toFixed(1)} s` : "–"],
    ["Attempts", String(j?.attempts ?? "–")],
    ["Cost", j?.provider_cost_usd != null ? `$${Number(j.provider_cost_usd).toFixed(3)}` : j?.provider === "comfyui" ? "local" : "–"],
  ];
  if (j?.scene_key) meta.push(["Benchmark scene", j.scene_key]);
  const qa = (j?.params as { qa?: { verdict: string; reason: string } } | undefined)?.qa;
  if (qa) meta.push(["Quality check", qa.verdict === "pass" ? "passed" : qa.verdict === "skipped" ? "not run" : qa.reason]);

  return (
    <dialog ref={ref} onClose={onClose} className="m-auto max-h-[94dvh] w-[min(1100px,96vw)] overflow-hidden rounded-xl bg-paper p-0 text-ink backdrop:bg-ink/70">
      <div className="grid max-h-[94dvh] md:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative grid place-items-center bg-ink p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.url} alt={j?.params?.scene ?? ""} className="max-h-[60dvh] w-auto rounded-[2px] object-contain md:max-h-[88dvh]" />
          <span className="absolute bottom-2 left-3 text-xs tabular-nums text-[#e6c86e]">Frame {String(frameNo).padStart(3, "0")}</span>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-bold">{personaName ?? "Frame"} </h2>
            <button onClick={() => ref.current?.close()} className="text-muted hover:text-ink" aria-label="Close">Close</button>
          </div>
          <p className="mt-2 text-sm">{j?.params?.scene || j?.prompt}</p>

          <div className="mt-4 flex gap-2">
            <button disabled={pending} onClick={() => save("accepted")}
              className={`btn flex-1 ${asset.review_status === "accepted" ? "bg-ok text-white" : "btn-ghost"}`}>Keep</button>
            <button disabled={pending} onClick={() => save("rejected")}
              className={`btn flex-1 ${asset.review_status === "rejected" ? "bg-bad text-white" : "btn-ghost"}`}>Reject</button>
          </div>
          <p className="mt-1 text-xs text-muted">Keys: A keep, R reject, arrows to move.</p>

          <fieldset className="mt-5">
            <legend className="font-semibold">Scores</legend>
            <div className="mt-2 space-y-2">
              {SCORE_CRITERIA.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                  <span>{c.label}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label={c.label}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} role="radio" aria-checked={scores[c.key] === n}
                        onClick={() => setScores((s) => { const next = { ...s }; if (next[c.key] === n) delete next[c.key]; else next[c.key] = n; return next; })}
                        className={`size-7 rounded-full text-xs tabular-nums ${scores[c.key] === n ? "bg-accent text-white" : scores[c.key] && scores[c.key] > n ? "bg-accent/25" : "bg-backdrop text-muted hover:text-ink"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <label className="label mt-4" htmlFor="notes">Notes</label>
          <textarea id="notes" rows={2} className="field text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Jawline drifts, earrings missing…" />
          <div className="mt-3 flex items-center gap-3">
            <button className="btn btn-primary" disabled={pending} onClick={() => save()}>Save scores</button>
            <a href={asset.url} download target="_blank" rel="noreferrer" className="btn btn-ghost">Download</a>
          </div>
          {asset.persona_id && (
            <button className="btn btn-ghost mt-3 w-full" disabled={pending}
              onClick={() => start(async () => {
                const r = await setAssetAsReference(asset.id);
                if (r.ok) onChange({ review_status: "accepted" });
                setErr(r.ok ? "" : r.error);
                setRefMsg(r.ok ? r.message ?? "Saved" : "");
              })}>
              Use as {personaName ?? "persona"}&apos;s face reference
            </button>
          )}
          {refMsg && <p className="mt-2 text-sm text-ok">{refMsg}</p>}
          <details className="mt-3 rounded-lg border border-line p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-bad">Report a defect</summary>
            <p className="mt-2 text-muted">Extra limbs, broken hands or a melted face? Report it and the credits for this frame come back.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {["Extra arms or hands", "Broken fingers", "Distorted face", "Wrong person"].map((r) => (
                <button key={r} className="btn btn-ghost py-1 text-xs" disabled={pending}
                  onClick={() => start(async () => {
                    const res = await reportDefect(asset.id, r);
                    if (res.ok) onChange({ review_status: "rejected" });
                    setErr(res.ok ? "" : res.error);
                    setRefMsg(res.ok ? res.message ?? "" : "");
                  })}>{r}</button>
              ))}
            </div>
          </details>
          {err && <p className="mt-2 text-sm text-bad">{err}</p>}

          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-4 text-xs">
            {meta.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="truncate tabular-nums" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted">Full prompt</summary>
            <p className="mt-2 rounded bg-backdrop p-2">{j?.prompt}</p>
            {j?.negative_prompt && <p className="mt-1 rounded bg-backdrop p-2 text-muted">Avoid: {j.negative_prompt}</p>}
          </details>
          <div className="mt-5 flex justify-between text-sm">
            <button disabled={!onPrev} onClick={onPrev} className="text-muted hover:text-ink disabled:opacity-30">Newer</button>
            <button disabled={!onNext} onClick={onNext} className="text-muted hover:text-ink disabled:opacity-30">Older</button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
