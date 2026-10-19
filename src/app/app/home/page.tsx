import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { Icon, type IconName } from "@/components/icons";
import { PersonaArt, type Look } from "@/components/persona-art";

const LOOKS: Look[] = ["lucia", "marco", "noa"];

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Madrid" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 19 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const { supabase, user } = await requireUser();
  const [{ data: me }, { data: personas }, { data: assets }, { data: posts }, { data: bal }, { count: openJobs }] = await Promise.all([
    supabase.from("profiles").select("display_name, plan:plans(name, monthly_credits, max_personas)").eq("id", user.id).maybeSingle(),
    supabase.from("personas").select("id, name, tagline, role").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("assets").select("id, storage_path, persona_id, review_status").eq("owner_id", user.id).neq("review_status", "rejected").order("created_at", { ascending: false }).limit(8),
    supabase.from("posts").select("id, caption, platform, persona_id, status").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("credit_balances").select("balance").eq("owner_id", user.id).maybeSingle(),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("owner_id", user.id).in("status", ["queued", "running"]),
  ]);
  const plan = me?.plan as unknown as { name: string; monthly_credits: number; max_personas: number } | null;
  const { data: refs } = personas?.length
    ? await supabase.from("persona_references").select("persona_id, storage_path").eq("is_primary", true).in("persona_id", personas.map((p) => p.id))
    : { data: [] as { persona_id: string; storage_path: string }[] };

  const signedRefs = refs?.length ? (await supabase.storage.from("references").createSignedUrls(refs.map((r) => r.storage_path), 3600)).data ?? [] : [];
  const refUrl = new Map((refs ?? []).map((r, i) => [r.persona_id, signedRefs[i]?.signedUrl]));
  const signedAssets = assets?.length ? (await supabase.storage.from("outputs").createSignedUrls(assets.map((a) => a.storage_path), 3600)).data ?? [] : [];
  const names = new Map((personas ?? []).map((p) => [p.id, p.name]));
  const first = me?.display_name?.split(/[ .@_]/)[0];
  const firstPersona = personas?.[0];

  const actions: { href: string; icon: IconName; title: string; text: string }[] = [
    { href: "/app/personas/new", icon: "sparkle", title: "Create a persona with AI", text: "Describe who you need; get a full passport in seconds." },
    { href: firstPersona ? `/app/personas/${firstPersona.id}/posts` : "/app/personas/new", icon: "pen", title: "Write posts", text: firstPersona ? `${firstPersona.name} writes in their own voice.` : "Create a persona first." },
    { href: "/app/studio", icon: "studio", title: "Shoot photos", text: "New scenes, same face. Fast drafts are nearly free." },
  ];

  return (
    <div className="max-w-6xl space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted">{greeting()}{first ? `, ${first}` : ""}</p>
          <h1 className="mt-1 text-[clamp(2.2rem,4.5vw,3.4rem)] font-extrabold">
            {personas?.length ? "Who's working for you today?" : "Let's cast your first persona."}
          </h1>
        </div>
        <dl className="flex gap-6 text-sm">
          <div><dt className="text-muted">Credits</dt><dd className="text-2xl font-bold tabular-nums">{bal?.balance ?? 0}</dd></div>
          <div><dt className="text-muted">Personas</dt><dd className="text-2xl font-bold tabular-nums">{personas?.length ?? 0}<span className="text-base font-normal text-muted">/{plan?.max_personas ?? 1}</span></dd></div>
          <div><dt className="text-muted">On set</dt><dd className="text-2xl font-bold tabular-nums">{openJobs ?? 0}</dd></div>
        </dl>
      </header>

      <section aria-label="Quick actions" className="grid gap-3 md:grid-cols-3">
        {actions.map((a, i) => (
          <Link key={a.title} href={a.href}
            className={`group flex flex-col rounded-2xl p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_-18px_rgba(23,32,43,.45)] ${i === 0 ? "bg-accent text-white" : "bg-paper ring-1 ring-line"}`}>
            <Icon name={a.icon} size={26} className={i === 0 ? "text-white" : "text-accent"} />
            <span className="mt-6 text-xl font-bold">{a.title}</span>
            <span className={`mt-1 text-sm ${i === 0 ? "text-white/80" : "text-muted"}`}>{a.text}</span>
            <Icon name="arrow" size={18} className="mt-4 transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
      </section>

      <section>
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-bold">Your personas</h2>
          <Link href="/app/personas" className="text-sm text-muted hover:text-ink">All personas</Link>
        </div>
        {personas?.length ? (
          <ul className="mt-5 flex gap-4 overflow-x-auto pb-2">
            {personas.map((p, i) => {
              const url = refUrl.get(p.id);
              return (
                <li key={p.id} className="w-40 shrink-0">
                  <Link href={`/app/personas/${p.id}`} className="group block">
                    <div className="frame transition-transform duration-200 group-hover:-rotate-1">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className="aspect-[2/3] w-full rounded-[2px] object-cover" />
                      ) : (
                        <PersonaArt look={LOOKS[i % 3]} scene="studio" className="block aspect-[2/3] w-full rounded-[2px] opacity-70 grayscale" title="No photo yet" />
                      )}
                      <span className="frame-no">{String(i + 1).padStart(2, "0")} · {p.role}</span>
                    </div>
                    <p className="mt-2 truncate font-semibold">{p.name}</p>
                    {p.tagline && <p className="line-clamp-2 text-xs text-muted">{p.tagline}</p>}
                  </Link>
                </li>
              );
            })}
            <li className="w-40 shrink-0">
              <Link href="/app/personas/new" className="grid aspect-[2/3] place-items-center rounded-xl border-2 border-dashed border-line text-muted hover:border-ink hover:text-ink">
                <span className="flex flex-col items-center gap-2 text-sm"><Icon name="plus" size={28} />New persona</span>
              </Link>
            </li>
          </ul>
        ) : (
          <div className="mt-5 grid items-center gap-6 rounded-2xl bg-paper p-6 ring-1 ring-line sm:grid-cols-[auto_1fr]">
            <div className="flex -space-x-6">
              {LOOKS.map((l, i) => <PersonaArt key={l} look={l} scene={(["beach", "office", "street"] as const)[i]} className="h-36 w-24 rounded-lg ring-4 ring-paper" />)}
            </div>
            <div>
              <p className="text-lg">A persona is a fictional person who works for your brand: a face, a voice, and a job.</p>
              <Link href="/app/personas/new" className="btn btn-primary mt-4">Create one with AI</Link>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section>
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-bold">Latest frames</h2>
            <Link href="/app/sheet" className="text-sm text-muted hover:text-ink">Contact sheet</Link>
          </div>
          {assets?.length ? (
            <ul className="mt-5 grid grid-cols-4 gap-2">
              {assets.map((a, i) => (
                <li key={a.id} className="frame relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={signedAssets[i]?.signedUrl ?? undefined} alt="" className="aspect-[2/3] w-full rounded-[2px] object-cover" />
                  <span className="frame-no truncate pr-2">{names.get(a.persona_id ?? "") ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed border-line bg-paper p-6 text-muted">Frames you shoot in the Studio appear here.</p>
          )}
        </section>
        <section>
          <h2 className="text-2xl font-bold">Latest posts</h2>
          {posts?.length ? (
            <ul className="mt-5 space-y-3">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/personas/${p.persona_id}/posts`} className="block rounded-xl bg-paper p-4 ring-1 ring-line hover:ring-ink">
                    <p className="text-xs text-muted"><span className="font-semibold capitalize text-ink">{names.get(p.persona_id) ?? "Persona"}</span> · {p.platform} · {p.status}</p>
                    <p className="mt-1 line-clamp-3 text-sm">{p.caption}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed border-line bg-paper p-6 text-muted">Posts your personas write appear here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
