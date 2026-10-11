"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ClinicalTerm } from "@/components/learning/Preferences";
import Snapshot from "./chart/Snapshot";
import ChartReview from "./chart/ChartReview";
import ResultsReview from "./chart/ResultsReview";
import { patientBits } from "./chart/Storyboard";
import type { ChartView } from "@/lib/engine/encounter";

type Tab =
  | "summary"
  | "visit"
  | "examine"
  | "notes"
  | "results"
  | "orders"
  | "documents"
  | "activity"
  | "team";

const KIND_LABEL: Record<string, string> = {
  exam: "Remote exam",
  vitals: "Vitals",
  lab: "Lab",
  imaging: "Imaging",
  test: "Test",
  record: "Record",
  assessment: "Assessment",
  procedure: "Procedure",
};

/** The electronic chart beside the visit. It only ever receives the student-safe ChartView. */
export default function ChartPanel({
  chart,
  fresh,
  onOrder,
  ordering,
  locked,
  teamTab,
  terminologyDisabled,
  notes,
  notesLabel,
  onNotes,
  focus,
  encounterStartedAt,
}: {
  chart: ChartView;
  focus?: { tab: "results" | "orders"; key: number };
  encounterStartedAt: string;
  /** ids (facts, actions, documents) that arrived in the latest update, highlighted briefly */
  fresh: Set<string>;
  onOrder: (request: string) => Promise<void>;
  ordering: boolean;
  locked: boolean;
  teamTab?: ReactNode;
  terminologyDisabled?: boolean;
  notes: string;
  notesLabel: string;
  onNotes: (text: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [seen, setSeen] = useState({ visit: 0, results: 0, documents: 0 });
  useEffect(() => { if (focus) setTab(focus.tab); }, [focus]);
  const now = useMemo(() => {
    const raw = encounterStartedAt.replace(" ", "T");
    const date = new Date(raw.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw + "Z");
    return Number.isFinite(date.getTime()) ? date : new Date(0);
  }, [encounterStartedAt]);
  const bits = useMemo(() => patientBits(chart), [chart]);
  const resultWhen = (r: ChartView["results"][number]) => r.turn === 0 ? "Prior record" : `This visit · T${r.turn}`;
  const newIds = fresh;
  const [order, setOrder] = useState("");

  const counts = useMemo(
    () => ({
      visit: chart.sections.reduce((n, s) => n + s.items.length, 0),
      results: chart.results.length + chart.unmatched.length,
      documents: chart.artifacts.length,
    }),
    [chart],
  );

  const allergies = chart.atStart.find((x) => /allerg/i.test(x.label));
  const header = chart.atStart.filter((x) => !/allerg/i.test(x.label));

  const tabs: { id: Tab; label: string; unread?: number }[] = [
    {
      id: "summary",
      label: "Patient chart",
      unread: counts.visit - seen.visit,
    },
    { id: "examine", label: "Examine" },
    { id: "notes", label: "Clinical notes" },
    { id: "results", label: "Results" },
    {
      id: "orders",
      label: "Order tests",
      unread: counts.results - seen.results,
    },
    {
      id: "documents",
      label: "Documents",
      unread: counts.documents - seen.documents,
    },
    { id: "activity", label: "Activity" },
    ...(teamTab ? [{ id: "team" as Tab, label: "Care team" }] : []),
  ];

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    const text = order.trim();
    if (!text || ordering) return;
    setOrder("");
    await onOrder(text);
  }

  return (
    <div className="encounter-chart flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Patient header strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-slate-300 bg-slate-800 px-4 py-2 text-white">
        <div>
          <div className="text-[15px] font-semibold leading-tight">
            {chart.patient.name}
          </div>
          <div className="text-xs text-slate-300">
            {chart.patient.age} y · {chart.patient.sex} ·{" "}
            {chart.patient.pronouns}
          </div>
        </div>
        <div className="min-w-0 flex-1 text-xs">
          <div className="text-slate-400">Reason for visit</div>
          <div className="truncate text-slate-100">{chart.chiefComplaint}</div>
        </div>
        <div
          className={`rounded px-2 py-1 text-xs ${allergies && !/^(none|nkda|no known)/i.test(allergies.value.trim()) ? "bg-rose-600 text-white" : "bg-slate-700 text-slate-200"}`}
        >
          <span className="opacity-80">Allergies: </span>
          {allergies ? allergies.value : "Not on file"}
        </div>
      </div>

      {header.filter((x) =>
        /vital|blood pressure|heart rate|oxygen|temperature/i.test(x.label),
      ).length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-blue-50 px-4 py-2">
          {header
            .filter((x) =>
              /vital|blood pressure|heart rate|oxygen|temperature/i.test(
                x.label,
              ),
            )
            .map((x, i) => (
              <span key={i} className="text-xs text-slate-700">
                <strong>{x.label}:</strong> {x.value}
              </span>
            ))}
        </div>
      )}
      <div className="flex gap-0.5 overflow-x-auto border-b border-slate-200 bg-slate-100 px-2 pt-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setSeen((s) => ({
                ...s,
                visit: t.id === "summary" ? counts.visit : s.visit,
                results:
                  t.id === "results" || t.id === "examine"
                    ? counts.results
                    : s.results,
                documents:
                  t.id === "documents" ? counts.documents : s.documents,
              }));
            }}
            aria-pressed={tab === t.id}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-md border border-b-0 px-3 py-1.5 text-[13px] ${tab === t.id ? "border-slate-300 bg-white font-medium text-slate-900" : "border-transparent text-slate-600 hover:bg-slate-200"}`}
          >
            {t.label}
            {!!t.unread && t.unread > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold leading-4 text-white">
                {t.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "notes" && (
          <div>
            <label
              htmlFor="clinical-note"
              className="mb-2 block text-sm font-semibold"
            >
              {notesLabel}
            </label>
            <textarea
              id="clinical-note"
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              rows={10}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              placeholder="Record your observations in your own words…"
            />
            <p className="mt-2 text-xs text-slate-500">
              This draft is kept in this browser tab and carries into your
              write-up. It is saved to the server when you submit the visit.
            </p>
          </div>
        )}
        {tab === "summary" && (
          <div className="space-y-3">
            <p className="rounded-md bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
              {chart.setting}
            </p>
            <Snapshot chart={chart} bits={bits} onGo={tab => setTab(tab === "review" ? "documents" : "results")} />
            <p className="text-xs text-slate-500">
              History you take during the call is filed below in your patient
              chart. Results appear when you request an exam, test or record.
            </p>
          </div>
        )}

        {tab === "summary" && (
          <div className="space-y-4">
            {chart.sections.length === 0 && (
              <p className="text-sm text-slate-500">
                Nothing documented yet. What the patient tells you is filed here
                as you go.
              </p>
            )}
            {chart.sections.map((s) => (
              <section key={s.category}>
                <h3 className="mb-1 border-b border-slate-200 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {s.label}
                </h3>
                <ul className="space-y-0.5">
                  {s.items.map((it) => (
                    <li
                      key={it.id}
                      className={`flex items-start gap-2 rounded px-1.5 py-1 text-[13px] ${fresh.has(it.id) ? "flash-new" : ""}`}
                    >
                      <span
                        className="mt-0.5 shrink-0 rounded bg-slate-100 px-1 text-[10px] tabular-nums text-slate-500"
                        data-tooltip={
                          it.how === "record"
                            ? "Already on record from an earlier encounter"
                            : `Turn ${it.turn}`
                        }
                      >
                        {it.how === "record" ? "REC" : `T${it.turn}`}
                      </span>
                      <span className="text-slate-800">{it.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {(tab === "orders" || tab === "examine") && (
          <div className="space-y-4">
            <form
              onSubmit={submitOrder}
              className="rounded-md border border-slate-200 bg-slate-50 p-3"
            >
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {tab === "examine"
                  ? "Request a guided examination"
                  : "Order a test or request a record"}
              </label>
              <div className="flex gap-2">
                <input
                  aria-label={
                    tab === "examine"
                      ? "Examination request"
                      : "Test or record request"
                  }
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                  disabled={locked || ordering}
                  placeholder={
                    tab === "examine"
                      ? "Describe the examination you want to request"
                      : "Describe the test or record you want to request"
                  }
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100"
                />
                <button
                  disabled={locked || ordering || !order.trim()}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300"
                >
                  {ordering ? "Sending" : "Request"}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Only results approved for this case can come back. Exams are
                guided over video.
              </p>
            </form>
            {chart.results.length === 0 && chart.unmatched.length === 0 && (
              <p className="text-sm text-slate-500">No results yet.</p>
            )}
            <ul className="space-y-2">
              {chart.results.map((r) => (
                <li
                  key={r.id}
                  className={`rounded-md border p-3 ${r.abnormal ? "border-amber-300 bg-amber-50/60" : "border-slate-200"} ${fresh.has(r.id) ? "flash-new" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-slate-900">
                      {r.name}{" "}
                      <ClinicalTerm
                        text={r.name}
                        disabled={terminologyDisabled}
                      />
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      {r.abnormal && (
                        <span className="rounded bg-amber-200 px-1.5 font-medium text-amber-900">
                          Abnormal
                        </span>
                      )}
                      {KIND_LABEL[r.kind] || r.kind} ·{" "}
                      {r.turn > 0 ? `after T${r.turn}` : "earlier visit"}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">
                    {r.result}
                  </p>
                </li>
              ))}
              {chart.unmatched.map((u, i) => (
                <li
                  key={"u" + i}
                  className="rounded-md border border-dashed border-slate-300 p-3 text-[13px] text-slate-600"
                >
                  <span className="font-medium text-slate-800">
                    {u.request}
                  </span>
                  : no approved result is available for this in the case file.
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "results" && <ResultsReview chart={chart} now={now} fresh={fresh} newIds={newIds} resultWhen={resultWhen} />}
        {tab === "documents" && <div className="flex min-h-[24rem] flex-col"><ChartReview chart={chart} now={now} fresh={fresh} newIds={newIds} resultWhen={resultWhen} /></div>}

        {tab === "activity" && (
          <div>
            <p className="mb-2 text-xs text-slate-500">
              Everything released to you in this visit, in order.
            </p>
            {chart.log.length === 0 && (
              <p className="text-sm text-slate-500">Nothing yet.</p>
            )}
            <ol className="space-y-1">
              {chart.log.map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px]">
                  <span className="mt-0.5 w-14 shrink-0 whitespace-nowrap rounded bg-slate-100 px-1 text-center text-[10px] tabular-nums text-slate-500">
                    {l.turn <= 0
                      ? "earlier"
                      : l.kind === "result"
                        ? `after T${l.turn}`
                        : `T${l.turn}`}
                  </span>
                  <span
                    className={`mt-0.5 w-16 shrink-0 text-[10px] font-medium uppercase tracking-wide ${l.kind === "fact" ? "text-brand-600" : l.kind === "result" ? "text-amber-700" : "text-violet-700"}`}
                  >
                    {l.kind === "fact"
                      ? "History"
                      : l.kind === "result"
                        ? "Result"
                        : "Document"}
                  </span>
                  <span className="text-slate-800">{l.text}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {tab === "team" && teamTab}
      </div>
    </div>
  );
}
