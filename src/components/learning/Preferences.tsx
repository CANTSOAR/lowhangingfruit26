"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import glossary from "@/lib/glossary.json";
import Link from "next/link";
import { AssistantBrands } from "./AssistantLogos";
import Dialog from "./Dialog";
import HoverHelp from "./HoverHelp";
type TermKey = keyof typeof glossary.terms;
const Learner = createContext<string | null>(null);
export function LearningProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  useEffect(() => {
    let prefs: { reduceMotion?: boolean; plain?: boolean } = {};
    try {
      prefs = JSON.parse(
        localStorage.getItem(`poscere:preferences:${userId}`) || "{}",
      );
    } catch {}
    document.documentElement.dataset.motion = prefs?.reduceMotion
      ? "reduced"
      : "system";
    document.documentElement.dataset.plainLanguage =
      prefs?.plain === false ? "off" : "on";
  }, [userId]);
  return <Learner.Provider value={userId}><HoverHelp />{children}</Learner.Provider>;
}
function useVocabulary(userId: string | null) {
  const key = `poscere:vocabulary:${userId}`;
  const serialized = useSyncExternalStore(
    (callback) => {
      window.addEventListener("poscere:vocabulary", callback);
      window.addEventListener("storage", callback);
      return () => {
        window.removeEventListener("poscere:vocabulary", callback);
        window.removeEventListener("storage", callback);
      };
    },
    () => {
      try {
        return localStorage.getItem(key) || "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  let saved: TermKey[] = [];
  try {
    const parsed = JSON.parse(serialized);
    if (Array.isArray(parsed))
      saved = parsed.filter(
        (t): t is TermKey => typeof t === "string" && t in glossary.terms,
      );
  } catch {}
  function toggle(term: TermKey) {
    if (!userId) return;
    const next = saved.includes(term)
      ? saved.filter((t) => t !== term)
      : [...saved, term];
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event("poscere:vocabulary"));
    } catch {}
  }
  return { saved, toggle };
}
export function ClinicalTerm({
  text,
  disabled = false,
}: {
  text: string;
  disabled?: boolean;
}) {
  if (disabled) return null;
  const term: TermKey | undefined = /\bCBC\b|complete blood count/i.test(text)
    ? "cbc"
    : /lipid|cholesterol/i.test(text)
      ? "lipids"
      : /vital/i.test(text)
        ? "vitals"
        : /\bSBAR\b/.test(text)
          ? "sbar"
          : undefined;
  return term ? <Term term={term} /> : null;
}
export function Term({
  term,
  label,
  inline = false,
}: {
  term: keyof typeof glossary.terms;
  label?: string;
  inline?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const entry = glossary.terms[term];
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function reveal() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    popup.current?.showPopover();
    place();
  }
  function leave() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => popup.current?.hidePopover(), 180);
  }
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);
  const userId = useContext(Learner);
  const { saved, toggle } = useVocabulary(userId);
  function place() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(340, window.innerWidth - 32);
    setPosition({
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      top: Math.max(8, rect.top - (popup.current?.offsetHeight || 200) - 8),
    });
  }
  useEffect(() => {
    if (!open) return;
    const close = () => popup.current?.hidePopover();
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);
  return (
    <span className={inline ? "clinical-term" : "term-help inline-block"} onMouseEnter={reveal} onMouseLeave={leave} onFocus={reveal} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) leave(); }}>
      <button
        ref={trigger}
        type="button"
        popoverTarget={id}
        onClick={(e) => { e.preventDefault(); reveal(); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={id}
        aria-label={`Explain ${entry.label}`}
        className={
          inline
            ? "inline-term-trigger rounded-sm underline decoration-dotted decoration-brand-400 underline-offset-4 hover:decoration-solid"
            : "rounded px-1 text-xs text-brand-700 underline decoration-dotted underline-offset-4"
        }
      >
        {inline ? label || entry.label : `ⓘ ${entry.label}`}
      </button>
      {inline && (
        <span className="inline-term-plain">{label || entry.label}</span>
      )}
      <span
        ref={popup}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={entry.label}
        onToggle={(e) => setOpen(e.newState === "open")}
        style={position}
        className="term-popover fixed m-0 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-blue-100 bg-white p-4 text-xs leading-relaxed text-slate-700 shadow-xl"
      >
        <span className="mb-2 flex items-center justify-between gap-3">
          <strong className="text-sm text-slate-900">{entry.label}</strong>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label="Dismiss definition"
            className="rounded px-2 py-1 text-slate-500"
          >
            ✕
          </button>
        </span>
        <span className="block">{entry.definition}</span>
        <span className="mt-3 flex gap-4">
          {entry.source.startsWith("https:") && (
            <a
              href={entry.source}
              target="_blank"
              rel="noreferrer"
              className="text-brand-700 underline"
            >
              Source
            </a>
          )}
          {userId && (
            <button
              type="button"
              onClick={() => toggle(term)}
              className="font-medium text-brand-700"
            >
              {saved.includes(term) ? "Remove saved term" : "Save term"}
            </button>
          )}
        </span>
      </span>
    </span>
  );
}

export default function Preferences({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [dictionaryQuery, setDictionaryQuery] = useState("");
  const dictionaryId = useId();
  const { saved, toggle } = useVocabulary(userId);
  const motion = useRef<HTMLInputElement>(null),
    plain = useRef<HTMLInputElement>(null);
  const key = `poscere:preferences:${userId}`;
  useEffect(() => {
    if (open) {
      if (motion.current)
        motion.current.checked =
          document.documentElement.dataset.motion === "reduced";
      if (plain.current)
        plain.current.checked =
          document.documentElement.dataset.plainLanguage !== "off";
    }
  }, [open]);
  function save() {
    const prefs = {
      reduceMotion: !!motion.current?.checked,
      plain: !!plain.current?.checked,
    };
    document.documentElement.dataset.motion = prefs.reduceMotion
      ? "reduced"
      : "system";
    document.documentElement.dataset.plainLanguage = prefs.plain ? "on" : "off";
    try {
      localStorage.setItem(key, JSON.stringify(prefs));
    } catch {}
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
      >
        Settings
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Learning preferences"
      >
        <div className="space-y-4 text-sm">
          <label className="flex gap-3">
            <input ref={motion} type="checkbox" onChange={save} /> Reduce motion
          </label>
          <label className="flex gap-3">
            <input ref={plain} type="checkbox" onChange={save} /> Show
            plain-language help
          </label>
          <p className="text-xs text-slate-500">
            Saved for this account in this browser. System reduced-motion
            preferences always apply.
          </p>
          <div className="rounded-2xl border border-slate-200">
            <button type="button" aria-expanded={dictionaryOpen} aria-controls={dictionaryId} onClick={() => setDictionaryOpen(!dictionaryOpen)} className="flex w-full items-center gap-3 rounded-2xl p-4 text-left hover:bg-slate-50">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6 shrink-0 text-brand-600"><path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" /></svg>
              <span className="flex-1"><span className="block font-semibold">Dictionary</span><span className="text-xs text-slate-500">{Object.keys(glossary.terms).length} terms · {saved.length} saved</span></span>
              <span className="text-xs text-brand-700">{dictionaryOpen ? "Collapse" : "Expand"}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 transition-transform motion-reduce:transition-none ${dictionaryOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div id={dictionaryId} hidden={!dictionaryOpen} className="space-y-4 border-t border-slate-100 p-4">
          <h3 className="font-semibold">Your vocabulary</h3>
          {saved.length ? (
            saved.map((k) => (
              <div key={k}>
                <h4 className="font-medium">{glossary.terms[k].label}</h4>
                <p className="mt-1 text-slate-600">
                  {glossary.terms[k].definition}
                </p>
                <button
                  onClick={() => toggle(k)}
                  className="mt-1 text-xs text-brand-700"
                >
                  Remove saved term
                </button>
              </div>
            ))
          ) : (
            <p className="text-slate-500">
              Save a term from its explanation to revisit it here.
            </p>
          )}
          <h3 className="pt-3 font-semibold">App and clinical glossary</h3>
          <label className="block"><span className="mb-1 block text-xs text-slate-500">Find a term</span><input type="search" value={dictionaryQuery} onChange={e => setDictionaryQuery(e.target.value)} placeholder="Search the dictionary" className="w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <div className="max-h-72 space-y-4 overflow-y-auto pr-2">
          {Object.entries(glossary.terms).filter(([, t]) => `${t.label} ${t.definition}`.toLowerCase().includes(dictionaryQuery.toLowerCase().trim())).map(([k, t]) => (
            <div key={k}>
              <h4 className="font-medium">{t.label}</h4>
              <p className="mt-1 text-slate-600">{t.definition}</p>
              {t.source.startsWith("https:") && (
                <a
                  href={t.source}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-700 underline"
                >
                  Source
                </a>
              )}
            </div>
          ))}
          {!Object.values(glossary.terms).some(t => `${t.label} ${t.definition}`.toLowerCase().includes(dictionaryQuery.toLowerCase().trim())) && <p className="text-slate-500">No matching terms.</p>}
          </div>
          <p className="text-xs text-slate-400">
            App glossary · version {glossary.version}
          </p>
          </div>
          </div>
          <Link
            href="/integrations"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"
          >
            <span className="space-y-2"><span className="block font-semibold">Integrations</span><AssistantBrands /></span>
            <span aria-hidden="true" className="text-brand-700">→</span>
          </Link>
        </div>
      </Dialog>
    </>
  );
}
