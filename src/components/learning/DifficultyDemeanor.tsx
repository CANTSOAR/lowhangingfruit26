import { INTERVIEW_STYLES } from "@/lib/engine/difficulty";

export default function DifficultyDemeanor({ level, patient }: { level: number; patient: string }) {
  const style = INTERVIEW_STYLES[level];
  return <span tabIndex={0} role="img" aria-label={`${patient}: ${style.label} interview difficulty`} data-tooltip={`Level ${level}: ${style.label} · ${style.description}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand-100 bg-brand-50 text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-7 w-7">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 10h.01M16 10h.01" strokeWidth="3" />
      {level === 1 ? <path d="M7.5 14q4.5 7 9 0z" /> : level === 2 ? <path d="M8 15q4 3 8 0" /> : level === 3 ? <path d="M8 16h8" /> : <path d="M8 17q4-4 8 0" />}
      {level === 5 && <path d="m6.5 7 3 1M17.5 7l-3 1" />}
    </svg>
  </span>;
}
