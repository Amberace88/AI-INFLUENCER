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
    <nav className="mt-5 flex gap-6 border-b border-line text-sm">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2 ${active ? "border-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
