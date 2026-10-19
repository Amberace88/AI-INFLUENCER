import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/icons";
import { signOut } from "./actions";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [{ data: bal }, { data: me }, { count: personaCount }] = await Promise.all([
    supabase.from("credit_balances").select("balance").eq("owner_id", user.id).maybeSingle(),
    supabase.from("profiles").select("role, plan:plans(name, max_personas, monthly_credits)").eq("id", user.id).maybeSingle(),
    supabase.from("personas").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
  ]);
  const plan = me?.plan as unknown as { name: string; max_personas: number; monthly_credits: number } | null;
  const balance = bal?.balance ?? 0;
  const cap = Math.max(plan?.monthly_credits || 30, balance, 1);
  const isAdmin = me?.role === "admin";

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[236px_1fr]">
      <aside className="z-30 border-b border-line bg-paper md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-4 px-5 py-4 md:block md:py-6">
          <Link href="/app/home" aria-label="Persona Studio home"><Logo /></Link>
          <Link href="/app/billing" title="Plan & credits" className="block text-sm transition-colors md:mt-7 md:rounded-xl md:bg-backdrop md:p-3 md:hover:bg-line/60">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums">{balance}</span>
              <span className="text-muted">credits</span>
            </div>
            <div className="meter mt-2 hidden h-1.5 overflow-hidden rounded-full bg-line md:block" role="meter" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={balance} aria-label="Credits left">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (balance / cap) * 100)}%` }} />
            </div>
            {plan && (
              <p className="mt-2 hidden text-xs text-muted md:block">
                {plan.name} plan · {personaCount ?? 0}/{plan.max_personas} persona{plan.max_personas === 1 ? "" : "s"}
                {isAdmin && <span className="ml-1 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-[#e6c86e]">ADMIN</span>}
              </p>
            )}
          </Link>
        </div>
        <Nav isAdmin={isAdmin} />
        <form action={signOut} className="mt-auto hidden px-5 pb-6 md:block">
          <p className="mb-2 truncate text-xs text-muted" title={user.email ?? ""}>{user.email}</p>
          <button className="flex items-center gap-2 text-sm text-muted hover:text-ink"><Icon name="logout" size={16} />Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 px-5 py-6 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
