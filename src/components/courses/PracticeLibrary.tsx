"use client";
import DifficultyDemeanor from "@/components/learning/DifficultyDemeanor";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Label, LinkButton, Select } from "@/components/ui";
import { PatientPortrait, ScoreRing } from "@/components/learning/Patient";
import { Term } from "@/components/learning/Preferences";
import { LEVEL_NAMES } from "@/lib/engine/difficulty";
import { feedbackUrl, visitUrl } from "@/lib/courses/settings";
import DifficultySignal from "@/components/learning/DifficultySignal";
import StartVisit from "./StartVisit";
import Dialog from "@/components/learning/Dialog";

export interface PracticeCase {
  id: string;
  /** Student-safe label; the faculty title never reaches this component. */
  label: string;
  specialty: string;
  professions: string[];
  difficulty: number;
  encounterType: string;
  patientFirstName: string;
  age: number | null;
  portrait?: string;
  aiDraft: boolean;
  attempts: number;
  best: number | null;
  lastId: string | null;
  activeId: string | null;
  activeLevel?: number;
}

export function CaseCard({
  c,
  professionNames,
}: {
  c: PracticeCase;
  professionNames: Record<string, string>;
}) {
  const [level, setLevel] = useState(c.activeLevel ?? c.difficulty);
  const [vary, setVary] = useState(c.attempts > 0);
  return (
    <Card className="patient-card flex min-w-0 flex-col p-5">
      <div className="flex items-center gap-4">
        <PatientPortrait
          src={c.portrait}
          name={c.patientFirstName}
          className="h-20 w-20 shrink-0 rounded-full ring-4 ring-brand-50"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold text-slate-900">
            {c.patientFirstName}
            {c.age !== null && `, ${c.age}`}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {c.encounterType || "Practice visit"}
          </p>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-slate-600">
        {c.professions.map((p) => professionNames[p] || p).join(", ")}
        {c.specialty && ` · ${c.specialty}`}
      </p>
      {c.aiDraft && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Badge tone="amber">AI · unreviewed</Badge>
          <Term term="draft" />
        </div>
      )}
      {(c.attempts > 0 || c.best !== null) ? <div className="my-4 min-h-20 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
        <div className="text-xs text-slate-500">
          <p>
            {c.attempts
              ? `${c.attempts} attempt${c.attempts === 1 ? "" : "s"}`
              : ""}
          </p>
          {c.lastId && (
            <Link
              href={feedbackUrl(c.lastId)}
              className="mt-1 inline-block text-brand-700 hover:underline"
            >
              Last feedback →
            </Link>
          )}
        </div>
        {c.best !== null && <ScoreRing value={c.best} />}
      </div> : <div className="my-4 flex min-h-20 items-center gap-3 rounded-xl bg-slate-50 p-3">
        <svg aria-hidden="true" className="h-6 w-6 shrink-0 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 3h6v3H9zM9 4H6v17h12V4h-3M9 11h6M9 15h6" /></svg>
        <div><p className="text-xs font-medium text-slate-700">{c.activeId ? "Your visit is in progress" : "A conversation, then your care plan"}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{c.activeId ? "Pick up where you left off and use the chart to build your next steps." : "Explore the patient's concerns, review the chart and practise your next steps."}</p></div>
      </div>}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2">
        {c.activeId ? (
          <LinkButton href={visitUrl(c.activeId)}>Continue visit →</LinkButton>
        ) : (
          <StartVisit
            body={{
              caseId: c.id,
              mode: "practice",
              level,
              perturb: c.attempts > 0 && vary,
            }}
            label={c.attempts ? "Retry patient →" : "Meet patient →"}
          />
        )}
        <div className="ml-auto flex items-center gap-2"><DifficultyDemeanor level={level} patient={c.patientFirstName} /><DifficultySignal level={level} onChange={setLevel} locked={!!c.activeId} patient={c.patientFirstName} /></div>
      </div>
      {c.attempts > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={vary}
              onChange={(e) => setVary(e.target.checked)}
            />
            Vary delivery
          </label>
          <Term term="variation" />
          <StartVisit
            body={{ caseId: c.id, mode: "practice", level, followUp: true }}
            label="Follow-up"
            variant="secondary"
            size="sm"
          />
        </div>
      ) : <p className="mt-4 flex min-h-9 items-center border-t border-slate-100 pt-3 text-xs text-slate-500">Private practice · Your notes and feedback are just for you.</p>}
    </Card>
  );
}

export default function PracticeLibrary({
  cases,
  professionNames,
  myProfession,
}: {
  cases: PracticeCase[];
  professionNames: Record<string, string>;
  myProfession: string | null;
}) {
  const profs = useMemo(
    () =>
      [...new Set(cases.flatMap((c) => c.professions))].sort((a, b) =>
        (professionNames[a] || a).localeCompare(professionNames[b] || b),
      ),
    [cases, professionNames],
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [prof, setProf] = useState(myProfession || "");
  const [specialty, setSpecialty] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState("");
  const inRole = cases.filter((c) => !prof || c.professions.includes(prof));
  const specialties = [
    ...new Set(inRole.map((c) => c.specialty).filter(Boolean)),
  ].sort();
  const shown = inRole.filter(
    (c) =>
      (!specialty || c.specialty === specialty) &&
      (!level || c.difficulty === Number(level)) &&
      (!status || (status === "new" ? c.attempts === 0 : c.attempts > 0)),
  );
  // The role list always offers the student's own role, even before a patient exists for it.
  const roleOptions =
    myProfession && !profs.includes(myProfession)
      ? [myProfession, ...profs]
      : profs;

  return (
    <div>
      <div
        className="mb-4 flex flex-wrap gap-2"
        aria-label="Visit history filters"
      >
        {[
          ["", "All patients"],
          ["new", "New to you"],
          ["done", "Practised"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={`rounded-full border px-4 py-2 text-sm ${status === value ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-4 flex justify-start"><Button variant="secondary" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-expanded={filtersOpen}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
        Filters{[prof,specialty,level,status].filter(Boolean).length > 0 && <span className="rounded-full bg-brand-50 px-1.5 text-xs text-brand-700">{[prof,specialty,level,status].filter(Boolean).length}</span>}
      </Button></div>
      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter patients">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="f-role">Role</Label>
            <Select
              id="f-role"
              value={prof}
              onChange={(e) => {
                setProf(e.target.value);
                setSpecialty("");
              }}
            >
              <option value="">All roles</option>
              {roleOptions.map((p) => (
                <option key={p} value={p}>
                  {professionNames[p] || p}
                  {p === myProfession ? " (your role)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="f-spec">Specialty</Label>
            <Select
              id="f-spec"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            >
              <option value="">All specialties</option>
              {specialties.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="f-level">Level the patient was written at</Label>
            <Select
              id="f-level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="">All levels</option>
              {[1, 2, 3, 4, 5].map((l) => (
                <option key={l} value={l}>
                  {l} {LEVEL_NAMES[l]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="f-status">Your history</Label>
            <Select
              id="f-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All patients</option>
              <option value="new">Not attempted yet</option>
              <option value="done">Attempted before</option>
            </Select>
          </div>
        </div>
        <div className="mt-6 flex justify-between gap-3"><Button variant="ghost" onClick={() => {setProf("");setSpecialty("");setLevel("");setStatus("");}}>Clear filters</Button><Button onClick={() => setFiltersOpen(false)}>Show {shown.length} patient{shown.length === 1 ? "" : "s"}</Button></div>
      </Dialog>
      <p className="mb-3 text-xs text-slate-500" role="status">
        {shown.length} patient{shown.length === 1 ? "" : "s"}
        {prof && prof !== myProfession && myProfession
          ? ". You are browsing another role; you will act in that role for the visit."
          : "."}
      </p>
      {shown.length === 0 ? (
        <Empty>
          {prof && inRole.length === 0
            ? `There are no published patients for ${professionNames[prof] || prof} yet. Choose "All roles" to practice with patients written for other roles.`
            : "No patients match those filters."}
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <CaseCard key={c.id} c={c} professionNames={professionNames} />
          ))}
        </div>
      )}
    </div>
  );
}
