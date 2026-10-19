"use client";

import Link from "next/link";
import { useState } from "react";

const PLANS = [
  { id: "free", name: "Free", monthly: 0, personas: 1, credits: "30 to start", note: "Try one persona", features: ["AI persona passport", "Natural photos and quick sketches", "Posts in the persona's voice"] },
  { id: "starter", name: "Starter", monthly: 29.99, personas: 1, credits: "400 / month", note: "One face for your brand", features: ["Everything in Free", "Same face in every scene", "A digital twin of yourself"] },
  { id: "pro", name: "Pro", monthly: 69.99, personas: 5, credits: "1,200 / month", note: "Several brands or channels", features: ["Everything in Starter", "Consistency benchmarks", "Priority queue"], featured: true },
  { id: "business", name: "Business", monthly: 109.99, personas: 10, credits: "1,800 / month", note: "Agencies and teams", features: ["Everything in Pro", "Video when it launches", "Invoice billing"] },
];

const eur = (v: number) => (v === 0 ? "€0" : `€${v.toFixed(2).replace(".", ",")}`);

export function Pricing() {
  const [yearly, setYearly] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <div role="radiogroup" aria-label="Billing period" className="flex gap-1 rounded-full border border-line bg-paper p-1 text-sm">
          {[{ v: false, l: "Monthly" }, { v: true, l: "Yearly" }].map((o) => (
            <button key={o.l} role="radio" aria-checked={yearly === o.v} onClick={() => setYearly(o.v)}
              className={`rounded-full px-4 py-1.5 font-semibold ${yearly === o.v ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>{o.l}</button>
          ))}
        </div>
        <span className="text-sm text-muted">Yearly: two months free</span>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const price = yearly ? (p.monthly * 10) / 12 : p.monthly;
          return (
            <li key={p.id} className={`relative flex flex-col rounded-2xl p-6 ${p.featured ? "bg-ink text-paper" : "bg-paper ring-1 ring-line"}`}>
              <h3 className="text-2xl font-bold">{p.name}</h3>
              <p className={`text-sm ${p.featured ? "text-paper/70" : "text-muted"}`}>{p.note}</p>
              <p className="mt-5">
                <span key={`${p.id}${yearly}`} className="panel-in inline-block text-4xl font-extrabold tabular-nums" style={{ fontVariationSettings: '"wdth" 78' }}>{eur(price)}</span>
                <span className={`ml-1 text-sm ${p.featured ? "text-paper/70" : "text-muted"}`}>/ month</span>
              </p>
              <p className={`text-xs ${p.featured ? "text-paper/60" : "text-muted"}`}>{p.monthly ? `incl. VAT${yearly ? `, billed ${eur(p.monthly * 10)} yearly` : ""}` : "no card needed"}</p>

              <div className="mt-6">
                <p className="text-sm font-semibold">{p.personas} persona{p.personas === 1 ? "" : "s"}</p>
                <div className="mt-2 flex flex-wrap gap-1" aria-hidden>
                  {Array.from({ length: 10 }).map((_, n) => (
                    <span key={n} className={`h-6 w-4 rounded-[3px] ${n < p.personas ? (p.featured ? "bg-[#e6c86e]" : "bg-accent") : p.featured ? "bg-paper/15" : "bg-line"}`} />
                  ))}
                </div>
                <p className="mt-3 text-sm">{p.credits} credits</p>
              </div>
              <ul className={`mt-5 space-y-1.5 text-sm ${p.featured ? "text-paper/85" : "text-muted"}`}>
                {p.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <Link href="/login?mode=signup" className={`btn mt-6 ${p.featured ? "bg-paper text-ink hover:bg-white" : p.id === "free" ? "btn-ghost" : "btn-primary"}`}>
                {p.id === "free" ? "Start free" : `Choose ${p.name}`}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 max-w-2xl text-sm text-muted">
        1 credit is one quick sketch; natural photos and same-face photos cost 2, AI texts 2. Need more in a busy month? Add a credit pack, or wait for next month&apos;s refill.
      </p>
    </div>
  );
}
