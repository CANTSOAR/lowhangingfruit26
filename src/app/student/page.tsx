import GeneratedText from "@/components/learning/GeneratedText";
import Link from "next/link";
import {
  PatientPortrait,
  LevelPips,
  ScoreRing,
} from "@/components/learning/Patient";
import { ScoreSpark } from "@/components/courses/charts";
import AppShell from "@/components/AppShell";
import JoinCourseDialog from "@/components/courses/JoinCourseDialog";
import FocusArea from "@/components/learning/FocusArea";
import StartVisit from "@/components/courses/StartVisit";
import When from "@/components/courses/When";
import {
  Badge,
  Card,
  CardHeader,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { recommend } from "@/lib/adaptive";
import { requireUser } from "@/lib/auth";
import { all, get, parse } from "@/lib/db";
import { decodeEntities } from "@/lib/courses/save";
import {
  describeSettings,
  feedbackUrl,
  heldAssignmentIds,
  publishedCaseCards,
  studentAssignments,
  studentCaseLabels,
  toDate,
  TYPE_LABEL,
  visitUrl,
} from "@/lib/courses";
import { profession } from "@/lib/professions";
import type { EncounterConfig, EncounterState } from "@/lib/types";

const MODE_LABEL: Record<string, string> = {
  practice: "Practice",
  adaptive: "Adaptive",
  homework: "Homework",
  exam: "Exam",
  journey: "Care journey",
};

export default async function StudentHome({ searchParams }: { searchParams: Promise<{ joined?: string | string[] }> }) {
  const user = await requireUser();
  const joinedId = (await searchParams).joined;
  // Only trusted when the viewer really is enrolled, so the banner cannot be made to name a course.
  const joined = typeof joinedId === "string" ? get<{ name: string }>("SELECT co.name FROM courses co JOIN enrollments en ON en.course_id = co.id WHERE co.id = ? AND en.user_id = ?", joinedId, user.id) : undefined;
  const role = profession(user.profession_id);
  const rec = recommend(user.id, role.id);
  const library = publishedCaseCards();
  const recCard = library.find((c) => c.id === rec.caseId);
  const otherPatients = library.filter((c) => c.id !== rec.caseId).sort((a, b) => Number(b.professions.includes(role.id)) - Number(a.professions.includes(role.id)) || a.patientFirstName.localeCompare(b.patientFirstName)).slice(0, 4);
  const assignments = studentAssignments(user.id);
  const courses = all<{ id: string; name: string }>(
    "SELECT co.id, co.name FROM courses co JOIN enrollments en ON en.course_id = co.id WHERE en.user_id = ? ORDER BY co.name",
    user.id,
  );
  const held = heldAssignmentIds();
  const now = new Date().getTime();

  const active = all<{
    id: string;
    case_id: string;
    config: string;
    state: string;
    status: string;
    started_at: string;
    portrait: string | null;
    assignment: string | null;
    journey_run_id: string | null;
  }>(
    `SELECT json_extract(c.profile, '$.patient.portrait') AS portrait, e.id, e.case_id, e.config, e.state, e.status, e.started_at, a.title AS assignment, e.journey_run_id
     FROM encounters e JOIN cases c ON c.id = e.case_id LEFT JOIN assignments a ON a.id = e.assignment_id
     WHERE e.user_id = ? AND e.status IN ('active','paused') AND e.started_at > datetime('now','-14 days') ORDER BY e.started_at DESC LIMIT 6`,
    user.id,
  );
  const recent = all<{
    id: string;
    case_id: string;
    config: string;
    score: number | null;
    faculty_score: number | null;
    ended_at: string | null;
    attempt: number;
    assignment_id: string | null;
    assignment: string | null;
    faculty_note: string | null;
    portrait: string | null;
  }>(
    `SELECT json_extract(c.profile, '$.patient.portrait') AS portrait, e.id, e.case_id, e.config, e.score, e.faculty_score, e.ended_at, e.attempt, e.assignment_id, a.title AS assignment, e.faculty_note
     FROM encounters e JOIN cases c ON c.id = e.case_id LEFT JOIN assignments a ON a.id = e.assignment_id
     WHERE e.user_id = ? AND e.status = 'scored' ORDER BY e.ended_at DESC LIMIT 6`,
    user.id,
  );
  // Case titles are faculty-facing and name the diagnosis; students get a neutral label.
  const labels = studentCaseLabels(
    [...active, ...recent].map((e) => e.case_id),
  );
  const open = assignments.filter((x) => x.status !== "submitted");
  const doneAssignments = assignments.filter((x) => x.status === "submitted");

  return (
    <AppShell user={user}>
      {joined && (
        <div role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold">You joined {decodeEntities(joined.name)}</div>
          <div className="mt-0.5 text-emerald-800">
            {open.length ? `${open.length} assignment${open.length === 1 ? " is" : "s are"} waiting for you.` : "Your instructor has not set any assignments yet."}
            {open.length > 0 && (
              <a href="#assignments" className="ml-1.5 inline-block py-1 font-medium underline">
                Go to assignments
              </a>
            )}
          </div>
        </div>
      )}
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle={`You are practicing as ${role.name}.`}
        action={
          <LinkButton href="/student/practice" variant="secondary">
            Browse all patients
          </LinkButton>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-5">
          {/* ---------- Adaptive session ---------- */}
          <Card className="overflow-hidden border-brand-100">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(150px,2fr)_minmax(0,3fr)]">
              <PatientPortrait
                src={recCard?.portrait}
                name={recCard?.patientFirstName || "Your next patient"}
                className="h-56 sm:h-96"
              />
              <div className="space-y-4 p-6">
                <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">
                  Your next step
                </span>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  Ready for your next patient?
                </h2>
                {recCard ? (
                  <>
                    <p className="text-lg font-medium text-slate-700">
                      {recCard.patientFirstName}
                      {recCard.age !== null && `, ${recCard.age}`}
                    </p>
                    <p className="text-sm text-slate-500">
                      {recCard.encounterType} · {role.name}
                    </p>
                    <LevelPips level={rec.level} />
                    <div>
                      <StartVisit
                        size="lg"
                        label="Meet your patient →"
                        body={{
                          caseId: rec.caseId,
                          mode: "adaptive",
                          level: rec.level,
                          knobs: rec.knobs,
                          perturb: true,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-600">
                    No patients have been published for {role.name} yet. Explore
                    another role in Practice.
                  </p>
                )}
                {rec.profile.weakest && (
                  <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
                    Next focus:{" "}
                    <strong><FocusArea area={rec.profile.weakest} /></strong>
                  </p>
                )}

              </div>
            </div>
          </Card>

          {otherPatients.length > 0 && <section aria-labelledby="more-patients">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h2 id="more-patients" className="text-base font-semibold text-slate-900">More patients to meet</h2><p className="mt-1 text-xs text-slate-500">A different conversation. Another chance to practice.</p></div>
              <Link href="/student/practice" className="shrink-0 text-sm font-medium text-brand-700 hover:underline">View all →</Link>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {otherPatients.map(c => <Card key={c.id} className="patient-card flex items-center gap-4 p-4">
                <PatientPortrait src={c.portrait} name={c.patientFirstName} className="h-20 w-20 shrink-0 rounded-2xl" initialsClassName="text-xl" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900">{c.patientFirstName}{c.age !== null && `, ${c.age}`}</h3>
                  <p className="mb-2 mt-1 text-xs text-slate-500">{c.encounterType || "Practice visit"}</p>
                  {!c.professions.includes(role.id) && <p className="mb-2 text-xs text-slate-500">Practice as {profession(c.professions[0]).name}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">Level {c.difficulty}</span><StartVisit body={{caseId:c.id, mode:"practice", level:c.difficulty}} label={`Meet ${c.patientFirstName}`} size="sm" variant="secondary" /></div>
                </div>
              </Card>)}
            </div>
          </section>}

          {/* ---------- Assignments ---------- */}
          <Card id="assignments" className={`scroll-mt-4 ${open.length ? "max-lg:order-first" : ""}`}>
            <CardHeader
              title="Assignments"
              subtitle={
                assignments.length
                  ? `${open.length} to do, ${doneAssignments.length} submitted`
                  : undefined
              }
            />
            {assignments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                {courses.length
                  ? "Your instructor has not set any assignments yet."
                  : "Join a course with the code from your instructor to see your assignments here."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {[...open, ...doneAssignments].map(
                  ({
                    a,
                    course,
                    cases,
                    status,
                    feedbackVisible,
                    journeyTitle,
                  }) => {
                    const pastDue =
                      a.due_at &&
                      toDate(a.due_at).getTime() < now &&
                      status !== "submitted";
                    const max = a.settings.maxAttempts;
                    return (
                      <li key={a.id} className="px-4 py-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900">
                              {a.title}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                              <Badge
                                tone={
                                  a.type === "exam"
                                    ? "violet"
                                    : a.type === "practice"
                                      ? "slate"
                                      : "blue"
                                }
                              >
                                {TYPE_LABEL[a.type]}
                              </Badge>
                              <span>{course}</span>
                              {a.due_at && (
                                <span>
                                  · Due <When at={a.due_at} />
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {pastDue && <Badge tone="red">Past due</Badge>}
                            <Badge
                              tone={
                                status === "submitted"
                                  ? "green"
                                  : status === "in_progress"
                                    ? "amber"
                                    : "slate"
                              }
                            >
                              {status === "submitted"
                                ? "Submitted"
                                : status === "in_progress"
                                  ? "In progress"
                                  : "Not started"}
                            </Badge>
                          </div>
                        </div>
                        {a.instructions && (
                          <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                            <GeneratedText text={a.instructions} />
                          </p>
                        )}
                        <p className="mt-1.5 text-xs text-slate-500">
                          {describeSettings(a.settings)}
                          {a.settings.liveAssist &&
                            ". Your instructor can watch these visits live and may pause to help"}
                          {!feedbackVisible &&
                            ". Feedback is released by your instructor"}
                        </p>
                        {a.journey_id ? (
                          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                            <div className="text-sm text-slate-800">
                              <span className="text-slate-500">
                                Care journey:{" "}
                              </span>
                              {journeyTitle}
                            </div>
                            <LinkButton
                              href={`/student/journeys/${a.journey_id}?assignment=${a.id}`}
                              size="sm"
                            >
                              {status === "not_started"
                                ? "Open journey"
                                : "Continue journey"}
                            </LinkButton>
                          </div>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {cases.map((c) => {
                              const left = max
                                ? Math.max(0, max - c.attemptsUsed)
                                : null;
                              return (
                                <li
                                  key={c.card.id}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm text-slate-900">
                                      <span className="font-medium">
                                        {c.card.label}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 text-xs text-slate-500">
                                      {max
                                        ? `${c.attemptsUsed} of ${max} attempt${max === 1 ? "" : "s"} used`
                                        : `${c.attemptsUsed} attempt${c.attemptsUsed === 1 ? "" : "s"} so far`}
                                      {c.best !== null && (
                                        <>
                                          {" "}
                                          · best{" "}
                                          <span className="font-semibold text-slate-800">
                                            {Math.round(c.best)}%
                                          </span>
                                        </>
                                      )}
                                      {c.scoredCount > 0 &&
                                        !feedbackVisible &&
                                        " · submitted, feedback not released yet"}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {c.lastId && feedbackVisible && (
                                      <LinkButton
                                        href={feedbackUrl(c.lastId)}
                                        variant="ghost"
                                        size="sm"
                                      >
                                        Feedback
                                      </LinkButton>
                                    )}
                                    {c.activeId ? (
                                      <LinkButton
                                        href={visitUrl(c.activeId)}
                                        size="sm"
                                      >
                                        Resume visit
                                      </LinkButton>
                                    ) : left === 0 ? (
                                      <span className="text-xs text-slate-500">
                                        No attempts left
                                      </span>
                                    ) : (
                                      <StartVisit
                                        size="sm"
                                        variant={
                                          c.scoredCount
                                            ? "secondary"
                                            : "primary"
                                        }
                                        label={
                                          c.scoredCount
                                            ? "Try again"
                                            : "Start visit"
                                        }
                                        body={{
                                          caseId: c.card.id,
                                          assignmentId: a.id,
                                        }}
                                      />
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                            {cases.length === 0 && (
                              <li className="text-xs text-slate-500">
                                The patients for this assignment are not
                                available right now.
                              </li>
                            )}
                          </ul>
                        )}
                      </li>
                    );
                  },
                )}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {active.length > 0 && (
            <Card>
              <CardHeader
                title="Visits in progress"
                subtitle="Pick up where you left off."
              />
              <ul className="divide-y divide-slate-100">
                {active.map((e) => {
                  const cfg = parse<Partial<EncounterConfig>>(e.config, {});
                  const st = parse<Partial<EncounterState>>(e.state, {});
                  return (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <PatientPortrait src={e.portrait} name={(labels.get(e.case_id) || "Patient").split(",")[0]} className="h-11 w-11 shrink-0 rounded-full" initialsClassName="text-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {cfg.journey?.roleTitle
                            ? `${(labels.get(e.case_id) || "Visit").split(" · ")[0]} · ${cfg.journey.roleTitle}`
                            : labels.get(e.case_id) || "Visit"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {(e.assignment && decodeEntities(e.assignment)) ||
                            MODE_LABEL[cfg.mode || "practice"]}{" "}
                          · turn {st.turn ?? 0} · started{" "}
                          <When at={e.started_at} />
                          {e.status === "paused" &&
                            " · paused by your instructor"}
                        </div>
                      </div>
                      <LinkButton
                        href={visitUrl(e.id)}
                        size="sm"
                        variant="secondary"
                      >
                        Resume
                      </LinkButton>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Recent results"
              action={
                <LinkButton href="/student/progress" variant="ghost" size="sm">
                  Progress
                </LinkButton>
              }
            />
            {recent.filter(
              (e) => !e.assignment_id || !held.has(e.assignment_id),
            ).length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <ScoreRing
                  value={Math.max(
                    ...recent
                      .filter(
                        (e) => !e.assignment_id || !held.has(e.assignment_id),
                      )
                      .map((e) => e.faculty_score ?? e.score ?? 0),
                  )}
                  label="Best recent"
                />
                <ScoreSpark
                  scores={recent
                    .filter(
                      (e) => !e.assignment_id || !held.has(e.assignment_id),
                    )
                    .reverse()
                    .map((e) => e.faculty_score ?? e.score ?? 0)}
                  labels={recent
                    .filter(
                      (e) => !e.assignment_id || !held.has(e.assignment_id),
                    )
                    .reverse()
                    .map(
                      (e) =>
                        `Visit score ${Math.round(e.faculty_score ?? e.score ?? 0)}%`,
                    )}
                />
              </div>
            )}
            {recent.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                Finish a visit to see your score and feedback here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((e) => {
                  const cfg = parse<Partial<EncounterConfig>>(e.config, {});
                  const hidden = !!e.assignment_id && held.has(e.assignment_id);
                  const body = (
                    <>
                      <PatientPortrait src={e.portrait} name={(labels.get(e.case_id) || "Patient").split(",")[0]} className="h-11 w-11 shrink-0 rounded-full" initialsClassName="text-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {cfg.journey?.roleTitle
                            ? `${(labels.get(e.case_id) || "Visit").split(" · ")[0]} · ${cfg.journey.roleTitle}`
                            : labels.get(e.case_id) || "Visit"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {(e.assignment && decodeEntities(e.assignment)) ||
                            MODE_LABEL[cfg.mode || "practice"]}{" "}
                          · attempt {e.attempt} · level{" "}
                          {cfg.knobs?.level ?? "?"} · <When at={e.ended_at} />
                          {!hidden && e.faculty_note && " · instructor note"}
                        </div>
                      </div>
                      {hidden ? (
                        <span className="shrink-0 text-xs text-slate-500">
                          Feedback held
                        </span>
                      ) : (
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                          {Math.round(e.faculty_score ?? e.score ?? 0)}%
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li key={e.id}>
                      {hidden ? (
                        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                          {body}
                        </div>
                      ) : (
                        <Link
                          href={feedbackUrl(e.id)}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                        >
                          {body}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Your courses" action={<JoinCourseDialog />} />
            <div className="p-4">
              {!courses.length && <p className="text-sm text-slate-500">Your courses will appear here once you join.</p>}
              {courses.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-slate-800">
                  {courses.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                      {c.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
