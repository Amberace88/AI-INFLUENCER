import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { LANGUAGES, ROLES } from "@/lib/catalog";
import { PersonaArt, type Look } from "@/components/persona-art";
import { PersonaTabs } from "./tabs";

const LOOKS: Look[] = ["lucia", "marco", "noa"];

/** Machine-readable zone, like the two lines at the bottom of a real passport. */
function mrz(name: string, id: string, role: string, lang: string) {
  const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "<");
  const parts = name.trim().split(/\s+/);
  const surname = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
  const given = parts.length > 1 ? parts[0] : "";
  const line1 = `P<PS<${clean(surname)}<<${clean(given)}`.padEnd(44, "<").slice(0, 44);
  const line2 = `${id.replace(/-/g, "").slice(0, 9).toUpperCase()}<${clean(lang)}<${clean(role)}`.padEnd(44, "<").slice(0, 44);
  return [line1, line2];
}

export default async function PersonaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const [{ data: p }, { data: ref }, { data: assets }, { count: posts }] = await Promise.all([
    supabase.from("personas").select("id, name, tagline, role, language, brand_name, likeness, created_at").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("persona_references").select("storage_path").eq("persona_id", id).eq("is_primary", true).limit(1).maybeSingle(),
    supabase.from("assets").select("review_status").eq("persona_id", id).eq("owner_id", user.id),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("persona_id", id).neq("status", "discarded"),
  ]);
  if (!p) notFound();
  const photo = ref ? (await supabase.storage.from("references").createSignedUrl(ref.storage_path, 3600)).data?.signedUrl : null;

  const role = ROLES.find((r) => r.id === p.role)?.label ?? "Influencer";
  const lang = LANGUAGES.find((l) => l.id === p.language)?.label ?? p.language ?? "Spanish";
  const frames = assets?.length ?? 0;
  const kept = (assets ?? []).filter((a) => a.review_status === "accepted").length;
  const face = p.likeness === "self" ? "Digital twin of you" : p.likeness === "consented" ? "Real person, consent on file" : "Fictional, AI-made";
  const issued = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(p.created_at));
  const [m1, m2] = mrz(p.name, p.id, role, lang);

  const facts: [string, string][] = [
    ["Job", role],
    ["Writes in", lang],
    ["Represents", p.brand_name || "Own channel"],
    ["Face", face],
    ["Issued", issued],
  ];

  return (
    <div className="max-w-6xl">
      <Link href="/app/personas" className="text-sm text-muted hover:text-ink">← All personas</Link>

      <article aria-label={`${p.name}, persona passport`}
        className="guilloche mt-4 grid overflow-hidden rounded-[22px] bg-paper ring-1 ring-line md:grid-cols-[minmax(220px,300px)_1fr]">
        {/* Portrait in a film frame */}
        <div className="bg-ink p-3 pb-9 md:p-4 md:pb-10">
          <div className="relative aspect-[3/4] overflow-hidden rounded-[3px] bg-[#222c38]">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={`${p.name}, main reference photo`} className="developing h-full w-full object-cover" />
            ) : (
              <Link href={`/app/studio?persona=${p.id}`} className="group block h-full">
                <PersonaArt look={LOOKS[p.id.charCodeAt(0) % 3]} scene="studio" className="h-full w-full opacity-50 grayscale" title="No photo yet" />
                <span className="absolute inset-x-3 bottom-3 rounded-lg bg-paper/95 px-3 py-2 text-center text-sm font-semibold text-ink transition-transform group-hover:-translate-y-0.5">
                  Shoot a first portrait
                </span>
              </Link>
            )}
          </div>
          <p className="relative mt-2.5 flex justify-between text-[0.72rem] tabular-nums text-safelight">
            <span>01 · {role}</span>
            <span>{frames} frames</span>
          </p>
        </div>

        {/* Identity page */}
        <div className="flex min-w-0 flex-col p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>Persona passport</span>
            {p.likeness === "self" && <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-safelight">Digital twin</span>}
          </div>
          <h1 className="condensed mt-2 text-[clamp(2.6rem,6vw,4.6rem)] font-extrabold leading-[0.95]">{p.name}</h1>
          {p.tagline && <p className="mt-3 max-w-[56ch] text-lg text-muted">{p.tagline}</p>}

          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 text-sm sm:grid-cols-3 2xl:grid-cols-5">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 font-semibold leading-snug">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={`/app/studio?persona=${p.id}`} className="btn btn-primary px-5">Shoot {p.name.split(" ")[0]}</Link>
            <Link href={`/app/personas/${p.id}/posts`} className="btn btn-ghost">Write posts</Link>
            <p className="text-sm tabular-nums text-muted sm:ml-auto">
              <b className="text-ink">{kept}</b> kept of {frames} frames · <b className="text-ink">{posts ?? 0}</b> posts
            </p>
          </div>

          <div aria-hidden className="mrz mt-auto border-t border-dashed border-line pt-4 leading-relaxed max-md:hidden">
            <div className="mt-6">{m1}</div>
            <div>{m2}</div>
          </div>
        </div>
      </article>

      <PersonaTabs id={p.id} />
      <div className="mt-8">{children}</div>
    </div>
  );
}
