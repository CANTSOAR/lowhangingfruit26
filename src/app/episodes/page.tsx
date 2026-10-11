import Link from "next/link";
import { PatientPortrait, ScoreRing } from "@/components/learning/Patient";
import AppShell from "@/components/AppShell";
import When from "@/components/courses/When";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
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
        <form role="search" className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-64">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <Input
              aria-label="Search visits"
              name="q"
              maxLength={250}
              defaultValue={
                q.q || q.patient || q.participant || q.role || q.text
              }
              placeholder="Search patients, teammates, roles or anything said in a visit…"
              className="pl-12"
            />
          </div>
          {q.view === "table" && (
            <input type="hidden" name="view" value="table" />
          )}
          <Button type="submit">Search</Button>
          <Link
            href={q.view === "table" ? "/episodes?view=table" : "/episodes"}
            className="text-sm text-slate-500 hover:underline"
          >
            Clear
          </Link>
        </form>
      </Card>
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-slate-500">
          {episodes.length} visit{episodes.length === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <Link
            className={`rounded-full px-3 py-2 ${q.view !== "table" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
            href={{ pathname: "/episodes", query: { ...q, view: "cards" } }}
          >
            Cards
          </Link>
          <Link
            className={`rounded-full px-3 py-2 ${q.view === "table" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
            href={{ pathname: "/episodes", query: { ...q, view: "table" } }}
          >
            Table
          </Link>
        </div>
      </div>
      {episodes.length > 0 && q.view !== "table" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {episodes.map((e) => (
            <Card key={e.id} className="patient-card overflow-hidden">
              <PatientPortrait
                src={e.portrait}
                name={e.patient}
                className="h-36 w-full"
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
      ) : q.view === "table" ? (
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
                <tr key={e.id} className="border-b border-slate-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    <When at={e.startedAt} />
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/episodes?patient=${encodeURIComponent(e.patient)}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {e.patient}
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
                      href={`/episodes?participant=${encodeURIComponent(e.participant)}`}
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
                      `${Math.round(e.score)}%`
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
