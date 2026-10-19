import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { PersonaPhoto } from "@/components/persona-photo";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,0.9fr)]">
      {/* Darkroom side: one persona, as the product shows them */}
      <section aria-hidden className="darkroom relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link href="/" className="text-paper"><Logo inverted /></Link>
        <div className="mx-auto flex w-full max-w-md items-end gap-6">
          <div className="frame w-56 shrink-0 -rotate-2 shadow-[0_30px_60px_-30px_rgba(0,0,0,.8)]">
            <PersonaPhoto look="lucia" scene="beach" alt="" className="rounded-[2px]" sizes="224px" priority />
            <span className="frame-no">01A · Playa del Albir</span>
          </div>
          <div className="pb-8">
            <p className="text-xs text-[#9eabb9]">Persona passport</p>
            <p className="condensed mt-1 text-3xl font-bold text-paper">Lucía Ferrer</p>
            <p className="mt-1 text-sm text-[#c9d2dc]">Brand ambassador for a surf school. Writes in Spanish.</p>
          </div>
        </div>
        <p className="max-w-sm text-sm text-[#9eabb9]">Same face, same voice, every week. Lucía is AI-made; your personas can be too, or a twin of you.</p>
      </section>

      <section className="grid place-items-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="lg:hidden"><Logo /></Link>
          {supabaseConfigured() ? (
            <LoginForm initialMode={sp.mode === "signup" ? "signup" : "signin"} next={sp.next ?? ""} linkError={sp.error === "link"} />
          ) : (
            <div className="mt-8 rounded-2xl bg-paper p-5 ring-1 ring-warn/40">
              <h1 className="text-2xl font-bold">Connect Supabase first</h1>
              <p className="mt-2 text-muted">
                Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Supabase URL and anon key, then restart
                <code> npm run dev</code>. The README walks through it.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
