import AppShell from "@/components/AppShell";
import MakePatient from "@/components/courses/MakePatient";
import PracticeLibrary, {
  type PracticeCase,
} from "@/components/courses/PracticeLibrary";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { all, parse } from "@/lib/db";
import { heldAssignmentIds, publishedCaseCards } from "@/lib/courses";
import { profession, professions } from "@/lib/professions";

export default async function PracticePage() {
  const user = await requireUser();
  const held = heldAssignmentIds();
  const mine = all<{
    id: string;
    case_id: string;
    status: string;
    config: string;
    score: number | null;
    faculty_score: number | null;
    assignment_id: string | null;
    journey_run_id: string | null;
  }>(
    "SELECT id, case_id, config, status, score, faculty_score, assignment_id, journey_run_id FROM encounters WHERE user_id = ? AND status != 'abandoned' ORDER BY started_at",
    user.id,
  );
  // Read only safe identity and gallery metadata for this student's private drafts.
  const own = all<{
    id: string;
    name: string | null;
    age: number | null;
    portrait: string | null;
    type: string | null;
    specialty: string;
    professions: string;
    difficulty: number;
  }>(
    `SELECT c.id, json_extract(c.profile, '$.patient.name') AS name, json_extract(c.profile, '$.patient.age') AS age,
      json_extract(c.profile, '$.patient.portrait') AS portrait, json_extract(c.profile, '$.encounterType') AS type,
      c.specialty, c.professions, c.difficulty
      FROM cases c WHERE c.owner_id = ? AND c.status = 'draft' AND c.origin = 'ai_draft' ORDER BY c.created_at DESC`,
    user.id,
  );
  const cards = [
    ...own.map((c) => ({
      id: c.id,
      label: (c.name || "Patient").split(" ")[0],
      patientFirstName: (c.name || "Patient").split(" ")[0],
      age: c.age,
      portrait: c.portrait || undefined,
      encounterType: c.type || "Practice visit",
      specialty: c.specialty,
      professions: parse<string[]>(c.professions, []),
      difficulty: c.difficulty,
      aiDraft: true,
    })),
    ...publishedCaseCards(),
  ];
  const cases: PracticeCase[] = cards.map((c) => {
    const encs = mine.filter((e) => e.case_id === c.id);
    const done = encs.filter(
      (e) => e.status === "scored" || e.status === "submitted",
    );
    const visible = done.filter(
      (e) => !e.assignment_id || !held.has(e.assignment_id),
    );
    const scores = visible
      .map((e) => e.faculty_score ?? e.score)
      .filter((x): x is number => x !== null);
    const active = [...encs].reverse().find(e => (e.status === "active" || e.status === "paused") && !e.assignment_id && !e.journey_run_id);
    const activeConfig = active ? parse<{knobs?: {level?:number}}>(active.config, {}) : null;
    return {
      ...c,
      activeLevel: activeConfig?.knobs?.level,
      attempts: done.length,
      best: scores.length ? Math.max(...scores) : null,
      lastId: visible.length ? visible[visible.length - 1].id : null,
      activeId:
        [...encs]
          .reverse()
          .find(
            (e) =>
              (e.status === "active" || e.status === "paused") &&
              !e.assignment_id &&
              !e.journey_run_id,
          )?.id || null,
    };
  });
  return (
    <AppShell user={user}>
      <PageHeader
        title="Practice"
        subtitle="Any published patient, as many times as you like. Practice visits are not graded, and each one updates your skill ratings."
      />
      {user.role === "student" && (
        <div className="mb-5">
          <MakePatient
            roleName={profession(user.profession_id).name}
            knownCaseIds={cases.map((c) => c.id)}
          />
        </div>
      )}
      <PracticeLibrary
        cases={cases}
        professionNames={Object.fromEntries(
          professions().map((p) => [p.id, p.name]),
        )}
        myProfession={user.role === "student" ? user.profession_id : null}
      />
    </AppShell>
  );
}
