import glossary from "./glossary.json";
export type HighlightTone = "positive" | "negative" | "partial";
export interface FeedbackHighlight {
  text: string;
  tone: HighlightTone;
}
export type TermKey = keyof typeof glossary.terms;
type Range = {
  start: number;
  end: number;
  tone?: HighlightTone | "communication" | "chart";
  bold?: boolean;
};
export type FeedbackPart = {
  text: string;
  term?: TermKey;
  tone?: Range["tone"];
  bold?: boolean;
};
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const aliases = Object.entries(glossary.terms)
  .flatMap(([key, entry]) =>
    "aliases" in entry
      ? entry.aliases.map((alias) => ({ key: key as TermKey, alias }))
      : [],
  )
  .sort((a, b) => b.alias.length - a.alias.length);
const terms = new RegExp(
  `\\b(?:${aliases.map((a) => escape(a.alias)).join("|")})\\b`,
  "gi",
);
export const plainFeedbackText = (text: string) =>
  text.replace(/\*\*([^*]+)\*\*/g, "$1");
/** Only exact snippets and known tones may decorate the model's rationale. */
export function validHighlights(
  text: string,
  raw: unknown,
): FeedbackHighlight[] {
  if (!Array.isArray(raw)) return [];
  const plain = plainFeedbackText(text);
  return raw
    .filter(
      (h): h is FeedbackHighlight =>
        h &&
        typeof h.text === "string" &&
        h.text.trim().length >= 3 &&
        h.text.length <= 180 &&
        plain.includes(h.text) &&
        ["positive", "negative", "partial"].includes(h.tone),
    )
    .slice(0, 5);
}
export function feedbackParts(
  raw: string,
  mode: "plain" | "actions" | "rubric" = "plain",
  highlights?: FeedbackHighlight[],
): FeedbackPart[] {
  const text = plainFeedbackText(raw);
  const ranges: Range[] = [];
  // Model metadata takes precedence; old saved feedback needs no new model request.
  for (const h of validHighlights(text, highlights)) {
    const start = text.indexOf(h.text);
    ranges.push({
      start,
      end: start + h.text.length,
      tone: h.tone,
      bold: true,
    });
  }
  const scan = (regex: RegExp, tone: Range["tone"], rejectNegated = false) => {
    for (const m of text.matchAll(regex)) {
      const start = m.index!;
      if (
        rejectNegated &&
        /\b(?:no|not|never|without|failed to|before|could|would|should|to improve)\b[^.;:]{0,55}$/i.test(
          text.slice(Math.max(0, start - 70), start),
        )
      )
        continue;
      if (!ranges.some((r) => start < r.end && start + m[0].length > r.start))
        ranges.push({ start, end: start + m[0].length, tone, bold: true });
    }
  };
  if (mode === "actions") {
    scan(
      /\b(?:(?:full )?self-introduction|introducing yourself|introduce yourself(?: and your role)?|introducing your role|name, role, and (?:the )?purpose of the visit|open(?:-ended)? questions?|patient-centered question|reflect back|build(?:ing)? rapport|empathic acknowledgment|check understanding|teach-back|shared decisions?)\b/gi,
      "communication",
    );
    scan(
      /\b(?:prior (?:visit['’]s |visits? )?labs|prior colonoscopy report|review (?:the )?(?:chart|prior labs|results|CBC|medicines)|chart review|reference the chart|medication (?:history|reconciliation)|lab review|school nurse note|cross-check the record)\b/gi,
      "chart",
    );
  }
  if (mode === "rubric" && !ranges.length) {
    scan(/\b(?:friendly, approachable tone|began (?:the encounter )?politely|respectful tone|clear introduction|thorough history|clear shared plan)\b/gi, "positive", true);
    scan(/\b(?:only (?:two|a few|\d+) turns|partially (?:explored|addressed|completed)|limited (?:history|follow-up|explanation))\b/gi, "partial", true);
    scan(/\b(?:none of [^.!?]{0,140} were attempted|(?:written )?wrap-up was left (?:entirely )?blank|never surfaced|unsafe gap|missed (?:critical|essential) (?:findings|information)|before you introduced your role|did not introduce (?:yourself|your role))\b/gi, "negative");
    // Conservative emphasis for existing records: only explicit strengths/gaps, never infer from a domain score.
    scan(
      /\b(?:did not|failed to|never)\s+(?:set expectations|acknowledge|explore|review|provide|discuss|screen|follow up|respond|mention|reference|attempt)\b(?:\s+(?:the|their|your|patient['’]s|for|visit|a|any|agenda|symptoms|labs|exam|cues|plan|red flags)){0,4}/gi,
      "negative",
    );
    scan(
      /\b(?:introduced (?:their|your|the) role|asked an open(?:-ended)? question|patient-centered question|empathic acknowledgment)\b/gi,
      "positive",
      true,
    );
    scan(/\b(?:reasonable|appropriate)\b/gi, "partial", true);
  }
  let stripped = 0;
  for (const m of raw.matchAll(/\*\*([^*]+)\*\*/g)) {
    const start = m.index! - stripped;
    if (!ranges.some((r) => start < r.end && start + m[1].length > r.start))
      ranges.push({
        start,
        end: start + m[1].length,
        bold: true,
        tone: mode === "rubric" ? "partial" : undefined,
      });
    stripped += 4;
  }
  const termRanges = [...text.matchAll(terms)].map((m) => ({
    start: m.index!,
    end: m.index! + m[0].length,
    key: aliases.find((a) => a.alias.toLowerCase() === m[0].toLowerCase())!.key,
  }));
  const breaks = [
    ...new Set([
      0,
      text.length,
      ...ranges.flatMap((r) => [r.start, r.end]),
      ...termRanges.flatMap((r) => [r.start, r.end]),
    ]),
  ].sort((a, b) => a - b);
  return breaks.slice(0, -1).map((start, i) => {
    const end = breaks[i + 1];
    const r = ranges.find((r) => start >= r.start && end <= r.end);
    const term = termRanges.find((t) => start >= t.start && end <= t.end);
    return {
      text: text.slice(start, end),
      tone: r?.tone,
      bold: r?.bold,
      term: term?.key,
    };
  });
}
/** Highlights only text supplied in the student's briefing, with no inferred diagnoses. */
export function briefParts(
  text: string,
): { text: string; important: boolean }[] {
  const important =
    /\b\d+\s*(?:minutes?|hours?|days?|weeks?|months?)\b(?:\s+of\s+[^.!?]{1,110})?|(?:^|(?<=\s))['“][^'”]{5,120}['”]|\b(?:take a (?:focused|thorough) history|perform (?:a |the )?(?:physical |focused )?exam(?:ination)?|review relevant (?:results|records)|(?:develop|formulate) a differential diagnosis(?: and (?:initial )?(?:management )?plan)?|agree a plan(?: and follow-up)?|functional status|symptom progression|medication list|adherence|order and interpret|escalation of care|urgent attention|(?:review|start(?:ing)? from) (?:the |his )?(?:shared record|vital signs|record|handoff|heart-related symptoms)|cannot admit (?:him|her|them) or change (?:his|her|their) treatment|duplicated, missing or unsafe|(?:read|write) (?:their |your )?SBAR(?: handoff)?|page any colleague|coordinated care plan|integrated patient view|run in order)\b/gi;
  const parts: { text: string; important: boolean }[] = [];
  let cursor = 0;
  for (const match of text.matchAll(important)) {
    if (match.index! > cursor)
      parts.push({ text: text.slice(cursor, match.index), important: false });
    parts.push({ text: match[0], important: true });
    cursor = match.index! + match[0].length;
  }
  if (cursor < text.length)
    parts.push({ text: text.slice(cursor), important: false });
  return parts;
}
