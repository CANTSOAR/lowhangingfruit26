"use client";

import GeneratedText from "@/components/learning/GeneratedText";
import { PatientPortrait } from "@/components/learning/Patient";

import Dialog from "@/components/learning/Dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Empty, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import type { LibraryItem } from "@/lib/studio/store";
import { api, Notice, startTestVisit } from "./fields";

export function StatusBadges({ c }: { c: { status: string; origin: string; reviewed: boolean } }) {
  return (
    <>
      {c.status === "published" && <Badge tone="green">Published</Badge>}
      {c.status === "draft" && <Badge tone="slate">Draft</Badge>}
      {c.status === "archived" && <Badge tone="slate">Archived</Badge>}
      {c.origin === "ai_draft" && c.reviewed && <Badge tone="teal">Faculty-reviewed</Badge>}
      {c.origin === "sample" && <Badge tone="blue">Sample</Badge>}
    </>
  );
}

const when = (s: string) => {
  const d = new Date(s.replace(" ", "T") + "Z");
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function CaseLibrary({ initial, professions, courses }: { courses: {id: string; name: string}[]; initial: LibraryItem[]; professions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [assigning, setAssigning] = useState<LibraryItem | null>(null);
  const [cases, setCases] = useState(initial);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("active");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roleName = (id: string) => professions.find((p) => p.id === id)?.name || id;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases.filter((c) => {
      if (status === "active" ? c.status === "archived" : status && c.status !== status) return false;
      if (role && !c.professions.includes(role)) return false;
      if (origin === "mine" && !c.mine) return false;
      if (origin === "sample" && c.origin !== "sample") return false;
      if (origin === "ai_unreviewed" && !(c.origin === "ai_draft" && !c.reviewed)) return false;
      if (origin === "faculty" && c.origin !== "faculty") return false;
      if (needle && ![c.title, c.patient, c.specialty, c.summary, c.encounterType].join(" ").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [cases, q, role, status, origin]);

  async function act(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const refresh = async () => setCases((await api<{ cases: LibraryItem[] }>("/api/cases")).cases);
  const setStatusOf = (id: string, action: string) =>
    act(id, async () => {
      await api(`/api/cases/${id}/status`, { json: { action } });
      await refresh();
    });

  return (
    <>
      <PageHeader
        title="Patients"
        subtitle="Find the right conversation for your class. Assign a patient, explore their case, or try a visit."
        action={<LinkButton href="/faculty/cases/new">New patient</LinkButton>}
      />
      <div className="mb-5 flex flex-wrap gap-2" aria-label="Patient status shortcuts">
        {[["active", "All active", cases.filter(c => c.status !== "archived").length], ["published", "Published", cases.filter(c => c.status === "published").length], ["draft", "In preparation", cases.filter(c => c.status === "draft").length]].map(([value,label,count]) => <button key={value} onClick={() => setStatus(String(value))} aria-pressed={status === value} className={`rounded-full border px-4 py-2 text-sm font-medium ${status === value ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{label} <span className="ml-2 opacity-75">{count}</span></button>)}
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, patient name or specialty" aria-label="Search patients" />
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by learner role" className="sm:w-52">
          <option value="">All learner roles</option>
          {professions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="sm:w-44">
          <option value="active">Drafts and published</option>
          <option value="draft">Drafts</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </Select>
        <Select value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Filter by origin" className="sm:w-52">
          <option value="">Any origin</option>
          <option value="mine">Created by me</option>
          <option value="sample">Samples</option>
          <option value="faculty">Faculty-written</option>
          <option value="ai_unreviewed">Awaiting faculty review</option>
        </Select>
      </div>
      {error && (
        <Notice tone="red" className="mb-3">
          {error}
        </Notice>
      )}
      <p role="status" className="mb-3 text-xs text-slate-500">{shown.length} patient{shown.length === 1 ? "" : "s"} shown</p>
      <Dialog open={!!assigning} onClose={() => setAssigning(null)} title={`Assign ${assigning?.patientName || "patient"}`}>
        <p className="mb-4 text-sm text-slate-600">Choose a course. You can set the visit level, due date, and instructions before publishing the assignment.</p>
        {courses.length ? <div className="space-y-3">{courses.map(c => <Link key={c.id} href={`/faculty/courses/${c.id}/assignments/new?patient=${encodeURIComponent(assigning?.id || "")}`} className="flex items-center justify-between rounded-xl border border-slate-200 p-4 font-medium hover:border-brand-500 hover:bg-brand-50">{c.name}<span aria-hidden="true">→</span></Link>)}</div> : <div className="rounded-xl bg-brand-50 p-4"><p className="mb-3 text-sm text-slate-700">Create a course first to give your students a place to join.</p><LinkButton href="/faculty/courses">Create a course</LinkButton></div>}
      </Dialog>
      {!shown.length ? (
        <Empty>
          {cases.length ? "No patients match these filters." : "You have no patients yet."}{" "}
          <Link href="/faculty/cases/new" className="font-medium text-brand-700 underline">
            Create a patient
          </Link>
        </Empty>
      ) : (
        <ul className="space-y-3">
          {shown.map((c) => (
            <li key={c.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-200">
              <div className="flex items-start gap-3 sm:gap-4">
                <PatientPortrait src={c.portrait} name={c.patientName} className="h-14 w-14 shrink-0 rounded-full ring-2 ring-brand-50 sm:h-20 sm:w-20" initialsClassName="text-xl" />
                <div className="min-w-0 flex-1">
              <div className="flex flex-col items-start justify-between gap-3 md:flex-row">
                <div className="min-w-0 flex-1">
                  <Link href={`/faculty/cases/${c.id}`} className="text-lg font-semibold text-slate-900 hover:text-brand-700">
                    {c.patient || c.patientName}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><Badge tone="blue">{c.specialty || c.encounterType || "Practice visit"}</Badge><Badge tone="violet">Level {c.difficulty}</Badge><StatusBadges c={c} />{c.openHigh > 0 && <Badge tone="red">{c.openHigh} issue{c.openHigh === 1 ? "" : "s"} to resolve</Badge>}</div>
                  <p className="mt-2 text-sm font-medium text-slate-700">{c.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{c.professions.map(roleName).join(", ")}</p>
                  {c.summary && <p className="mt-1.5 line-clamp-2 max-w-4xl text-sm text-slate-600"><GeneratedText text={c.summary} /></p>}
                  <details className="mt-2 text-xs text-slate-500"><summary className="w-fit cursor-pointer font-medium text-brand-700">Case details</summary><p className="mt-2">
                    {c.counts.facts} facts, {c.counts.actions} exams and orders, {c.counts.artifacts} documents
                    {c.counts.variants ? `, ${c.counts.variants} approved variant${c.counts.variants === 1 ? "" : "s"}` : ""} · edited {when(c.updatedAt)}
                  </p></details>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {c.status === "published" && <Button size="sm" onClick={() => setAssigning(c)}>Assign</Button>}
                  <LinkButton href={`/faculty/cases/${c.id}`} size="sm" variant="secondary">
                    Open
                  </LinkButton>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy === c.id || c.status === "archived"}
                    title="Run the visit yourself, exactly as a student would"
                    onClick={() => act(c.id, async () => router.push(await startTestVisit(c.id)))}
                  >
                    Test visit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label={`Duplicate ${c.patientName}`}
                    data-tooltip="Duplicate patient"
                    disabled={busy === c.id}
                    onClick={() =>
                      act(c.id, async () => {
                        const { id } = await api<{ id: string }>(`/api/cases/${c.id}/duplicate`, { json: {} });
                        router.push(`/faculty/cases/${id}`);
                      })
                    }
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" /></svg>
                  </Button>
                  {c.canEdit &&
                    (c.status === "archived" ? (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Restore ${c.patientName}`} data-tooltip="Restore patient" disabled={busy === c.id} onClick={() => setStatusOf(c.id, "restore")}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9M8 6l4-4 4 4M12 2v12" /><path d="M3 8h5M16 8h5" /></svg>
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`Archive ${c.patientName}`}
                        data-tooltip="Archive patient"
                        disabled={busy === c.id}
                        onClick={() => {
                          if (c.status !== "published" || window.confirm("This patient is published. Archiving removes it from students' lists. Archive it?")) setStatusOf(c.id, "archive");
                        }}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="3" y="3" width="18" height="5" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M9 12h6" /></svg>
                      </Button>
                    ))}
                </div>
              </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
