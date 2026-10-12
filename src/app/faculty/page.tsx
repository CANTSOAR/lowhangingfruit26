import Link from "next/link";
import { PatientPortrait } from "@/components/learning/Patient";
import { listCases } from "@/lib/studio/store";
import AppShell from "@/components/AppShell";
import When from "@/components/courses/When";
import { Badge, Card, CardHeader, Empty, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { assignmentOverviews, coursesOf, feedbackUrl, liveVisitCount, RECORDED_VISIT, reviewQueue, toDate, TYPE_LABEL } from "@/lib/courses";

function Stat({ label, value, note, href }: { label: string; value: number; note: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </Link>
  );
}

const LINKS = [
  { href: "/faculty/cases", title: "Patient Studio", text: "Build, review and publish virtual patients." },
  { href: "/faculty/journeys", title: "Care Journeys", text: "One patient seen by several professions, with handoffs." },
  { href: "/faculty/courses", title: "Courses", text: "Rosters, assignments and gradebooks." },
  { href: "/faculty/live", title: "Live Visits", text: "Watch visits in progress, pause one and help." },
];

export default async function FacultyHome() {
  const user = await requireUser("faculty");
  const courses = coursesOf(user);
  const students = courses.length
    ? get<{ n: number }>(`SELECT COUNT(DISTINCT user_id) AS n FROM enrollments WHERE course_id IN (${courses.map(() => "?").join(",")})`, ...courses.map((c) => c.id))!.n
    : 0;
  const assignments = assignmentOverviews(user);
  const now = Date.now();
  const week = 7 * 24 * 3600 * 1000;
  // Due in the next two weeks, or recently due and still missing submissions.
  const due = assignments
    .filter((x) => x.a.due_at)
    .filter((x) => {
      const t = toDate(x.a.due_at!).getTime();
      return t > now - week && t < now + 2 * week;
    })
    .slice(0, 8);
  const held = assignments.filter((x) => !x.a.feedback_released && x.submitted > 0);
  const queue = reviewQueue(user, 8);
  const queueTotal = reviewQueue(user, 200).length;
  const live = liveVisitCount();
  const published = get<{ n: number }>("SELECT COUNT(*) AS n FROM cases WHERE status = 'published'")!.n;
  // Assignment and care-journey visits only: self-started practice is private to the student.
  const recent = all<{ id: string; student: string; title: string; score: number | null; faculty_score: number | null; ended_at: string | null }>(
    `SELECT e.id, u.name AS student, c.title, e.score, e.faculty_score, e.ended_at FROM encounters e JOIN users u ON u.id = e.user_id JOIN cases c ON c.id = e.case_id
     WHERE e.status = 'scored' AND u.role = 'student' AND ${RECORDED_VISIT} ORDER BY e.ended_at DESC LIMIT 6`,
  );


  const hasActivity = courses.length || assignments.length || queueTotal || live || recent.length;
  const patients = listCases(user).filter(c => c.status === "published").slice(0, 3);

  return (
    <AppShell user={user}>
      <PageHeader title={`Welcome, ${user.name}`} subtitle="Support your learners. Plan their next visit. Follow their progress." action={<LinkButton href="/faculty/courses">Manage courses</LinkButton>} />

      <section className="dashboard-banner mb-5 flex flex-wrap items-center justify-between gap-6 rounded-3xl p-6 text-white sm:p-8">
        <div className="max-w-xl"><p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Your teaching workspace</p><h2 className="mt-2 text-2xl font-semibold">{queueTotal ? `${queueTotal} visit${queueTotal === 1 ? " is" : "s are"} ready for your review` : courses.length ? "Set up the next learning moment" : "Your first class starts here"}</h2><p className="mt-2 text-sm leading-relaxed text-blue-100">{queueTotal ? "See where students need support, read the conversation, and leave feedback they can use in their next visit." : "Choose a patient, assign a visit, and turn each conversation into a chance to learn."}</p></div>
        <div className="flex flex-wrap gap-3"><Link href={queueTotal ? feedbackUrl(queue[0].id) : "/faculty/courses"} className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-emerald-200">{queueTotal ? "Review next visit →" : courses.length ? "Manage your classes →" : "Create your first course →"}</Link><Link href="/faculty/cases" className="rounded-full border border-blue-300/50 px-5 py-3 text-sm font-medium text-white hover:bg-white/10">Find a patient</Link></div>
      </section>
      {!!hasActivity && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Learners" value={students} note={`Across ${courses.length} course${courses.length === 1 ? "" : "s"}`} href="/faculty/courses" />
        <Stat label="Assignments" value={assignments.length} note={`${due.length} due around now`} href="/faculty/courses" />
        <Stat label="Visits needing review" value={queueTotal} note="Flagged by the rubric, not yet reviewed" href="#review" />
        <Stat label="Live visits now" value={live} note="With live assist turned on" href="/faculty/live" />
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
        <Card id="review" className="overflow-hidden border-amber-200">
          <CardHeader title="Submissions needing review" subtitle="Start here: flagged visits that need your feedback." />
          {queue.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No flagged visits are waiting for you.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {queue.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {r.student} <span className="font-normal text-slate-500">· {r.title}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {r.reasons.map((x) => (
                        <Badge key={x} tone={/safety/i.test(x) ? "red" : "amber"}>
                          {x}
                        </Badge>
                      ))}
                      <span>
                        {r.assignment || "Independent practice"} · <When at={r.ended_at} />
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {r.score !== null && <span className="text-sm font-medium tabular-nums text-slate-900">{Math.round(r.score)}%</span>}
                    <LinkButton href={feedbackUrl(r.id)} variant="secondary" size="sm">
                      Review
                    </LinkButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {queueTotal > queue.length && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{queueTotal - queue.length} more in your assignment gradebooks.</p>}
        </Card>

        <Card>
          <CardHeader title="Assignments due" subtitle="Due in the next two weeks or in the past week." />
          {due.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">{assignments.length ? "Nothing is due around now." : "You have not set any assignments yet. Open a course to create one."}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {due.map(({ a, course, roster, submitted, inProgress }) => {
                const past = toDate(a.due_at!).getTime() < now;
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <Link href={`/faculty/courses/${a.course_id}/assignments/${a.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700">
                        {a.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <Badge tone={a.type === "exam" ? "violet" : a.type === "practice" ? "slate" : "blue"}>{TYPE_LABEL[a.type]}</Badge>
                        <span>{course}</span>
                        <span>
                          · {past ? "Was due" : "Due"} <When at={a.due_at} />
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-slate-600">
                      <div className="text-sm font-medium text-slate-900">
                        {submitted} of {roster} submitted
                      </div>
                      {inProgress > 0 && <div>{inProgress} in progress</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {held.length > 0 && (
            <div className="border-t border-slate-100 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Feedback is being held for{" "}
              {held.map(({ a }, i) => (
                <span key={a.id}>
                  {i > 0 && ", "}
                  <Link href={`/faculty/courses/${a.course_id}/assignments/${a.id}`} className="font-medium underline">
                    {a.title}
                  </Link>
                </span>
              ))}
              . Students cannot see their results until you release it.
            </div>
          )}
        </Card>


        <Card>
          <CardHeader title="Your courses" action={<LinkButton href="/faculty/courses" variant="secondary" size="sm">All courses</LinkButton>} />
          {courses.length === 0 ? (
            <div className="p-4">
              <Empty>
                No courses yet. <Link href="/faculty/courses" className="font-medium text-brand-700 underline">Create your first course</Link> to get a join code for students.
              </Empty>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {courses.slice(0, 6).map((c) => {
                const n = assignments.filter((x) => x.a.course_id === c.id);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <Link href={`/faculty/courses/${c.id}`} className="min-w-0 truncate text-sm font-medium text-slate-900 hover:text-brand-700">
                      {c.name}
                    </Link>
                    <span className="shrink-0 text-xs text-slate-500">
                      {n[0]?.roster ?? get<{ n: number }>("SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ?", c.id)!.n} students · {n.length} assignment{n.length === 1 ? "" : "s"} · code <span className="font-mono text-slate-700">{c.join_code}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recently scored visits" subtitle="Across all students, newest first." />
          {recent.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No assignment or care journey visit has been scored yet. Students&apos; private practice visits are not listed here.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={feedbackUrl(r.id)} className="min-w-0 truncate text-sm text-slate-800 hover:text-brand-700">
                    <span className="font-medium">{r.student}</span> <span className="text-slate-500">· {r.title}</span>
                  </Link>
                  <span className="shrink-0 text-xs text-slate-500">
                    <span className="text-sm font-medium tabular-nums text-slate-900">{Math.round(r.faculty_score ?? r.score ?? 0)}%</span> · <When at={r.ended_at} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      </>}
      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">Plan your next session</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500">
            <div className="text-sm font-semibold text-brand-700">{l.title}</div>
            <div className="mt-1 text-xs text-slate-600">{l.text}</div>
            {l.href === "/faculty/cases" && <div className="mt-2 text-xs text-slate-500">{published} published patient{published === 1 ? "" : "s"}</div>}
            {l.href === "/faculty/live" && <div className="mt-2 text-xs text-slate-500">{live} in progress</div>}
          </Link>
        ))}
      </div>
      {patients.length > 0 && <section className="mt-6" aria-labelledby="faculty-patients">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 id="faculty-patients" className="text-base font-semibold text-slate-900">Meet your teaching patients</h2><Link href="/faculty/cases" className="text-sm font-medium text-brand-700">All {published} patients →</Link></div>
        <div className="grid gap-3 md:grid-cols-3">{patients.map(p => <Link key={p.id} href={`/faculty/cases/${p.id}`} className="patient-card flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><PatientPortrait src={p.portrait} name={p.patientName} className="h-16 w-16 shrink-0 rounded-full" initialsClassName="text-lg" /><div className="min-w-0"><h3 className="font-semibold text-slate-900">{p.patient}</h3><p className="mt-1 text-xs text-slate-500">{p.specialty}</p><span className="mt-2 inline-block text-xs font-medium text-brand-700">Explore patient →</span></div></Link>)}</div>
      </section>}
    </AppShell>
  );
}
