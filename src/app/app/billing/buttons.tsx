"use client";

import { useState, useTransition } from "react";
import { buyPack, choosePlan, openPortal } from "./actions";
import type { ActionResult } from "../actions";

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));
  return { pending, result, run };
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return <p role={result.ok ? "status" : "alert"} className={`mt-2 text-xs ${result.ok ? "text-ok" : "text-bad"}`}>{result.ok ? result.message : result.error}</p>;
}

export function PlanButton({ planId, label, primary }: { planId: string; label: string; primary?: boolean }) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => run(() => choosePlan(planId))}
        className={`btn w-full justify-center ${primary ? "btn-primary" : ""}`}>
        {pending ? "Opening Stripe…" : label}
      </button>
      <Feedback result={result} />
    </div>
  );
}

export function PackButton({ packId, label }: { packId: string; label: string }) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => run(() => buyPack(packId))} className="btn w-full justify-center">
        {pending ? "Opening Stripe…" : label}
      </button>
      <Feedback result={result} />
    </div>
  );
}

export function PortalButton() {
  const { pending, result, run } = useAction();
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => run(() => openPortal())} className="btn btn-ghost">
        {pending ? "Opening…" : "Manage subscription, card & invoices"}
      </button>
      <Feedback result={result} />
    </div>
  );
}
