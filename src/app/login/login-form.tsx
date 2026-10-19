"use client";

import { useActionState, useState } from "react";
import { signIn, type AuthState } from "./actions";

const MODES = [
  { id: "signin", label: "Sign in", button: "Sign in" },
  { id: "signup", label: "New account", button: "Create account" },
  { id: "magic", label: "Email link", button: "Send sign-in link" },
] as const;

export function LoginForm({ initialMode, next, linkError }: { initialMode: "signin" | "signup"; next: string; linkError: boolean }) {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>(initialMode);
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, linkError ? { error: "That sign-in link expired. Request a new one." } : null);
  const current = MODES.find((m) => m.id === mode)!;

  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <h1 className="condensed text-[2.6rem] font-extrabold leading-none">{mode === "signup" ? "Open your studio" : "Welcome back"}</h1>
        <p className="mt-2 text-muted">{mode === "signup" ? "30 free credits to cast your first persona. No card needed." : mode === "magic" ? "We email you a link; no password needed." : "Sign in to your personas, photos and posts."}</p>
      </div>
      <div role="tablist" className="flex gap-1 rounded-full bg-paper p-1 text-sm ring-1 ring-line">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 font-semibold ${mode === m.id ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" />
      </div>
      {mode !== "magic" && (
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" minLength={8} required
            autoComplete={mode === "signup" ? "new-password" : "current-password"} className="field" />
        </div>
      )}
      {state?.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
      {state?.message && <p role="status" className="text-sm text-ok">{state.message}</p>}
      <button className="btn btn-primary w-full py-3 text-base" disabled={pending}>{pending ? "Working…" : current.button}</button>
    </form>
  );
}
