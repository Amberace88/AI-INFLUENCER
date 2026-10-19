"use client";

import { useState } from "react";
import { PersonaPhoto, type PhotoLook, type PhotoScene } from "@/components/persona-photo";

const ROLES: { id: string; label: string; who: string; look: PhotoLook; scene: PhotoScene; lang: string; platform: string; post: string; use: string }[] = [
  {
    id: "ambassador", label: "Brand ambassador", who: "Lucía, for a surf school", look: "lucia", scene: "beach", lang: "ES", platform: "Instagram",
    post: "Tres cosas que nadie te cuenta de tu primera clase de surf: vas a beber agua salada, te vas a reír mucho y vas a querer volver mañana. Reserva en el enlace de la bio.",
    use: "The same face across every campaign, season after season, without booking a model.",
  },
  {
    id: "blogger", label: "Blogger", who: "Noa, budget travel", look: "noa", scene: "street", lang: "EN", platform: "Blog",
    post: "Valencia on €40 a day: where I ate, where I slept, and the one free viewpoint that beats every rooftop bar in town.",
    use: "A niche voice that publishes every week, in your tone, on the topics your customers search for.",
  },
  {
    id: "representative", label: "Company representative", who: "Marco, for a renovation firm", look: "marco", scene: "office", lang: "ES", platform: "LinkedIn",
    post: "Este mes hemos entregado 14 reformas en Finestrat y Altea. Lo que más nos piden los clientes extranjeros: plazos claros y un solo interlocutor.",
    use: "A consistent spokesperson for news, offers and behind-the-scenes, without putting staff on camera.",
  },
  {
    id: "educator", label: "Educator", who: "Noa, skincare basics", look: "noa", scene: "product", lang: "DE", platform: "TikTok",
    post: "Sonnencreme im Winter? Ja. UV-Strahlen machen keine Ferien. Hier ist, wie viel du wirklich brauchst 👇",
    use: "Short lessons and how-tos that turn a product into something people understand and trust.",
  },
  {
    id: "influencer", label: "Lifestyle influencer", who: "Marco, fitness after 40", look: "marco", scene: "gym", lang: "EN", platform: "Instagram",
    post: "Week 6. No miracle, just three sessions a week and better sleep. Here's the routine that finally stuck.",
    use: "A creator for your niche that posts on schedule and recommends what you sell, honestly.",
  },
  {
    id: "support", label: "Customer helper", who: "Lucía, for an online shop", look: "lucia", scene: "cafe", lang: "LV", platform: "Facebook",
    post: "Kā izvēlēties pareizo izmēru? Paņem savu mīļāko kreklu, izmēri to no padusēm un salīdzini ar tabulu. Divas minūtes, nulle atgriešanu.",
    use: "A friendly face for FAQs, onboarding and product guides, in every language your customers speak.",
  },
];

export function RolesShowcase() {
  const [active, setActive] = useState(ROLES[0].id);
  const r = ROLES.find((x) => x.id === active)!;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
      <div role="tablist" aria-label="Persona jobs" className="flex flex-col gap-1">
        {ROLES.map((x) => {
          const on = x.id === active;
          return (
            <button key={x.id} role="tab" aria-selected={on} aria-controls="role-panel" onClick={() => setActive(x.id)}
              className={`group flex items-baseline justify-between gap-4 rounded-xl px-4 py-3 text-left transition-colors ${on ? "bg-ink text-paper" : "hover:bg-paper"}`}>
              <span className="text-2xl font-bold sm:text-3xl" style={{ fontVariationSettings: on ? '"wdth" 75' : '"wdth" 90', transition: "font-variation-settings .35s ease" }}>{x.label}</span>
              <span className={`hidden text-sm sm:block ${on ? "text-paper/70" : "text-muted"}`}>{x.who}</span>
            </button>
          );
        })}
      </div>

      <div id="role-panel" role="tabpanel" key={r.id} className="panel-in grid gap-5 rounded-2xl bg-paper p-4 ring-1 ring-line sm:grid-cols-[180px_1fr] sm:p-5">
        <div className="frame">
          <PersonaPhoto scene={r.scene} look={r.look} sizes="180px" className="developing w-full rounded-[2px]" alt={`${r.who}, AI persona`} />
          <span className="frame-no">{r.platform} · {r.lang}</span>
        </div>
        <div className="flex flex-col">
          <p className="text-sm text-muted">{r.who}</p>
          <blockquote className="mt-3 border-l-2 border-accent pl-4 text-lg leading-relaxed">{r.post}</blockquote>
          <p className="mt-auto pt-6 text-muted">{r.use}</p>
        </div>
      </div>
    </div>
  );
}
