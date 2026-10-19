"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app/studio", label: "Studio" },
  { href: "/app/personas", label: "Personas" },
  { href: "/app/sheet", label: "Contact sheet" },
  { href: "/app/jobs", label: "Jobs & metrics" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3">
      {LINKS.map((l) => {
        const active = path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-[0.95rem] ${
              active ? "bg-ink font-semibold text-paper" : "text-muted hover:bg-backdrop hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
