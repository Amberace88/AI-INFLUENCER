"use client";

import { useActionState } from "react";
import { adminSetDailyLimit, type ActionResult } from "../actions";

export function DailyLimitForm({ current }: { current: number }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(adminSetDailyLimit, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="limit-usd">Daily cloud limit (USD)</label>
        <input id="limit-usd" name="usd" type="number" min={0} max={1000} step="0.5" defaultValue={current} className="field w-32 tabular-nums" />
      </div>
      <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save limit"}</button>
      {state && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-ok" : "text-bad"}`}>{state.ok ? state.message : state.error}</p>}
    </form>
  );
}
