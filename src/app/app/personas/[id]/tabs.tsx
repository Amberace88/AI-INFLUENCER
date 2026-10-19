"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PersonaTabs({ id }: { id: string }) {
  const path = usePathname();
  const tabs = [
    { href: `/app/personas/${id}`, label: "Profile" },
    { href: `/app/personas/${id}/posts`, label: "Posts" },
    { href: `/app/sheet?persona=${id}`, label: "Photos" },
  ];
  return (
    <nav aria-label="Persona sections" className="mt-6 flex gap-1 rounded-full bg-paper p-1 ring-1 ring-line sm:inline-flex">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
            className={`flex-1 rounded-full px-5 py-1.5 text-center text-sm transition-colors ${active ? "bg-ink font-semibold text-paper" : "text-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
