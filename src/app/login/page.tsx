import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-lg font-bold" style={{ fontVariationSettings: '"wdth" 80' }}>Persona Studio</Link>
        {supabaseConfigured() ? (
          <LoginForm initialMode={sp.mode === "signup" ? "signup" : "signin"} next={sp.next ?? ""} linkError={sp.error === "link"} />
        ) : (
          <div className="mt-8 rounded-lg border border-warn/40 bg-paper p-5">
            <h1 className="text-2xl font-bold">Connect Supabase first</h1>
            <p className="mt-2 text-muted">
              Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Supabase URL and anon key, then restart
              <code> npm run dev</code>. The README walks through it.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
