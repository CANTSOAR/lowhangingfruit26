import { z } from "zod";
import { createHash } from "node:crypto";
import { isFaculty } from "@/lib/auth";
import { db, get, run } from "@/lib/db";
import {
  getEpisode,
  getPatientRecord,
  listPatients,
  searchEpisodes,
} from "@/lib/episodes";
import { professions } from "@/lib/professions";
import {
  blankProfile,
  sanitizeProfile,
} from "@/lib/studio/profile";
import {
  canEdit,
  getCase,
  insertCase,
  metaOf,
  profileOf,
  saveCase,
} from "@/lib/studio/store";
import type { User } from "@/lib/types";

export const READ = "poscere:read";
export const PATIENT_WRITE = "patients:write";
export const FEEDBACK_WRITE = "feedback:write";
export interface Principal {
  user: User;
  scopes: string[];
}
const id = z.string().min(1).max(150);
const empty = z.object({}).strict();
const query = z
  .object({
    patient: z.string().max(250).optional(),
    participant: z.string().max(250).optional(),
    role: z.string().max(100).optional(),
    text: z.string().max(250).optional(),
    case_id: id.optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
const tools = [
  {
    name: "get_profile",
    title: "Connected Poscere account",
    description:
      "Read the authenticated account and granted permissions. Roles come from the server, never a tool argument.",
    schema: empty,
    scope: READ,
  },
  {
    name: "search_episodes",
    title: "Search visits",
    description:
      "Search simulation visits visible to this account. Private practice stays with its learner; held scores stay hidden.",
    schema: query,
    scope: READ,
  },
  {
    name: "get_episode",
    title: "Read visit and feedback",
    description:
      "Read a visible visit transcript, disclosed chart, write-up, released rubric feedback and faculty review.",
    schema: z.object({ episode_id: id }).strict(),
    scope: READ,
  },
  {
    name: "list_patients",
    title: "List patients",
    description:
      "List available virtual patients. Student results omit diagnoses and hidden case details.",
    schema: z.object({ name: z.string().max(150).optional() }).strict(),
    scope: READ,
  },
  {
    name: "get_patient_record",
    title: "Read patient profile",
    description:
      "Faculty receive the full editable case and revision; students receive only the pre-visit chart. Use the returned revision when updating.",
    schema: z.object({ case_id: id }).strict(),
    scope: READ,
  },
  {
    name: "get_analytics",
    title: "Learning analytics",
    description:
      "Summarize up to the latest 100 visible visits, released scores and rubric domains. Returns sample size and date range; held feedback is excluded. Students receive their own analytics only.",
    schema: z
      .object({
        case_id: id.optional(),
        participant_id: id.optional(),
        limit: z.number().int().min(1).max(100).default(100),
      })
      .strict(),
    scope: READ,
  },
  {
    name: "create_patient",
    title: "Create draft patient",
    description:
      "Faculty only. Create a private draft patient without a model call. Supply a profession and optional complete CaseProfile. This does not publish or attest faculty review.",
    schema: z
      .object({
        profession_id: id,
        title: z.string().min(1).max(250),
        profile: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
    scope: PATIENT_WRITE,
  },
  {
    name: "update_patient",
    title: "Edit draft patient",
    description:
      "Faculty only. Merge top-level CaseProfile fields into an editable draft; nested objects and arrays replace that field. Requires the latest revision from get_patient_record. Published patients must be edited in Patient Studio or duplicated first. Does not publish or mark reviewed.",
    schema: z
      .object({
        case_id: id,
        expected_revision: z.string().min(1),
        changes: z.record(z.string(), z.unknown()),
      })
      .strict(),
    scope: PATIENT_WRITE,
  },
  {
    name: "delete_patient",
    title: "Archive patient",
    description:
      "Faculty only. Reversibly archive an editable patient and remove it from active libraries. Existing visit history remains. Requires its latest revision; restore_patient can undo the archive.",
    schema: z
      .object({ case_id: id, expected_revision: z.string().min(1) })
      .strict(),
    scope: PATIENT_WRITE,
    destructive: true,
  },
  {
    name: "restore_patient",
    title: "Restore archived patient",
    description:
      "Faculty only. Restore an editable archived patient as a draft. Does not publish it.",
    schema: z
      .object({ case_id: id, expected_revision: z.string().min(1) })
      .strict(),
    scope: PATIENT_WRITE,
  },
  {
    name: "add_faculty_feedback",
    title: "Leave faculty feedback",
    description:
      "Faculty only. Add or replace an instructor note on a submitted visit in your own course, a shared care journey, or your own test visit. Preserves model scores and any existing score adjustment. Does not release held feedback.",
    schema: z
      .object({ episode_id: id, note: z.string().trim().min(1).max(4000) })
      .strict(),
    scope: FEEDBACK_WRITE,
  },
];

export function toolsFor(p: Principal) {
  return tools
    .filter(
      (t) =>
        p.scopes.includes(t.scope) && (t.scope === READ || isFaculty(p.user)),
    )
    .map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: z.toJSONSchema(t.schema),
      annotations: {
        readOnlyHint: t.scope === READ,
        destructiveHint: !!("destructive" in t && t.destructive),
        idempotentHint: t.name !== "create_patient",
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: [t.scope] }],
    }));
}
function editable(user: User, caseId: string) {
  if (!isFaculty(user)) throw new Error("Faculty access required");
  const row = getCase(caseId);
  if (!row || !canEdit(user, row))
    throw new Error("Patient not found or not editable by this account");
  return row;
}
function revision(caseId: string) {
  const r = getCase(caseId)!;
  return `${r.status}:${createHash("sha256")
    .update(JSON.stringify(profileOf(r)))
    .digest("hex")}`;
}
function patientResult(user: User, caseId: string) {
  const row = getCase(caseId)!;
  return {
    caseId,
    meta: metaOf(row, user),
    record: profileOf(row),
    revision: revision(caseId),
  };
}

export function callTool(p: Principal, name: string, args: unknown): unknown {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error("Unknown tool");
  if (!p.scopes.includes(tool.scope))
    throw new Error(`Missing permission: ${tool.scope}`);
  if (tool.scope !== READ && !isFaculty(p.user))
    throw new Error("Faculty access required");
  // Validation is independent of the model and schema advertisement.
  const a = tool.schema.parse(args) as Record<string, unknown>;
  const user = p.user;
  switch (name) {
    case "get_profile":
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        professionId: user.profession_id,
        scopes: p.scopes,
      };
    case "search_episodes":
      return searchEpisodes(user, {
        patient: a.patient as string,
        participant: a.participant as string,
        role: a.role as string,
        text: a.text as string,
        caseId: a.case_id as string,
        limit: a.limit as number,
      });
    case "get_episode": {
      const result = getEpisode(user, a.episode_id as string);
      if (!result) throw new Error("Visit not found or not visible");
      const row = get<{
        faculty_note: string | null;
        faculty_score: number | null;
        feedback_released: number | null;
      }>(
        "SELECT e.faculty_note,e.faculty_score,a.feedback_released FROM encounters e LEFT JOIN assignments a ON a.id=e.assignment_id WHERE e.id=?",
        result.id,
      )!;
      return {
        ...result,
        facultyReview:
          isFaculty(user) || row.feedback_released !== 0
            ? { note: row.faculty_note, adjustedScore: row.faculty_score }
            : null,
      };
    }
    case "list_patients":
      return listPatients(user, a.name as string);
    case "get_patient_record": {
      const caseId = a.case_id as string;
      const result = getPatientRecord(user, caseId);
      if (!result) throw new Error("Patient not found or not visible");
      return isFaculty(user) ? patientResult(user, caseId) : result;
    }
    case "get_analytics": {
      if (!isFaculty(user) && a.participant_id && a.participant_id !== user.id)
        throw new Error("Students may only view their own analytics");
      const visits = searchEpisodes(user, {
        caseId: a.case_id as string,
        participantId: isFaculty(user) ? (a.participant_id as string) : user.id,
        limit: a.limit as number,
      });
      const scored = visits.filter(
        (v) => v.status === "scored" && v.score !== null && !v.feedbackHeld,
      );
      const domains = new Map<string, { count: number; total: number }>();
      for (const v of scored) {
        const f = getEpisode(user, v.id)?.feedback;
        for (const d of f?.domains || []) {
          if (d.score === null || d.max <= 0) continue;
          const item = domains.get(d.name) || { count: 0, total: 0 };
          item.count++;
          item.total += (100 * d.score) / d.max;
          domains.set(d.name, item);
        }
      }
      return {
        scope: isFaculty(user) ? "Visible visits" : "Your visits",
        sampleLimit: a.limit,
        sampledVisits: visits.length,
        possiblyTruncated: visits.length === a.limit,
        scoredVisits: scored.length,
        heldFeedbackExcluded: visits.filter((v) => v.feedbackHeld).length,
        meanScore: scored.length
          ? Math.round(
              (scored.reduce((n, v) => n + v.score!, 0) / scored.length) * 10,
            ) / 10
          : null,
        dateRange: {
          newest: visits[0]?.startedAt || null,
          oldest: visits.at(-1)?.startedAt || null,
        },
        domains: [...domains].map(([name, d]) => ({
          name,
          visits: d.count,
          meanPercent: Math.round((d.total / d.count) * 10) / 10,
        })),
        visits: visits.map((v) => ({
          id: v.id,
          patient: v.patient,
          status: v.status,
          score: v.score,
          feedbackHeld: v.feedbackHeld,
        })),
      };
    }
    case "create_patient": {
      if (!professions().some((r) => r.id === a.profession_id))
        throw new Error("Unknown profession_id");
      const raw = a.profile
        ? {
            ...blankProfile(a.profession_id as string),
            ...(a.profile as object),
            title: a.title,
            professions: [a.profession_id as string],
          }
        : { ...blankProfile(a.profession_id as string), title: a.title };
      const profile = sanitizeProfile(raw);
      const caseId = insertCase({
        ownerId: user.id,
        origin: "ai_draft",
        profile,
        reviewed: false,
      });
      return patientResult(user, caseId);
    }
    case "update_patient":
    case "delete_patient":
    case "restore_patient":
      return db().transaction(() => {
        const caseId = a.case_id as string,
          row = editable(user, caseId);
        if (revision(caseId) !== a.expected_revision)
          throw new Error(
            "This patient changed. Read the latest profile before editing.",
          );
        if (name === "update_patient") {
          if (row.status !== "draft")
            throw new Error(
              "Only draft profiles can be edited through MCP. Use Patient Studio to prepare an editable draft.",
            );
          const changes = a.changes as Record<string, unknown>;
          const current = profileOf(row);
          if (
            Object.keys(changes).some(
              (k) =>
                !(k in current) ||
                ["id", "origin", "reviewed", "status", "owner_id"].includes(k),
            )
          )
            throw new Error("Unknown or protected profile field");
          const profile = sanitizeProfile({ ...current, ...changes });
          if (!profile.facts.length)
            throw new Error("A patient needs at least one fact");
          saveCase(caseId, profile, null);
          run("UPDATE cases SET reviewed=0 WHERE id=?", caseId);
        } else {
          if (name === "restore_patient" && row.status !== "archived")
            throw new Error("Only archived patients can be restored");
          run(
            "UPDATE cases SET status=?,updated_at=datetime('now') WHERE id=?",
            name === "delete_patient" ? "archived" : "draft",
            caseId,
          );
        }
        return patientResult(user, caseId);
      })();
    case "add_faculty_feedback": {
      const row = get<{
        user_id: string;
        assignment_id: string | null;
        journey_run_id: string | null;
        status: string;
        faculty_id: string | null;
      }>(
        "SELECT e.user_id,e.assignment_id,e.journey_run_id,e.status,co.faculty_id FROM encounters e LEFT JOIN assignments a ON a.id=e.assignment_id LEFT JOIN courses co ON co.id=a.course_id WHERE e.id=?",
        a.episode_id,
      );
      if (!row || !["submitted", "scored"].includes(row.status))
        throw new Error("Submitted visit not found");
      if (
        user.role !== "admin" &&
        (row.assignment_id
          ? row.faculty_id !== user.id
          : !row.journey_run_id && row.user_id !== user.id)
      )
        throw new Error("This visit is not available for your review");
      run(
        "UPDATE encounters SET faculty_note=? WHERE id=?",
        a.note,
        a.episode_id,
      );
      return { episodeId: a.episode_id, note: a.note };
    }
  }
}
