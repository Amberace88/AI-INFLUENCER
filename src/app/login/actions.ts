"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | null;

function safeNext(v: FormDataEntryValue | null) {
  const s = String(v || "");
  return s.startsWith("/app") ? s : "/app/studio";
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const mode = String(form.get("mode") || "signin");

  if (!email) return { error: "Enter your email." };

  if (mode === "magic") {
    const origin = (await headers()).get("origin") ?? "";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}` },
    });
    return error ? { error: error.message } : { message: `Sign-in link sent to ${email}.` };
  }

  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  if (mode === "signup") {
    const origin = (await headers()).get("origin") ?? "";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) return { error: error.message };
    if (!data.session) return { message: `Check ${email} to confirm your account.` };
    redirect("/app/personas");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message === "Invalid login credentials" ? "Email or password is wrong." : error.message };
  redirect(safeNext(form.get("next")));
}
