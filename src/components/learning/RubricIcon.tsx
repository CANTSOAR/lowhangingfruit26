/** Distinct symbols for the seven core rubric domains; labels remain visible. */
export default function RubricIcon({ area }: { area: string }) {
  const path = /opening|intro/.test(area) ? <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9h8M8 12h5" /></>
    : /rapport|empathy/.test(area) ? <path d="m12 20-8-8a5 5 0 0 1 8-6 5 5 0 0 1 8 6Z" />
    : /information|needs/.test(area) ? <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M10 7v6M7 10h6" /></>
    : /listening/.test(area) ? <><path d="M7 9a5 5 0 0 1 10 0c0 5-5 4-5 8a3 3 0 0 1-6 0M10 10a2 2 0 0 1 4 0c0 2-2 2-2 4" /></>
    : /explanation|shared|exp_/.test(area) ? <><path d="M3 4h12v9H8l-5 3V4ZM18 8h3v12l-4-3h-6v-1M6 8h6" /></>
    : /reasoning|synthesis/.test(area) ? <><circle cx="12" cy="5" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="18" r="2" /><path d="M12 7v5M5 16v-4h14v4" /></>
    : <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>;
  return <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
}
