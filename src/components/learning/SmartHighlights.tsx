"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { briefParts, feedbackParts } from "@/lib/feedback-text";
import { Term } from "./Preferences";
const Highlights = createContext<{ on: boolean; toggle: () => void }>({on:false,toggle:()=>{}});
export function SmartHighlights({children}: {children: ReactNode}) {
  const [on, setOn] = useState(false);
  return <Highlights.Provider value={{on,toggle:()=>setOn(v=>!v)}}>{children}</Highlights.Provider>;
}
export function SmartHighlightToggle() {
  const {on,toggle} = useContext(Highlights);
  return <button type="button" onClick={toggle} aria-pressed={on} data-tooltip={on ? "Hide important text" : "Highlight important text"} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium ${on ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-700"}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m14 3 7 7-8 8-7-7zM6 11l-3 6 4 4 6-3M3 21h7" /></svg>
    Highlights
  </button>;
}
/** Decorate only the briefing and record already visible to the student. */
export function SmartText({text}: {text: string}) {
  const {on} = useContext(Highlights);
  if (!on) return <>{text}</>;
  return <>{briefParts(text).map((part,i) => <span key={i}>{feedbackParts(part.text).map((p,j) => {
    const content = p.term ? <Term term={p.term} label={p.text} inline /> : p.text;
    return part.important || p.term ? <mark key={j} className={`rounded px-0.5 text-inherit ${part.important ? "bg-blue-100" : "bg-amber-100"}`}>{content}</mark> : <span key={j}>{content}</span>;
  })}</span>)}</>;
}
