/** Decorative specialty symbols; the adjacent text supplies the accessible label. */
export default function ProfessionIcon({
  area,
  className = "h-5 w-5",
}: {
  area: string;
  className?: string;
}) {
  const name = area.toLowerCase();
  const path = /cardio/.test(name) ? (
    <>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
      <path d="M3 12h5l2-4 3 8 2-4h6" />
    </>
  ) : /pharma/.test(name) ? (
    <>
      <path d="m7 17 10-10M4.2 19.8a5 5 0 0 1 0-7L12.8 4a5 5 0 0 1 7 7L11 19.8a5 5 0 0 1-6.8 0Z" />
    </>
  ) : /diet|nutri/.test(name) ? (
    <>
      <path d="M12 8c-5-4-10 0-8 6 1 4 4 8 8 6 4 2 7-2 8-6 2-6-3-10-8-6ZM12 8V4" />
      <path d="M12 5c0-3 3-4 6-3 0 3-3 4-6 3Z" />
    </>
  ) : /emergency/.test(name) ? (
    <>
      <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" />
    </>
  ) : (
    <>
      <path d="M5 3v5a5 5 0 0 0 10 0V3M3 3h4M13 3h4M10 13v3a5 5 0 0 0 10 0v-2" />
      <circle cx="20" cy="12" r="2" />
    </>
  );
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {path}
    </svg>
  );
}
