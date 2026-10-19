import Image from "next/image";

// Example personas generated with Grok Imagine (fictional people, AI-generated).
// Files live in /public/personas/<look>-<scene>.webp, 800×1200.
export type PhotoLook = "lucia" | "marco" | "noa";
export type PhotoScene = "studio" | "beach" | "cafe" | "product" | "gym" | "night" | "office" | "street";

export const PHOTOS: Record<PhotoLook, PhotoScene[]> = {
  lucia: ["studio", "beach", "cafe", "product", "gym", "night"],
  marco: ["studio", "office", "gym"],
  noa: ["studio", "street", "product"],
};

export function PersonaPhoto({
  look, scene, alt, className = "", sizes = "(min-width: 1024px) 300px, 45vw", priority = false,
}: { look: PhotoLook; scene: PhotoScene; alt: string; className?: string; sizes?: string; priority?: boolean }) {
  return (
    <span className={`relative block aspect-[2/3] overflow-hidden ${className}`}>
      <Image src={`/personas/${look}-${scene}.webp`} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
    </span>
  );
}
