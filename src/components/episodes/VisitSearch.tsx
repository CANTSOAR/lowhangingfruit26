"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

export default function VisitSearch({ initialQuery, view }: { initialQuery: string; view: "cards" | "table" }) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();
  return (
    <form role="search" className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1 basis-64">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <Input aria-label="Search visits" name="q" maxLength={250} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search patients, teammates, roles or anything said in a visit…" className="pl-12 pr-12" />
        {query.length > 0 && <button type="button" aria-label="Clear search" data-tooltip="Clear search" onClick={() => { setQuery(""); if (initialQuery) router.push(`/episodes?view=${view}`); }} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-rose-600 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-600">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>}
      </div>
      <input type="hidden" name="view" value={view} />
      <Button type="submit">Search</Button>
    </form>
  );
}
