import { loadEncounter, messagesOf, type MessageRow } from "../engine/encounter";
import { chatJSON, MODELS } from "../llm";
import { get } from "../db";
import type { Artifact } from "../types";
import { aliasing, approvedCorpus, arr, clean, entryLine, unverifiedValues } from "./context";
import { bestOverlap, factSupported, isMedSafetyConcern, medSafetyRank, sameIssue, sentencesOf } from "./support";
import { addEntry, addLink, entriesOf, norm, quoteIn, RECORD_STAGE, studentNameOf, who, type LoadedRun } from "./store";
import type { EntryKind, EntrySource, EntryStatus, Evidence, Relation, Sbar, Stage } from "./types";

/** A document's content as one line of text: table rows with their values and flags, plotted points, or the report text. */
export function documentText(d: Artifact): string {
  let body = "";
  if (d.table?.rows?.length) {
    const cols = d.table.columns || [];
    body = d.table.rows
      .map((r) => {
        const [first, ...rest] = r.cells || [];
        let out = "";
        rest.forEach((c, i) => {
          if (!c) return;
          const col = (cols[i + 1] || "").toLowerCase();
          if (/unit/.test(col)) out += ` ${c}`;
          else if (/reference|range|normal/.test(col)) out += ` (reference ${c})`;
          else out += `${out ? ", " : ""}${c}`;
        });
        return `${first}: ${out.trim()}${r.flag ? ` [${r.flag === "H" ? "high" : r.flag === "L" ? "low" : "abnormal"}]` : ""}`;
      })
      .join("; ");
  } else if (d.chart?.series?.length) {
    body = d.chart.series.map((sr) => `${d.chart!.yLabel || sr.name}: ${sr.points.map((pt) => `${pt.x} ${pt.y}`).join(", ")}`).join("; ");
  } else if (d.body) body = d.body.replace(/\s+/g, " ").trim();
  return body.slice(0, 1500);
}
const documentHead = (d: Artifact) => `${d.title}${d.date ? ` (${d.date})` : ""}${d.author ? `, ${d.author}` : ""}`;

/**
 * Stage 0: the record that existed before anyone on this team saw the patient. Documents on file
 * enter with their content (lab values, medication rows, report text), not just their titles, so
 * every colleague, human or AI, knows what the chart says.
 */
export function seedRecord(run: LoadedRun) {
  if (get("SELECT 1 FROM state_entries WHERE run_id = ? AND stage_id = ?", run.row.id, RECORD_STAGE)) return;
  const base = { runId: run.row.id, status: "established" as const, source: "record" as const, contributorRole: "Existing record", contributorName: "Patient chart", contributorIsAi: false, stageId: RECORD_STAGE, stageOrder: 0, simTime: "Before the journey" };
  for (const item of run.c.chartAtStart || []) {
    // The source case's booked reason belongs to one profession's visit; in a journey it is the referral that was on file.
    const label = /^reason for visit$/i.test(item.label.trim()) ? "Referral on file" : item.label;
    addEntry({ ...base, kind: "record", category: label, text: `${label}: ${item.value}`, evidence: { where: "record", ref: item.label, quote: item.value, verified: true } });
  }
  for (const d of (run.c.artifacts || []).filter((a) => a.release.when === "start")) {
    const content = documentText(d);
    addEntry({ ...base, kind: "record", category: "Documents on file", text: `Document on file: ${documentHead(d)}${content ? `. ${content}` : ""}`, evidence: { where: "record", ref: d.id, quote: content || d.title, verified: true } });
  }
}

const ACTION_SOURCE: Record<string, EntrySource> = { exam: "exam", vitals: "test", lab: "test", imaging: "test", test: "test", assessment: "test", procedure: "test", record: "record" };

const MODEL_KINDS = ["assessment", "interpretation", "recommendation", "referral", "plan_item", "goal", "uncertainty", "open_question", "disagreement", "follow_up"] as const;
const RELATIONS: Relation[] = ["uses", "confirms", "contradicts", "updates", "answers", "resolves"];

const SCHEMA = {
  type: "object",
  required: ["entries", "uses", "answered"],
  properties: {
    answered: {
      type: "array",
      description: "Earlier unanswered questions or uncertainties that a patient statement, result or document ALREADY RECORDED FOR THIS ENCOUNTER actually answers. Only when that entry itself states the missing information. Usually empty.",
      items: { type: "object", required: ["question", "by"], properties: { question: { type: "string", description: "Label of the earlier open entry" }, by: { type: "string", description: "Label of the entry recorded for this encounter that supplies the information" } } },
    },
    entries: {
      type: "array",
      description: "New contributions made by the clinician in THIS encounter. Do not repeat patient facts or results already listed for this encounter.",
      items: {
        type: "object",
        required: ["kind", "text", "status", "where", "quote"],
        properties: {
          kind: { type: "string", enum: [...MODEL_KINDS] },
          text: { type: "string", description: "One self-contained sentence in chart language. No values, doses or diagnoses that are not in the transcript, note or listed entries." },
          status: { type: "string", enum: ["established", "uncertain", "open_question", "disputed", "patient_reported"] },
          where: { type: "string", enum: ["visit", "note"], description: "Where the evidence is: the visit transcript or the clinician's written note" },
          turn: { type: "integer", description: "Turn number when where = visit" },
          quote: { type: "string", description: "5-25 words copied EXACTLY from that turn or from the note" },
          relates_to: { type: "string", description: "Label (e.g. E7) of the one entry this most directly builds on, answers, contradicts or updates. Omit if none." },
          relation: { type: "string", enum: RELATIONS },
        },
      },
    },
    uses: {
      type: "array",
      description: "Each moment in the visit where the clinician asked about, checked or explicitly built on an entry from an EARLIER encounter or the existing record.",
      items: {
        type: "object",
        required: ["turn", "entry", "quote"],
        properties: { turn: { type: "integer" }, entry: { type: "string", description: "Label of the earlier entry, e.g. E4" }, quote: { type: "string", description: "The clinician's exact words in that turn (5-25 words)" } },
      },
    },
  },
};

const SYSTEM = `You maintain the shared patient state for an interprofessional care team in a clinical training simulation. After each encounter you record what the clinician contributed, with evidence.

Rules:
- Patient-reported facts and exam/test results for this encounter are already recorded from the simulation's disclosure ledger. Never re-enter them and never add new patient facts, values or results.
- Record only what the clinician actually said in the visit or wrote in the note: assessments, interpretations, recommendations, referrals, care-plan items, patient goals or preferences the clinician elicited that are not already listed, and explicitly: uncertainties, unanswered or open questions, and disagreements with an earlier entry (including when what the patient says does not match the record or a colleague's entry).
- kind "disagreement" is ONLY for two incompatible factual claims about the same specific thing (the patient says he takes it daily; the refill record shows gaps). It needs relates_to = the entry it disagrees with and relation "contradicts". A clinician's remark that something is unusual, atypical, concerning or incompletely explained is NOT a disagreement with the record: record it as an interpretation or an uncertainty.
- kind "follow_up" is for when the clinician checked an earlier entry and it was confirmed or updated; give relates_to and relation. When an approved result or document confirms what the patient or a colleague said, use relation "confirms".
- "answers" and "resolves" are only for an entry that itself states the missing information. A recommendation, referral, plan or intention to find out ("recommend a repeat echocardiogram") does NOT answer or resolve anything: link it with "uses" and leave the question open.
- CHART lines that begin "Outside the case record" list words of the simulated patient that are not in the approved case. Never base an entry on those words.
- The simulated patient sometimes says clinical things that are not in the case file. The lists of recorded entries are the only confirmed clinical facts. If a clinician's conclusion depends on a symptom or event that appears only in the patient's words and not in any recorded entry, either leave it out or record it as "uncertain" and say in the text that it is not confirmed in the record.
- Never add to the text an attribution, cause, emotion or detail the speaker did not state. If the patient reported dizziness on standing, do not write that he "fears" it or that a medicine "causes" it; write what was said. Refer to the clinician by professional role, never as "the student" or "the learner".
- Never record that the patient agreed to, accepted, committed to or will try something unless the PATIENT said so in a turn you can quote. A clinician's proposal or suggestion is a "recommendation" or "plan_item" with the clinician's own words as the quote, never a patient goal or agreement.
- A medication-safety concern (duplication, interaction, contraindication, wrong dose, "needs prescriber review", "intent unconfirmed") is "uncertain" or "open_question" until someone supplies the answer; never "established". Keep the clinician's own hedge: "possible" or "could" stays "possible" or "could", never "confirmed".
- Status: "established" only for something the clinician states firmly; "uncertain" for hedged or provisional judgements; "open_question" for things nobody knows yet; "disputed" for disagreements.
- Every entry needs a quote copied exactly from the stated turn or from the note. If you cannot quote it, do not record it.
- "uses": list every turn where the clinician's question or statement is clearly ABOUT the subject of a specific earlier entry (the same medicine, symptom, test, habit or document). Be strict: the link must be recognisable from the words used, and a question on a different subject asked later in the visit is not a use. Fewer, true links are better than many.
- 4 to 10 entries is typical. Prefer fewer, precise entries over many vague ones.`;

export interface StageExtraction {
  deterministic: number;
  extracted: number;
  dropped: number;
  downgraded: number;
  uses: number;
}

/**
 * Updates the shared state after a stage's encounter. Deterministic entries come from the engine's
 * disclosure ledger; clinician contributions are model-extracted and each quote is checked against
 * the transcript or note before the entry is kept.
 */
export async function extractStage(run: LoadedRun, stage: Stage, encounterId: string, note: string, declaredUses: { turn: number; entryIds: string[]; quote: string }[] = [], opts: { ledgerOnly?: boolean; sbar?: Sbar } = {}): Promise<StageExtraction> {
  const enc = loadEncounter(encounterId);
  if (!enc) throw new Error("Stage encounter not found");
  const runId = run.row.id;
  const msgs = messagesOf(encounterId);
  const w = who(run, stage, studentNameOf(run.row.user_id));
  const base = { runId, contributorRole: w.role, contributorName: w.name, contributorIsAi: w.isAi, stageId: stage.id, stageOrder: stage.order, encounterId, simTime: stage.simTime };
  const stats: StageExtraction = { deterministic: 0, extracted: 0, dropped: 0, downgraded: 0, uses: 0 };
  const patientAt = (turn: number) => msgs.find((m) => m.turn === turn && m.speaker === "patient");
  const already = entriesOf(runId).filter((e) => e.stageId === stage.id);

  // ----- Deterministic: the ledger decides what was disclosed and which results came back -----
  for (const f of enc.c.facts) {
    const d = enc.state.disclosed[f.id];
    if (!d || d.how === "record" || d.turn <= 0) continue; // on record from an earlier stage
    if (already.some((e) => e.factId === f.id)) continue;
    // The ledger can mark a fact as given when the cited reply never said it. Only attribute it to the
    // patient when the patient's words in that turn actually support it.
    const said = patientAt(d.turn)?.text || "";
    if (!factSupported(said, f)) {
      stats.dropped++;
      continue;
    }
    addEntry({
      ...base,
      kind: f.category === "goals" ? "goal" : "finding",
      category: f.category,
      text: f.chart,
      status: "patient_reported",
      source: "patient",
      factId: f.id,
      evidence: { where: "visit", turn: d.turn, speaker: "patient", quote: said.slice(0, 400), verified: true },
      meta: { importance: f.importance, flags: d.how === "volunteered" ? ["volunteered"] : [] },
    });
    stats.deterministic++;
  }
  for (const a of enc.c.actions) {
    const d = enc.state.actions[a.id];
    if (!d) continue;
    const text = `${a.name}: ${a.result}`;
    if (already.some((e) => e.text === text)) continue;
    addEntry({
      ...base,
      kind: "result",
      category: a.kind,
      text,
      status: "established",
      source: ACTION_SOURCE[a.kind] || "test",
      evidence: { where: "visit", turn: d.turn, speaker: "chart", quote: `Requested: ${d.request}`, verified: true },
      meta: { importance: a.importance, abnormal: !!a.abnormal },
    });
    stats.deterministic++;
  }
  // Documents that a check released during this visit enter the state with their content, as record.
  for (const d of enc.c.artifacts || []) {
    if (d.release.when === "start" || enc.state.artifacts[d.id] === undefined) continue;
    if (entriesOf(runId).some((e) => e.evidence?.where === "record" && e.evidence.ref === d.id)) continue;
    const content = documentText(d);
    addEntry({ ...base, kind: "record", category: "Documents on file", text: `Document reviewed: ${documentHead(d)}${content ? `. ${content}` : ""}`, status: "established", source: "record", evidence: { where: "record", ref: d.id, quote: content || d.title, verified: true } });
    stats.deterministic++;
  }
  // Faculty-authored patient-versus-record conflicts become disputes once BOTH sides are in the shared
  // state: the patient's claim (disclosed in this or an earlier encounter) and the record that
  // contradicts it (on file at the start, or pulled by a check in this or an earlier encounter).
  // Nobody is credited with noticing a conflict against a record that no one has opened.
  for (const m of enc.c.mismatches || []) {
    if (!m.factId || !enc.state.disclosed[m.factId]) continue;
    const text = `Patient's account ("${m.patientClaim}") does not match the record: ${m.recordEvidence}`;
    const state = entriesOf(runId);
    if (state.some((e) => e.text === text)) continue;
    const art = m.artifactId ? enc.c.artifacts.find((a) => a.id === m.artifactId) : undefined;
    const onFile = !art || art.release.when === "start" || enc.state.artifacts[art.id] !== undefined || state.some((e) => e.evidence?.where === "record" && e.evidence.ref === art.id);
    if (!onFile) continue;
    const target = state.find((e) => e.factId === m.factId);
    addEntry({ ...base, kind: "disagreement", category: "Patient versus record", text, status: "disputed", source: "record", evidence: { where: "record", ref: m.artifactId || m.id, quote: m.recordEvidence, verified: true }, relatesTo: target?.id, relation: target ? "contradicts" : null });
    stats.deterministic++;
  }

  if (opts.ledgerOnly) return stats;

  // ----- Model-extracted clinician contributions, evidence-checked -----
  const all = entriesOf(runId);
  const visible = all.filter((e) => e.stageOrder <= stage.order);
  const { toAlias, resolve } = aliasing(visible);
  const prior = visible.filter((e) => e.stageOrder < stage.order);
  const mine = visible.filter((e) => e.stageId === stage.id);
  const spoken = msgs.filter((m) => m.speaker === "student" || m.speaker === "patient" || m.speaker === "system");
  const transcript = spoken.map((m) => `[T${m.turn}] ${m.speaker === "student" ? "CLINICIAN" : m.speaker === "patient" ? "PATIENT" : "CHART"}: ${m.text}`).join("\n");

  type RawEntry = { kind: string; text: string; status: string; where: string; turn?: number; quote: string; relates_to?: string; relation?: string };
  type Raw = { entries: RawEntry[]; uses: { turn: number; entry: string; quote: string }[]; answered: { question: string; by: string }[] };
  let raw: Raw = { entries: [], uses: [], answered: [] };
  const extractOnce = () =>
    chatJSON<Raw>({
      model: MODELS.smart,
      system: SYSTEM,
      schema: SCHEMA,
      maxTokens: 5000,
      messages: [
        {
          role: "user",
          text: `THIS ENCOUNTER: encounter ${stage.order}, ${w.name} (${stage.roleTitle}), ${stage.simTime}. Purpose: ${stage.focus}

ENTRIES FROM THE EXISTING RECORD AND EARLIER ENCOUNTERS
${prior.map((e) => entryLine(e, toAlias.get(e.id))).join("\n") || "(none)"}

ALREADY RECORDED FOR THIS ENCOUNTER (from the disclosure ledger; do not repeat)
${mine.map((e) => entryLine(e, toAlias.get(e.id))).join("\n") || "(none)"}

VISIT TRANSCRIPT
${transcript || "(no conversation)"}

CLINICIAN'S WRITTEN NOTE
${note.trim() || "(none)"}`,
        },
      ],
    });
  if (spoken.length || note.trim()) {
    raw = await extractOnce();
    // A visit with a written note always has something to record. An empty answer (or an array field that could
    // not be read) is treated as a failed call and asked once more, and logged so it can be diagnosed.
    if (note.trim().length > 200 && !arr(raw.entries).length) {
      console.warn(`[journey] extraction for ${stage.id} returned no entries (fields: ${Object.keys(raw || {}).join(", ") || "none"}; entries is ${Array.isArray(raw.entries) ? "an empty array" : typeof raw.entries}); asking again`);
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const again = await extractOnce();
          if (arr(again.entries).length) {
            raw = again;
            break;
          }
          console.warn(`[journey] extraction retry ${attempt} for ${stage.id} also returned no entries (fields: ${Object.keys(again || {}).join(", ") || "none"})`);
        } catch (e) {
          console.error("[journey] extraction retry failed", e);
        }
      }
    }
  }

  const corpus = approvedCorpus(enc.c, all);
  const byTurn = (turn: number) => spoken.filter((m) => m.turn === turn);
  // The clinician's line that the patient answered: if a turn was sent twice (a dropped connection), the last one counts.
  const clinicianAt = (turn: number) => spoken.filter((m) => m.turn === turn && m.speaker === "student").pop()?.text || "";
  const locate = (where: string, turn: number | undefined, quote: string, clinicianOnly = false): Evidence | null => {
    if (where === "note") return quoteIn(quote, note) ? { where: "note", quote, verified: true } : null;
    const ok = (m: MessageRow) => (!clinicianOnly || m.speaker === "student") && m.speaker !== "system" && quoteIn(quote, m.text);
    const hit = (turn !== undefined ? byTurn(turn).find(ok) : undefined) || spoken.find(ok);
    if (hit) return { where: "visit", turn: hit.turn, speaker: hit.speaker === "student" ? "clinician" : hit.speaker, quote, verified: true };
    return quoteIn(quote, note) ? { where: "note", quote, verified: true } : null;
  };

  // ----- Pass 1: shape every proposed entry and relation; collect the relations that need checking -----
  const HEDGED = /\b(likely|probabl[ey]|possibl[ey]|suspect|may be|might|could (?:be|represent|indicate|reflect)|appears? to|seems? to|unclear|not (?:yet )?(?:confirmed|established))\b/i;
  const NO_ANSWER_KINDS = ["recommendation", "referral", "plan_item", "open_question", "uncertainty", "goal"];
  const cands: LinkCandidate[] = [];
  const seen = new Set(mine.map((e) => norm(e.text)));
  type Pending = { kind: EntryKind; text: string; status: EntryStatus; ev: Evidence; relatesTo: string | null; relation: Relation | null; cand?: number; flagged: string[] };
  const pending: Pending[] = [];
  for (const r of arr<RawEntry>(raw.entries)) {
    r.text = clean(r.text).replace(/\b(?:the )?(?:student|learner)(?:'s)?\b/gi, (m) => (/'s$/i.test(m) ? "the clinician's" : "the clinician"));
    if (!MODEL_KINDS.includes(r.kind as (typeof MODEL_KINDS)[number]) || !r.text) continue;
    const key = norm(r.text);
    if (seen.has(key)) continue;
    const kind = r.kind as EntryKind;
    // A judgement must rest on the clinician's own words (in the visit or the note). If the quoted words
    // are the patient's, it is a patient statement in disguise, and those only enter through the ledger.
    let ev = locate(r.where, r.turn, r.quote || "", kind !== "goal");
    // Anything attributed to the patient (a goal, an agreement) needs the PATIENT's own words in a visit turn that support it.
    // A quote from the clinician's note can only support a clinician-sourced entry.
    if (kind === "goal" && !(ev && ev.where === "visit" && ev.speaker === "patient" && factSupported(ev.quote || "", { chart: r.text }))) {
      stats.dropped++;
      continue;
    }
    if (!ev && kind !== "goal" && locate(r.where, r.turn, r.quote || "")) {
      stats.dropped++;
      continue;
    }
    let status: EntryStatus = kind === "open_question" ? "open_question" : kind === "disagreement" ? "disputed" : kind === "uncertainty" ? "uncertain" : kind === "goal" ? "patient_reported" : r.status === "uncertain" ? "uncertain" : "established";
    if (!ev) {
      // No verifiable evidence: claims about what happened are dropped, judgements are kept as uncertain and marked.
      if (kind === "disagreement" || kind === "follow_up" || kind === "goal") {
        stats.dropped++;
        continue;
      }
      if (status === "established") status = "uncertain";
      ev = { where: r.where === "note" ? "note" : "visit", turn: r.turn, quote: r.quote, verified: false };
      stats.downgraded++;
    }
    const relatesTo = resolve(r.relates_to);
    const target = relatesTo ? visible.find((e) => e.id === relatesTo) : undefined;
    let relation = RELATIONS.includes(r.relation as Relation) ? (r.relation as Relation) : null;
    if (target && !relation) relation = "uses";
    if (!target) relation = null;
    if (kind === "disagreement") {
      if (!target) {
        stats.dropped++;
        continue;
      }
      relation = "contradicts";
    } else if (relation === "contradicts") relation = "uses"; // only a recorded disagreement disputes an entry
    if ((relation === "answers" || relation === "resolves") && target) {
      // A plan to find out is not an answer, and only something still open can be answered.
      if (NO_ANSWER_KINDS.includes(kind) || !["open_question", "uncertain", "disputed"].includes(target.effectiveStatus)) relation = "uses";
    }
    if (kind === "follow_up" && !target) {
      stats.dropped++;
      continue;
    }
    // A medication-safety concern stays a question until someone answers it; a hedged judgement stays hedged.
    if (status === "established" && ["assessment", "interpretation", "consult"].includes(kind) && (isMedSafetyConcern(r.text) || HEDGED.test(r.text))) status = "uncertain";
    if (unverifiedValues(r.text, corpus + " " + note + " " + transcript).length) {
      // A value that appears nowhere: not in the case, not even in what the clinician said. Never stored.
      stats.dropped++;
      continue;
    }
    const p: Pending = { kind, text: r.text, status, ev, relatesTo: target?.id || null, relation, flagged: unverifiedValues(r.text, corpus) };
    if (target && relation) {
      p.cand = cands.length;
      cands.push({ type: relation === "contradicts" ? "contradicts" : relation === "answers" || relation === "resolves" ? "answers" : "builds", a: target.text, b: r.text });
    }
    seen.add(key);
    pending.push(p);
  }

  // Earlier open items answered by something the ledger recorded in this visit.
  const answered: { question: string; by: string; cand: number }[] = [];
  for (const a of arr<{ question: string; by: string }>(raw.answered)) {
    const q = prior.find((e) => e.id === resolve(a.question));
    const by = mine.find((e) => e.id === resolve(a.by));
    if (!q || !by || !["open_question", "uncertain"].includes(q.effectiveStatus) || !["patient", "exam", "test", "record"].includes(by.source)) continue;
    answered.push({ question: q.id, by: by.id, cand: cands.length });
    cands.push({ type: "answers", a: q.text, b: by.text });
  }

  // "Uses": which earlier entries shaped this visit. A link is proposed per (turn, earlier entry)
  // and per thing learned in that turn, and each one is checked for being about the same subject.
  const uses: { turn: number; entryId: string }[] = [];
  for (const u of arr<{ turn: number; entry: string; quote: string }>(raw.uses)) {
    const target = prior.find((e) => e.id === resolve(u.entry));
    const ev = locate("visit", u.turn, u.quote || "", true);
    if (target && ev?.turn !== undefined && !uses.some((x) => x.turn === ev.turn && x.entryId === target.id)) uses.push({ turn: ev.turn, entryId: target.id });
  }
  for (const d of declaredUses) for (const id of d.entryIds) if (prior.some((e) => e.id === id) && !uses.some((u) => u.turn === d.turn && u.entryId === id)) uses.push({ turn: d.turn, entryId: id });
  const useCands: { turn: number; target: string; learned: string | null; cand: number }[] = [];
  for (const u of uses) {
    const target = prior.find((e) => e.id === u.entryId)!;
    const said = clinicianAt(u.turn);
    if (!said) continue;
    const learned = mine.filter((e) => e.evidence?.where === "visit" && e.evidence.turn === u.turn && (e.source === "patient" || e.kind === "result"));
    for (const e of learned) {
      useCands.push({ turn: u.turn, target: target.id, learned: e.id, cand: cands.length });
      cands.push({ type: "uses", a: target.text, b: e.text, q: said });
    }
    useCands.push({ turn: u.turn, target: target.id, learned: null, cand: cands.length });
    cands.push({ type: "uses", a: target.text, b: "", q: said });
  }

  const keep = await verifyLinks(cands);

  // ----- Pass 2: write what survived -----
  const created: { id: string; relatesTo?: string }[] = [];
  for (const p of pending) {
    let { kind, status, relation } = p;
    let relatesTo = p.relatesTo;
    if (p.cand !== undefined && !keep.has(p.cand)) {
      if (relation === "contradicts") {
        // Not two incompatible facts: keep the clinician's remark as their interpretation, and do not dispute the earlier entry.
        kind = "interpretation";
        if (status === "disputed") status = "uncertain";
        relation = "uses";
      } else if (relation === "answers" || relation === "resolves") relation = "uses";
      else {
        // Not about the same thing: the entry stands on its own, without a link.
        if (kind === "follow_up") {
          stats.dropped++;
          continue;
        }
        relation = null;
        relatesTo = null;
      }
    }
    const id = addEntry({ ...base, kind, category: kind === "goal" ? "goals" : "", text: p.text, status, source: kind === "goal" ? "patient" : "clinician", evidence: p.ev, relatesTo, relation, meta: p.flagged.length ? { unverifiedValues: p.flagged } : null });
    created.push({ id, relatesTo: relatesTo || undefined });
    stats.extracted++;
  }
  for (const a of answered) if (keep.has(a.cand)) addLink(runId, a.by, a.question, "answers", stage.id, { where: "visit", quote: mine.find((e) => e.id === a.by)?.evidence?.quote?.slice(0, 300), verified: true });

  const linkedTurns = new Set<string>();
  for (const c of useCands.filter((x) => x.learned && keep.has(x.cand))) {
    const target = prior.find((e) => e.id === c.target)!;
    const learned = mine.find((e) => e.id === c.learned)!;
    addLink(runId, learned.id, target.id, "uses", stage.id, { where: "visit", turn: c.turn, speaker: "clinician", quote: bestSentence(clinicianAt(c.turn), `${target.text} ${learned.text}`), verified: true });
    linkedTurns.add(`${c.turn}:${c.target}`);
    stats.uses++;
  }
  const now = entriesOf(runId).filter((e) => e.stageId === stage.id);
  // One follow-up per earlier entry per encounter, and only where nothing else in this encounter is already linked to it.
  const followed = new Set<string>([...linkedTurns].map((k) => k.split(":")[1]));
  for (const c of useCands.filter((x) => !x.learned && keep.has(x.cand)).sort((x, y) => x.turn - y.turn)) {
    if (followed.has(c.target)) continue;
    const target = prior.find((e) => e.id === c.target)!;
    if (target.stageOrder <= 0 || created.some((x) => x.relatesTo === target.id) || now.some((e) => e.kind === "follow_up" && e.text.includes(target.text.slice(0, 60)))) continue;
    followed.add(c.target);
    const ev: Evidence = { where: "visit", turn: c.turn, speaker: "clinician", quote: bestSentence(clinicianAt(c.turn), target.text), verified: true };
    const asked = (ev.quote || "").includes("?");
    addEntry({ ...base, kind: "follow_up", text: `${asked ? "Asked about" : "Referred to"} earlier information ("${target.text.slice(0, 160)}"). No new approved finding was recorded from ${asked ? "the reply" : "this exchange"}.`, status: "established", source: "clinician", evidence: ev, relatesTo: target.id, relation: "uses" });
    linkedTurns.add(`${c.turn}:${c.target}`);
    stats.uses++;
  }
  // Backstop: a medication-safety concern the clinician wrote down must not depend on the model proposing it.
  stats.extracted += recordMedSafetyConcerns(run, stage, encounterId, [{ where: "note", text: note }, ...(opts.sbar ? [{ where: "sbar" as const, text: Object.values(opts.sbar).join(" ") }] : [])]);
  return stats;
}

/**
 * Deterministic backstop for medication-safety concerns. Every sentence of the clinician's note or SBAR that
 * states one (a duplication, interaction, wrong dose, contraindication, or "needs prescriber review") must be
 * in the shared state. Any such sentence that no entry from this stage covers is added as an UNCERTAIN
 * assessment with the sentence itself as its evidence: a concern stays a question until someone answers it.
 * Idempotent (a sentence already recorded is covered), at most two per stage, safest first. Returns how many were added.
 */
export function recordMedSafetyConcerns(run: LoadedRun, stage: Stage, encounterId: string, sources: { where: "note" | "sbar"; text: string }[]): number {
  const runId = run.row.id;
  const w = who(run, stage, studentNameOf(run.row.user_id));
  const base = { runId, contributorRole: w.role, contributorName: w.name, contributorIsAi: w.isAi, stageId: stage.id, stageOrder: stage.order, encounterId, simTime: stage.simTime };
  const sentences: { where: "note" | "sbar"; text: string }[] = [];
  for (const src of sources) for (const text of sentencesOf(src.text)) if (text.split(" ").length >= 4 && isMedSafetyConcern(text) && !sentences.some((x) => sameIssue(x.text, text))) sentences.push({ where: src.where, text });
  sentences.sort((a, b) => medSafetyRank(a.text) - medSafetyRank(b.text));
  const corpus = approvedCorpus(run.c, entriesOf(runId));
  let added = 0;
  for (const s of sentences) {
    if (added >= 2) break;
    const covered = entriesOf(runId).some((e) => e.stageId === stage.id && (e.source === "clinician" || e.source === "consult") && e.kind !== "follow_up" && (sameIssue(e.text, s.text) || bestOverlap(s.text, [e.text]) >= 0.6));
    if (covered) continue;
    const flagged = unverifiedValues(s.text, corpus);
    addEntry({ ...base, kind: "assessment", category: "", text: clean(s.text), status: "uncertain", source: "clinician", evidence: { where: s.where, quote: s.text.slice(0, 400), verified: true }, meta: flagged.length ? { unverifiedValues: flagged } : null });
    added++;
  }
  return added;
}

// ---------- Checking proposed relations ----------

export interface LinkCandidate {
  type: "uses" | "builds" | "answers" | "contradicts";
  /** The earlier entry. */
  a: string;
  /** The new entry ("" for a question that produced nothing new). */
  b: string;
  /** The clinician's words, for "uses". */
  q?: string;
}

const STOP = new Set("about after again also been being both from have having into just like more most much only other over same some such than that their them then there these they this those very what when where which while with would your patient patients reports report reported states stated visit earlier information past month months week weeks days daily times year years most something sometimes taking takes take does doing make makes made tell told well really going want need needs help today right about thing things because before".split(" "));
const stems = (t: string) => new Set(norm(t).split(" ").filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 6)));
const overlap = (x: string, y: string) => {
  const a = stems(x);
  let n = 0;
  for (const w of stems(y)) if (a.has(w)) n++;
  return n;
};

/** The sentence of a clinician's turn that refers to the given subject, so a quoted link shows the relevant words. */
export function bestSentence(text: string, about: string): string {
  // Sentences, without breaking after titles and common abbreviations ("Dr. Lee noticed ...").
  const parts: string[] = [];
  for (const piece of (text || "").split(/(?<=[.?!])\s+/).map((x) => x.trim()).filter(Boolean)) {
    const last = parts[parts.length - 1];
    if (last && /(?:^|[\s(])(?:Dr|Mr|Mrs|Ms|Prof|St|vs|approx|e\.g|i\.e)\.$/.test(last)) parts[parts.length - 1] = `${last} ${piece}`;
    else parts.push(piece);
  }
  if (parts.length <= 1) return (text || "").slice(0, 320);
  let best = -1;
  let score = 0;
  parts.forEach((pt, i) => {
    const sc = overlap(pt, about) + (pt.endsWith("?") ? 0.5 : 0);
    if (sc > score) {
      score = sc;
      best = i;
    }
  });
  if (best < 0) best = Math.max(0, parts.findIndex((pt) => pt.endsWith("?")));
  // Keep the question that follows a referring statement ("Dr. Lee noted X. How often does that happen?").
  const out = parts[best] + (!parts[best].endsWith("?") && parts[best + 1]?.endsWith("?") ? " " + parts[best + 1] : "");
  return out.slice(0, 320);
}

/**
 * Relations proposed by a model (or implied by two things happening in the same turn) are only kept
 * when a second, narrow check agrees that the two entries are about the same thing. One call for the
 * whole encounter. If the check itself fails, a relation is kept only on plain word overlap, and
 * "answers" / "contradicts" are not kept at all: a missing link is better than a false one.
 */
export async function verifyLinks(cands: LinkCandidate[]): Promise<Set<number>> {
  const keep = new Set<number>();
  if (!cands.length) return keep;
  try {
    const out = await chatJSON<{ results: { id: number; subject_earlier: string; subject_new: string; match: string; words_refer: boolean }[] }>({
      model: MODELS.chat,
      emphasis: false,
      maxTokens: 4000,
      temperature: 0,
      schema: {
        type: "object",
        required: ["results"],
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "subject_earlier", "subject_new", "match", "words_refer"],
              properties: {
                id: { type: "integer" },
                subject_earlier: { type: "string", description: "The specific subject of EARLIER in 2-5 words, e.g. 'weight loss', 'metformin adherence', 'ankle swelling'" },
                subject_new: { type: "string", description: "The specific subject of NEW in 2-5 words ('none' when there is no NEW)" },
                match: { type: "string", enum: ["same", "related", "different"], description: "same = the test for this candidate's type is clearly met; related = only loosely connected (same body system, same general theme such as 'eating' or 'medicines', cause and possible effect); different = unconnected" },
                words_refer: { type: "boolean", description: "USES only: the clinician's WORDS name or unmistakably point at the subject of EARLIER. true for other types." },
              },
            },
          },
        },
      },
      system: `You check proposed links between entries in a patient's shared clinical record. Be strict: a wrong link is worse than a missing one, and "related" is not "same". Return one result per candidate id. First name the subject of each side, then judge.

USES (a clinician's WORDS drew on an EARLIER entry, and NEW is what the patient or the chart gave back):
- words_refer: true only if WORDS name the subject of EARLIER or unmistakably point at it (the same medicine, symptom, measurement, test, habit or document, by name or plain synonym). A general opener ("how have you been?", "what worries you most?") or a question on another topic ("what does a typical day of eating look like?" for an entry about weight loss) is false, even when the topics are clinically connected.
- match: "same" only if NEW is information about that SAME specific subject. Judge NEW against EARLIER, ignoring WORDS. If WORDS covered two topics and NEW answers the other one: "different". When EARLIER is a document or list with several items (a medication list, a lab panel), NEW is "same" only if it concerns an item that document actually contains.
  Examples: EARLIER weight trend / NEW how often he misses his pills = different. EARLIER medication list / NEW nausea from metformin = same. EARLIER medication list / NEW pharmacy refill record for those medicines = same. EARLIER lab panel with HbA1c / NEW pharmacy refill record = different. EARLIER nausea from metformin / NEW skips breakfast, relies on canned soup = related. EARLIER ankle swelling noted in a clinic letter / NEW ankle swelling by evening = same. EARLIER patient's goal / NEW a lab result = different.
- When there is no NEW, only words_refer matters: it is true when any sentence of WORDS mentions the subject of EARLIER (for example "I understand you've been dealing with some weight loss" for an entry about weight loss), even if the question that follows is broader.

BUILDS (NEW is a clinician's judgement, recommendation or question resting on EARLIER): "same" only if NEW is clearly about the subject of EARLIER. words_refer = true.

ANSWERS (NEW supplies what EARLIER says is missing): "same" only if NEW itself states the missing information. A recommendation, referral, plan or intention to find out, or a restatement of the question, is "different". words_refer = true.

CONTRADICTS: "same" only if EARLIER and NEW make incompatible factual claims about the same specific thing (takes it every day / refill record shows long gaps). A remark that something is unusual, a different emphasis, an added concern or an interpretation is "different". words_refer = true.`,
      messages: [{ role: "user", text: cands.map((c, i) => `#${i} ${c.type.toUpperCase()}\nEARLIER: ${c.a.slice(0, 500)}\n${c.q ? `WORDS: ${c.q.slice(0, 600)}\n` : ""}NEW: ${c.b ? c.b.slice(0, 500) : "(none)"}`).join("\n\n") }],
    });
    for (const r of arr<{ id: number; match: string; words_refer: boolean }>(out.results)) {
      const c = cands[r.id];
      if (!c) continue;
      // With nothing new to compare, the only question is whether the clinician's words point at the earlier entry.
      if (c.type === "uses" && !c.b ? r.words_refer === true : r.match === "same" && r.words_refer !== false) keep.add(r.id);
    }
  } catch (e) {
    console.error("[journey] link check failed; falling back to word overlap", e);
    cands.forEach((c, i) => {
      if (c.type === "uses" && overlap(c.a, c.q || "") >= 1 && (!c.b || overlap(c.a, c.b) >= 1)) keep.add(i);
      if (c.type === "builds" && overlap(c.a, c.b) >= 1) keep.add(i);
    });
  }
  return keep;
}
