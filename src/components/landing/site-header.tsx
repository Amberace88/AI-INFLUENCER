"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";

const LINKS = [
  { href: "#jobs", label: "What they do" },
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={`sticky top-0 z-40 transition-[background-color,box-shadow] duration-300 ${scrolled || open ? "bg-backdrop/85 shadow-[0_1px_0_var(--line)] backdrop-blur-md" : ""}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" aria-label="Persona Studio home"><Logo /></Link>
        <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Main">
          {LINKS.map((l) => <a key={l.href} href={l.href} className="text-muted hover:text-ink">{l.label}</a>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Link href="/app/home" className="btn btn-primary">Open studio</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">Sign in</Link>
              <Link href="/login?mode=signup" className="btn btn-primary">Start free</Link>
            </>
          )}
        </div>
        <button className="md:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>
          <span className="sr-only">Menu</span>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" className="panel-in border-t border-line px-5 pb-5 md:hidden" aria-label="Mobile">
          <ul className="flex flex-col py-2 text-lg">
            {LINKS.map((l) => <li key={l.href}><a href={l.href} onClick={() => setOpen(false)} className="block py-2">{l.label}</a></li>)}
          </ul>
          <div className="flex gap-2">
            {signedIn ? <Link href="/app/home" className="btn btn-primary flex-1">Open studio</Link> : (
              <>
                <Link href="/login" className="btn btn-ghost flex-1">Sign in</Link>
                <Link href="/login?mode=signup" className="btn btn-primary flex-1">Start free</Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
