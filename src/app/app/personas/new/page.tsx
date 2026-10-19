import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { Icon, type IconName } from "@/components/icons";
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

  const modes: { id: string; href: string; icon: IconName; title: string; text: string; note?: string }[] = [
    { id: "ai", href: "/app/personas/new", icon: "sparkle", title: "Invent one with AI", text: "Describe who you need in a sentence. The AI writes the full passport.", note: `${cost?.credits ?? 2} credits` },
    { id: "me", href: "/app/personas/new?mode=me", icon: "personas", title: "Make one of me", text: "Your own digital twin from 1–4 photos of you, with your consent.", note: plan?.allow_twin ? undefined : "Paid plans" },
    { id: "manual", href: "/app/personas/new?mode=manual", icon: "pen", title: "Write it myself", text: "Fill in every field by hand. Free." },
  ];

  return (
    <div className="max-w-5xl">
      <Link href="/app/personas" className="text-sm text-muted hover:text-ink">← Your cast</Link>
      <h1 className="condensed mt-3 text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold">Cast a new persona</h1>

      {full ? (
        <div className="mt-8 max-w-2xl rounded-2xl bg-paper p-6 ring-1 ring-line">
          <p className="text-lg font-semibold">
            All {plan?.max_personas} persona place{plan?.max_personas === 1 ? "" : "s"} on your {plan?.name} plan are taken.
          </p>
          <p className="mt-2 text-muted">Choose a bigger plan, or delete a persona you no longer need.</p>
          <Link href="/app/billing" className="btn btn-primary mt-5">See plans</Link>
        </div>
      ) : (
        <>
          <nav aria-label="How to create" className="mt-7 mb-10 grid gap-3 sm:grid-cols-3">
            {modes.map((m) => {
              const on = mode === m.id;
              return (
                <Link key={m.id} href={m.href} aria-current={on ? "page" : undefined}
                  className={`group relative rounded-2xl p-5 transition-[background-color,box-shadow] ${on ? "bg-ink text-paper shadow-[0_18px_40px_-24px_rgba(23,32,43,.8)]" : "bg-paper ring-1 ring-line hover:ring-ink"}`}>
                  <Icon name={m.icon} size={22} className={on ? "text-safelight" : "text-accent"} />
                  <span className="mt-4 block text-lg font-bold">{m.title}</span>
                  <span className={`mt-1 block text-sm ${on ? "text-white/70" : "text-muted"}`}>{m.text}</span>
                  {m.note && <span className={`absolute right-4 top-4 text-xs tabular-nums ${on ? "text-safelight" : "text-muted"}`}>{m.note}</span>}
                </Link>
              );
            })}
          </nav>
          {mode === "manual" ? <PersonaForm /> : mode === "me" ? (
            <TwinForm allowed={Boolean(plan?.allow_twin)} aiConfigured={textAiConfigured()} cost={cost?.credits ?? 2} />
          ) : <AiPersonaForm cost={cost?.credits ?? 2} configured={textAiConfigured()} />}
        </>
      )}
    </div>
  );
}
