"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import GeneratedText from "@/components/learning/GeneratedText";
import { plainSpeech, stripStageCues } from "@/lib/text-format";
import IconToggle from "@/components/learning/IconToggle";
import { briefParts } from "@/lib/feedback-text";
import type { PatientEnded, ComfortReason } from "@/lib/types";
import NoteComposer from "./NoteComposer";
import { PatientPortrait } from "@/components/learning/Patient";
import { Logo } from "@/components/Brand";
import JourneyChartTab from "@/components/journey/JourneyChartTab";
import type { ChartView } from "@/lib/engine/encounter";
import ChartPanel from "./ChartPanel";
import {
  envelopeMouth,
  levelAt,
  parseMouth,
  type MouthTimeline,
} from "./mouth";
import TalkingPortrait from "./TalkingPortrait";

interface Msg {
  id: number;
  turn: number;
  speaker:
    "student" | "patient" | "system" | "instructor" | "coach" | "clinician";
  text: string;
  comfort?: { delta: number; reasons: ComfortReason[] };
}
interface VisitData {
  id: string;
  status: "active" | "paused" | "submitted" | "scored" | "abandoned";
  mode: string;
  attempt: number;
  visitNumber: number;
  recorded: boolean;
  level: number;
  hints: boolean;
  canRewind: boolean;
  liveAssist: boolean;
  timeLimitMin: number | null;
  startedAt: string;
  pauseNote: string | null;
  pausedAt: string | null;
  role: {
    name: string;
    roleTitle: string;
    noteFormat: string;
    wrapUp: { id: string; label: string; placeholder?: string }[];
  };
  journeyRunId: string | null;
  priorContext: string | null;
  chart: ChartView;
  messages: Msg[];
  endedBy: PatientEnded | null;
  showComfort: boolean;
}

// Minimal typing for the browser speech recognition API (Chrome, Edge, Safari).
interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: {
          length: number;
          [i: number]: { isFinal: boolean; 0: { transcript: string } };
        };
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

const SILENCE_MS = 2200;
const ENDED_WHY: Record<PatientEnded["reason"], string> = {
  closed: "The visit came to a natural close.",
  upset: "The patient chose to stop the visit.",
  time: "The patient had to go; the visit ran well past its time.",
};
const COMFORT_HELP =
  "Comfort is how much the patient trusts you right now. It rises when you introduce yourself, show empathy, name their feelings or ask gently, and falls when you sound dismissive, judgmental, rushed or use jargon. Some details only come out once comfort is high enough.";
const MODE_LABEL: Record<string, string> = {
  practice: "Practice",
  adaptive: "Adaptive practice",
  homework: "Homework",
  exam: "Exam",
  journey: "Care journey",
};
const fmt = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const stripCues = plainSpeech;

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
const ICON = {
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3",
  micOff:
    "M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 11V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.4 5.4M19 11a7 7 0 0 1-.5 2.6M12 18v3",
  cam: "M3 7h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM15 10l6-3v10l-6-3",
  camOff:
    "M3 3l18 18M15 10l6-3v10l-3.5-1.75M10 7h4a1 1 0 0 1 1 1v4M15 15.5V16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3.5",
  vol: "M4 9v6h4l5 4V5L8 9H4ZM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  volOff: "M4 9v6h4l5 4V5L8 9H4ZM17 9l5 6M22 9l-5 6",
  cc: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM10 9a3 3 0 1 0 0 6M17 9a3 3 0 1 0 0 6",
  hang: "M3 14c5-5 13-5 18 0l-2 3-4-1.5v-2.2a9 9 0 0 0-6 0v2.2L5 17l-2-3Z",
};

/** An ordered test or exam coming back into the conversation: one row per result, abnormal ones flagged. */
function ResultCard({ text, results, onView }: { text: string; results: ChartView["results"]; onView: () => void }) {
  const [head, ...lines] = text.split("\n");
  const rows = lines.map((l) => {
    const i = l.indexOf(": ");
    return i > 0 ? { name: l.slice(0, i), result: l.slice(i + 2) } : { name: "", result: l };
  });
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{head.replace(/^Requested:\s*/, "Requested: ")}</div>
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          if (/no approved result is available/i.test(r.result)) return <div key={i} className="text-slate-600"><span className="font-semibold text-slate-800">{r.name}</span>: no approved result for this in the case file.</div>;
          const abnormal = !!r.name && results.some((x) => x.name === r.name && x.abnormal);
          return (
            <div key={i}>
              <div className="flex flex-wrap items-center gap-2">
                {r.name && <span className="font-semibold text-slate-900">{r.name}</span>}
                {abnormal && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">Abnormal</span>}
              </div>
              <div className="leading-snug text-slate-700">{r.result}</div>
            </div>
          );
        })}
      </div>
      {rows.some((r) => r.name && results.some((x) => x.name === r.name)) && (
        <button type="button" onClick={onView} className="mt-2 text-sm font-medium text-brand-700 underline decoration-dotted underline-offset-2 hover:text-brand-600">
          View in chart
        </button>
      )}
    </div>
  );
}

export default function Visit({
  id,
  viewerName,
}: {
  id: string;
  viewerName: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<VisitData | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chart, setChart] = useState<ChartView | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<"call" | "chart">("call");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null); // patient reply being streamed
  const [busy, setBusy] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [joined, setJoined] = useState(false);
  const [highlightBrief, setHighlightBrief] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [interim, setInterim] = useState("");
  const [speakerOn, setSpeakerOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wrapOpen, setWrapOpen] = useState(false);
  const [wrap, setWrap] = useState<Record<string, string>>({});
  const [scoring, setScoring] = useState(false);
  const [submissionSaved, setSubmissionSaved] = useState(false);
  const [fullTranscript, setFullTranscript] = useState(true);
  const [, setLastDelta] = useState(0);
  const [turnComfort, setTurnComfort] = useState<{ delta: number; reasons: ComfortReason[]; fade: boolean } | null>(null);
  const [chartFocus, setChartFocus] = useState<{ tab: "results" | "orders"; key: number }>();
  const [callEnd, setCallEnd] = useState<PatientEnded | null>(null);
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const handledEnding = useRef<string | null>(null);
  const timeUpShown = useRef(false);
  const hangUp = useCallback((e: PatientEnded) => {
    setCallEnd(e);
    setFrozenAt(f => f ?? (e.at && Number.isFinite(Date.parse(e.at)) ? Date.parse(e.at) : Date.now()));
    setMicOn(false);
  }, []);
  const [recTick, setRecTick] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const selfRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const draftLoaded = useRef<string | null>(null);
  const live = useRef({ busy: false });
  live.current = { busy };

  const load = useCallback(async () => {
    const res = await fetch(`/api/encounters/${id}`, { cache: "no-store" });
    if (!res.ok)
      return setError(
        (await res.json().catch(() => ({}))).error ||
          "Could not load this visit.",
      );
    const d: VisitData = await res.json();
    setData(d);
    if (d.endedBy) {
      hangUp(d.endedBy);
      try { handledEnding.current = sessionStorage.getItem(`poscere:ending-reviewed:${id}`); } catch {}
    }
    if (draftLoaded.current !== id) {
      try {
        const draft = JSON.parse(
          sessionStorage.getItem(`poscere:note:${id}`) || "{}",
        );
        if (!draft || typeof draft !== "object" || Array.isArray(draft))
          throw new Error("Invalid note draft");
        const allowed = new Set(d.role.wrapUp.map((f) => f.id));
        setWrap(
          Object.fromEntries(
            Object.entries(draft).filter(
              ([key, value]) => allowed.has(key) && typeof value === "string",
            ),
          ) as Record<string, string>,
        );
      } catch {}
      const last = [...d.messages].reverse().find(m => m.speaker === "patient");
      if (d.showComfort && last?.comfort) setTurnComfort({ ...last.comfort, fade: false });
      draftLoaded.current = id;
    }
    setChart((c) => (live.current.busy && c ? c : d.chart));
    // Keep optimistic local messages while a turn is in flight.
    setMessages((m) => (live.current.busy ? m : d.messages));
    if (d.messages.length) setJoined(true);
    return d;
  }, [id, hangUp]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (draftLoaded.current !== id) return;
    try {
      sessionStorage.setItem(`poscere:note:${id}`, JSON.stringify(wrap));
    } catch {}
  }, [id, wrap]);

  // Live assist: the instructor may pause or send a note at any time.
  useEffect(() => {
    if (!data?.liveAssist || data.status === "scored") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data?.liveAssist, data?.status, load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);
  useEffect(() => {
    setMicSupported(
      typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    );
  }, []);

  const paused = data?.status === "paused";
  const ended = data?.status === "submitted" || data?.status === "scored";
  const utc = (t: string) => new Date(/[Z+-]\d*:?.*$/.test(t.slice(10)) ? t : t.replace(" ", "T") + "Z").getTime();
  // The clock does not run in the waiting room or while an instructor has the visit paused.
  const clockNow = frozenAt ?? (data?.pausedAt ? utc(data.pausedAt) : now);
  const elapsed =
    data && joined
      ? Math.max(0, Math.floor((clockNow - utc(data.startedAt)) / 1000))
      : 0;
  const remaining = data?.timeLimitMin
    ? data.timeLimitMin * 60 - elapsed
    : null;

  // When the clock runs out, open the write-up; the student can still go back for a closing sentence.
  const timeUp = remaining !== null && remaining <= 0;
  useEffect(() => {
    if (timeUp && joined && !ended && !timeUpShown.current) { timeUpShown.current = true; setFrozenAt(Date.now()); setWrapOpen(true); }
  }, [timeUp, joined, ended]);

  // Speech is synthesised sentence by sentence so the patient starts talking while the reply is still arriving.
  const voice = useRef<{
    gen: number;
    queue: Promise<string | null>[];
    playing: boolean;
  }>({ gen: 0, queue: [], playing: false });
  // Lip-sync timelines by clip URL; filled when the clip arrives (from the server's alignment, or decoded loudness).
  const mouths = useRef(new Map<string, MouthTimeline | null>());
  function stopVoice() {
    voice.current.gen += 1;
    voice.current.queue = [];
    voice.current.playing = false;
    audioRef.current?.pause();
    mouths.current.clear();
    setSpeaking(false);
  }
  function pump() {
    const v = voice.current;
    if (v.playing) return;
    const next = v.queue.shift();
    if (!next) return setSpeaking(false);
    v.playing = true;
    setSpeaking(true);
    const gen = v.gen;
    next.then((url) => {
      if (gen !== voice.current.gen) return;
      const a = audioRef.current;
      if (!url || !a) {
        v.playing = false;
        return pump();
      }
      a.src = url;
      a.play().catch(() => {
        v.playing = false;
        pump();
      });
    });
  }
  function speak(text: string) {
    if (!speakerOn || !plainSpeech(text)) return;
    const gen = voice.current.gen;
    voice.current.queue.push(
      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ e: id, text }),
      })
        .then(async (r) => {
          if (!r.ok || r.status === 204) return null;
          const b = await r.blob();
          if (gen !== voice.current.gen) return null;
          const url = URL.createObjectURL(b);
          const tl = parseMouth(r.headers.get("X-Mouth"));
          mouths.current.set(url, tl);
          // No alignment (fallback voice): derive the mouth from the audio's loudness without delaying playback.
          if (!tl)
            envelopeMouth(b).then(
              (e) => mouths.current.has(url) && mouths.current.set(url, e),
            );
          return url;
        })
        .catch(() => null),
    );
    pump();
  }
  function onAudioDone() {
    const src = audioRef.current?.src;
    if (src) mouths.current.delete(src);
    voice.current.playing = false;
    pump();
  }

  // Offer the write-up once for each ending; chart review stays available after dismissal, including reloads.
  useEffect(() => {
    if (!callEnd || wrapOpen || busy || speaking || !joined || scoring || ended) return;
    const marker = `${id}:${callEnd.turn}`;
    if (handledEnding.current === marker) return;
    const timer = setTimeout(() => {
      handledEnding.current = marker;
      try { sessionStorage.setItem(`poscere:ending-reviewed:${id}`, marker); } catch {}
      setWrapOpen(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [id, callEnd, wrapOpen, busy, speaking, joined, scoring, ended]);
  useEffect(() => {
    if (!turnComfort?.fade) return;
    const timer = setTimeout(() => setTurnComfort(null), 8000);
    return () => clearTimeout(timer);
  }, [turnComfort]);
  function openWrap() { setFrozenAt(f => f ?? Date.now()); setWrapOpen(true); }
  function closeWrap() { setWrapOpen(false); if (!callEnd && !scoring) setFrozenAt(null); }

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || live.current.busy || callEnd || scoring || paused) return;
      setError(null);
      setTurnComfort(null);
      setBusy(true);
      setInput("");
      setInterim("");
      stopVoice();
      const turn = (chart?.turn || 0) + 1;
      setMessages((m) => [
        ...m,
        { id: -Date.now(), turn, speaker: "student", text },
      ]);
      setPending("");
      try {
        const res = await fetch(`/api/encounters/${id}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          if (res.status === 409 && j.code === "call_ended" && j.endedBy) {
            setPending(null); setMessages(m => m.filter(x => x.id > 0)); hangUp(j.endedBy); load(); return;
          }
          throw new Error(j.error || "The message could not be sent.");
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let acc = "";
        let spokenTo = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 2);
            if (!line.startsWith("data:")) continue;
            const ev = JSON.parse(line.slice(5));
            if (ev.type === "delta") {
              acc += ev.text;
              setPending(acc);
              // Hand each finished sentence to the voice as soon as it is complete.
              const rest = acc.slice(spokenTo);
              const m = rest.match(/^[\s\S]*[.!?]["']?(?=\s)/);
              if (m && m[0].trim().length > 12) {
                speak(m[0]);
                spokenTo += m[0].length;
              }
            } else if (ev.type === "done") {
              setMessages((m) => [
                ...m,
                { id: ev.messageId, turn, speaker: "patient", text: ev.text },
                ...(ev.notice
                  ? [
                      {
                        id: ev.messageId + 0.5,
                        turn,
                        speaker: "system" as const,
                        text: ev.notice,
                      },
                    ]
                  : []),
              ]);
              setPending(null);
              const before = new Set([
                ...(chart?.sections.flatMap((s) => s.items.map((x) => x.id)) ||
                  []),
                ...(chart?.artifacts.map((a) => a.id) || []),
              ]);
              const after: ChartView = ev.chart;
              setFresh(
                new Set(
                  [
                    ...after.sections.flatMap((s) => s.items.map((x) => x.id)),
                    ...after.artifacts.map((a) => a.id),
                  ].filter((x) => !before.has(x)),
                ),
              );
              setChart(after);
              setLastDelta(ev.rapportDelta);
              const reasons: ComfortReason[] = ev.comfortReasons || [];
              setTurnComfort(after.showComfort && (ev.rapportDelta !== 0 || reasons.length) ? { delta: ev.rapportDelta, reasons, fade: true } : null);
              if (ev.callEnded) hangUp(ev.callEnded);
              speak(acc.slice(spokenTo));
            } else if (ev.type === "error") {
              throw new Error(ev.message);
            }
          }
        }
      } catch (e) {
        setPending(null);
        setMessages((m) => m.filter((x) => x.id > 0));
        setInput(text);
        setError((e as Error).message);
        load();
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, chart, speakerOn, callEnd, scoring, paused],
  );

  // Hands-free mic: listen whenever the patient is not talking and nothing is in flight.
  useEffect(() => {
    const idle = micOn && joined && !busy && !speaking && !paused && !ended && !wrapOpen && !callEnd && !scoring;
    if (!idle) return;
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    // Keep listening across the browser's own end-of-speech cut-offs; the visit sends after a pause of SILENCE_MS.
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = "";
    let latest = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const text = latest.trim();
      if (!text) return;
      rec.onend = null;
      rec.abort();
      recRef.current = null;
      send(text);
    };
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else live += e.results[i][0].transcript;
      }
      latest = finalText + live;
      setInterim(latest);
      if (timer) clearTimeout(timer);
      if (latest.trim()) timer = setTimeout(flush, SILENCE_MS);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicOn(false);
        setError("Microphone access was blocked. Allow it in the browser, or type instead.");
      }
    };
    rec.onend = () => {
      // The browser stopped on its own (long silence or its time limit): send what we have, or listen again.
      if (timer) clearTimeout(timer);
      recRef.current = null;
      if (latest.trim()) send(latest);
      else setRecTick((n) => n + 1);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {}
    return () => {
      if (timer) clearTimeout(timer);
      rec.onend = null;
      rec.abort();
      recRef.current = null;
    };
  }, [micOn, joined, busy, speaking, paused, ended, wrapOpen, callEnd, scoring, send, recTick]);

  async function toggleCam() {
    if (camOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCamOn(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
      });
      streamRef.current = s;
      setCamOn(true);
      setTimeout(() => {
        if (selfRef.current) selfRef.current.srcObject = s;
      }, 0);
    } catch {
      setError("Camera access was blocked. The visit works without it.");
    }
  }
  useEffect(
    () => () => streamRef.current?.getTracks().forEach((t) => t.stop()),
    [],
  );

  async function order(request: string) {
    if (callEnd || scoring || paused || !joined) return;
    setOrdering(true);
    setError(null);
    try {
      const res = await fetch(`/api/encounters/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      const before = new Set([
        ...(chart?.results.map((r) => r.id) || []),
        ...(chart?.artifacts.map((a) => a.id) || []),
      ]);
      setFresh(
        new Set(
          [
            ...j.chart.results.map((r: { id: string }) => r.id),
            ...j.chart.artifacts.map((a: { id: string }) => a.id),
          ].filter((x: string) => !before.has(x)),
        ),
      );
      setChart(j.chart);
      const d = await load();
      if (d) setMessages(d.messages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOrdering(false);
    }
  }

  async function askHint() {
    const res = await fetch(`/api/encounters/${id}/hint`, { method: "POST" });
    const j = await res.json();
    if (j.text)
      setMessages((m) => [
        ...m,
        {
          id: Date.now(),
          turn: chart?.turn || 0,
          speaker: "coach",
          text: j.text,
        },
      ]);
  }

  async function rewindTo(turn: number) {
    if (
      !confirm(
        "Go back to just before this message and try it a different way? Your current visit stays saved.",
      )
    )
      return;
    const res = await fetch(`/api/encounters/${id}/rewind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turn }),
    });
    const j = await res.json();
    if (j.id) router.push(`/encounter/${j.id}`);
    else setError(j.error || "Could not rewind.");
  }

  async function submit() {
    setScoring(true);
    setSubmissionSaved(false);
    const checkSaved = async () => {
      try {
        const r = await fetch(`/api/encounters/${id}`, { cache: "no-store" });
        if (!r.ok) return;
        const state = await r.json();
        if (state.status === "submitted" || state.status === "scored")
          setSubmissionSaved(true);
      } catch {}
    };
    const savedPoll = setInterval(checkSaved, 2000);
    setMicOn(false);
    stopVoice();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const res = await fetch(`/api/encounters/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wrapup: wrap }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      try {
        sessionStorage.removeItem(`poscere:note:${id}`);
      } catch {}
      router.push(
        data?.journeyRunId
          ? `/journey/${data.journeyRunId}`
          : `/encounter/${id}/feedback`,
      );
    } catch (e) {
      setScoring(false);
      await checkSaved();
      setError(
        "Scoring did not finish: " +
          (e as Error).message +
          " Retry to check the saved visit or submit again.",
      );
    } finally {
      clearInterval(savedPoll);
    }
  }

  if (error && !data)
    return (
      <div className="grid h-screen place-items-center text-slate-600">
        {error}
      </div>
    );
  if (!data || !chart)
    return (
      <div className="grid h-screen place-items-center text-slate-500">
        Connecting to the visit…
      </div>
    );
  if (ended && !scoring) {
    return (
      <div className="grid h-screen place-items-center">
        <div className="text-center">
          <p className="mb-3 text-slate-700">This visit has ended.</p>
          <a
            href={
              data.journeyRunId
                ? `/journey/${data.journeyRunId}`
                : `/encounter/${id}/feedback`
            }
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          >
            {data.status === "scored" ? "View feedback" : "Finish scoring"}
          </a>
        </div>
      </div>
    );
  }

  const p = chart.patient;
  // Mouth openness for the clip that is playing right now, read from the audio clock.
  const mouthLevel = () => {
    const a = audioRef.current;
    const tl = a && !a.paused ? mouths.current.get(a.src) : null;
    return tl ? levelAt(tl, a!.currentTime) : 0;
  };
  const caption =
    pending !== null
      ? pending
      : speaking
        ? [...messages].reverse().find((m) => m.speaker === "patient")?.text ||
          ""
        : "";
  const patientTalking = speaking || (pending !== null && pending.length > 0);
  const firstName = p.name.split(" ")[0];

  return (
    <div className="encounter-root flex h-dvh flex-col bg-slate-100">
      <audio
        ref={audioRef}
        onEnded={onAudioDone}
        onError={onAudioDone}
        hidden
      />

      {scoring && !wrapOpen && (
        <button
          onClick={openWrap}
          className="bg-brand-600 px-4 py-2 text-sm text-white"
        >
          {submissionSaved
            ? "Visit saved · feedback is being evaluated"
            : "Submitting your visit…"}{" "}
          · View status
        </button>
      )}
      {/* Top bar */}
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <Link href="/student" aria-label="Return home">
          <Logo compact />
        </Link>
        <span className="hidden text-slate-300 sm:inline">|</span>
        <span className="truncate text-slate-700">
          <span className="font-medium text-slate-900">{p.name}</span>
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
          {MODE_LABEL[data.mode] || data.mode}
        </span>
        <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 sm:inline">
          Difficulty: Level {data.level}
        </span>
        {data.visitNumber > 1 ? (
          <span className="hidden rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800 sm:inline">
            Follow-up · visit {data.visitNumber}
          </span>
        ) : (
          data.attempt > 1 && (
            <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 sm:inline">
              Attempt {data.attempt}
            </span>
          )
        )}
        <span
          className={`hidden rounded px-1.5 py-0.5 text-xs font-medium md:inline ${data.recorded ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"}`}
        >
          {data.recorded ? "Recorded for instructor" : "Private practice"}
        </span>
        {data.liveAssist && (
          <span className="hidden rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800 md:inline">
            Instructor can join
          </span>
        )}
        <div className="flex-1" />
        <span
          className={`whitespace-nowrap tabular-nums ${remaining !== null && remaining < 120 ? "font-semibold text-rose-600" : "text-slate-600"}`}
        >
          {remaining !== null ? `${fmt(remaining)} left` : fmt(elapsed)}
        </span>
        {data.hints && joined && (
          <button
            onClick={askHint}
            disabled={busy}
            className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Coach hint
          </button>
        )}
        <button
          onClick={openWrap}
          disabled={!joined}
          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:bg-slate-300"
        >
          End visit
        </button>
      </header>

      {/* Phones and small tablets: one pane at a time, switched here. Hidden from lg up, where both show. */}
      <div role="tablist" aria-label="Visit or chart" className="grid shrink-0 grid-cols-2 gap-1 border-b border-slate-300 bg-white p-1 lg:hidden">
        {(["call", "chart"] as const).map((v) => (
          <button key={v} role="tab" aria-selected={mobileView === v} onClick={() => setMobileView(v)} className={`relative min-h-10 rounded-md text-sm font-medium ${mobileView === v ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
            {v === "call" ? "Conversation" : "Patient chart"}
            {v === "chart" && fresh.size > 0 && mobileView !== "chart" && <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-amber-400" />}
          </button>
        ))}
      </div>

      <div className="encounter-layout grid min-h-0 flex-1 gap-4 p-2 max-lg:grid-rows-[minmax(0,1fr)] max-lg:grid-cols-[minmax(0,1fr)] sm:p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* LEFT: the call */}
        <div className={`encounter-call flex min-h-0 flex-col gap-3 ${mobileView === "chart" ? "max-lg:hidden" : ""}`}>
          <div className="relative h-[44%] min-h-[260px] shrink-0 overflow-hidden rounded-2xl bg-slate-900">
            {p.portrait ? (
              <TalkingPortrait
                src={p.portrait}
                alt={p.name}
                talking={speaking}
                enabled={speakerOn}
                level={mouthLevel}
              />
            ) : (
              <div className="grid h-full place-items-center bg-gradient-to-br from-slate-700 to-slate-900">
                <div
                  className={`grid h-28 w-28 place-items-center rounded-full bg-brand-600 text-4xl font-semibold text-white ${patientTalking ? "ring-4 ring-emerald-400/70" : ""}`}
                >
                  {initials(p.name)}
                </div>
              </div>
            )}
            <div
              className={`pointer-events-none absolute inset-0 rounded-lg transition-shadow ${patientTalking ? "shadow-[inset_0_0_0_3px_rgba(52,211,153,0.9)]" : ""}`}
            />
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded bg-black/55 px-2 py-1 text-xs font-medium text-white">
                <span className={`h-1.5 w-1.5 rounded-full ${callEnd ? "bg-slate-400" : "bg-rose-500"}`} /> {callEnd ? "CALL ENDED" : "LIVE"}
              </span>
              {chart.showComfort && chart.rapport !== null && joined && (
                <span
                  tabIndex={0}
                  aria-label={COMFORT_HELP}
                  className="flex cursor-help items-center gap-2 rounded bg-black/55 px-2 py-1 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  data-tooltip={COMFORT_HELP}
                >
                  Comfort
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/25">
                    <span
                      className={`block h-full rounded-full transition-all duration-700 ${chart.rapport >= 60 ? "bg-emerald-400" : chart.rapport >= 40 ? "bg-amber-400" : "bg-rose-400"}`}
                      style={{ width: `${chart.rapport}%` }}
                    />
                  </span>
                  {turnComfort && turnComfort.delta !== 0 && (
                    <span
                      className={`font-semibold ${turnComfort.delta > 0 ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      {turnComfort.delta > 0 ? "+" : "\u2212"}
                      {Math.abs(turnComfort.delta)}
                    </span>
                  )}
                </span>
              )}
            </div>
            {chart.showComfort && turnComfort?.reasons.length ? <div className="absolute bottom-24 left-3 z-10 flex max-w-[70%] flex-wrap gap-1">{turnComfort.reasons.map((r,i) => <span key={i} className={`rounded-full px-2 py-1 text-xs ${r.delta >= 0 ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{r.delta >= 0 ? "+" : "−"} {r.label}</span>)}</div> : null}
            {callEnd && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/55 p-10 text-center text-white"><div><p className="text-lg font-semibold">{firstName} ended the call</p><p className="mt-2 text-sm">{ENDED_WHY[callEnd.reason]}</p></div></div>}
            {/* A self-view is useful only while the camera is enabled. */}
            {camOn && <div className="absolute right-3 top-3 h-20 w-28 overflow-hidden rounded-md border border-white/20 bg-slate-800">
              <video ref={selfRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
              <span className="absolute bottom-0.5 left-1 text-xs text-white/80">You</span>
            </div>}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-3 pt-10">
              {captionsOn && caption && (
                <p className="mb-2 text-[15px] leading-snug text-white">
                  {(() => {
                    const t = stripCues(caption);
                    return t.length > 190
                      ? "… " + t.slice(t.length - 190).replace(/^\S*\s/, "")
                      : t || "…";
                  })()}
                </p>
              )}
              {micOn && !patientTalking && !busy && !callEnd && (
                <p className="mb-2 text-sm italic text-emerald-200">
                  {interim
                    ? `You: ${interim}`
                    : "Listening… speak to the patient"}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-medium text-white">
                  {p.name}
                  <span className="ml-2 text-xs font-normal text-white/70">
                    {patientTalking
                      ? "speaking"
                      : busy
                        ? "thinking…"
                        : chart.emotion}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                  {[
                    {
                      on: micOn,
                      set: () => setMicOn((v) => !v),
                      a: ICON.mic,
                      b: ICON.micOff,
                      label: micSupported
                        ? micOn
                          ? "Mute microphone"
                          : "Talk with your microphone"
                        : "Voice input needs Chrome, Edge or Safari",
                      disabled: !micSupported || !!callEnd || scoring,
                    },
                    {
                      on: camOn,
                      set: toggleCam,
                      a: ICON.cam,
                      b: ICON.camOff,
                      label: camOn ? "Turn camera off" : "Turn camera on",
                    },
                    {
                      on: speakerOn,
                      set: () => (setSpeakerOn((v) => !v), stopVoice()),
                      a: ICON.vol,
                      b: ICON.volOff,
                      label: speakerOn
                        ? "Mute patient voice"
                        : "Hear the patient",
                    },
                    {
                      on: captionsOn,
                      set: () => setCaptionsOn((v) => !v),
                      a: ICON.cc,
                      b: ICON.cc,
                      label: captionsOn ? "Hide captions" : "Show captions",
                    },
                  ].map((c, i) => (
                    <button
                      key={i}
                      onClick={c.set}
                      disabled={c.disabled}
                      data-tooltip={c.label}
                      aria-label={c.label}
                      className={`grid h-10 w-10 place-items-center rounded-full sm:h-9 sm:w-9 transition-colors disabled:opacity-40 ${c.on ? "bg-white/20 text-white hover:bg-white/30" : "bg-white text-slate-800"}`}
                    >
                      <Icon d={c.on ? c.a : c.b} />
                    </button>
                  ))}
                  <button
                    onClick={openWrap}
                    data-tooltip="End visit"
                    aria-label="End visit"
                    className="grid h-10 w-12 place-items-center rounded-full sm:h-9 sm:w-11 bg-rose-600 text-white hover:bg-rose-700"
                  >
                    <Icon d={ICON.hang} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Conversation */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <h2 className="text-xs font-semibold text-slate-600">
                Conversation
              </h2>
              <button
                onClick={() => setFullTranscript((v) => !v)}
                aria-expanded={fullTranscript}
                className="text-xs text-brand-700"
              >
                {fullTranscript ? "Recent exchange" : "Full transcript"}
              </button>
            </div>
            <div
              ref={logRef}
              className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3"
            >
              {messages.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-500">
                  Start by introducing yourself to {firstName}.
                </p>
              )}
              {(fullTranscript ? messages : messages.slice(-2)).map((m) =>
                m.speaker === "student" ? (
                  <div key={m.id} className="group flex justify-end gap-2">
                    {data.canRewind && m.id > 0 && !busy && (
                      <button
                        onClick={() => rewindTo(m.turn - 1)}
                        className="self-center whitespace-nowrap text-xs text-slate-400 underline decoration-dotted hover:text-brand-600"
                      >
                        Try this again
                      </button>
                    )}
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-sm text-white">
                      {m.text}
                    </div>
                  </div>
                ) : m.speaker === "patient" ? (
                  <div key={m.id} className="flex">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2 text-sm text-slate-900">
                      <GeneratedText text={m.text} cues />
                    </div>
                  </div>
                ) : m.speaker === "system" && m.text.startsWith("Requested:") ? (
                  <ResultCard key={m.id} text={m.text} results={chart.results} onView={() => setChartFocus({ tab: "results", key: Date.now() })} />
                ) : (
                  <div
                    key={m.id}
                    className={`whitespace-pre-wrap rounded-md border px-3 py-2 text-[13px] ${m.speaker === "coach" ? "border-amber-200 bg-amber-50 text-amber-900" : m.speaker === "instructor" ? "border-violet-200 bg-violet-50 text-violet-900" : "border-slate-200 bg-slate-50 font-mono text-[12px] text-slate-700"}`}
                  >
                    <span className="mr-1.5 font-sans text-xs font-semibold uppercase tracking-wide opacity-70">
                      {m.speaker === "coach"
                        ? "Coach"
                        : m.speaker === "instructor"
                          ? "Instructor"
                          : m.speaker === "clinician"
                            ? "Colleague"
                            : "Chart"}
                    </span>
                    <GeneratedText text={m.text} />
                  </div>
                ),
              )}
              {pending !== null && (
                <div className="flex">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2 text-sm text-slate-900">
                    {stripCues(pending) ? <GeneratedText text={stripStageCues(pending)} /> : (
                      <span className="text-slate-400">
                        {firstName} is thinking…
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {error && (
              <div className="border-t border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                {error}
              </div>
            )}
            {callEnd && <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{firstName} ended the call. The chart stays open to review; write up the visit when you are ready.</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex gap-2 border-t border-slate-200 p-2.5"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy || paused || !joined || scoring || !!callEnd}
                placeholder={
                  callEnd ? `${firstName} ended the call` : paused
                    ? "Paused by your instructor"
                    : micOn
                      ? "Speak, or type here"
                      : `Say something to ${firstName}`
                }
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-base sm:text-[15px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100"
                autoFocus={typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches}
              />
              <button
                disabled={busy || paused || scoring || !!callEnd || !input.trim()}
                className="min-h-10 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-slate-300"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT: the chart */}
        <div className={`min-h-0 lg:contents ${mobileView === "call" ? "max-lg:hidden" : ""}`}>
        <ChartPanel
          terminologyDisabled={data.mode === "exam"}
          notes={wrap[data.role.wrapUp[0]?.id] || ""}
          notesLabel={data.role.wrapUp[0]?.label || "Visit notes"}
          onNotes={(text) =>
            setWrap((w) => ({
              ...w,
              [data.role.wrapUp[0]?.id || "summary"]: text,
            }))
          }
          chart={chart}
          focus={chartFocus}
          encounterStartedAt={data.startedAt}
          fresh={fresh}
          onOrder={order}
          ordering={ordering}
          locked={paused || !joined || scoring}
          teamTab={
            data.journeyRunId ? (
              <JourneyChartTab runId={data.journeyRunId} encounterId={id} />
            ) : undefined
          }
        />
        </div>
      </div>

      {/* Waiting room */}
      {!joined && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Waiting room"
            className="relative flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <div className="absolute right-6 top-6 z-10">
              <IconToggle
                side="bottom"
                label="Highlight important briefing text"
                tip={
                  highlightBrief
                    ? "Turn off briefing highlights"
                    : "Highlight the visit reason, timing and session goals"
                }
                active={highlightBrief}
                onClick={() => setHighlightBrief((v) => !v)}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-5 w-5"
                >
                  <path d="m14 3 7 7-9 9-7-7Z M5 12l-2 7 7-2 M3 22h18" />
                  <path d="m11 6 7 7" />
                </svg>
              </IconToggle>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-2 sm:p-6 sm:pb-2">
              <PatientPortrait
                src={p.portrait}
                name={p.name}
                className="mb-4 h-40 w-full rounded-2xl"
              />
              <div className="text-xs font-medium uppercase tracking-wide text-brand-600">
                Waiting room · {MODE_LABEL[data.mode] || data.mode}
              </div>
              <h1 className="mt-1 text-xl font-semibold text-slate-900">
                {p.name}, {p.age}
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                You are joining as the {data.role.roleTitle}.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-slate-700">
                {highlightBrief
                  ? briefParts(chart.brief).map((part, i) =>
                      part.important ? (
                        <mark
                          key={i}
                          className="rounded bg-amber-100 text-slate-900"
                        >
                          {part.text}
                        </mark>
                      ) : (
                        part.text
                      ),
                    )
                  : chart.brief}
              </p>
              {(chart.goals?.length || chart.tasks.length) > 0 && (
                <>
                  <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Session goals
                  </h2>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                    {(chart.goals?.length ? chart.goals : chart.tasks).map((t, i) => (
                      <li key={i}>
                        {highlightBrief
                          ? briefParts(t).map((part, j) =>
                              part.important ? (
                                <mark
                                  key={j}
                                  className="rounded bg-blue-100 text-blue-900"
                                >
                                  {part.text}
                                </mark>
                              ) : (
                                part.text
                              ),
                            )
                          : t}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="mt-4 rounded-md bg-slate-50 p-3 text-[13px] text-slate-600">
                <span
                  className={
                    highlightBrief
                      ? "rounded bg-amber-100 font-medium text-slate-900"
                      : ""
                  }
                >
                  {data.timeLimitMin
                    ? `You have ${data.timeLimitMin} minutes. `
                    : "No time limit. "}
                </span>
                Talk by microphone or type. The chart on the right fills in as
                you learn things; request exams, tests and records from Examine
                or Order tests. When you are done, end the visit and write your{" "}
                {data.role.noteFormat} wrap-up.
                {data.mode === "exam" &&
                  " This is an exam: no hints, and the comfort meter is hidden."}
                {data.liveAssist &&
                  " Your instructor may watch this visit, pause it, or send you a note."}
              </div>
              <p
                className={`mt-3 text-[13px] ${data.recorded ? "text-violet-800" : "text-slate-600"}`}
              >
                {data.recorded
                  ? "Recorded: your instructor can see this visit, its transcript and its score."
                  : "Private practice: only you see this visit and its feedback. It still updates your own progress."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-4 sm:px-6">
              <button
                onClick={() => {
                  fetch(`/api/encounters/${id}/start`, { method: "POST" })
                    .then(load)
                    .catch(() => {});
                  setJoined(true);
                  // Unlock audio playback inside the click.
                  audioRef.current?.play().catch(() => {});
                }}
                className="min-h-11 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Join visit
              </button>
              <div className="ml-auto flex items-center gap-2">
                {micSupported && (
                  <IconToggle
                    label="Use my microphone"
                    tip={
                      micOn
                        ? "Microphone on — click to use typing only"
                        : "Microphone off — click to speak your questions"
                    }
                    active={micOn}
                    onClick={() => setMicOn((v) => !v)}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                    >
                      <rect x="9" y="2" width="6" height="12" rx="3" />
                      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
                      {!micOn && <path d="m3 3 18 18" />}
                    </svg>
                  </IconToggle>
                )}
                <IconToggle
                  label="Patient voice"
                  tip={
                    speakerOn
                      ? "Patient voice on — click to mute spoken replies"
                      : "Patient voice off — click to hear spoken replies"
                  }
                  active={speakerOn}
                  onClick={() => setSpeakerOn((v) => !v)}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                  >
                    <path d="M11 4 6 8H2v8h4l5 4Z" />
                    {speakerOn ? (
                      <>
                        <path d="M15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16" />
                      </>
                    ) : (
                      <path d="m16 9 6 6m0-6-6 6" />
                    )}
                  </svg>
                </IconToggle>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instructor pause */}
      {paused && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-violet-950/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
              Paused by your instructor
            </div>
            <p className="mt-3 whitespace-pre-wrap text-slate-800">
              {data.pauseNote ||
                "Take a moment. Your instructor will resume the visit shortly."}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              The clock is stopped. The visit continues when they resume it.
            </p>
          </div>
        </div>
      )}

      <NoteComposer
        open={wrapOpen}
        onClose={closeWrap}
        fields={data.role.wrapUp}
        format={data.role.noteFormat}
        patient={p.name}
        chart={chart}
        wrap={wrap}
        setWrap={setWrap}
        onSubmit={submit}
        scoring={scoring}
        saved={submissionSaved}
        error={error || ""}
        timeUp={timeUp}
        callEnd={callEnd}
      />
    </div>
  );
}
