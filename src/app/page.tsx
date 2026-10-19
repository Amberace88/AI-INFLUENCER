import Link from "next/link";
import { PersonaPhoto, type PhotoLook, type PhotoScene } from "@/components/persona-photo";
import { HeroPassport } from "@/components/landing/hero-passport";
import { RolesShowcase } from "@/components/landing/roles-showcase";
import { Pricing } from "@/components/landing/pricing";
import { SiteHeader } from "@/components/landing/site-header";
import { Logo } from "@/components/logo";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

const STRIP: { scene: PhotoScene; look: PhotoLook; label: string }[] = [
  { scene: "beach", look: "lucia", label: "Lucía · Albir" },
  { scene: "office", look: "marco", label: "Marco · site visit" },
  { scene: "street", look: "noa", label: "Noa · Valencia" },
  { scene: "cafe", look: "lucia", label: "Lucía · morning" },
  { scene: "gym", look: "marco", label: "Marco · week 6" },
  { scene: "product", look: "noa", label: "Noa · SPF tip" },
  { scene: "night", look: "lucia", label: "Lucía · season end" },
  { scene: "studio", look: "marco", label: "Marco · profile" },
  { scene: "studio", look: "noa", label: "Noa · profile" },
  { scene: "gym", look: "lucia", label: "Lucía · warm-up" },
];

const SHEET: { scene: PhotoScene; keep: boolean; score: number }[] = [
  { scene: "studio", keep: true, score: 4.8 },
  { scene: "beach", keep: true, score: 4.6 },
  { scene: "night", keep: false, score: 3.2 },
  { scene: "cafe", keep: true, score: 4.5 },
  { scene: "gym", keep: true, score: 4.4 },
  { scene: "product", keep: true, score: 4.7 },
];

const FAQ = [
  { q: "Is it obvious the persona is AI?", a: "It should be. Every persona is fictional, and we recommend labelling posts as AI-generated. EU rules already require disclosure for synthetic content that could pass as real, and Persona Studio is built around being upfront about it." },
  { q: "Can I make a persona of a real person?", a: "Only with that person's documented, written consent, and you confirm it when creating the persona. Personas of public figures or anyone who has not agreed are not allowed." },
  { q: "How consistent is the face, really?", a: "Good, not perfect. Fast drafts keep the look from the description; reference-photo workflows hold the face much better. Every frame gets a score, and you only publish what you keep. We show you the numbers instead of promising perfection." },
  { q: "What languages can a persona write in?", a: "Spanish, English, German, French, Italian, Portuguese, Latvian and Russian today. One persona writes in one main language, so the voice stays consistent." },
  { q: "What happens when my credits run out?", a: "Generation pauses until your monthly refill, or you add a credit pack. Failed generations are refunded automatically, so you never pay for a technical error." },
  { q: "Can I use the images and posts commercially?", a: "Yes, for your own marketing and your clients' marketing, under our terms. Don't use them for deceptive claims or to misrepresent a product." },
];

export default async function Home() {
  let signedIn = false;
  if (supabaseConfigured()) {
    const supabase = await createClient();
    signedIn = Boolean((await supabase.auth.getUser()).data.user);
  }

  return (
    <div className="min-h-dvh overflow-x-clip">
      <SiteHeader signedIn={signedIn} />

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-8 pb-16 md:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:pb-24">
          <div>
            <h1 className="text-[clamp(2.9rem,7.2vw,5.6rem)] font-extrabold leading-[0.95]">
              <span className="headline-in block">Create a person once.</span>
              <span className="headline-in-late block text-accent">Publish them everywhere.</span>
            </h1>
            <p className="rise-1 mt-7 max-w-xl text-lg text-muted md:text-xl">
              Persona Studio builds an AI character for your brand, with a face, a voice and a job. Then it writes
              their posts and shoots their photos, week after week, looking and sounding like the same person.
            </p>
            <div className="rise-2 mt-9 flex flex-wrap items-center gap-3">
              <Link href={signedIn ? "/app/personas/new" : "/login?mode=signup"} className="btn btn-primary px-6 py-3 text-base">Create your persona</Link>
              <a href="#jobs" className="btn btn-ghost px-6 py-3 text-base">See what they can do</a>
            </div>
            <p className="rise-2 mt-5 text-sm text-muted">Free to start · 30 credits · no card</p>
          </div>
          <HeroPassport />
        </section>

        {/* Film strip */}
        <section aria-label="Personas made in the studio" className="darkroom py-5">
          <div className="flex overflow-hidden">
            <div className="marquee flex shrink-0 gap-3 pr-3">
              {[...STRIP, ...STRIP].map((s, n) => (
                <figure key={n} className="w-[150px] shrink-0 sm:w-[170px]" aria-hidden={n >= STRIP.length}>
                  <PersonaPhoto scene={s.scene} look={s.look} sizes="170px" className="w-full rounded-[3px]" alt={`${s.label}, AI persona`} />
                  <figcaption className="mt-1.5 text-xs tabular-nums safelight">{String((n % STRIP.length) + 1).padStart(2, "0")}A · {s.label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Jobs */}
        <section id="jobs" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:py-28">
          <div className="max-w-2xl">
            <h2 className="text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold">Not just an influencer.<br />Whoever your brand needs.</h2>
            <p className="mt-4 text-lg text-muted">
              Give the persona a job and it behaves like it: a surf instructor sells lessons differently from a renovation
              firm&apos;s spokesperson. Pick one to see a real draft.
            </p>
          </div>
          <div className="mt-12"><RolesShowcase /></div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 border-y border-line bg-paper">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
            <h2 className="max-w-2xl text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold">From one paragraph to a month of content</h2>
            <ol className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
              <li>
                <span className="text-6xl font-extrabold tabular-nums text-accent" style={{ fontVariationSettings: '"wdth" 70' }}>1</span>
                <h3 className="mt-3 text-2xl font-bold">Describe who you need</h3>
                <p className="mt-2 text-muted">A sentence or two is enough. The AI writes the full passport: face, backstory, values, voice, topics, and what they never say. You edit anything.</p>
                <div className="mt-5 rounded-xl bg-backdrop p-4 text-sm">
                  <p className="text-muted">Your brief</p>
                  <p className="mt-1">&ldquo;Sporty woman around 30 from Alicante who loves paddle surf; promotes a local surf school.&rdquo;</p>
                </div>
              </li>
              <li>
                <span className="text-6xl font-extrabold tabular-nums text-accent" style={{ fontVariationSettings: '"wdth" 70' }}>2</span>
                <h3 className="mt-3 text-2xl font-bold">Let them write and pose</h3>
                <p className="mt-2 text-muted">Ask for five Instagram posts about summer lessons. Each comes with a photo idea; one click shoots it with the same face.</p>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {(["beach", "cafe", "product"] as PhotoScene[]).map((s) => (
                    <PersonaPhoto key={s} scene={s} look="lucia" sizes="120px" className="w-full rounded-md" alt={`Lucía, ${s} scene`} />
                  ))}
                </div>
              </li>
              <li>
                <span className="text-6xl font-extrabold tabular-nums text-accent" style={{ fontVariationSettings: '"wdth" 70' }}>3</span>
                <h3 className="mt-3 text-2xl font-bold">Keep only what&apos;s right</h3>
                <p className="mt-2 text-muted">Review every frame like a photographer&apos;s contact sheet. Keep, reject, score. Then copy the post and publish.</p>
                <div className="mt-5 space-y-2 rounded-xl bg-backdrop p-4 text-sm">
                  {[["Face identity", 92], ["Follows the prompt", 86], ["Usable in an ad", 78]].map(([k, v]) => (
                    <div key={k as string}>
                      <div className="flex justify-between"><span>{k}</span><span className="tabular-nums text-muted">{((v as number) / 20).toFixed(1)}</span></div>
                      <div className="meter mt-1 h-1.5 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-accent" style={{ width: `${v}%` }} /></div>
                    </div>
                  ))}
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Consistency */}
        <section className="darkroom">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
            <div>
              <h2 className="text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold">The face holds.<br /><span className="safelight">You can check it.</span></h2>
              <p className="mt-5 text-lg text-[#b9c3cf]">
                Most AI tools hope the character looks the same. Persona Studio measures it. Run a twelve-scene benchmark on
                any persona and see, frame by frame, where identity holds and where it slips.
              </p>
              <p className="mt-4 text-[#b9c3cf]">Rejected frames don&apos;t reach your feed. Failed ones don&apos;t cost credits.</p>
            </div>
            <ul className="grid grid-cols-3 gap-3">
              {SHEET.map((f, n) => (
                <li key={f.scene} className="frame relative" style={{ background: "#0e141c" }}>
                  <PersonaPhoto scene={f.scene} look="lucia" sizes="200px" className={`w-full rounded-[2px] ${f.keep ? "" : "opacity-40 grayscale"}`} alt={`Lucía, ${f.scene} frame, score ${f.score}`} />
                  <span className="frame-no">{String(n + 1).padStart(3, "0")} · {f.score.toFixed(1)}</span>
                  <span className={`stamp ${f.keep ? "text-ok" : "text-bad"}`}>{f.keep ? "KEEP" : "NO"}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:py-28">
          <h2 className="max-w-2xl text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold">Pay for personas, not for seats</h2>
          <p className="mt-4 max-w-2xl text-lg text-muted">Each plan includes a number of personas and monthly credits. Prices include Spanish VAT.</p>
          <div className="mt-10"><Pricing /></div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-line bg-paper">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:py-28 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <h2 className="text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold">Straight answers</h2>
            <div className="divide-y divide-line border-y border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="faq group">
                  <summary className="flex items-center justify-between gap-6 py-5 text-lg font-semibold">
                    {f.q}
                    <svg className="chev shrink-0" width="20" height="20" viewBox="0 0 20 20" aria-hidden><path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </summary>
                  <div className="pb-6 pr-10 text-muted">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <div className="grid items-center gap-10 rounded-3xl bg-accent p-8 text-white md:grid-cols-[1fr_auto] md:p-14">
            <div>
              <h2 className="text-[clamp(2.2rem,5vw,3.8rem)] font-extrabold">Who should your brand hire?</h2>
              <p className="mt-3 max-w-xl text-lg text-white/80">Describe them in a sentence. Meet them in thirty seconds.</p>
            </div>
            <Link href={signedIn ? "/app/personas/new" : "/login?mode=signup"} className="btn bg-white px-7 py-3.5 text-base text-ink hover:bg-paper">Create your persona</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-muted md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <Logo />
            <p className="mt-3">
              All personas are fictional and AI-generated, including every person shown on this page. Generated images can
              contain mistakes in hands, text and products; review before publishing.
            </p>
          </div>
          <nav className="flex gap-6" aria-label="Footer">
            <a href="#pricing" className="hover:text-ink">Pricing</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
