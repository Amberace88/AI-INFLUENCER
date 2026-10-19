import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { textAiConfigured } from "@/lib/ai/text";
import { PersonaForm } from "../persona-form";
import { AiPersonaForm } from "./ai-persona-form";
import { TwinForm } from "./twin-form";

export default async function NewPersonaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const mode = sp.mode === "manual" ? "manual" : sp.mode === "me" ? "me" : "ai";
  const { supabase, user } = await requireUser();
  const [{ count }, { data: me }, { data: cost }] = await Promise.all([
    supabase.from("personas").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    supabase.from("profiles").select("plan:plans(name, max_personas, allow_twin)").eq("id", user.id).single(),
    supabase.from("generation_costs").select("credits").eq("kind", "text_persona").maybeSingle(),
  ]);
  const plan = me?.plan as unknown as { name: string; max_personas: number; allow_twin: boolean } | null;
  const full = plan ? (count ?? 0) >= plan.max_personas : false;

  return (
    <div className="max-w-4xl">
      <Link href="/app/personas" className="text-sm text-muted hover:text-ink">Personas</Link>
      <h1 className="mt-2 text-4xl font-bold">New persona</h1>

      {full ? (
        <div className="mt-8 rounded-xl border border-warn/40 bg-paper p-6">
          <p className="text-lg">
            Your {plan?.name} plan includes {plan?.max_personas} persona{plan?.max_personas === 1 ? "" : "s"}, and all are in use.
          </p>
          <p className="mt-2 text-muted">Upgrade the plan or delete a persona you no longer need.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 mb-8 flex flex-wrap gap-1 rounded-full border border-line bg-paper p-1 text-sm sm:w-fit">
            {[
              { id: "ai", href: "/app/personas/new", label: "Invent one with AI" },
              { id: "me", href: "/app/personas/new?mode=me", label: "Make one of me" },
              { id: "manual", href: "/app/personas/new?mode=manual", label: "Write it myself" },
            ].map((t) => (
              <Link key={t.id} href={t.href} aria-current={mode === t.id ? "page" : undefined}
                className={`flex-1 whitespace-nowrap rounded-full px-4 py-1.5 text-center ${mode === t.id ? "bg-ink font-semibold text-paper" : "text-muted hover:text-ink"}`}>{t.label}</Link>
            ))}
          </div>
          {mode === "manual" ? <PersonaForm /> : mode === "me" ? (
            <TwinForm allowed={Boolean(plan?.allow_twin)} aiConfigured={textAiConfigured()} cost={cost?.credits ?? 2} />
          ) : <AiPersonaForm cost={cost?.credits ?? 2} configured={textAiConfigured()} />}
        </>
      )}
    </div>
  );
}
