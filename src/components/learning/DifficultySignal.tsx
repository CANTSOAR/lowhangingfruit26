"use client";
import { LEVEL_NAMES } from "@/lib/engine/difficulty";
export default function DifficultySignal({ level, onChange, locked = false, patient, integrated = false }: { level: number; onChange: (level: number) => void; locked?: boolean; patient: string; integrated?: boolean }) {
  const label = `Difficulty: ${level} · ${LEVEL_NAMES[level]}${locked ? " · Fixed for this ongoing visit" : " · Click to change"}`;
  return <span className="group relative inline-flex">
    <button type="button" aria-label={`${label} for ${patient}`} aria-disabled={locked} data-tooltip={label} onClick={() => { if (!locked) onChange(level === 5 ? 1 : level + 1); }} className={`grid h-11 w-14 place-items-center text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-600 ${integrated ? "rounded-r-lg" : "rounded-xl border border-brand-100 bg-brand-50"}`}>
      <svg aria-hidden="true" viewBox="0 0 42 30" className="h-7 w-10">
        {[1,2,3,4,5].map(bar => <rect key={bar} x={2+(bar-1)*8} y={28-bar*5} width="5" height={bar*5} rx="1.5" className="transition-all duration-300 ease-out motion-reduce:transition-none" style={{ fill: bar <= level ? "currentColor" : "transparent", stroke: "currentColor", strokeWidth: 1.5, opacity: bar <= level ? 1 : 0.25, transformOrigin: "bottom", transform: bar <= level ? "scaleY(1)" : "scaleY(0.9)" }} />)}
      </svg>
    </button>
    <span aria-live="polite" className="sr-only">{level} {LEVEL_NAMES[level]}</span>
  </span>;
}
