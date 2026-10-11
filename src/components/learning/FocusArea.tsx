"use client";
import glossary from "@/lib/glossary.json";
import { Term } from "./Preferences";
/** Every built-in rubric domain and checklist skill has a brief learning definition. */
export default function FocusArea({ area, label }: { area: string; label?: string }) {
  const value = glossary.focusAreas[area as keyof typeof glossary.focusAreas];
  const term = value as keyof typeof glossary.terms | undefined;
  return term ? <Term term={term} label={label || glossary.terms[term].label} inline /> : <span>{label || area.replace(/_/g, " ")}</span>;
}
