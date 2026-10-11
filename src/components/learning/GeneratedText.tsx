import { Fragment } from "react";
import { emphasisParts } from "@/lib/text-format";

/** React escapes every text node. Only the balanced emphasis grammar is rendered. */
export default function GeneratedText({ text, cues = false }: { text: string; cues?: boolean }) {
  return <>{emphasisParts(text).map((part, i) => part.bold
    ? <strong key={i} className="font-semibold">{part.text}</strong>
    : <Fragment key={i}>{cues ? part.text.split(/(\*[^*\n]{1,80}\*)/).map((t, j) => /^\*[^*]+\*$/.test(t) ? <em key={j} className="text-slate-500">{t.slice(1, -1)}</em> : t) : part.text}</Fragment>)}</>;
}
