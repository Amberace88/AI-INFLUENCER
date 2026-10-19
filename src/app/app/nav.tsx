"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/app/home", label: "Home", icon: "home" },
  { href: "/app/personas", label: "Personas", icon: "personas" },
  { href: "/app/studio", label: "Studio", icon: "studio" },
  { href: "/app/sheet", label: "Contact sheet", icon: "sheet" },
  { href: "/app/jobs", label: "Jobs & metrics", icon: "jobs" },
  { href: "/app/billing", label: "Plan & credits", icon: "card" },
];

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const links = isAdmin ? [...LINKS, { href: "/app/admin", label: "Admin", icon: "admin" as IconName }] : LINKS;
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col" aria-label="App">
      {links.map((l) => {
        const active = path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-[0.95rem] transition-colors ${
              active ? "bg-ink font-semibold text-paper" : "text-muted hover:bg-backdrop hover:text-ink"
            } ${l.href === "/app/admin" ? "md:mt-4" : ""}`}>
            <Icon name={l.icon} size={18} className={active ? "text-[#e6c86e]" : "transition-transform group-hover:scale-110"} />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
