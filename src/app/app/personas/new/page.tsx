import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { textAiConfigured } from "@/lib/ai/text";
import { PersonaForm } from "../persona-form";
import { AiPersonaForm } from "./ai-persona-form";

export default async function NewPersonaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const manual = sp.mode === "manual";
  const { supabase } = await requireUser();
  const [{ count }, { data: me }, { data: cost }] = await Promise.all([
    supabase.from("personas").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("plan:plans(name, max_personas)").single(),
    supabase.from("generation_costs").select("credits").eq("kind", "text_persona").maybeSingle(),
  ]);
  const plan = me?.plan as unknown as { name: string; max_personas: number } | null;
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
          <div className="mt-6 mb-8 flex gap-1 rounded-full border border-line bg-paper p-1 text-sm sm:w-fit">
            <Link href="/app/personas/new" aria-current={!manual ? "page" : undefined}
              className={`flex-1 rounded-full px-4 py-1.5 text-center ${!manual ? "bg-ink font-semibold text-paper" : "text-muted hover:text-ink"}`}>With AI</Link>
            <Link href="/app/personas/new?mode=manual" aria-current={manual ? "page" : undefined}
              className={`flex-1 rounded-full px-4 py-1.5 text-center ${manual ? "bg-ink font-semibold text-paper" : "text-muted hover:text-ink"}`}>Write it myself</Link>
          </div>
          {manual ? <PersonaForm /> : <AiPersonaForm cost={cost?.credits ?? 2} configured={textAiConfigured()} />}
        </>
      )}
    </div>
  );
}
