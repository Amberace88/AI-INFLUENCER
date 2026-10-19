import { requireUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [{ data: bal }, { data: me }, { count: personaCount }] = await Promise.all([
    supabase.from("credit_balances").select("balance").eq("owner_id", user.id).maybeSingle(),
    supabase.from("profiles").select("plan:plans(name, max_personas)").eq("id", user.id).maybeSingle(),
    supabase.from("personas").select("id", { count: "exact", head: true }),
  ]);
  const plan = me?.plan as unknown as { name: string; max_personas: number } | null;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-paper md:sticky md:top-0 md:h-dvh md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-4 px-5 py-4 md:block md:py-6">
          <span className="text-lg font-bold" style={{ fontVariationSettings: '"wdth" 80' }}>Persona Studio</span>
          <div className="text-sm md:mt-6">
            <span className="text-2xl font-bold tabular-nums">{bal?.balance ?? 0}</span>
            <span className="ml-1 text-muted">credits</span>
            {plan && (
              <p className="text-xs text-muted">
                {plan.name} plan · {personaCount ?? 0}/{plan.max_personas} persona{plan.max_personas === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>
        <Nav />
        <form action={signOut} className="hidden px-5 pb-6 md:absolute md:bottom-0 md:block">
          <p className="mb-2 max-w-[180px] truncate text-xs text-muted">{user.email}</p>
          <button className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 px-5 py-6 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
