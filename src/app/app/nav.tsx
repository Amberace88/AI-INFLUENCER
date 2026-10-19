"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

type L = { href: string; label: string; icon: IconName; match?: string };

const MAKE: L[] = [
  { href: "/app/home", label: "Home", icon: "home" },
  { href: "/app/personas", label: "Personas", icon: "personas" },
  { href: "/app/studio", label: "Studio", icon: "studio" },
  { href: "/app/sheet", label: "Contact sheet", icon: "sheet" },
];
const ACCOUNT: L[] = [
  { href: "/app/jobs", label: "Jobs & metrics", icon: "jobs" },
  { href: "/app/billing", label: "Plan & credits", icon: "card" },
];

export function Nav({ isAdmin, onSet = 0 }: { isAdmin: boolean; onSet?: number }) {
  const path = usePathname();
  const account = isAdmin ? [...ACCOUNT, { href: "/app/admin", label: "Admin", icon: "admin" as IconName }] : ACCOUNT;

  const item = (l: L) => {
    const active = path.startsWith(l.href);
    return (
      <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
        className="console-link group relative flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-[0.95rem] transition-colors">
        <Icon name={l.icon} size={18} className={active ? "text-safelight" : "transition-transform group-hover:scale-110"} />
        {l.label}
        {l.href === "/app/studio" && onSet > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-xs tabular-nums text-safelight" title={`${onSet} on set now`}>
            <span className="size-1.5 animate-pulse rounded-full bg-safelight shadow-[0_0_8px_var(--safelight)]" aria-hidden />
            {onSet}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:overflow-visible md:pl-3 md:pr-3" aria-label="App">
      {MAKE.map(item)}
      <div className="hidden md:block md:h-5" aria-hidden />
      {account.map(item)}
    </nav>
  );
}
