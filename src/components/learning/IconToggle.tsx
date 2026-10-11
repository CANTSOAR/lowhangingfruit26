"use client";
import { type ReactNode } from "react";
export default function IconToggle({
  label,
  tip,
  active,
  onClick,
  children,
}: {
  label: string;
  tip: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        data-tooltip={tip}
        onClick={onClick}
        className={`grid h-11 w-11 place-items-center rounded-xl border transition-colors ${active ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-500"}`}
      >
        {children}
      </button>
    </span>
  );
}
