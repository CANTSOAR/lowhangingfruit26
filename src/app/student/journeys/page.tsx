import { PatientPortrait } from "@/components/learning/Patient";
import ProfessionIcon from "@/components/learning/ProfessionIcon";
import AppShell from "@/components/AppShell";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { isFaculty, requireUser } from "@/lib/auth";
import { studentJourneyLabel } from "@/lib/courses/label";
import { all, parse } from "@/lib/db";
import type { JourneySpec } from "@/lib/journey/types";
import type { CaseProfile } from "@/lib/types";

export default async function StudentJourneys() {
  const user = await requireUser();
  const journeys = all<{
    id: string;
    title: string;
    spec: string;
    profile: string;
  }>(
    "SELECT j.id, j.title, j.spec, c.profile FROM journeys j JOIN cases c ON c.id = j.case_id WHERE j.status = 'published' ORDER BY j.created_at",
  );
  const runs = all<{
    id: string;
    journey_id: string;
    status: string;
    student_stage_id: string;
    created_at: string;
  }>(
    "SELECT id, journey_id, status, student_stage_id, created_at FROM journey_runs WHERE user_id = ? ORDER BY created_at DESC",
    user.id,
  );
  return (
    <AppShell user={user}>
      <PageHeader
        title="Care Journeys"
        subtitle="One patient, several professionals, one shared record. Take one role; the AI plays the patient and your colleagues. What each of you finds changes what the next one does."
      />
      {!journeys.length && (
        <Empty>No care journeys have been published yet.</Empty>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {journeys.map((j) => {
          const spec = parse<JourneySpec>(j.spec, { summary: "", stages: [] });
          const c = parse<CaseProfile>(j.profile, {} as CaseProfile);
          const mine = runs.filter((r) => r.journey_id === j.id);
          // The journey title and summary are written for faculty and name the diagnoses.
          const faculty = isFaculty(user);
          const neutral = studentJourneyLabel(
            c.patient?.name,
            spec.stages.map((s) => s.roleTitle),
          );
          return (
            <Card
              key={j.id}
              className="patient-card flex flex-col overflow-hidden p-5"
            >
              <div className="flex items-center gap-4">
                <PatientPortrait
                  src={c.patient?.portrait}
                  name={c.patient?.name || "Patient"}
                  className="h-24 w-24 shrink-0 rounded-full ring-4 ring-brand-50"
                />
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-brand-600">
                    Shared care · {spec.stages.length} roles
                  </p>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {faculty ? j.title : neutral.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {c.patient?.age !== undefined
                      ? `${c.patient.age} years old · `
                      : ""}
                    One patient, one shared record
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-slate-600">
                {faculty
                  ? spec.summary
                  : "Choose your role in the care team. Practise your visit, then see how each handoff shapes the next."}
              </p>
              <ol
                className="my-5 space-y-2"
                aria-label="Care team in visit order"
              >
                {[...spec.stages]
                  .sort((a, b) => a.order - b.order)
                  .map((stage, i) => (
                    <li
                      key={stage.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3"
                    >
                      <span className="w-4 text-center text-xs tabular-nums text-slate-400">
                        {i + 1}
                      </span>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-sm">
                        <ProfessionIcon area={stage.roleTitle} />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium text-slate-700">
                        {stage.roleTitle}
                      </span>
                      {i < spec.stages.length - 1 && (
                        <span aria-hidden="true" className="text-slate-400">
                          ↓
                        </span>
                      )}
                    </li>
                  ))}
              </ol>
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <LinkButton href={`/student/journeys/${j.id}`}>
                  Choose your role
                </LinkButton>
                {mine.slice(0, 3).map((r) => {
                  const st = spec.stages.find(
                    (s) => s.id === r.student_stage_id,
                  );
                  return (
                    <LinkButton
                      key={r.id}
                      href={`/journey/${r.id}`}
                      variant="secondary"
                      size="sm"
                    >
                      {r.status === "complete" ? "Review" : "Resume"} as{" "}
                      {st?.roleTitle.toLowerCase() || "your role"}{" "}
                      <Badge tone={r.status === "complete" ? "green" : "amber"}>
                        {r.status === "complete" ? "complete" : "in progress"}
                      </Badge>
                    </LinkButton>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
