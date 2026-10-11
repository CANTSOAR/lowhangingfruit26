"use client";
import { useState } from "react";
import { LEVEL_NAMES } from "@/lib/engine/difficulty";

export function PatientPortrait({
  src,
  name,
  className = "",
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`patient-portrait overflow-hidden bg-blue-100 ${className}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={`Portrait of ${name}`}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover object-[50%_25%] object-[center_25%]"
        />
      ) : (
        <div
          className="grid h-full min-h-20 place-items-center bg-gradient-to-br from-blue-100 to-indigo-100 text-3xl font-semibold text-blue-800"
          aria-label={`Patient ${name}`}
        >
          {name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </div>
      )}
    </div>
  );
}
export function LevelPips({ level }: { level: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
      <span className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((l) => (
          <span
            key={l}
            className={`h-2 w-4 rounded-full ${l <= level ? "bg-brand-600" : "bg-slate-200"}`}
          />
        ))}
      </span>
      Level {level} · {LEVEL_NAMES[level]}
    </span>
  );
}
export function ScoreRing({
  value,
  label = "Best score",
}: {
  value: number | null;
  label?: string;
}) {
  const score =
    value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2">
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        role="img"
        aria-label={
          score === null ? "No released score" : `${label}: ${score}%`
        }
      >
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="4"
        />
        {score !== null && (
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="#2563eb"
            strokeWidth="4"
            strokeDasharray={`${score * 1.257} 125.7`}
            transform="rotate(-90 24 24)"
            strokeLinecap="round"
          />
        )}
        <text
          x="24"
          y="28"
          textAnchor="middle"
          fontSize="12"
          fill="#172554"
          fontWeight="600"
        >
          {score === null ? "—" : `${score}%`}
        </text>
      </svg>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}
