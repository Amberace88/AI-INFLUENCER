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
  const { supabase, user } = await requireUser();
  const { data: personas } = await supabase.from("personas").select("id, name").eq("owner_id", user.id).order("name");

  let q = supabase
    .from("assets")
    .select("id, storage_path, width, height, review_status, scores, notes, created_at, persona_id, job:jobs(id, prompt, negative_prompt, workflow, provider, params, duration_ms, attempts, provider_cost_usd, scene_key, benchmark_run_id)")
    .eq("owner_id", user.id)
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

  const { data: counts } = await supabase.from("assets").select("review_status").eq("owner_id", user.id);
  const n = (st?: string) => (counts ?? []).filter((c) => !st || c.review_status === st).length;
  const label = (id: string) => (id === "pending" ? n("pending") : id === "accepted" ? n("accepted") : id === "rejected" ? n("rejected") : n());

  return (
    <div className="max-w-[1500px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="condensed text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold">Contact sheet</h1>
          <p className="mt-1 max-w-[62ch] text-muted">
            Every frame you shot. Keep the good ones, reject the rest, and use the best as a persona&apos;s face.
            {n("pending") > 0 && <span className="text-ink"> {n("pending")} waiting for your review.</span>}
          </p>
        </div>
        <Link href="/app/studio" className="btn btn-primary px-5">Shoot more</Link>
      </header>

      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <nav aria-label="Review status" className="flex gap-1 rounded-full bg-paper p-1 ring-1 ring-line">
          {FILTERS.map((f) => (
            <Link key={f.id} href={href({ status: f.id })} aria-current={(sp.status ?? "") === f.id ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 ${(sp.status ?? "") === f.id ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>
              {f.label} <span className="tabular-nums opacity-60">{label(f.id)}</span>
            </Link>
          ))}
        </nav>
        {(personas?.length ?? 0) > 1 && (
          <nav aria-label="Persona" className="flex flex-wrap gap-1">
            <Link href={href({ persona: "" })} aria-current={!sp.persona ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 ${!sp.persona ? "bg-paper font-semibold ring-1 ring-ink" : "text-muted hover:text-ink"}`}>Everyone</Link>
            {(personas ?? []).map((p) => (
              <Link key={p.id} href={href({ persona: p.id })} aria-current={sp.persona === p.id ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 ${sp.persona === p.id ? "bg-paper font-semibold ring-1 ring-ink" : "text-muted hover:text-ink"}`}>{p.name}</Link>
            ))}
          </nav>
        )}
        {sp.persona && (personas?.length ?? 0) <= 1 && <Link href={href({ persona: "" })} className="text-muted hover:text-ink">Show every persona</Link>}
        {sp.run && <Link href={href({ run: "" })} className="text-accent">One benchmark run shown. Show all</Link>}
        <p className="ml-auto hidden text-xs text-muted lg:block">Open a frame, then A to keep, R to reject, arrows to move.</p>
      </div>

      {error && <p className="mt-6 text-bad">{error.message}</p>}
      {!assets.length ? (
        <div className="sheet mt-8 grid min-h-72 place-items-center rounded-[22px] px-6 py-16 text-center">
          <div>
            <p className="condensed text-2xl font-bold text-paper">{sp.status || sp.persona ? "Nothing matches this filter" : "The sheet is empty"}</p>
            <p className="mt-1 text-sm text-[#9eabb9]">{sp.status || sp.persona ? "Try another filter." : "Frames you shoot in the Studio develop here."}</p>
            {!sp.status && !sp.persona && <Link href="/app/studio" className="btn btn-primary mt-5">Open the Studio</Link>}
          </div>
        </div>
      ) : (
        <ContactSheet assets={assets} personaNames={Object.fromEntries((personas ?? []).map((p) => [p.id, p.name]))} />
      )}
    </div>
  );
}
