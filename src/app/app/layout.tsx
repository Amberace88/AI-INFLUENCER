import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/icons";
import { signOut } from "./actions";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [{ data: bal }, { data: me }, { count: personaCount }, { count: onSet }] = await Promise.all([
    supabase.from("credit_balances").select("balance").eq("owner_id", user.id).maybeSingle(),
    supabase.from("profiles").select("role, plan:plans(name, max_personas, monthly_credits)").eq("id", user.id).maybeSingle(),
    supabase.from("personas").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("owner_id", user.id).in("status", ["queued", "running"]),
  ]);
  const plan = me?.plan as unknown as { name: string; max_personas: number; monthly_credits: number } | null;
  const balance = bal?.balance ?? 0;
  const cap = Math.max(plan?.monthly_credits || 30, balance, 1);
  const isAdmin = me?.role === "admin";
  const low = plan?.monthly_credits ? balance < plan.monthly_credits * 0.1 : balance < 6;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[244px_1fr]">
      <aside className="console z-30 md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
        <div className="flex items-center justify-between gap-4 px-5 py-4 md:block md:py-6">
          <Link href="/app/home" aria-label="Persona Studio home" className="text-paper"><Logo inverted /></Link>

          {/* Credits counter: like the frame counter on a camera */}
          <Link href="/app/billing" title="Plan & credits"
            className="group block rounded-xl text-sm md:mt-7 md:bg-white/[.05] md:p-3.5 md:ring-1 md:ring-white/10 md:transition-colors md:hover:bg-white/[.08]">
            <div className="relative flex items-baseline gap-1.5">
              <span className={`condensed text-2xl font-bold tabular-nums md:text-[1.9rem] ${low ? "text-safelight" : "text-paper"}`}>{balance}</span>
              <span className="text-[#9eabb9]">credits</span>
              {isAdmin && <span className="absolute right-0 top-1 hidden rounded bg-safelight px-1.5 py-px text-[10px] font-bold text-ink md:inline">Admin</span>}
            </div>
            <div className="meter mt-2.5 hidden h-1 overflow-hidden rounded-full bg-white/10 md:block" role="meter" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={balance} aria-label="Credits left">
              <span className={`block h-full rounded-full ${low ? "bg-safelight" : "bg-[#6f86ff]"}`} style={{ width: `${Math.min(100, (balance / cap) * 100)}%` }} />
            </div>
            {plan && (
              <p className="mt-2.5 hidden items-center justify-between gap-2 whitespace-nowrap text-xs text-[#9eabb9] md:flex">
                <span>{plan.name} plan</span>
                <span className="tabular-nums">{personaCount ?? 0}/{plan.max_personas} personas</span>
              </p>
            )}
            {low && <p className="mt-2 hidden text-xs text-safelight md:block">Running low. Top up or change plan.</p>}
          </Link>
        </div>

        <Nav isAdmin={isAdmin} onSet={onSet ?? 0} />

        <form action={signOut} className="mt-auto hidden border-t border-white/10 px-5 py-5 md:block">
          <p className="mb-2 truncate text-xs text-[#9eabb9]" title={user.email ?? ""}>{user.email}</p>
          <button className="flex items-center gap-2 text-sm text-[#9eabb9] hover:text-paper"><Icon name="logout" size={16} />Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 px-5 py-7 md:px-10 md:py-10 xl:px-14">{children}</main>
    </div>
  );
}
