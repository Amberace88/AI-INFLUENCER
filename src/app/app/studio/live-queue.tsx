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
  queued: { label: "Waiting", cls: "text-[#9eabb9]" },
  running: { label: "Shooting", cls: "text-safelight" },
  succeeded: { label: "Developed", cls: "text-[#8fe0b7]" },
  failed: { label: "Failed", cls: "text-[#ff9b8f]" },
  canceled: { label: "Cancelled", cls: "text-[#9eabb9]" },
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
    for (const j of initial) if (!known.current.has(j.id)) known.current.set(j.id, j.status);
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
      const { data } = await supabase.from("jobs").select(COLUMNS).eq("owner_id", userId).order("queued_at", { ascending: false }).limit(40);
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
    }, 2500);
    return () => { clearInterval(t); void supabase.removeChannel(channel); };
  }, [userId, loadThumbs]);

  const waiting = jobs.filter((j) => j.status === "queued").length;
  const running = jobs.filter((j) => j.status === "running").length;

  return (
    <section aria-label="On set" className="darkroom overflow-hidden rounded-[22px]">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="condensed text-2xl font-bold text-paper">On set</h2>
        <p className="flex items-center gap-2 text-xs tabular-nums text-[#9eabb9]">
          {running + waiting > 0 ? (
            <><span className="size-2 animate-pulse rounded-full bg-safelight shadow-[0_0_10px_var(--safelight)]" aria-hidden />{running} shooting, {waiting} waiting</>
          ) : "Quiet"}
        </p>
      </header>

      {!jobs.length ? (
        <p className="px-5 py-10 text-center text-sm text-[#9eabb9]">Shots you queue appear here and develop when they are ready.</p>
      ) : (
        <>
          {waiting > 0 && !running && (
            <p className="mx-4 mt-4 rounded-lg bg-white/[.06] p-3 text-xs text-safelight">
              {waiting} waiting. If nothing starts within a minute, check that the worker is running (npm run worker).
            </p>
          )}
          <ul className="max-h-[calc(100dvh-9rem)] space-y-1 overflow-y-auto p-2">
            {jobs.map((j) => {
              const s = STATUS[j.status];
              const thumb = thumbs[j.id];
              return (
                <li key={j.id} className="grid grid-cols-[64px_1fr] gap-3 rounded-xl p-2 transition-colors hover:bg-white/[.04]">
                  <div className="aspect-[2/3] overflow-hidden rounded-[3px] bg-[#222c38] ring-1 ring-white/10">
                    {thumb ? (
                      <Link href="/app/sheet" aria-label="Open on the contact sheet" className="block h-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumb} alt="" className={`h-full w-full object-cover ${fresh.has(j.id) ? "developing" : ""}`} />
                      </Link>
                    ) : j.status === "running" ? (
                      <div className="flex h-full items-end">
                        <div className="w-full bg-safelight/70 transition-[height] duration-700" style={{ height: `${Math.round((j.progress ?? 0.05) * 100)}%` }} />
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0 py-0.5 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`font-semibold ${s.cls}`}>
                        {s.label}{j.status === "running" && j.progress != null ? ` ${Math.round(j.progress * 100)}%` : ""}
                      </span>
                      <span className="text-xs tabular-nums text-[#7d8a99]">
                        {j.duration_ms ? `${(j.duration_ms / 1000).toFixed(1)} s` : new Date(j.queued_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[#dfe5ec]">{j.params?.scene || j.prompt}</p>
                    <p className="mt-0.5 truncate text-xs text-[#7d8a99]">
                      {j.persona_id ? personaNames[j.persona_id] ?? "Persona" : "No persona"}, {workflowById(j.workflow)?.label ?? j.workflow}
                      {j.attempts > 1 ? `, attempt ${j.attempts}` : ""}
                    </p>
                    {j.error && j.status !== "succeeded" && <p className="mt-1 line-clamp-3 text-xs text-[#ff9b8f]">{j.error}{j.status === "failed" && !/returned/i.test(j.error) ? " Credits returned." : ""}</p>}
                    {j.status === "queued" && (
                      <button className="mt-1 text-xs text-[#9eabb9] underline-offset-2 hover:text-[#ff9b8f] hover:underline"
                        onClick={() => start(async () => { await cancelJob(j.id); })}>
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
