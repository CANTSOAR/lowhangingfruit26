import { validHighlights } from "../feedback-text";
import { recordSkill } from "../adaptive";
import { all, parse, run } from "../db";
import { chatJSON, chatText, MODELS } from "../llm";
import { profession } from "../professions";
import { getRubric } from "../rubrics";
import type { DomainScore, EncounterConfig, Fact, Feedback, Rubric } from "../types";
import { loadEncounter, messagesOf, type MessageRow } from "./encounter";
import { caseFacts } from "./gatekeeper";
import { startVisible } from "./startVisible";

const str = { type: "string" };
const highlightSchema = { type: "array", maxItems: 5, description: "Exact short phrases from this text without ** markers. Positive means demonstrated strength, negative means a gap, and partial means incomplete success.", items: { type: "object", required: ["text", "tone"], properties: { text: str, tone: { type: "string", enum: ["positive", "negative", "partial"] } } } };
const noted = { type: "array", items: { type: "object", required: ["text"], properties: { text: str, turn: { type: "integer" }, highlights: highlightSchema } } };

function schema(rubric: Rubric) {
  const isCheck = rubric.type === "checklist";
  return {
    type: "object",
    required: ["domains", "objectives", "interview", "strengths", "improvements", "safetyConcerns", "accuracyIssues", "wrapUpReview", "nextAttempt", "summary"],
    properties: {
      domains: {
        type: "array",
        description: "One entry per rubric " + (isCheck ? "item" : "domain") + ", same keys, same order.",
        items: {
          type: "object",
          required: ["key", "score", "rationale", "evidence"],
          properties: {
            key: str,
            score: isCheck
              ? { type: "number", description: "Points awarded, 0 up to the item's maximum" }
              : { type: ["integer", "null"], description: "4, 3, 2, 1, or null for N/A when the scenario gave no chance to observe it" },
            rationale: { type: "string", description: "Why this score, in 1-2 sentences, tied to the descriptor. Use **short key phrases** for emphasis and provide their tones in highlights." },
            highlights: { type: "array", maxItems: 5, description: "A few exact short snippets from the rationale, excluding ** markers, with their meaning. Positive = demonstrated strength; negative = absent or unsafe behaviour; partial = incomplete success. Do not highlight whole paragraphs.", items: { type: "object", required: ["text", "tone"], properties: { text: str, tone: { type: "string", enum: ["positive", "negative", "partial"] } } } },
            evidence: {
              type: "array",
              description: "1-3 moments from the transcript that justify the score",
              items: {
                type: "object",
                required: ["turn", "quote", "note"],
                properties: { turn: { type: "integer" }, quote: { type: "string", description: "Exact words copied from that turn" }, note: str },
              },
            },
          },
        },
      },
      objectives: {
        type: "array",
        description: "Judge each objective on what the student actually did. The comment must agree with the met value.",
        items: { type: "object", required: ["id", "met", "comment"], properties: { id: str, met: { type: "string", enum: ["met", "partial", "not_met"] }, comment: str } },
      },
      interview: {
        type: "object",
        required: ["structure", "sequencing", "questionMix"],
        properties: { structure: str, sequencing: str, questionMix: str },
      },
      strengths: noted,
      improvements: noted,
      safetyConcerns: noted,
      accuracyIssues: {
        type: "array",
        description: "Clinically incorrect or unsupported things the student told the patient or wrote in the wrap-up, judged against the answer key and knowledge sources only",
        items: { type: "object", required: ["claim", "correction"], properties: { claim: str, correction: str, turn: { type: "integer" } } },
      },
      mismatches: {
        type: "array",
        description: "One entry per listed patient-versus-chart mismatch. noticed is true only if the student explicitly raised the discrepancy with the patient or in the write-up; seeing the document is not enough. The comment must agree with the noticed value.",
        items: { type: "object", required: ["id", "noticed", "comment"], properties: { id: str, noticed: { type: "boolean" }, comment: str } },
      },
      wrapUpReview: { type: "string", description: "Assessment of the student's written wrap-up against the answer key" },
      nextAttempt: { type: "array", items: str, description: "3-5 concrete things to do differently next time, each phrased as an action, ideally with example wording" },
      summary: { type: "string", description: "3-4 sentence overall summary addressed to the student as 'you'" },
      summaryHighlights: highlightSchema,
    },
  };
}

const SYSTEM = `You are a clinical skills examiner giving feedback on a simulated telehealth encounter. You are fair, specific and kind, and you never inflate scores.

Rules:
- Score strictly from the transcript. Every score needs evidence: a turn number and an exact quote copied from that turn.
- Use N/A (null) only when the scenario truly offered no opportunity to show the domain.
- Judge clinical accuracy only against the case answer key and the supplied knowledge sources. If something is outside them, say it could not be verified rather than calling it wrong.
- Judge the student against what their profession is expected to do; do not penalize a dietetics student for not forming a medical differential.
- Feedback is addressed to the student as "you". Be concrete: say what was said, why it mattered, and what to say instead.
- A short or abandoned encounter gets low scores, not N/A.
- In each domain rationale, put ** around 1-3 short phrases worth skimming, and include exact snippets without markers in highlights with positive, negative or partial tones. Distinguish strengths from gaps even within one sentence. Never insert formatting markers into transcript evidence quotes. These are reading aids; do not change scores to fit highlight colours.
- Also provide summaryHighlights for 2-5 exact short phrases in the summary, and highlights in each strengths and improvements entry. Only demonstrated performance is positive; a recommendation or hypothetical benefit is not an achieved strength. Use negative for actual gaps and partial for incomplete performance. Keep the full prose intact.`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Keeps only evidence that really exists in the transcript; repairs wrong turn numbers when the quote is found elsewhere. */
function groundEvidence(ev: { turn: number; quote: string; note: string }[], msgs: MessageRow[]) {
  const out: { turn: number; quote: string; note: string }[] = [];
  for (const e of ev || []) {
    const q = norm(e.quote || "");
    const inTurn = msgs.find((m) => m.turn === e.turn && q && norm(m.text).includes(q));
    if (inTurn) {
      out.push(e);
      continue;
    }
    const anywhere = q.length > 8 ? msgs.find((m) => norm(m.text).includes(q)) : undefined;
    if (anywhere) out.push({ ...e, turn: anywhere.turn });
    else if (msgs.some((m) => m.turn === e.turn)) out.push({ turn: e.turn, quote: "", note: e.note });
  }
  return out;
}

export async function scoreEncounter(encId: string): Promise<Feedback> {
  const enc = loadEncounter(encId);
  if (!enc) throw new Error("Encounter not found");
  const { c, cfg, state, row } = enc;
  const rubric = getRubric(c.rubricId);
  const role = profession(cfg.professionId);
  const msgs = messagesOf(encId);
  const wrap = parse<Record<string, string>>(row.wrapup, {});

  // ----- Deterministic part: what was and was not elicited comes from the disclosure ledger -----
  // Anything already placed in the chart before the visit is not the student's to find: it is left out
  // of both "elicited" and "missed" so the totals stay coherent.
  const sv = startVisible(c);
  const allFacts = caseFacts(c, cfg.knobs).filter((f) => !f.distractor);
  const facts = allFacts.filter((f) => !sv.factIds.has(f.id));
  const inChart = {
    facts: allFacts.filter((f) => sv.factIds.has(f.id)).map((f) => ({ id: f.id, chart: f.chart })),
    actions: c.actions.filter((a) => sv.actionIds.has(a.id)).map((a) => ({ id: a.id, name: a.name })),
  };
  const elicited = facts.filter((f) => state.disclosed[f.id]).map((f) => ({ id: f.id, chart: f.chart, importance: f.importance, turn: state.disclosed[f.id].turn }));
  // Near-identical fact wording within one case counts as one finding: elicited if either was, missed once.
  const toks = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const same = (a: Fact, b: Fact) => {
    const x = toks(a.chart), y = toks(b.chart);
    if (x.size < 3 || y.size < 3) return a.chart.trim().toLowerCase() === b.chart.trim().toLowerCase();
    let n = 0;
    for (const w of x) if (y.has(w)) n++;
    return n / (x.size + y.size - n) >= 0.8;
  };
  const dupSeen: Fact[] = [];
  const missed = facts
    .filter((f) => {
      if (state.disclosed[f.id]) return false;
      if (facts.some((g) => g.id !== f.id && state.disclosed[g.id] && same(f, g))) return false;
      if (dupSeen.some((g) => same(f, g))) return false;
      dupSeen.push(f);
      return true;
    })
    .map((f) => ({ id: f.id, topic: f.topic, chart: f.chart, importance: f.importance }));
  const rank = { critical: 0, important: 1, minor: 2 };
  missed.sort((a, b) => rank[a.importance] - rank[b.importance]);
  const actionsDone = c.actions.filter((a) => state.actions[a.id]).map((a) => ({ id: a.id, name: a.name, importance: a.importance }));
  const actionsMissed = c.actions.filter((a) => !state.actions[a.id] && !sv.actionIds.has(a.id) && a.importance !== "minor").map((a) => ({ id: a.id, name: a.name, importance: a.importance }));
  const unnecessaryOrders = state.unmatchedOrders.map((u) => u.request);

  const objectiveStatus = c.objectives.map((o) => {
    // Items already in the chart at the start neither help nor hurt an objective.
    const factIds = o.factIds.filter((id) => !sv.factIds.has(id));
    const actionIds = o.actionIds.filter((id) => !sv.actionIds.has(id));
    const refs = factIds.length + actionIds.length;
    const hit = factIds.filter((id) => state.disclosed[id]).length + actionIds.filter((id) => state.actions[id]).length;
    return { id: o.id, text: o.text, refs, hit };
  });

  const transcript = msgs
    .map((m) => {
      const who = { student: "STUDENT", patient: "PATIENT", system: "CHART", instructor: "INSTRUCTOR NOTE", coach: "COACH HINT", clinician: "COLLEAGUE" }[m.speaker];
      return `[T${m.turn}] ${who}: ${m.text}`;
    })
    .join("\n");
  const st = state.stats;

  const rubricText =
    rubric.type === "domain4"
      ? rubric.domains!.map((d) => `${d.key} — ${d.name}\n  4: ${d.descriptors["4"]}\n  3: ${d.descriptors["3"]}\n  2: ${d.descriptors["2"]}\n  1: ${d.descriptors["1"]}`).join("\n")
      : rubric.items!.map((i) => `${i.key} — [${i.section}] ${i.text} (max ${i.points} points)`).join("\n");

  const prompt = `STUDENT ROLE: ${role.name}. Expected of this role: ${role.rubricEmphasis}
CASE: ${c.title}. ${c.summary}
PATIENT: ${c.patient.name}, ${c.patient.age}, ${c.patient.sex}. Health literacy ${c.persona.healthLiteracy}.
TASKS GIVEN TO THE STUDENT: ${c.scenario.tasks.join("; ")}
DIFFICULTY LEVEL: ${cfg.knobs.level}/5${cfg.perturbation ? `. Patient variation this attempt: ${cfg.perturbation.label}` : ""}

ANSWER KEY (faculty-approved)
Primary problem: ${c.answerKey.primaryProblem}
Differential: ${c.answerKey.differential.join("; ")}
Key findings: ${c.answerKey.keyFindings.join("; ")}
Plan: ${c.answerKey.plan.join("; ")}
Red flags: ${c.answerKey.redFlags.join("; ")}
Education points: ${c.answerKey.educationPoints.join("; ")}
${c.knowledge.length ? "\nKNOWLEDGE SOURCES (faculty-supplied)\n" + c.knowledge.map((k) => `## ${k.title}\n${k.text.slice(0, 6000)}`).join("\n\n") : ""}

${c.mismatches?.length ? "PATIENT-VERSUS-CHART MISMATCHES BUILT INTO THE CASE\n" + c.mismatches.map((m) => `${m.id}: patient says "${m.patientClaim}" but the record shows: ${m.recordEvidence}. ${m.teachingPoint}`).join("\n") + "\n" : ""}
LEARNING OBJECTIVES
${c.objectives.map((o) => `${o.id}: ${o.text}`).join("\n")}

RUBRIC (${rubric.name})
${rubric.instructions || ""}
${rubricText}

FACTS FROM THE DISCLOSURE LEDGER (authoritative, do not re-derive)
Elicited: ${elicited.map((f) => `[T${f.turn}] ${f.chart}`).join("; ") || "none"}
Missed: ${missed.map((f) => `(${f.importance}) ${f.chart}`).join("; ") || "none"}
Exams/orders done: ${actionsDone.map((a) => a.name).join("; ") || "none"}
Important exams/orders not done: ${actionsMissed.map((a) => a.name).join("; ") || "none"}
ALREADY IN THE CHART FROM THE START (the student could read these before the visit; they are neither credited nor missed, and not having asked about or ordered them is not a gap): ${[...inChart.actions.map((a) => a.name), ...inChart.facts.map((f) => f.chart)].join("; ") || "none"}
Requests with no approved result: ${unnecessaryOrders.join("; ") || "none"}
Question mix: ${st.open} open, ${st.focused} focused, ${st.closed} closed, ${st.leading} leading, ${st.multiple} stacked. Empathic statements: ${st.empathy}. Unexplained jargon: ${st.jargon}. Judgmental/dismissive moments: ${st.judgmental}.
Patient comfort (0-100) over time: ${state.rapportHistory.join(" → ")}
Coach hints used: ${state.hintsUsed}
${state.endedBy ? `THE PATIENT ENDED THE CALL at turn ${state.endedBy.turn}: ${{ closed: "naturally, after the student wrapped up the visit", upset: "because the student's tone had left the patient feeling disrespected over several turns", time: "because the visit ran well past its time limit" }[state.endedBy.reason]}. Comment on it where relevant (for example, how the visit was closed, or the effect of tone on trust); do not change how the rubric is applied.\n` : ""}
TRANSCRIPT
${transcript || "(the student did not say anything)"}

STUDENT'S WRITTEN WRAP-UP
${role.wrapUp.map((f) => `${f.label}:\n${wrap[f.id] || "(left blank)"}`).join("\n\n")}`;

  type Raw = {
    domains: { key: string; score: number | null; rationale: string; highlights?: DomainScore["highlights"]; evidence: { turn: number; quote: string; note: string }[] }[];
    objectives: { id: string; met: "met" | "partial" | "not_met"; comment: string }[];
    mismatches?: { id: string; noticed: boolean; comment: string }[];
  } & Pick<Feedback, "interview" | "strengths" | "improvements" | "safetyConcerns" | "accuracyIssues" | "wrapUpReview" | "nextAttempt" | "summary" | "summaryHighlights">;

  // The patient's memory of this visit does not depend on the scoring, so it runs alongside it.
  const remembered = !row.parent_id && cfg.mode !== "journey" ? rememberVisit(encId).catch((e) => console.error("rememberVisit", e)) : Promise.resolve();
  let raw!: Raw;
  // A reply without usable domain scores is a failed scoring, not a zero: retry, then fail loudly.
  for (let attempt = 0; attempt < 3; attempt++) {
    raw = await chatJSON<Raw>({
      model: MODELS.smart,
      system: SYSTEM,
      schema: schema(rubric),
      maxTokens: 8000,
      messages: [{ role: "user", text: prompt }],
    });
    if (typeof raw.domains === "string") {
      try {
        raw.domains = JSON.parse(raw.domains);
      } catch {}
    }
    const usable = Array.isArray(raw.domains) && raw.domains.filter((d) => d && typeof d.score === "number").length >= 2;
    if (usable) break;
    if (attempt === 2) throw new Error("The examiner did not return rubric scores. Your visit is saved; select Score this visit to try again.");
  }

  const spoken = msgs.filter((m) => m.speaker === "student" || m.speaker === "patient" || m.speaker === "system");
  const defs = rubric.type === "domain4" ? rubric.domains!.map((d) => ({ key: d.key, name: d.name, max: 4, review: !!d.reviewIfOne })) : rubric.items!.map((i) => ({ key: i.key, name: i.text, max: i.points, review: false }));
  const domains: DomainScore[] = defs.map((d) => {
    const r = raw.domains?.find((x) => x.key === d.key);
    let score: number | null = r ? r.score : null;
    if (score !== null) score = rubric.type === "domain4" ? Math.max(1, Math.min(4, Math.round(score))) : Math.max(0, Math.min(d.max, score));
    return { key: d.key, name: d.name, score, max: d.max, rationale: r?.rationale || "Not assessed.", highlights: validHighlights(r?.rationale || "", r?.highlights), evidence: groundEvidence(r?.evidence || [], spoken) };
  });
  const scored = domains.filter((d) => d.score !== null);
  const total = scored.reduce((s, d) => s + (d.score as number), 0);
  const max = scored.reduce((s, d) => s + d.max, 0);
  const percent = max ? Math.round((total / max) * 100) : 0;
  const reviewReasons = defs.filter((d) => d.review && domains.find((x) => x.key === d.key)?.score === 1).map((d) => `Scored 1 in ${d.name}`);
  if (raw.safetyConcerns?.length) reviewReasons.push("Safety concern flagged");

  const feedback: Feedback = {
    rubricId: rubric.id,
    rubricType: rubric.type,
    domains,
    total,
    max,
    percent,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    elicited,
    missed,
    actionsDone,
    actionsMissed,
    unnecessaryOrders,
    inChart,
    callEndedBy: state.endedBy,
    objectives: objectiveStatus.map((o) => {
      const r = raw.objectives?.find((x) => x.id === o.id);
      // Objectives linked to facts/actions are decided by the ledger; the model only comments.
      const order = { not_met: 0, partial: 1, met: 2 } as const;
      const ledger = o.refs ? (o.hit === o.refs ? "met" : o.hit > 0 ? "partial" : "not_met") : null;
      // The ledger shows the information came out; the examiner judges whether the skill was shown.
      // An objective counts as met only when both agree, so the label never contradicts the comment.
      const met = ledger && r?.met ? (order[ledger] <= order[r.met] ? ledger : r.met) : ledger || r?.met || "not_met";
      return { id: o.id, text: o.text, met, comment: r?.comment || "" };
    }),
    interview: raw.interview || { structure: "", sequencing: "", questionMix: "" },
    strengths: (raw.strengths || []).map(s => ({ ...s, highlights: validHighlights(s.text, s.highlights) })),
    improvements: (raw.improvements || []).map(s => ({ ...s, highlights: validHighlights(s.text, s.highlights) })),
    safetyConcerns: raw.safetyConcerns || [],
    accuracyIssues: raw.accuracyIssues || [],
    wrapUpReview: raw.wrapUpReview || "",
    mismatches: (c.mismatches || []).map((m) => {
      const r = raw.mismatches?.find((x) => x.id === m.id);
      return { id: m.id, patientClaim: m.patientClaim, recordEvidence: m.recordEvidence, noticed: !!r?.noticed, comment: r?.comment || "" };
    }),
    nextAttempt: raw.nextAttempt || [],
    summary: raw.summary || "",
    summaryHighlights: validHighlights(raw.summary || "", raw.summaryHighlights),
  };

  run("UPDATE encounters SET feedback = ?, score = ?, status = 'scored', ended_at = COALESCE(ended_at, datetime('now')) WHERE id = ?", JSON.stringify(feedback), percent, encId);
  await remembered;
  // Rewound branches do not move the adaptive rating a second time.
  if (!row.parent_id) recordSkill(row.user_id, cfg.professionId, encId, cfg.knobs.level, rubric.type === "domain4" ? domains : []);
  return feedback;
}

/**
 * Updates what this patient remembers of this student, so a later follow-up visit continues the
 * relationship: facts already shared, tests already done, trust level and a short memory.
 */
async function rememberVisit(encId: string) {
  const enc = loadEncounter(encId);
  if (!enc) return;
  const { c, cfg, state, row } = enc;
  const prev = parse<{ memory?: string }>(JSON.stringify({ memory: cfg.memory || "" }), {});
  const talk = messagesOf(encId)
    .filter((m) => m.speaker === "student" || m.speaker === "patient")
    .map((m) => `${m.speaker === "student" ? "STUDENT" : "ME"}: ${m.text}`)
    .join("\n");
  if (!talk) return;
  const memory = await chatText({
    model: MODELS.fast,
    maxTokens: 350,
    temperature: 0.3,
    system: `You are ${c.patient.name}, a patient. Write what you would remember of this visit a few weeks later, in first person, in 3-5 plain sentences${cfg.team ? `, referring to the clinician as ${cfg.team.studentName}` : ""}: what the student was like, what you told them, what they advised or agreed with you, and how you felt leaving. Only use what was actually said. No medical details that are not in the conversation.`,
    messages: [{ role: "user", text: talk.slice(-9000) }],
  });
  const visit = cfg.visitNumber || 1;
  // A class-shared patient remembers each visit by who it was with.
  const who = cfg.team ? ` with ${cfg.team.studentName} (${profession(cfg.professionId).roleTitle})` : "";
  const merged = [prev.memory, `Visit ${visit}${who}: ${memory.trim()}`].filter(Boolean).join("\n").slice(-4500);
  const key = cfg.team?.scope || row.user_id;
  run(
    `INSERT INTO patient_relationships (user_id, case_id, visits, rapport, disclosed, actions, memory, last_encounter_id, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(user_id, case_id) DO UPDATE SET visits = excluded.visits, rapport = excluded.rapport, disclosed = excluded.disclosed, actions = excluded.actions, memory = excluded.memory, last_encounter_id = excluded.last_encounter_id, updated_at = excluded.updated_at`,
    key,
    row.case_id,
    visit,
    Math.round(state.rapport),
    JSON.stringify(Object.keys(state.disclosed)),
    JSON.stringify(Object.keys(state.actions)),
    merged,
    encId,
  );
}

export interface AttemptSummary {
  id: string;
  attempt: number;
  date: string;
  percent: number;
  level: number;
  mode: string;
  variation: string | null;
  /** Role the student played in a care-journey visit (differs from the case's own profession). */
  roleTitle: string | null;
  domains: { key: string; name: string; score: number | null; max: number }[];
  elicitedIds: string[];
  missedCritical: number;
}

/** Every scored attempt a student has made at a case, oldest first, for the progress view. */
export function attemptHistory(userId: string, caseId: string): AttemptSummary[] {
  const rows = all<{ id: string; attempt: number; ended_at: string; feedback: string; config: string; score: number }>(
    "SELECT id, attempt, ended_at, feedback, config, score FROM encounters WHERE user_id = ? AND case_id = ? AND status = 'scored' ORDER BY ended_at",
    userId,
    caseId,
  );
  // A rewound branch shares its attempt number with the visit it came from; keep the latest scored one.
  const latest = new Map<number, (typeof rows)[number]>();
  for (const r of rows) latest.set(r.attempt, r);
  return [...latest.values()].sort((a, b) => a.attempt - b.attempt
  ).map((r) => {
    const f = parse<Feedback>(r.feedback, {} as Feedback);
    const cfg = parse<EncounterConfig>(r.config, {} as EncounterConfig);
    return {
      id: r.id,
      attempt: r.attempt,
      date: r.ended_at,
      percent: f.percent ?? r.score ?? 0,
      level: cfg.knobs?.level ?? 0,
      mode: cfg.mode,
      variation: cfg.perturbation?.label || null,
      roleTitle: cfg.journey?.roleTitle || null,
      domains: (f.domains || []).map((d) => ({ key: d.key, name: d.name, score: d.score, max: d.max })),
      elicitedIds: (f.elicited || []).map((e) => e.id),
      missedCritical: (f.missed || []).filter((m) => m.importance === "critical").length,
    };
  });
}
