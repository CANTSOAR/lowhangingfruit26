/** Small, safe emphasis grammar: literal text and balanced **phrases**, never HTML. */
export function emphasisParts(text: string): { text: string; bold: boolean }[] {
  const parts: { text: string; bold: boolean }[] = [];
  let cursor = 0;
  for (const m of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
    if (m.index! > cursor) parts.push({ text: text.slice(cursor, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    cursor = m.index! + m[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), bold: false });
  return parts;
}
export const plainEmphasis = (text: string) => emphasisParts(text).map(p => p.text).join("");
/** Single-asterisk stage cues must not consume double-asterisk emphasis. */
export function stripStageCues(text: string, keepFirst = false) {
  let kept = false;
  return text.replace(/(?<!\*)\*[^*\n]{1,80}\*(?!\*)/g, cue => {
    if (keepFirst && !kept) { kept = true; return cue; }
    return " ";
  });
}
/** Keeps emphasized spoken words; also tolerates incomplete streaming markers. */
export const plainSpeech = (text: string) => stripStageCues(plainEmphasis(text)).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

export const PROSE_EMPHASIS = `For prose read by learners or faculty (dialogue, briefings, explanations, summaries, feedback and plans), use **...** around 1-3 short phrases per paragraph that are most useful to skim. Mark words already present in your grounded answer; never add a fact, diagnosis, hint or conclusion just to create emphasis. Keep dialogue in character. Do not emphasize whole sentences or every sentence. Use only this emphasis syntax, no HTML. In structured output, markers belong inside human-facing prose string values only. Never add markers to keys, IDs, enum values, names, titles, labels, numeric values, canonical clinical facts/results, action requests, citations, exact evidence quotes, quoted source passages or proposed patch values. Preserve all schema types and exact-match requirements. Specific evidence/highlight instructions in the task still apply.`;
