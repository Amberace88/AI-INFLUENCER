import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { workflowById } from "@/lib/catalog";
import { UsersTable, type AdminUser } from "./users-table";
import { DailyLimitForm } from "./daily-limit";

type Economics = {
  credit_floor_eur: number; credit_floor_source: string; eur_per_usd: number; min_margin_multiple: number; daily_limit_usd: number;
  actions: { kind: string; label: string; credits: number; usd_estimate: number; usd_actual_30d: number | null; revenue_eur: number; multiple: number | null; ok: boolean }[];
  today: { cost_usd: number; credits_spent: number; jobs: number; waiting: number };
  last_30d: { cost_usd: number; credits_spent: number };
};

type Overview = {
  users: number; users_7d: number; by_plan: Record<string, number>; personas: number; posts: number;
  jobs_30d: number; jobs_failed_30d: number; jobs_open: number; assets: number; assets_accepted: number;
  cost_usd_30d: number; credits_spent_30d: number; mrr_eur_incl_vat: number;
};

export default async function AdminPage() {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") notFound();

  const [{ data: ov, error }, { data: users }, { data: plans }, { data: failures }, { data: econ }] = await Promise.all([
    supabase.rpc("admin_overview"),
    supabase.rpc("admin_list_users"),
    supabase.from("plans").select("id, name, price_eur_incl_vat, max_personas, monthly_credits").order("sort"),
    supabase.from("jobs").select("id, owner_id, workflow, error, queued_at, attempts").eq("status", "failed").order("queued_at", { ascending: false }).limit(10),
    supabase.rpc("admin_economics"),
  ]);
  const e = econ as Economics | null;
  if (error) return <p className="text-bad">Admin overview failed: {error.message}</p>;
  const o = ov as Overview;
  const emails = new Map(((users ?? []) as AdminUser[]).map((u) => [u.id, u.email]));
  const fmt = (n: number) => new Intl.NumberFormat("en-GB").format(n);
  const failRate = o.jobs_30d ? Math.round((o.jobs_failed_30d / o.jobs_30d) * 100) : 0;

  const tiles: [string, string, string][] = [
    ["Users", fmt(o.users), `+${o.users_7d} this week`],
    ["Paying (MRR)", `€${o.mrr_eur_incl_vat.toFixed(2)}`, "incl. VAT, excl. your account"],
    ["Personas", fmt(o.personas), `${fmt(o.posts)} posts written`],
    ["Jobs, 30 days", fmt(o.jobs_30d), `${failRate}% failed · ${o.jobs_open} open`],
    ["Frames kept", fmt(o.assets_accepted), `of ${fmt(o.assets)} generated`],
    ["Cloud cost, 30 days", `$${Number(o.cost_usd_30d).toFixed(2)}`, `${fmt(o.credits_spent_30d)} credits spent`],
  ];

  return (
    <div className="max-w-6xl space-y-12">
      <header>
        <h1 className="condensed text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold">Admin</h1>
        <p className="mt-1 text-muted">The whole platform at a glance. Only you can see this page.</p>
      </header>

      <dl className="grid gap-px overflow-hidden rounded-2xl bg-line sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([k, v, sub]) => (
          <div key={k} className="bg-paper p-5">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="mt-1 text-3xl font-bold tabular-nums">{v}</dd>
            <dd className="text-xs text-muted">{sub}</dd>
          </div>
        ))}
      </dl>

      {e && <MoneySection e={e} />}

      <section>
        <h2 className="text-2xl font-bold">Plans in use</h2>
        <ul className="mt-4 flex flex-wrap gap-3">
          {(plans ?? []).map((p) => (
            <li key={p.id} className="rounded-xl bg-paper px-4 py-3 ring-1 ring-line">
              <span className="font-semibold">{p.name}</span>
              <span className="ml-2 tabular-nums text-muted">{o.by_plan?.[p.id] ?? 0} users</span>
              <p className="text-xs text-muted">€{Number(p.price_eur_incl_vat).toFixed(2)} · {p.max_personas} personas · {p.monthly_credits} cr/mo</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Users</h2>
        <p className="mt-1 text-sm text-muted">
          Switch your own plan to see the app exactly as a Free, Starter, Pro or Business client sees it. Credit changes are logged.
        </p>
        <UsersTable users={(users ?? []) as AdminUser[]} plans={(plans ?? []).map((p) => ({ id: p.id, name: p.name }))} meId={user.id} />
      </section>

      <section>
        <h2 className="text-2xl font-bold">Recent failures, all users</h2>
        {failures?.length ? (
          <ul className="mt-4 space-y-2 text-sm">
            {failures.map((f) => (
              <li key={f.id} className="rounded-lg bg-paper p-3 ring-1 ring-line">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
                  <span>{emails.get(f.owner_id) ?? f.owner_id.slice(0, 8)} · {workflowById(f.workflow)?.label ?? f.workflow} · {f.attempts} attempts</span>
                  <time>{new Date(f.queued_at).toLocaleString("en-GB")}</time>
                </div>
                <p className="mt-1 break-words text-bad">{f.error}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-muted">No failed jobs.</p>
        )}
      </section>
    </div>
  );
}

function MoneySection({ e }: { e: Economics }) {
  const usd = (n: number | null | undefined, d = 3) => (n == null ? "–" : `$${Number(n).toFixed(d)}`);
  const todayPct = e.daily_limit_usd > 0 ? Math.min(100, (Number(e.today.cost_usd) / e.daily_limit_usd) * 100) : 100;
  // what the credits spent are worth to us at the lowest net price, vs what the cloud cost
  const earned30 = Number(e.last_30d.credits_spent) * e.credit_floor_eur;
  const cost30 = Number(e.last_30d.cost_usd) * e.eur_per_usd;
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Money per action</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          One credit brings us at least <b className="text-ink">€{e.credit_floor_eur.toFixed(4)}</b> after 21% VAT and card fees
          (lowest case: {e.credit_floor_source}). Every action must earn {e.min_margin_multiple}× its real cloud cost.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-paper ring-1 ring-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 text-right font-medium">Credits</th>
              <th className="p-3 text-right font-medium">We earn</th>
              <th className="p-3 text-right font-medium">Cost, estimate</th>
              <th className="p-3 text-right font-medium">Cost, real 30 d</th>
              <th className="p-3 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {e.actions.map((a) => (
              <tr key={a.kind} className="border-b border-line last:border-0">
                <td className="p-3">{a.label}<span className="ml-2 text-xs text-muted">{a.kind}</span></td>
                <td className="p-3 text-right">{a.credits}</td>
                <td className="p-3 text-right">€{Number(a.revenue_eur).toFixed(3)}</td>
                <td className="p-3 text-right">{usd(a.usd_estimate, 4)}</td>
                <td className="p-3 text-right">{usd(a.usd_actual_30d, 4)}</td>
                <td className="p-3 text-right">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.ok ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad"}`}>
                    {a.multiple == null ? "local" : `${a.multiple}×`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-sm text-muted">Cloud spend today (UTC)</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{usd(e.today.cost_usd)} <span className="text-base font-normal text-muted">of ${e.daily_limit_usd}</span></p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className={`h-full rounded-full ${todayPct >= 100 ? "bg-bad" : todayPct > 75 ? "bg-warn" : "bg-ok"}`} style={{ width: `${todayPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">{e.today.jobs} jobs · {e.today.credits_spent} credits spent · {e.today.waiting} waiting. At the limit, cloud jobs wait until 00:00 UTC; nothing is lost.</p>
          <div className="mt-4"><DailyLimitForm current={e.daily_limit_usd} /></div>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-sm text-muted">Last 30 days</p>
          <dl className="mt-2 grid grid-cols-2 gap-4 tabular-nums">
            <div><dt className="text-xs text-muted">Credits spent, worth</dt><dd className="text-2xl font-bold">€{earned30.toFixed(2)}</dd></div>
            <div><dt className="text-xs text-muted">Cloud cost</dt><dd className="text-2xl font-bold">€{cost30.toFixed(2)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            {cost30 > 0 ? `Credits earned ${(earned30 / cost30).toFixed(1)}× what the cloud cost. ` : ""}
            Includes test and bonus credits, so it shows the price rule, not cash in the bank. Fixed costs (Supabase, Cloudflare plan) are not included.
          </p>
        </div>
      </div>
    </section>
  );
}
