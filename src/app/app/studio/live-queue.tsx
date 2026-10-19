"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { workflowById } from "@/lib/catalog";
import { cancelJob } from "../actions";

export type QueueJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  progress: number | null;
  prompt: string;
  workflow: string;
  provider: string;
  params: { scene?: string; seed?: number; width?: number; height?: number };
  error: string | null;
  attempts: number;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  persona_id: string | null;
};

const COLUMNS = "id, status, progress, prompt, workflow, provider, params, error, attempts, queued_at, started_at, finished_at, duration_ms, persona_id";

const STATUS: Record<QueueJob["status"], { label: string; cls: string }> = {
  queued: { label: "Waiting for the worker", cls: "text-muted" },
  running: { label: "Shooting", cls: "text-accent" },
  succeeded: { label: "Done", cls: "text-ok" },
  failed: { label: "Failed", cls: "text-bad" },
  canceled: { label: "Cancelled", cls: "text-muted" },
};

export function LiveQueue({ userId, initial, personaNames }: { userId: string; initial: QueueJob[]; personaNames: Record<string, string> }) {
  const [jobs, setJobs] = useState(initial);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const known = useRef(new Map(initial.map((j) => [j.id, j.status])));

  const loadThumbs = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const supabase = createClient();
    const { data } = await supabase.from("assets").select("job_id, storage_path").in("job_id", ids);
    const assets = data as { job_id: string; storage_path: string }[] | null;
    if (!assets?.length) return;
    const { data: signed } = await supabase.storage.from("outputs").createSignedUrls(assets.map((a) => a.storage_path), 3600) as { data: { signedUrl: string }[] | null };
    setThumbs((t) => {
      const next = { ...t };
      assets.forEach((a, i) => { if (signed?.[i]?.signedUrl && !next[a.job_id]) next[a.job_id] = signed[i].signedUrl; });
      return next;
    });
  }, []);

  // keep in sync with props after server revalidation (new jobs queued from the form)
  useEffect(() => {
    setJobs((cur) => {
      const map = new Map(cur.map((j) => [j.id, j]));
      for (const j of initial) if (!map.has(j.id)) map.set(j.id, j);
      return [...map.values()].sort((a, b) => b.queued_at.localeCompare(a.queued_at)).slice(0, 40);
    });
  }, [initial]);

  useEffect(() => {
    void loadThumbs(initial.filter((j) => j.status === "succeeded").map((j) => j.id));
  }, [initial, loadThumbs]);

  useEffect(() => {
    const supabase = createClient();
    const refresh = async () => {
      const { data } = await supabase.from("jobs").select(COLUMNS).order("queued_at", { ascending: false }).limit(40);
      if (!data) return;
      const done: string[] = [];
      for (const j of data as QueueJob[]) {
        const prev = known.current.get(j.id);
        if (j.status === "succeeded" && prev !== "succeeded") done.push(j.id);
        known.current.set(j.id, j.status);
      }
      setJobs(data as QueueJob[]);
      if (done.length) {
        setFresh((f) => new Set([...f, ...done]));
        void loadThumbs(done);
      }
    };
    const channel = supabase
      .channel(`jobs-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `owner_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    // fallback poll in case realtime is not enabled on the project
    const t = setInterval(() => {
      if ([...known.current.values()].some((s) => s === "queued" || s === "running")) void refresh();
    }, 4000);
    return () => { clearInterval(t); void supabase.removeChannel(channel); };
  }, [userId, loadThumbs]);

  if (!jobs.length) {
    return <p className="rounded-xl border border-dashed border-line bg-paper p-6 text-muted">Shots you queue appear here and develop when the worker finishes them.</p>;
  }

  const waiting = jobs.filter((j) => j.status === "queued").length;

  return (
    <div>
      {waiting > 0 && !jobs.some((j) => j.status === "running") && (
        <p className="mb-4 rounded-lg bg-paper p-3 text-sm text-warn ring-1 ring-warn/30">
          {waiting} waiting. If nothing starts, check that ComfyUI and <code>npm run worker</code> are running on your Mac.
        </p>
      )}
      <ul className="space-y-3">
        {jobs.map((j) => {
          const s = STATUS[j.status];
          const thumb = thumbs[j.id];
          return (
            <li key={j.id} className="grid grid-cols-[72px_1fr] gap-3 rounded-lg bg-paper p-2 ring-1 ring-line">
              <div className="aspect-[2/3] overflow-hidden rounded bg-ink">
                {thumb ? (
                  <Link href="/app/sheet">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb} alt="" className={`h-full w-full object-cover ${fresh.has(j.id) ? "developing" : ""}`} />
                  </Link>
                ) : j.status === "running" ? (
                  <div className="flex h-full items-end">
                    <div className="w-full bg-accent transition-[height] duration-700" style={{ height: `${Math.round((j.progress ?? 0.05) * 100)}%` }} />
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 py-0.5 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`font-semibold ${s.cls}`}>
                    {s.label}
                    {j.status === "running" && j.progress != null ? ` ${Math.round(j.progress * 100)}%` : ""}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {j.duration_ms ? `${(j.duration_ms / 1000).toFixed(1)} s` : new Date(j.queued_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-ink">{j.params?.scene || j.prompt}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {j.persona_id ? personaNames[j.persona_id] ?? "Persona" : "No persona"} · {workflowById(j.workflow)?.label ?? j.workflow}
                  {j.attempts > 1 ? ` · attempt ${j.attempts}` : ""}
                </p>
                {j.error && j.status !== "succeeded" && <p className="mt-1 line-clamp-3 text-xs text-bad">{j.error}{j.status === "failed" ? " Credits returned." : ""}</p>}
                {j.status === "queued" && (
                  <button className="mt-1 text-xs text-muted underline-offset-2 hover:text-bad hover:underline"
                    onClick={() => start(async () => { await cancelJob(j.id); })}>
                    Cancel
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
