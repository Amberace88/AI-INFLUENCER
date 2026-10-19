"use client";

import { useState, useTransition } from "react";
import { adminGrantCredits, adminSetPlan } from "../actions";

export type AdminUser = {
  id: string; email: string; display_name: string | null; role: string; plan_id: string; balance: number;
  personas: number; jobs_30d: number; created_at: string; last_sign_in_at: string | null;
};

export function UsersTable({ users, plans, meId }: { users: AdminUser[]; plans: { id: string; name: string }[]; meId: string }) {
  const [rows, setRows] = useState(users);
  const [q, setQ] = useState("");
  const filtered = rows.filter((u) => !q || u.email.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mt-4">
      <input className="field max-w-sm" placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
      <div className="mt-4 overflow-x-auto rounded-xl bg-paper ring-1 ring-line">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              {["User", "Plan", "Credits", "Personas", "Jobs 30d", "Last sign-in", "Adjust credits"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <Row key={u.id} u={u} plans={plans} isMe={u.id === meId}
                onChange={(patch) => setRows((all) => all.map((x) => (x.id === u.id ? { ...x, ...patch } : x)))} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ u, plans, isMe, onChange }: { u: AdminUser; plans: { id: string; name: string }[]; isMe: boolean; onChange: (p: Partial<AdminUser>) => void }) {
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setPlan = (plan: string) => {
    const prev = u.plan_id;
    onChange({ plan_id: plan });
    start(async () => {
      const r = await adminSetPlan(u.id, plan);
      if (!r.ok) onChange({ plan_id: prev });
      setMsg(r.ok ? { ok: true, text: "Plan saved" } : { ok: false, text: r.error });
    });
  };
  const grant = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    start(async () => {
      const r = await adminGrantCredits(u.id, n, "admin panel");
      if (r.ok) { onChange({ balance: u.balance + n }); setAmount(""); }
      setMsg(r.ok ? { ok: true, text: r.message ?? "Done" } : { ok: false, text: r.error });
    });
  };

  return (
    <tr className="border-b border-line/70 align-middle last:border-0">
      <td className="px-4 py-3">
        <span className="font-semibold">{u.email}</span>
        {isMe && <span className="ml-2 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-[#e6c86e]">YOU · ADMIN</span>}
        <div className="text-xs text-muted">since {new Date(u.created_at).toLocaleDateString("en-GB")}</div>
      </td>
      <td className="px-4 py-3">
        <select className="field py-1.5" value={u.plan_id} disabled={pending} onChange={(e) => setPlan(e.target.value)} aria-label={`Plan for ${u.email}`}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
      <td className="px-4 py-3 tabular-nums">{u.balance}</td>
      <td className="px-4 py-3 tabular-nums">{u.personas}</td>
      <td className="px-4 py-3 tabular-nums">{u.jobs_30d}</td>
      <td className="px-4 py-3 text-muted">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("en-GB") : "–"}</td>
      <td className="px-4 py-3">
        <form onSubmit={grant} className="flex items-center gap-2">
          <input className="field w-24 py-1.5" inputMode="numeric" placeholder="+100" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ""))} aria-label={`Credits for ${u.email}`} />
          <button className="btn btn-ghost py-1.5" disabled={pending || !amount || amount === "-"}>Apply</button>
        </form>
        {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
      </td>
    </tr>
  );
}
