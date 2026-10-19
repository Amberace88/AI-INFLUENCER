import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { ContactSheet, type SheetAsset } from "./contact-sheet";

const FILTERS = [
  { id: "", label: "All" },
  { id: "pending", label: "To review" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
];

export default async function SheetPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { data: personas } = await supabase.from("personas").select("id, name").order("name");

  let q = supabase
    .from("assets")
    .select("id, storage_path, width, height, review_status, scores, notes, created_at, persona_id, job:jobs(id, prompt, negative_prompt, workflow, provider, params, duration_ms, attempts, provider_cost_usd, scene_key, benchmark_run_id)")
    .order("created_at", { ascending: false })
    .limit(120);
  if (sp.status) q = q.eq("review_status", sp.status);
  if (sp.persona) q = q.eq("persona_id", sp.persona);

  const { data: rows, error } = await q;
  let assets = (rows ?? []) as unknown as SheetAsset[];
  if (sp.run) assets = assets.filter((a) => a.job?.benchmark_run_id === sp.run);

  const signed = assets.length
    ? (await supabase.storage.from("outputs").createSignedUrls(assets.map((a) => a.storage_path), 3600)).data ?? []
    : [];
  assets = assets.map((a, i) => ({ ...a, url: signed[i]?.signedUrl ?? "" }));

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...sp, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return `/app/sheet${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <h1 className="text-4xl font-bold">Contact sheet</h1>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <div className="flex gap-1 rounded-full border border-line bg-paper p-1">
          {FILTERS.map((f) => (
            <Link key={f.id} href={href({ status: f.id })} aria-current={(sp.status ?? "") === f.id ? "true" : undefined}
              className={`rounded-full px-3 py-1 ${(sp.status ?? "") === f.id ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>{f.label}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={href({ persona: "" })} className={!sp.persona ? "font-semibold" : "text-muted hover:text-ink"}>Every persona</Link>
          {(personas ?? []).map((p) => (
            <Link key={p.id} href={href({ persona: p.id })} className={sp.persona === p.id ? "font-semibold" : "text-muted hover:text-ink"}>{p.name}</Link>
          ))}
        </div>
        {sp.run && <Link href={href({ run: "" })} className="text-accent">Showing one benchmark run. Show all</Link>}
      </div>

      {error && <p className="mt-6 text-bad">{error.message}</p>}
      {!assets.length ? (
        <p className="mt-10 max-w-md rounded-xl border border-dashed border-line bg-paper p-6 text-muted">
          No frames here yet. Shoot something in the <Link href="/app/studio" className="text-accent underline">Studio</Link>.
        </p>
      ) : (
        <ContactSheet assets={assets} personaNames={Object.fromEntries((personas ?? []).map((p) => [p.id, p.name]))} />
      )}
    </div>
  );
}
