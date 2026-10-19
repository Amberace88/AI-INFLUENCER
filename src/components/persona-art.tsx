// Illustrated, clearly fictional persona portraits used on the landing page and as
// placeholders until a persona has real photos. Same face, different scenes:
// that is the product promise, drawn.
import { useId } from "react";

export type Scene = "studio" | "cafe" | "beach" | "night" | "gym" | "product" | "office" | "street";
export type Look = "lucia" | "marco" | "noa";

const LOOKS: Record<Look, { skin: string; skinShade: string; hair: string; hairHi: string; style: "wavy" | "short" | "bob"; beard: boolean; hoops: boolean; mole: boolean; lip: string }> = {
  lucia: { skin: "#c99272", skinShade: "#b27c5d", hair: "#4a2a1d", hairHi: "#6b3d29", style: "wavy", beard: false, hoops: true, mole: true, lip: "#a55a4f" },
  marco: { skin: "#a8775a", skinShade: "#93654a", hair: "#1f1a17", hairHi: "#3a302a", style: "short", beard: true, hoops: false, mole: false, lip: "#8b5446" },
  noa: { skin: "#ecc7ad", skinShade: "#d9ad91", hair: "#d8b46a", hairHi: "#ecd08f", style: "bob", beard: false, hoops: false, mole: false, lip: "#c47a72" },
};

const SCENES: Record<Scene, { bg: [string, string]; top: string; tilt: number }> = {
  studio: { bg: ["#dfe5ec", "#c9d2dd"], top: "#2e4be0", tilt: -2 },
  cafe: { bg: ["#e9d3bb", "#c79f7b"], top: "#f2ede4", tilt: -4 },
  beach: { bg: ["#8fc6e6", "#f2d6a2"], top: "#f6f1e7", tilt: 5 },
  night: { bg: ["#1a1d3a", "#3b1f4f"], top: "#121418", tilt: -3 },
  gym: { bg: ["#cfd8d6", "#9fb1ad"], top: "#e2463a", tilt: 3 },
  product: { bg: ["#f1eee9", "#dcd6cc"], top: "#7a8f6b", tilt: -2 },
  office: { bg: ["#d7dee6", "#aab8c6"], top: "#2b3440", tilt: 0 },
  street: { bg: ["#f0c79a", "#d9876a"], top: "#e8e1d4", tilt: 4 },
};

export function PersonaArt({ scene = "studio", look = "lucia", className, title }: { scene?: Scene; look?: Look; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, "");
  const L = LOOKS[look];
  const S = SCENES[scene];
  const g = `bg${uid}`;
  const hairBack =
    L.style === "wavy"
      ? "M58 130c-6-42 18-66 42-66s50 26 44 66c4 24 10 44 4 66-10 14-26 8-30-4H86c-6 12-22 16-30 2-6-20 2-40 2-64z"
      : L.style === "bob"
        ? "M56 126c-4-38 18-60 44-60s48 22 44 60c2 18 4 28-2 38-14 6-24 0-26-8H86c-4 8-16 14-28 6-4-12-4-22-2-36z"
        : "M62 150c-2-40 14-62 38-62s40 22 38 62c-4-20-6-30-8-36H70c-2 6-4 16-8 36z";

  return (
    <svg viewBox="0 0 200 300" className={className} role="img" aria-label={title ?? `Illustrated persona, ${scene} scene`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={S.bg[0]} />
          <stop offset="1" stopColor={S.bg[1]} />
        </linearGradient>
      </defs>
      <rect width="200" height="300" fill={`url(#${g})`} />
      <SceneProps scene={scene} />

      <g transform={`rotate(${S.tilt} 100 210)`}>
        {/* hair behind */}
        <path d={hairBack} fill={L.hair} />
        {/* shoulders + top */}
        <path d="M24 300c4-46 30-70 76-72 46 2 72 26 76 72z" fill={S.top} />
        <path d="M84 222c4 10 10 14 16 14s12-4 16-14l-2-16H86z" fill={L.skinShade} />
        {scene === "office" && <path d="M92 236l8 64 8-64-8-6z" fill="#e9eef3" />}
        {/* face */}
        <ellipse cx="100" cy="150" rx="38" ry="48" fill={L.skin} />
        <ellipse cx="62" cy="152" rx="6" ry="10" fill={L.skinShade} />
        <ellipse cx="138" cy="152" rx="6" ry="10" fill={L.skinShade} />
        {L.hoops && (
          <>
            <circle cx="62" cy="170" r="6" fill="none" stroke="#d9b55a" strokeWidth="2.2" />
            <circle cx="138" cy="170" r="6" fill="none" stroke="#d9b55a" strokeWidth="2.2" />
          </>
        )}
        {/* brows + eyes */}
        <path d="M78 134q8-6 16-1M106 133q8-5 16 1" stroke={L.hair} strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="86" cy="146" rx="3.4" ry="4" fill="#20160f" />
        <ellipse cx="114" cy="146" rx="3.4" ry="4" fill="#20160f" />
        {/* nose + mouth */}
        <path d="M100 150q-4 12 2 14" stroke={L.skinShade} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M88 174q12 9 24 0" stroke={L.lip} strokeWidth="3.4" fill="none" strokeLinecap="round" />
        {L.mole && <circle cx="113" cy="168" r="1.6" fill="#5a3426" />}
        {L.beard && <path d="M66 160q4 40 34 42 30-2 34-42-6 20-34 22-28-2-34-22z" fill={L.hair} opacity=".55" />}
        {/* hair front */}
        {L.style === "wavy" && <path d="M61 136c1-32 18-48 41-48 24 0 38 20 37 44-9-17-23-25-40-23-16 2-28 11-38 27z" fill={L.hair} />}
        {L.style === "wavy" && <path d="M98 94c14 0 26 6 32 18" stroke={L.hairHi} strokeWidth="3" fill="none" strokeLinecap="round" />}
        {L.style === "bob" && <path d="M60 134c0-32 17-50 41-50s41 18 41 48c-12-15-26-21-42-21-16 0-30 9-40 23z" fill={L.hair} />}
        {L.style === "bob" && <path d="M74 102q27-15 54 0" stroke={L.hairHi} strokeWidth="3" fill="none" strokeLinecap="round" />}
        {L.style === "short" && <path d="M63 128c0-28 16-42 38-42s37 14 37 42c-5-10-15-17-37-17s-33 7-38 17z" fill={L.hair} />}
      </g>
      <ForegroundProps scene={scene} />
    </svg>
  );
}

function SceneProps({ scene }: { scene: Scene }) {
  switch (scene) {
    case "beach":
      return (
        <g>
          <circle cx="160" cy="54" r="18" fill="#fff3c9" />
          <path d="M0 196q50-10 100 0t100 0v20H0z" fill="#5fa8d3" opacity=".7" />
        </g>
      );
    case "night":
      return (
        <g>
          <rect x="12" y="30" width="54" height="16" rx="8" fill="none" stroke="#ff4fa3" strokeWidth="3" />
          <rect x="140" y="60" width="44" height="12" rx="6" fill="none" stroke="#53e0ff" strokeWidth="3" />
          <circle cx="40" cy="120" r="3" fill="#ffd36e" /><circle cx="168" cy="140" r="2" fill="#ffd36e" />
        </g>
      );
    case "cafe":
      return (
        <g>
          <rect x="0" y="40" width="200" height="6" fill="#8a6446" opacity=".5" />
          <circle cx="30" cy="80" r="10" fill="#f6e3b8" opacity=".8" /><circle cx="172" cy="74" r="8" fill="#f6e3b8" opacity=".8" />
        </g>
      );
    case "gym":
      return <rect x="0" y="70" width="200" height="4" fill="#6d7f7b" opacity=".6" />;
    case "office":
      return <g><rect x="14" y="40" width="40" height="60" fill="#c3cfdb" /><rect x="150" y="30" width="36" height="80" fill="#c3cfdb" /></g>;
    case "street":
      return <g><rect x="0" y="60" width="38" height="140" fill="#c56b54" opacity=".5" /><rect x="164" y="40" width="36" height="160" fill="#c56b54" opacity=".5" /></g>;
    default:
      return null;
  }
}

function ForegroundProps({ scene }: { scene: Scene }) {
  switch (scene) {
    case "cafe":
      return (
        <g>
          <rect x="128" y="250" width="34" height="34" rx="4" fill="#f9f6f0" />
          <path d="M162 258q12 2 0 16" stroke="#f9f6f0" strokeWidth="5" fill="none" />
          <path d="M138 240q4-8 0-14M150 240q4-8 0-14" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".7" />
        </g>
      );
    case "product":
      return (
        <g>
          <rect x="132" y="214" width="30" height="62" rx="6" fill="#e9f0ea" stroke="#9fb39a" strokeWidth="2" />
          <rect x="140" y="204" width="14" height="12" rx="2" fill="#7a8f6b" />
          <rect x="138" y="236" width="18" height="14" rx="2" fill="#7a8f6b" opacity=".5" />
        </g>
      );
    case "gym":
      return (
        <g>
          <rect x="120" y="262" width="60" height="7" rx="3" fill="#2a2f33" />
          <rect x="116" y="252" width="10" height="26" rx="3" fill="#2a2f33" /><rect x="174" y="252" width="10" height="26" rx="3" fill="#2a2f33" />
        </g>
      );
    default:
      return null;
  }
}
