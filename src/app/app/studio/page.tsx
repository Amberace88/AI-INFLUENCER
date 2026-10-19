import { requireUser } from "@/lib/supabase/server";
import type { Persona } from "@/lib/catalog";
import { GenerateForm } from "./generate-form";
import { LiveQueue, type QueueJob } from "./live-queue";

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: personas }, { data: refs }, { data: costs }, { data: jobs }] = await Promise.all([
    supabase.from("personas").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }),
    supabase.from("persona_references").select("persona_id, storage_path, is_primary"),
    supabase.from("generation_costs").select("kind, credits"),
    supabase
      .from("jobs")
      .select("id, status, progress, prompt, workflow, provider, params, error, attempts, queued_at, started_at, finished_at, duration_ms, persona_id")
      .eq("owner_id", user.id)
      .order("queued_at", { ascending: false })
      .limit(24),
  ]);

  const mine = new Set((personas ?? []).map((p) => p.id));
  const ownRefs = (refs ?? []).filter((r) => mine.has(r.persona_id));
  const withRefs = new Set(ownRefs.map((r) => r.persona_id));
  const primaries = ownRefs.filter((r) => r.is_primary);
  const signed = primaries.length ? (await supabase.storage.from("references").createSignedUrls(primaries.map((r) => r.storage_path), 3600)).data ?? [] : [];
  const avatars = Object.fromEntries(primaries.map((r, i) => [r.persona_id, signed[i]?.signedUrl ?? ""]));
  const costMap = Object.fromEntries((costs ?? []).map((c) => [c.kind, c.credits]));

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0">
        <header className="mb-8">
          <h1 className="condensed text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold">Studio</h1>
          <p className="mt-1 max-w-[60ch] text-muted">Describe the scene and the frames develop on the monitor. Failed or rejected shots cost nothing.</p>
        </header>
        <GenerateForm
          avatars={avatars}
          personas={(personas ?? []) as Persona[]}
          personasWithRefs={[...withRefs]}
          costs={costMap}
          initialPersona={sp.persona ?? (personas?.[0]?.id as string | undefined) ?? ""}
          initialScene={sp.scene ?? ""}
        />
      </section>
      <aside className="xl:sticky xl:top-6 xl:self-start">
        <LiveQueue userId={user.id} initial={(jobs ?? []) as QueueJob[]} personaNames={Object.fromEntries((personas ?? []).map((p) => [p.id, p.name]))} />
      </aside>
    </div>
  );
}
