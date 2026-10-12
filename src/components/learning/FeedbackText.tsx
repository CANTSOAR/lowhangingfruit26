"use client";
import { Fragment } from "react";
import { feedbackParts, type FeedbackHighlight } from "@/lib/feedback-text";
import { Term } from "./Preferences";
const styles = {
  positive: "bg-emerald-100 text-emerald-900 decoration-emerald-400",
  negative: "bg-rose-100 text-rose-900 decoration-rose-400",
  partial: "bg-orange-100 text-orange-900 decoration-orange-400",
  communication: "bg-blue-100 text-blue-900",
  chart: "bg-emerald-100 text-emerald-900",
};
const labels = {
  positive: "Strength",
  negative: "Gap",
  partial: "Partial success",
  communication: "Communication",
  chart: "Chart review",
};
function CategoryIcon({ chart }: { chart: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom"
    >
      {chart ? (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <rect x="9" y="2" width="6" height="4" rx="1" />
          <path d="M9 11h6M9 15h6" />
        </>
      ) : (
        <>
          <circle cx="12" cy="7" r="4" />
          <path d="M5 21v-3a7 7 0 0 1 14 0v3" />
        </>
      )}
    </svg>
  );
}
export default function FeedbackText({
  text,
  mode = "plain",
  highlights,
}: {
  text: string;
  mode?: "plain" | "actions" | "rubric";
  highlights?: FeedbackHighlight[];
}) {
  const parts = feedbackParts(text, mode, highlights);
  return (
    <>
      {parts.map((part, i) => {
        const content = part.term ? (
          <Term term={part.term} label={part.text} inline />
        ) : (
          part.text
        );
        return part.tone ? (
          <mark
            key={i}
            data-tooltip={labels[part.tone]}
            className={`rounded px-0.5 font-medium ${styles[part.tone]}`}
          >
            {(part.tone === "communication" || part.tone === "chart") && parts[i - 1]?.tone !== part.tone && (
              <CategoryIcon chart={part.tone === "chart"} />
            )}
            {content}
          </mark>
        ) : part.bold ? (
          <strong key={i} className="generated-highlight rounded px-0.5">{content}</strong>
        ) : (
          <Fragment key={i}>{content}</Fragment>
        );
      })}
    </>
  );
}
