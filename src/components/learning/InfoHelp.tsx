/** Uses the shared hover/focus tooltip, including Escape to dismiss. */
export default function InfoHelp({ label, text, className = "" }: { label: string; text: string; className?: string }) {
  return (
    <button type="button" aria-label={label} data-tooltip={text} className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600 ${className}`}>
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" strokeWidth="2" />
      </svg>
    </button>
  );
}
