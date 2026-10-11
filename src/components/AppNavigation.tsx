"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function AppNavigation({ items, faculty }: { items: { href: string; label: string }[]; faculty: boolean }) {
  const pathname = usePathname();
  const active = items.filter(n => pathname === n.href || pathname.startsWith(n.href + "/")).sort((a,b) => b.href.length - a.href.length)[0]?.href;
  return <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap items-center gap-1 text-sm lg:order-none lg:w-auto lg:flex-1 lg:flex-nowrap lg:overflow-x-auto">
    {items.map(n => <Link key={n.href} href={n.href} aria-current={active === n.href ? "page" : undefined} className={`relative whitespace-nowrap rounded-md px-2.5 py-2 hover:bg-slate-100 hover:text-slate-900 ${active === n.href ? "bg-slate-50 text-slate-900 after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-600" : "text-slate-600"}`}>{n.label}</Link>)}
    {faculty && <Link href="/student" className="whitespace-nowrap rounded-md px-2.5 py-2 text-slate-400 hover:bg-slate-100">Student view</Link>}
  </nav>;
}
