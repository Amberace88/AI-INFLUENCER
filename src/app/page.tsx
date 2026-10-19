import Link from "next/link";
import { BENCHMARK_SCENES } from "@/lib/benchmark";

const STRIP = BENCHMARK_SCENES.slice(0, 6);

export default function Home() {
  return (
    <main className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="text-lg font-bold" style={{ fontVariationSettings: '"wdth" 80' }}>Persona Studio</span>
        <Link href="/login" className="btn btn-ghost">Sign in</Link>
      </header>

      <section className="mx-auto max-w-6xl px-5 pt-10 pb-14 md:pt-20">
        <h1 className="max-w-4xl text-[clamp(2.8rem,8vw,6.5rem)] font-extrabold">
          The same face in every shot of your campaign.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Describe an AI persona once, then generate it in new scenes, outfits and products.
          Review every frame, keep the ones that hold the identity, export the rest of the campaign.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login?mode=signup" className="btn btn-primary">Create a persona</Link>
          <a href="#how" className="btn btn-ghost">How it works</a>
        </div>
      </section>

      {/* The memorable element: one persona across a contact-sheet strip */}
      <section aria-label="One persona, six scenes" className="overflow-hidden bg-ink py-6">
        <div className="mx-auto flex max-w-6xl gap-3 overflow-x-auto px-5 pb-2">
          {STRIP.map((s, i) => (
            <figure key={s.key} className="frame min-w-[180px] flex-1">
              <div className="flex aspect-[2/3] items-end rounded-[2px] bg-gradient-to-b from-[#2a3646] to-[#1d2733] p-3">
                <figcaption className="text-sm leading-snug text-[#c9d3df]">{s.prompt}</figcaption>
              </div>
              <span className="frame-no">{String(i + 1).padStart(2, "0")}A · Lucía</span>
            </figure>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-4xl font-bold">How it works</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {[
            ["Cast your persona", "Write down face, hair, build and wardrobe, and add reference photos. That description goes into every prompt."],
            ["Shoot scenes", "Pick a scene, a format and how many takes. Generation runs on your own ComfyUI or in the cloud."],
            ["Keep what works", "Score each frame for identity and quality. Accepted frames are your campaign; the scores tell you which workflow to trust."],
          ].map(([t, d], i) => (
            <li key={t} className="border-t-2 border-ink pt-4">
              <span className="text-5xl font-extrabold text-accent tabular-nums">{i + 1}</span>
              <h3 className="mt-2 text-xl font-bold">{t}</h3>
              <p className="mt-2 text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mx-auto max-w-6xl border-t border-line px-5 py-8 text-sm text-muted">
        Personas are fictional unless you have documented consent from the real person. Generated images can contain
        mistakes in hands, text and products; review before publishing.
      </footer>
    </main>
  );
}
