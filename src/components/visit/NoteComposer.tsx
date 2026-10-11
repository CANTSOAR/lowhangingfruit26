"use client";
import { useState } from "react";
import Dialog from "@/components/learning/Dialog";
import { Button } from "@/components/ui";
import type { PatientEnded } from "@/lib/types";
import type { ChartView } from "@/lib/engine/encounter";
export default function NoteComposer({
  open,
  onClose,
  fields,
  format,
  patient,
  chart,
  wrap,
  setWrap,
  onSubmit,
  scoring,
  saved,
  error,
  timeUp,
  callEnd,
}: {
  open: boolean;
  onClose: () => void;
  fields: { id: string; label: string; placeholder?: string }[];
  format: string;
  patient: string;
  chart: ChartView;
  wrap: Record<string, string>;
  setWrap: (
    update: (w: Record<string, string>) => Record<string, string>,
  ) => void;
  onSubmit: () => void;
  scoring: boolean;
  saved: boolean;
  error: string;
  timeUp: boolean;
  callEnd?: PatientEnded | null;
}) {
  const [step, setStep] = useState(0);
  // Field order comes from the profession catalog; the final step is always review.
  const editing = fields[step];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        callEnd ? "The patient ended the call · write up your visit" : timeUp ? "Time is up · write up your visit" : `Your ${format} write-up`
      }
      busy={scoring}
    >
      {scoring ? (
        <div className="py-8 text-center" role="status">
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-brand-600" />
          <h3 className="text-lg font-semibold">Reviewing your visit</h3>
          <p className="mt-3 text-sm text-slate-600">
            {saved
              ? "The server has saved your visit and write-up. Feedback is being evaluated."
              : "Submitting your write-up and waiting for the server."}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Scoring uses the case rubric and evidence from the conversation.
            This can take a minute.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-5 text-sm text-slate-500">
            {patient} · Your own observations, reasoning and plan.
          </p>
          <nav
            aria-label="Write-up steps"
            className="mb-5 flex flex-wrap gap-2"
          >
            {[
              ...fields.map(
                (f, i) => `${i + 1}. ${f.label.split(":")[0].split(" (")[0]}`,
              ),
              "Review",
            ].map((label, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-current={step === i ? "step" : undefined}
                className={`max-w-full truncate rounded-full px-3 py-2 text-xs ${step === i ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </nav>
          {editing ? (
            <div key={editing.id} className="fade-in">
              <label
                htmlFor={`note-${editing.id}`}
                className="mb-2 block text-sm font-semibold"
              >
                {editing.label}
              </label>
              <textarea
                id={`note-${editing.id}`}
                value={wrap[editing.id] || ""}
                onChange={(e) =>
                  setWrap((w) => ({ ...w, [editing.id]: e.target.value }))
                }
                rows={7}
                className="w-full rounded-xl border border-slate-300 p-4 text-sm focus:border-brand-500"
                placeholder="Write in your own words…"
              />
              <details className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-slate-600">
                  Review disclosed findings
                </summary>
                <ul className="mt-3 space-y-2 text-xs text-slate-600">
                  {chart.sections.flatMap((s) =>
                    s.items.map((it) => <li key={it.id}>{it.text}</li>),
                  )}
                  {chart.results.map((r) => (
                    <li key={r.id}>
                      <strong>{r.name}:</strong> {r.result}
                    </li>
                  ))}
                  {!chart.sections.length && !chart.results.length && (
                    <li>No findings have been released yet.</li>
                  )}
                </ul>
              </details>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((f) => (
                <section
                  key={f.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <h3 className="text-sm font-semibold">{f.label}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                    {wrap[f.id]?.trim() || "No note entered."}
                  </p>
                  <button
                    onClick={() => setStep(fields.indexOf(f))}
                    className="mt-2 text-xs font-medium text-brand-700"
                  >
                    Edit
                  </button>
                </section>
              ))}
              <div className="rounded-xl bg-brand-50 p-4 text-sm text-slate-700">
                <h3 className="font-semibold">Before you leave</h3>
                <p className="mt-1 text-xs">
                  Reflect on what you actually did. These reminders do not
                  affect your score.
                </p>
                {[
                  "Summarised with the patient",
                  "Checked their understanding",
                  "Agreed next steps",
                ].map((label) => (
                  <label key={label} className="mt-3 flex gap-2">
                    <input type="checkbox" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={onClose}>
              {callEnd ? "Review the chart" : "Back to patient"}
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="secondary" onClick={() => setStep(step - 1)}>
                  Previous
                </Button>
              )}
              {step < fields.length ? (
                <Button onClick={() => setStep(step + 1)}>Continue →</Button>
              ) : (
                <Button onClick={onSubmit}>Submit for feedback</Button>
              )}
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}
