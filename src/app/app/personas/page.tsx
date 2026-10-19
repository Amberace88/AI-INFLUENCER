import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { ROLES, type Persona } from "@/lib/catalog";
import { PersonaArt, type Look } from "@/components/persona-art";

const LOOKS: Look[] = ["lucia", "marco", "noa"];
const lookFor = (id: string) => LOOKS[id.charCodeAt(0) % LOOKS.length];

export default async function PersonasPage() {
  const { supabase, user } = await requireUser();
  const [{ data: personas }, { data: counts }, { data: posts }, { data: me }] = await Promise.all([
    supabase.from("personas").select("*").eq("owner_id", user.id).order("created_at", { ascending: true }),
    supabase.from("assets").select("persona_id, review_status").eq("owner_id", user.id),
    supabase.from("posts").select("persona_id").eq("owner_id", user.id).neq("status", "discarded"),
    supabase.from("profiles").select("plan:plans(name, max_personas)").eq("id", user.id).maybeSingle(),
  ]);
  const plan = me?.plan as unknown as { name: string; max_personas: number } | null;
  const ids = (personas ?? []).map((p) => p.id);
  const { data: refs } = ids.length
    ? await supabase.from("persona_references").select("persona_id, storage_path").eq("is_primary", true).in("persona_id", ids)
    : { data: [] as { persona_id: string; storage_path: string }[] };
  const signed = refs?.length ? (await supabase.storage.from("references").createSignedUrls(refs.map((r) => r.storage_path), 3600)).data ?? [] : [];
  const thumb = new Map((refs ?? []).map((r, i) => [r.persona_id, signed[i]?.signedUrl]));
  const stats = (id: string) => {
    const mine = (counts ?? []).filter((c) => c.persona_id === id);
    return {
      frames: mine.length,
      kept: mine.filter((c) => c.review_status === "accepted").length,
      posts: (posts ?? []).filter((x) => x.persona_id === id).length,
    };
  };
  const max = plan?.max_personas ?? 1;
  const used = personas?.length ?? 0;
  const full = used >= max;

  return (
    <div className="max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="condensed text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold">Your cast</h1>
          <p className="mt-1 max-w-[60ch] text-muted">
            Each persona keeps the same face, voice and job in every photo and post.
            <span className="tabular-nums"> {used} of {max} on your {plan?.name ?? "Free"} plan.</span>
          </p>
        </div>
        {!full && <Link href="/app/personas/new" className="btn btn-primary px-5">New persona</Link>}
      </header>

      {!used ? (
        <section className="mt-10 grid items-center gap-8 rounded-[22px] bg-paper p-6 ring-1 ring-line md:grid-cols-[220px_1fr] md:p-8">
          <div className="frame mx-auto w-44 md:w-full">
            <PersonaArt look="lucia" scene="studio" className="aspect-[3/4] w-full" title="Example persona" />
            <span className="frame-no">01 · your first persona</span>
          </div>
          <div>
            <h2 className="condensed text-3xl font-bold">Cast your first persona</h2>
            <p className="mt-2 max-w-[58ch] text-muted">
              Describe who your brand needs, in a sentence. The AI writes the passport: name, voice, look, what they always and never say.
              Then you shoot their first portrait and use it as the face for everything after.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/app/personas/new" className="btn btn-primary px-5">Create with AI</Link>
              <Link href="/app/personas/new?mode=me" className="btn btn-ghost">Make one of me</Link>
            </div>
          </div>
        </section>
      ) : (
        <ul className="mt-9 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {(personas as Persona[]).map((p, i) => {
            const s = stats(p.id);
            const img = thumb.get(p.id);
            const role = ROLES.find((r) => r.id === p.role)?.label ?? "Influencer";
            return (
              <li key={p.id}>
                <Link href={`/app/personas/${p.id}`} className="group block focus-visible:outline-offset-4">
                  <div className="frame transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_24px_48px_-28px_rgba(23,32,43,.7)]">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-[2px] bg-[#222c38]">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      ) : (
                        <>
                          <PersonaArt look={lookFor(p.id)} scene="studio" className="h-full w-full opacity-45 grayscale" title="No photo yet" />
                          <span className="absolute inset-x-3 bottom-3 rounded-md bg-paper/95 py-1.5 text-center text-xs font-semibold text-ink">No face yet</span>
                        </>
                      )}
                      {p.likeness === "self" && <span className="absolute left-2 top-2 rounded bg-ink/85 px-1.5 py-0.5 text-[11px] font-semibold text-safelight">Digital twin</span>}
                    </div>
                    <span className="frame-no">{String(i + 1).padStart(2, "0")} · {role}</span>
                  </div>
                  <h2 className="condensed mt-4 text-[1.7rem] font-bold leading-tight group-hover:text-accent">{p.name}</h2>
                  {p.tagline && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.tagline}</p>}
                  <p className="mt-2 text-sm tabular-nums text-muted">
                    <b className="text-ink">{s.frames}</b> frames, <b className="text-ink">{s.kept}</b> kept, <b className="text-ink">{s.posts}</b> posts
                  </p>
                </Link>
              </li>
            );
          })}

          <li>
            {full ? (
              <Link href="/app/billing" className="grid aspect-[3/4] place-items-center rounded-[3px] border-2 border-dashed border-line p-6 text-center hover:border-ink">
                <span>
                  <span className="block font-semibold">All {max} places taken</span>
                  <span className="mt-1 block text-sm text-muted">A bigger plan holds more personas.</span>
                  <span className="mt-3 inline-block text-sm font-semibold text-accent">See plans</span>
                </span>
              </Link>
            ) : (
              <Link href="/app/personas/new" className="group grid aspect-[3/4] place-items-center rounded-[3px] border-2 border-dashed border-line p-6 text-center transition-colors hover:border-accent hover:bg-paper/70">
                <span>
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-2xl text-white transition-transform group-hover:scale-110" aria-hidden>+</span>
                  <span className="mt-3 block font-semibold">Cast a new persona</span>
                  <span className="mt-1 block text-sm tabular-nums text-muted">{max - used} place{max - used === 1 ? "" : "s"} left</span>
                </span>
              </Link>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}
