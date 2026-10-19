import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import type { Persona } from "@/lib/catalog";
import { PersonaArt, type Look } from "@/components/persona-art";

const LOOKS: Look[] = ["lucia", "marco", "noa"];
const lookFor = (id: string) => LOOKS[id.charCodeAt(0) % LOOKS.length];

export default async function PersonasPage() {
  const { supabase, user } = await requireUser();
  const { data: personas } = await supabase.from("personas").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
  const { data: refs } = await supabase.from("persona_references").select("persona_id, storage_path").eq("is_primary", true);
  const { data: counts } = await supabase.from("assets").select("persona_id, review_status").eq("owner_id", user.id);

  const paths = (refs ?? []).map((r) => r.storage_path);
  const signed = paths.length ? (await supabase.storage.from("references").createSignedUrls(paths, 3600)).data ?? [] : [];
  const thumb = new Map((refs ?? []).map((r, i) => [r.persona_id, signed[i]?.signedUrl]));
  const stats = (id: string) => {
    const mine = (counts ?? []).filter((c) => c.persona_id === id);
    return { total: mine.length, accepted: mine.filter((c) => c.review_status === "accepted").length };
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-bold">Personas</h1>
        <Link href="/app/personas/new" className="btn btn-primary">New persona</Link>
      </div>

      {!personas?.length ? (
        <div className="mt-10 max-w-lg rounded-xl border border-dashed border-line bg-paper p-8">
          <h2 className="text-2xl font-bold">Cast your first persona</h2>
          <p className="mt-2 text-muted">
            A persona is the character you will reuse across a campaign: face, hair, build, wardrobe and a few reference
            photos. The more precise the description, the more consistent the results.
          </p>
          <Link href="/app/personas/new" className="btn btn-primary mt-5">Create a persona</Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {(personas as Persona[]).map((p) => {
            const s = stats(p.id);
            const img = thumb.get(p.id);
            return (
              <li key={p.id}>
                <Link href={`/app/personas/${p.id}`} className="group grid grid-cols-[112px_1fr] gap-4 rounded-xl bg-paper p-3 ring-1 ring-line hover:ring-ink">
                  <div className="aspect-[3/4] overflow-hidden rounded-md bg-backdrop">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="relative block h-full">
                        <PersonaArt look={lookFor(p.id)} scene="studio" className="h-full w-full opacity-60 grayscale" title="No photo yet" />
                        <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-[10px] text-paper">No photo yet</span>
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 py-1">
                    <h2 className="truncate text-2xl font-bold">{p.name}</h2>
                    {p.tagline && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.tagline}</p>}
                    <p className="mt-3 text-sm tabular-nums">
                      {s.total} frames, <span className="text-ok">{s.accepted} accepted</span>
                    </p>
                    {!p.is_fictional && <p className="mt-1 text-xs text-warn">Real person, consent on file</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
