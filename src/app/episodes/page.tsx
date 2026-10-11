import Link from "next/link";
import { PatientPortrait, ScoreRing, ScoreGauge } from "@/components/learning/Patient";
import AppShell from "@/components/AppShell";
import When from "@/components/courses/When";
import VisitSearch from "@/components/episodes/VisitSearch";
import {
  Badge,
  Card,
  Empty,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { isFaculty, requireUser } from "@/lib/auth";
import { searchEpisodes } from "@/lib/episodes";

export default async function EpisodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const q = await searchParams;
  const view = q.view === "cards" ? "cards" : "table";
  const faculty = isFaculty(user);
  const episodes = searchEpisodes(user, {
    query: q.q,
    patient: q.patient,
    participant: q.participant,
    role: q.role,
    text: q.text,
    limit: 60,
  });
  return (
    <AppShell user={user}>
      <PageHeader
        action={
          <LinkButton href="/integrations" variant="secondary">
            Integrations
          </LinkButton>
        }
        title={faculty ? "Episodes" : "My visits"}
        subtitle={
          faculty
            ? "Every recorded visit (assignments and care journeys): search by patient, by who took part, by role, or by what was said. Students' private practice is not listed."
            : "Every visit you have taken part in, plus your teammates' visits with a patient your class shares."
        }
      />
      <Card className="mb-4 p-4">
        <VisitSearch key={`${view}:${q.q || q.patient || q.participant || q.role || q.text || ""}`} initialQuery={q.q || q.patient || q.participant || q.role || q.text || ""} view={view} />
      </Card>
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-slate-500">
          {episodes.length} visit{episodes.length === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <Link
            className={`rounded-full px-3 py-2 ${view === "cards" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
            href={{ pathname: "/episodes", query: { ...q, view: "cards" } }}
          >
            Cards
          </Link>
          <Link
            className={`rounded-full px-3 py-2 ${view === "table" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
            href={{ pathname: "/episodes", query: { ...q, view: "table" } }}
          >
            Table
          </Link>
        </div>
      </div>
      {episodes.length > 0 && view === "cards" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {episodes.map((e) => (
            <Card key={e.id} className="patient-card overflow-hidden">
              <PatientPortrait
                src={e.portrait}
                name={e.patient}
                className="h-44 w-full"
              />
              <div className="space-y-3 p-5">
                <div className="flex justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {e.patient}
                  </h2>
                  <Badge tone={e.status === "scored" ? "green" : "blue"}>
                    {e.feedbackHeld ? "Feedback held" : e.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  <When at={e.startedAt} /> · {e.role}
                </p>
                <p className="text-sm text-slate-600">
                  {e.participant} · {e.turns} turns
                  {e.visitNumber > 1 && ` · follow-up ${e.visitNumber}`}
                </p>
                {faculty && (
                  <p className="text-xs text-slate-500">{e.caseTitle}</p>
                )}
                {e.match && (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs text-slate-600">
                    {e.match}
                  </p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <ScoreRing
                    value={e.status === "scored" ? e.score : null}
                    label="Visit score"
                  />
                  <Link
                    href={
                      e.status === "active" && e.participantId === user.id
                        ? `/encounter/${e.id}`
                        : `/encounter/${e.id}/feedback`
                    }
                    className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    {e.status === "active" && e.participantId === user.id
                      ? "Continue"
                      : "Review"}{" "}
                    →
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {episodes.length === 0 ? (
        <Empty>No episodes match.</Empty>
      ) : view === "table" ? (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Patient</th>
                <th className="px-3 py-2 font-medium">Professional</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Turns</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {episodes.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 align-middle">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    <When at={e.startedAt} />
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={{ pathname: "/episodes", query: { patient: e.patient, view } }}
                      className="inline-flex items-center gap-3 font-medium text-slate-900 hover:underline"
                    >
                      <PatientPortrait src={e.portrait} name={e.patient} className="h-10 w-10 shrink-0 rounded-full ring-2 ring-brand-50" initialsClassName="text-base" />
                      <span>{e.patient}</span>
                    </Link>
                    {e.visitNumber > 1 && (
                      <Badge tone="blue" className="ml-1.5">
                        visit {e.visitNumber}
                      </Badge>
                    )}
                    {faculty && (
                      <div className="text-xs text-slate-500">
                        {e.caseTitle}
                      </div>
                    )}
                    {e.match && (
                      <div className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-slate-700">
                        {e.match}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={{ pathname: "/episodes", query: { participant: e.participant, view } }}
                      className="text-slate-800 hover:underline"
                    >
                      {e.participant}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{e.role}</td>
                  <td className="px-3 py-2">
                    <Badge tone={e.recorded ? "violet" : "slate"}>
                      {e.mode}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">
                    {e.turns}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-900">
                    {e.feedbackHeld ? (
                      "Feedback held"
                    ) : e.status === "scored" && e.score !== null ? (
                      <ScoreGauge value={e.score} />
                    ) : (
                      <span className="text-slate-500">
                        {e.status === "active" ? "in progress" : e.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={
                        e.status === "active" && e.participantId === user.id
                          ? `/encounter/${e.id}`
                          : `/encounter/${e.id}/feedback`
                      }
                      className="font-medium text-brand-600 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </AppShell>
  );
}
