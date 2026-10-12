"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Textarea } from "@/components/ui";
import { CaseCard, type PracticeCase } from "./PracticeLibrary";
import Dialog from "@/components/learning/Dialog";
import { LevelPips } from "@/components/learning/Patient";
import { LEVEL_NAMES } from "@/lib/engine/difficulty";

const IDEAS = [
  {
    title: "Build trust",
    text: "A teenager who answers in one word until I earn some trust",
    icon: "♡",
  },
  {
    title: "Explain clearly",
    text: "An anxious first-time parent who has read a lot online and questions everything I say",
    icon: "✧",
  },
  {
    title: "Listen closely",
    text: "An older man who downplays his symptoms and does not want to bother anyone",
    icon: "◎",
  },
  {
    title: "Explore barriers",
    text: "Someone who has stopped a medication and has not told anyone",
    icon: "↗",
  },
];
export default function MakePatient({
  roleName,
  knownCaseIds,
}: {
  roleName: string;
  knownCaseIds: string[];
}) {
  const router = useRouter();
  const [created, setCreated] = useState<PracticeCase | null>(null);
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0);
  const [text, setText] = useState(""),
    [level, setLevel] = useState(2);
  const [busy, setBusy] = useState(false),
    [secs, setSecs] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  async function go() {
    setOpen(false);
    setCreated(null);
    setBusy(true);
    setSecs(0);
    setError("");
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text, level }),
      });
      const j = await res.json();
      if (!res.ok || j.error || !j.id)
        throw new Error(j.error || "The patient could not be created.");
      setCreated({
        ...j.patient,
        activeId: j.id,
        attempts: 0,
        best: null,
        lastId: null,
      });
      setBusy(false);
      setText("");
      setStep(0);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <button
        disabled={busy}
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/60 p-5 text-left hover:border-brand-500 hover:bg-brand-50"
      >
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-3xl text-brand-600"
          aria-hidden="true"
        >
          ＋
        </span>
        <span>
          <span className="block font-semibold text-slate-900">
            {busy ? "Creating your patient…" : "Create a practice patient"}
          </span>
          <span className="mt-1 block text-sm text-slate-600">
            Choose a skill or describe someone you want to meet.
          </span>
        </span>
        <span className="ml-auto text-brand-600" aria-hidden="true">
          →
        </span>
      </button>
      {(busy || error) && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="min-w-0 p-5" role={error ? "alert" : "status"}>
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-500"
              >
                {error ? (
                  "!"
                ) : (
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                )}
              </span>
              <div>
                <h3 className="font-semibold">
                  {error ? "Patient not generated" : "Generating your patient…"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {roleName} · {LEVEL_NAMES[level]}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {error ||
                "Your patient's card will appear here when ready. You can browse other patients while we create the case."}
            </p>
            {busy && (
              <p className="mt-3 text-xs tabular-nums text-slate-400">
                Elapsed {Math.floor(secs / 60)}:
                {String(secs % 60).padStart(2, "0")}
                {secs > 150 ? " · Still waiting for the server" : ""}
              </p>
            )}
            {error && (
              <Button className="mt-4" onClick={go}>
                Try again
              </Button>
            )}
          </Card>
        </div>
      )}
      {created && !knownCaseIds.includes(created.id) && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CaseCard
            c={created}
            professionNames={Object.fromEntries(
              created.professions.map((p) => [p, roleName]),
            )}
          />
        </div>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create your next patient"
        busy={busy}
      >
        <>
          <ol className="mb-6 flex gap-2" aria-label="Creation steps">
            {["Your idea", "Difficulty", "Review"].map((label, i) => (
              <li
                key={label}
                className={`flex-1 rounded-lg px-2 py-2 text-center text-xs font-medium ${i === step ? "bg-brand-600 text-white" : i < step ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-500"}`}
                aria-current={i === step ? "step" : undefined}
              >
                {i + 1}. {label}
              </li>
            ))}
          </ol>
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                What would you like to practice as a {roleName.toLowerCase()}{" "}
                student?
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {IDEAS.map((i) => (
                  <button
                    key={i.title}
                    onClick={() => setText(i.text)}
                    aria-pressed={text === i.text}
                    className={`rounded-xl border p-4 text-left ${text === i.text ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <span className="text-xl text-brand-600" aria-hidden="true">
                      {i.icon}
                    </span>
                    <span className="ml-2 text-sm font-semibold">
                      {i.title}
                    </span>
                    <span className="mt-2 block text-xs leading-relaxed text-slate-600">
                      {i.text}
                    </span>
                  </button>
                ))}
              </div>
              <label
                htmlFor="patient-idea"
                className="block text-sm font-medium"
              >
                Or describe your own patient
              </label>
              <Textarea
                id="patient-idea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={1500}
                placeholder="One sentence about the patient or the skill you want to practice…"
              />
              <p className="text-xs text-slate-500">
                At least 15 characters · {text.length}/1500
              </p>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-5">
              <h3 className="font-semibold">Choose your challenge</h3>
              <p className="text-sm text-slate-600">
                Difficulty changes the patient&apos;s behavior and how readily
                they share information.
              </p>
              <div className="grid gap-2">
                {[1, 2, 3, 4, 5].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    aria-pressed={level === l}
                    className={`flex items-center justify-between rounded-xl border p-4 text-left ${level === l ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}
                  >
                    <LevelPips level={l} />
                    <span className="text-brand-600" aria-hidden="true">
                      {level === l ? "✓" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Ready to meet your patient?</h3>
              <blockquote className="rounded-2xl bg-slate-50 p-5 text-sm leading-relaxed text-slate-700">
                {text}
              </blockquote>
              <LevelPips level={level} />
              <p className="text-sm text-slate-600">
                Role: {roleName} · {LEVEL_NAMES[level]}
              </p>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                Private practice patient.
                It is for practice and is not clinically validated.
              </p>
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
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
            <Button
              variant="secondary"
              onClick={() => (step ? setStep(step - 1) : setOpen(false))}
            >
              {step ? "Back" : "Cancel"}
            </Button>
            {step < 2 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={text.trim().length < 15}
              >
                Continue →
              </Button>
            ) : (
              <Button onClick={go}>Generate patient →</Button>
            )}
          </div>
        </>
      </Dialog>
    </>
  );
}
