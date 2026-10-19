import { requireUser } from "@/lib/supabase/server";
import type { Persona } from "@/lib/catalog";
import { GenerateForm } from "./generate-form";
import { LiveQueue, type QueueJob } from "./live-queue";

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: personas }, { data: refs }, { data: costs }, { data: jobs }] = await Promise.all([
    supabase.from("personas").select("*").order("created_at", { ascending: false }),
    supabase.from("persona_references").select("persona_id"),
    supabase.from("generation_costs").select("kind, credits"),
    supabase
      .from("jobs")
      .select("id, status, progress, prompt, workflow, provider, params, error, attempts, queued_at, started_at, finished_at, duration_ms, persona_id")
      .order("queued_at", { ascending: false })
      .limit(24),
  ]);

  const withRefs = new Set((refs ?? []).map((r) => r.persona_id));
  const costMap = Object.fromEntries((costs ?? []).map((c) => [c.kind, c.credits]));

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <h1 className="mb-6 text-4xl font-bold">Studio</h1>
        <GenerateForm
          personas={(personas ?? []) as Persona[]}
          personasWithRefs={[...withRefs]}
          costs={costMap}
          initialPersona={sp.persona ?? (personas?.[0]?.id as string | undefined) ?? ""}
          initialScene={sp.scene ?? ""}
        />
      </section>
      <aside>
        <h2 className="mb-4 text-2xl font-bold">On set</h2>
        <LiveQueue userId={user.id} initial={(jobs ?? []) as QueueJob[]} personaNames={Object.fromEntries((personas ?? []).map((p) => [p.id, p.name]))} />
      </aside>
    </div>
  );
}
