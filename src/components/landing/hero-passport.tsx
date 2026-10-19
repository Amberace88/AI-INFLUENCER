"use client";

import { useEffect, useRef, useState } from "react";
import { PersonaPhoto, type PhotoScene } from "@/components/persona-photo";

const SHOTS: { scene: PhotoScene; place: string; caption: string }[] = [
  { scene: "beach", place: "Playa del Albir, 8:10", caption: "Hoy el mar estaba de cristal. Primera clase del día con los peques de Marea: nadie se cayó… bueno, casi nadie 🌊" },
  { scene: "cafe", place: "Café del puerto, 10:30", caption: "Café con leche y la tabla de mareas abierta. ¿Mañana a las 9 o a las 11? Vosotros decidís." },
  { scene: "product", place: "Estudio, 12:00", caption: "Lo que llevo siempre en la mochila: crema solar mineral, factor 50. Tu piel te lo agradecerá en agosto." },
  { scene: "gym", place: "Gimnasio, 18:00", caption: "Diez minutos de hombros antes de entrar al agua. Sin esto, la remada te pasa factura." },
  { scene: "night", place: "Benidorm, 21:40", caption: "Fin de temporada con todo el equipo. Gracias por un verano increíble ✨" },
  { scene: "studio", place: "Foto de perfil", caption: "Soy Lucía. Enseño surf en la Costa Blanca y comparto lo que aprendo en el agua y fuera de ella." },
];

export function HeroPassport() {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // type the caption, then hold, then advance
  useEffect(() => {
    const text = SHOTS[i].caption;
    if (reduced.current) { setTyped(text); return; }
    setTyped("");
    let n = 0;
    const t = setInterval(() => {
      n += 2;
      setTyped(text.slice(0, n));
      if (n >= text.length) clearInterval(t);
    }, 22);
    return () => clearInterval(t);
  }, [i]);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setI((x) => (x + 1) % SHOTS.length), 5200);
    return () => clearTimeout(t);
  }, [i, paused]);

  const shot = SHOTS[i];

  return (
    <div className="rise-3 relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative grid overflow-hidden rounded-2xl bg-paper shadow-[0_30px_80px_-30px_rgba(23,32,43,.45)] ring-1 ring-line sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="relative flex flex-col bg-ink p-3 pb-9">
          <PersonaPhoto key={shot.scene} scene={shot.scene} look="lucia" priority={i === 0} sizes="(min-width: 1024px) 280px, 50vw" className="developing w-full rounded-[3px] sm:aspect-auto sm:min-h-[340px] sm:flex-1" alt={`Lucía, AI persona, ${shot.place}`} />
          <span className="absolute bottom-3 left-3 text-xs tabular-nums safelight">{String(i + 1).padStart(2, "0")}A · {shot.place}</span>
          <span key={`k${i}`} className="stamp stamp-in text-ok">KEEP</span>
        </div>
        <div className="flex flex-col p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="inline-block size-2 rounded-full bg-ok" aria-hidden />
            Persona passport
          </div>
          <h2 className="mt-2 text-3xl font-extrabold" style={{ fontVariationSettings: '"wdth" 80' }}>Lucía Ferrer</h2>
          <p className="text-sm text-muted">Brand ambassador for a surf school · writes in Spanish</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted">Face</dt><dd>late 20s, wavy chestnut hair, gold hoops, small mole above the lip</dd></div>
            <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted">Voice</dt><dd>warm, short sentences, one emoji at most</dd></div>
            <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted">Never</dt><dd>hard sells, medical claims</dd></div>
          </dl>
          <div className="mt-4 flex-1 rounded-xl bg-backdrop p-4">
            <p className="text-xs text-muted">Instagram · written by Lucía</p>
            <p className="caret mt-1 min-h-[6.5rem] text-[0.95rem] leading-relaxed" aria-live="polite">{typed}</p>
          </div>
          <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Scenes">
            {SHOTS.map((s, n) => (
              <button key={s.scene} role="tab" aria-selected={n === i} aria-label={s.place} onClick={() => setI(n)}
                className={`h-1.5 flex-1 rounded-full transition-colors ${n === i ? "bg-accent" : "bg-line hover:bg-muted"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
