import { requireUser } from "@/lib/supabase/server";
import { workflowById } from "@/lib/catalog";
import { stripeConfigured, stripeTestMode } from "@/lib/billing/stripe";
import { PackButton, PlanButton, PortalButton } from "./buttons";

type Billing = {
  plan_id: string; plan_name: string; status: string; renews_at: string | null; period_start: string | null; has_subscription: boolean;
  monthly_credits: number; max_personas: number; price_eur: number; balance: number; plan_left: number; extra: number;
};
type Row = { id: number; delta: number; reason: string; created_at: string; job: { workflow: string; prompt: string } | null };

const TEXT_KINDS: Record<string, string> = { text_persona: "AI wrote a persona", text_posts: "AI wrote posts" };

function describe(r: Row): { what: string; detail?: string } {
  const i = r.reason.indexOf(":");
  const kind = i < 0 ? r.reason : r.reason.slice(0, i);
  const arg = i < 0 ? "" : r.reason.slice(i + 1);
  switch (kind) {
    case "signup_bonus": return { what: "Welcome bonus" };
    case "plan_credits": return { what: `Monthly credits · ${arg ? arg[0].toUpperCase() + arg.slice(1) : "plan"}` };
    case "plan_expire": return { what: "Unused monthly credits expired", detail: "Monthly credits last one month; extra credits stay." };
    case "pack": return { what: "Extra credits bought" };
    case "admin_grant": return { what: "Credits from Persona Studio", detail: arg?.trim() || undefined };
    case "job_charge": return { what: workflowById(r.job?.workflow ?? "")?.label ?? "Photo", detail: r.job?.prompt?.split(". ")[0]?.slice(0, 90) };
    case "job_refund": return { what: "Returned: the photo failed" };
    case "defect_refund": return { what: "Returned: you reported a defect" };
    case "spend": return { what: TEXT_KINDS[arg] ?? "AI text" };
    case "refund": return { what: "Returned: the AI text failed" };
    default: return { what: r.reason };
  }
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/Madrid" });

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { paid } = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: b, error }, { data: plans }, { data: packs }, { data: rows }, { data: me }] = await Promise.all([
    supabase.rpc("my_billing"),
    supabase.from("plans").select("id, name, price_eur_incl_vat, monthly_credits, max_personas").gt("price_eur_incl_vat", 0).order("sort"),
    supabase.from("credit_packs").select("id, credits, price_eur_incl_vat").eq("active", true).order("credits"),
    supabase.from("credit_ledger").select("id, delta, reason, created_at, job:jobs(workflow, prompt)").eq("owner_id", user.id).order("id", { ascending: false }).limit(80),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (error || !b) return <p className="text-bad">Could not load your plan: {error?.message}</p>;
  const bill = b as Billing;
  const history = (rows ?? []) as unknown as Row[];
  const payments = stripeConfigured();
  const isAdmin = me?.role === "admin";
  const planPct = bill.monthly_credits ? Math.min(100, (bill.plan_left / bill.monthly_credits) * 100) : 0;
  const usedThisPeriod = bill.monthly_credits ? bill.monthly_credits - bill.plan_left : 0;
  const currentPrice = Number(bill.price_eur);

  return (
    <div className="max-w-6xl space-y-12">
      <header>
        <h1 className="condensed text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold">Plan & credits</h1>
        <p className="mt-1 text-muted"><b className="tabular-nums text-ink">{bill.balance}</b> credit{bill.balance === 1 ? "" : "s"} left. Monthly credits are used first, extra credits after.</p>
      </header>

      {paid && (
        <p role="status" className="panel-in rounded-xl bg-ok/10 p-4 text-sm text-ok ring-1 ring-ok/30">
          Payment received. Your credits appear here within a few seconds. Refresh if they are not here yet.
        </p>
      )}
      {bill.status === "past_due" && (
        <p role="alert" className="rounded-xl bg-bad/10 p-4 text-sm text-bad ring-1 ring-bad/30">
          Your last payment did not go through. Update your card under “Manage subscription” to keep your plan.
        </p>
      )}

      {/* Current plan and the two kinds of credits */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl bg-ink p-6 text-paper">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-white/60">Your plan</p>
              <p className="mt-1 text-3xl font-bold">{bill.plan_name}</p>
              <p className="mt-1 text-sm text-white/70">
                {currentPrice > 0 ? `€${currentPrice.toFixed(2)} a month · ` : ""}{bill.max_personas} persona{bill.max_personas === 1 ? "" : "s"}
                {bill.monthly_credits ? ` · ${bill.monthly_credits} credits every month` : ""}
              </p>
            </div>
            {bill.renews_at && (
              <p className="rounded-full bg-white/10 px-3 py-1 text-xs">
                {bill.status === "manual" ? "Given by Persona Studio · " : ""}renews {dayFmt.format(new Date(bill.renews_at))}
              </p>
            )}
          </div>

          {bill.monthly_credits > 0 ? (
            <div className="mt-8">
              <div className="flex items-baseline justify-between text-sm">
                <span>Monthly credits</span>
                <span className="tabular-nums"><b className="text-xl">{bill.plan_left}</b> <span className="text-white/60">of {bill.monthly_credits}</span></span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15" role="meter" aria-valuemin={0} aria-valuemax={bill.monthly_credits} aria-valuenow={bill.plan_left} aria-label="Monthly credits left">
                <div className="meter h-full rounded-full bg-[#e6c86e]" style={{ width: `${planPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-white/60">
                {usedThisPeriod} used this period. Monthly credits are used first; unused ones do not carry over.
              </p>
            </div>
          ) : (
            <p className="mt-8 text-sm text-white/70">The Free plan has no monthly credits. Choose a plan below to start creating.</p>
          )}

          <div className="mt-6 flex items-baseline justify-between border-t border-white/10 pt-4 text-sm">
            <span>Extra credits <span className="text-white/60">(bonus, packs; they never expire with the month)</span></span>
            <b className="text-xl tabular-nums">{bill.extra}</b>
          </div>
        </div>

        <div className="rounded-2xl bg-paper p-6 ring-1 ring-line">
          <h2 className="font-bold">What things cost</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              ["Photo with the persona's face", 2],
              ["Photo from a description", 2],
              ["Quick sketch", 1],
              ["AI writes a persona or a set of posts", 2],
            ].map(([t, c]) => (
              <li key={t as string} className="flex justify-between gap-3"><span className="text-muted">{t}</span><span className="tabular-nums font-semibold">{c} cr</span></li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">If a photo fails or our quality check rejects it, the credits come back automatically. Spotted a defect we missed? Report it on the frame and get them back.</p>
          {bill.has_subscription && payments && <div className="mt-5"><PortalButton /></div>}
        </div>
      </section>

      {/* Plans */}
      <section>
        <h2 className="text-2xl font-bold">{bill.monthly_credits ? "Change plan" : "Choose a plan"}</h2>
        {!payments && (
          <p className="mt-2 text-sm text-muted">
            Online payment is being set up.{isAdmin ? " Admin: add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to .env.local (see README)." : ""}
          </p>
        )}
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {(plans ?? []).map((p) => {
            const current = p.id === bill.plan_id;
            const price = Number(p.price_eur_incl_vat);
            const perCredit = (price / p.monthly_credits) * 100;
            const upgrade = price > currentPrice;
            return (
              <li key={p.id} className={`flex flex-col rounded-2xl p-6 ring-1 transition-shadow ${current ? "bg-paper ring-2 ring-accent" : "bg-paper ring-line hover:shadow-[0_14px_40px_-22px_rgba(23,32,43,.5)]"}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  {current && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">Your plan</span>}
                </div>
                <p className="mt-3"><span className="condensed text-5xl font-extrabold tabular-nums">€{price.toFixed(2)}</span><span className="text-muted"> / month</span></p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  <li><b className="tabular-nums">{p.monthly_credits}</b> credits every month <span className="text-muted">({perCredit.toFixed(1)}¢ each)</span></li>
                  <li>About <b className="tabular-nums">{Math.floor(p.monthly_credits / 2)}</b> photos with the same face</li>
                  <li>Up to <b>{p.max_personas}</b> persona{p.max_personas === 1 ? "" : "s"}</li>
                  <li>Your own digital twin</li>
                </ul>
                <div className="mt-5">
                  {current && bill.has_subscription ? (
                    <p className="text-center text-sm text-muted">Active</p>
                  ) : payments ? (
                    <PlanButton planId={p.id} primary={upgrade} label={current ? `Pay for ${p.name}` : bill.has_subscription ? `Switch to ${p.name}` : `Get ${p.name}`} />
                  ) : (
                    <button className="btn w-full justify-center" disabled>Coming soon</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">Prices include VAT. Switching plans starts a new month with the new plan&apos;s credits; the difference in price is settled on your next invoice.</p>
      </section>

      {/* Packs */}
      <section>
        <h2 className="text-2xl font-bold">Need more this month?</h2>
        <p className="mt-1 text-sm text-muted">Extra credits stay until you use them, also after your plan renews.</p>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 md:max-w-2xl">
          {(packs ?? []).map((k) => (
            <li key={k.id} className="rounded-2xl bg-paper p-5 ring-1 ring-line">
              <p className="text-2xl font-bold tabular-nums">{k.credits} credits</p>
              <p className="text-sm text-muted">€{Number(k.price_eur_incl_vat).toFixed(2)} · {((Number(k.price_eur_incl_vat) / k.credits) * 100).toFixed(1)}¢ each</p>
              <div className="mt-4">
                {payments && bill.plan_id !== "free" ? <PackButton packId={k.id} label="Buy" />
                  : <button className="btn w-full justify-center" disabled>{bill.plan_id === "free" ? "With a plan" : "Coming soon"}</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* History */}
      <section>
        <h2 className="text-2xl font-bold">Where your credits went</h2>
        {history.length ? (
          <div className="mt-5 overflow-x-auto rounded-2xl bg-paper ring-1 ring-line">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="p-3 font-medium">When</th>
                  <th className="p-3 font-medium">What</th>
                  <th className="p-3 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const d = describe(r);
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap p-3 text-muted tabular-nums">{dateFmt.format(new Date(r.created_at))}</td>
                      <td className="p-3">
                        {d.what}
                        {d.detail && <span className="block truncate text-xs text-muted md:max-w-[52ch]">{d.detail}</span>}
                      </td>
                      <td className={`p-3 text-right font-semibold tabular-nums ${r.delta > 0 ? "text-ok" : ""}`}>{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-muted">Nothing yet.</p>
        )}
        {payments && stripeTestMode() && isAdmin && (
          <p className="mt-3 text-xs text-muted">Stripe is in test mode: pay with card 4242 4242 4242 4242, any future date, any CVC.</p>
        )}
      </section>
    </div>
  );
}
