// Shared domain types. A case is pure data: the encounter engine never contains patient-specific code.

export type Tier = "initial" | "discoverable" | "reluctant" | "hidden";
export type Importance = "critical" | "important" | "minor";

export const FACT_CATEGORIES: Record<string, string> = {
  chief_complaint: "Chief concern",
  hpi: "History of present illness",
  pmh: "Past medical history",
  psh: "Surgical history",
  medications: "Medications",
  allergies: "Allergies",
  family: "Family history",
  social: "Social history",
  substance: "Substance use",
  sexual: "Sexual history",
  ros: "Review of systems",
  nutrition: "Diet & nutrition",
  function: "Function & activity",
  psychosocial: "Psychosocial",
  goals: "Goals & preferences",
  adherence: "Adherence & barriers",
  other: "Other",
};

/** One atomic, faculty-approved piece of patient information. */
export interface Fact {
  id: string;
  category: string;
  /** Non-revealing topic label, e.g. "alcohol use". Safe to show the patient model before disclosure. */
  topic: string;
  /** Clinician-facing wording written to the chart once disclosed. */
  chart: string;
  /** How the patient would say it in their own words. */
  says: string;
  tier: Tier;
  importance: Importance;
  /** True when the fact is a faculty-approved red herring. Only used at higher difficulty. */
  distractor?: boolean;
}

export type ActionKind = "exam" | "vitals" | "lab" | "imaging" | "test" | "record" | "assessment" | "procedure";

/** Something the student can do or order. Results are fixed, faculty-approved text. */
export interface ClinicalAction {
  id: string;
  kind: ActionKind;
  name: string;
  aliases?: string[];
  /** Result written to the chart. */
  result: string;
  abnormal?: boolean;
  importance: Importance;
  artifactIds?: string[];
}

export interface ArtifactTable {
  columns: string[];
  rows: { cells: string[]; flag?: "H" | "L" | "A" | "" }[];
}

/** A plotted series: lab/vital trends, growth curves, audiograms, spirometry, glucose logs, etc. */
export interface ArtifactChart {
  kind: "line" | "bar" | "audiogram";
  xLabel: string;
  yLabel: string;
  /** Draw the y axis downwards (audiograms). */
  invertY?: boolean;
  refLow?: number;
  refHigh?: number;
  series: { name: string; points: { x: string; y: number }[] }[];
}

export interface Artifact {
  id: string;
  type: "lab_report" | "ecg" | "imaging" | "note" | "medication_list" | "flowsheet" | "chart" | "form" | "other";
  title: string;
  /** Date shown in the record, e.g. "3 weeks ago" or "2026-09-18". */
  date?: string;
  /** Author / performing service, e.g. "Dr. Narang, Internal Medicine". */
  author?: string;
  chart?: ArtifactChart;
  /** Free text / report body. */
  body?: string;
  table?: ArtifactTable;
  /** Uploaded file (image/PDF) served from /api/uploads/.. */
  fileUrl?: string;
  /** When the artifact appears in the chart. */
  release: { when: "start" | "action" | "fact"; ref?: string };
}

export interface Objective {
  id: string;
  text: string;
  factIds: string[];
  actionIds: string[];
}

export interface KnowledgeSource {
  id: string;
  title: string;
  text: string;
}

/** A faculty-approved alternate version of the case used for repeat practice. */
export interface Variant {
  id: string;
  label: string;
  description: string;
  /** Persona fields to override. */
  persona?: Partial<Persona>;
  /** Replacement facts/actions keyed by id (same ids, different content). */
  factOverrides?: Record<string, Partial<Fact>>;
  actionOverrides?: Record<string, Partial<ClinicalAction>>;
  approved: boolean;
}

export interface Persona {
  personality: string;
  communicationStyle: string;
  healthLiteracy: "low" | "moderate" | "high";
  emotionalState: string;
  /** Non-clinical biography the patient can talk about freely. */
  background: string;
  speechExamples: string[];
  concerns: string[];
}

export interface WrapUpField {
  id: string;
  label: string;
  placeholder?: string;
}

export interface CaseProfile {
  version: 1;
  title: string;
  summary: string;
  professions: string[];
  specialty: string;
  setting: string;
  encounterType: string;
  /** Intrinsic difficulty 1-5. */
  difficulty: number;
  patient: {
    name: string;
    age: number;
    sex: string;
    pronouns: string;
    ethnicity: string;
    occupation: string;
    language: string;
    appearance: string;
    portrait?: string;
  };
  persona: Persona;
  scenario: {
    /** Shown to the student before they walk in. */
    studentBrief: string;
    chiefComplaint: string;
    openingLine: string;
    tasks: string[];
    /** Exactly three short (3-7 words) session goals shown to the student. Tasks remain what scoring uses. */
    goals?: string[];
    timeLimitMin: number;
  };
  /** Record items visible in the chart before any question is asked. */
  chartAtStart: { label: string; value: string }[];
  facts: Fact[];
  actions: ClinicalAction[];
  artifacts: Artifact[];
  objectives: Objective[];
  answerKey: {
    primaryProblem: string;
    differential: string[];
    keyFindings: string[];
    plan: string[];
    redFlags: string[];
    educationPoints: string[];
  };
  knowledge: KnowledgeSource[];
  rubricId: string;
  variants?: Variant[];
  /** Deliberate conflicts between what the patient says and what the record shows. */
  mismatches?: Mismatch[];
}

export interface Mismatch {
  id: string;
  /** What the patient claims (matches a fact's wording). */
  patientClaim: string;
  /** What the chart shows instead. */
  recordEvidence: string;
  /** How a strong student handles it. */
  teachingPoint: string;
  factId?: string;
  artifactId?: string;
}

// ---------- Rubrics ----------

export interface RubricDomain {
  key: string;
  name: string;
  descriptors: Record<string, string>;
  reviewIfOne?: boolean;
}
export interface ChecklistItem {
  key: string;
  section: string;
  text: string;
  points: number;
}
export interface Rubric {
  id: string;
  name: string;
  type: "domain4" | "checklist";
  instructions?: string;
  domains?: RubricDomain[];
  items?: ChecklistItem[];
}

// ---------- Professions ----------

export interface Profession {
  id: string;
  name: string;
  /** e.g. "Physician", "Nursing", "Rehabilitation", "Diagnostics" */
  group: string;
  /** How the learner is addressed in briefs, e.g. "cardiology consultant". */
  roleTitle: string;
  scope: string;
  encounterTypes: string[];
  /** Kinds of actions this role typically performs. */
  actionKinds: ActionKind[];
  noteFormat: string;
  wrapUp: WrapUpField[];
  rubricEmphasis: string;
}

// ---------- Difficulty ----------

export interface Knobs {
  level: number;
  /** Starting rapport 0-100. */
  rapportStart: number;
  /** Rapport needed before reluctant / hidden facts are shared. */
  reluctantAt: number;
  hiddenAt: number;
  /** Max new facts disclosed per turn. */
  factsPerTurn: number;
  /** Patient volunteers loosely related facts. */
  volunteers: boolean;
  /** 0 clear & forthcoming .. 3 vague, rambling, needs specific questions. */
  vagueness: number;
  /** 0 calm .. 3 distressed / irritable. */
  emotion: number;
  distractors: boolean;
  hints: boolean;
  timeLimitMin: number | null;
}

/** Persona twist applied on repeat attempts so reps are not memorizable. */
export interface Perturbation {
  id: string;
  label: string;
  description: string;
  /** Extra instruction to the patient model. Never changes clinical facts. */
  directive: string;
  knobDelta?: Partial<Knobs>;
}

// ---------- Encounter state ----------

export interface EncounterState {
  turn: number;
  rapport: number;
  emotion: string;
  disclosed: Record<string, { turn: number; how: "volunteered" | "asked" | "record" }>;
  deflected: Record<string, number>;
  actions: Record<string, { turn: number; request: string }>;
  unmatchedOrders: { turn: number; request: string }[];
  artifacts: Record<string, number>;
  stats: {
    open: number;
    focused: number;
    closed: number;
    leading: number;
    multiple: number;
    empathy: number;
    jargon: number;
    judgmental: number;
  };
  rapportHistory: number[];
  hintsUsed: number;
  /** Set when the patient ended the call. No further student messages are accepted. */
  endedBy?: PatientEnded;
  /** Comfort credit already given once for the opening courtesies. */
  credited?: { intro?: boolean; purpose?: boolean };
  /** Consecutive student messages judged judgmental or dismissive (drives the "upset" ending). */
  hostileRun?: number;
}

/** The patient ended the call themselves. */
export interface PatientEnded {
  by: "patient";
  reason: "closed" | "upset" | "time";
  turn: number;
  /** When the goodbye completed; older records may lack this. */
  at?: string;
}

/** One reason the comfort meter moved on a turn, in plain student-facing words. */
export interface ComfortReason {
  label: string;
  delta: number;
}

export interface EncounterConfig {
  mode: "practice" | "homework" | "exam" | "adaptive" | "journey";
  knobs: Knobs;
  perturbation?: Perturbation | null;
  variantId?: string | null;
  liveAssist?: boolean;
  /** Show the comfort meter (and why it moved) to the student. Missing = legacy behavior (shown unless an exam). */
  showComfort?: boolean;
  /** Profession the student is acting as. */
  professionId: string;
  /** Follow-up visits: which visit this is with this patient, and what the patient remembers of the student. */
  visitNumber?: number;
  memory?: string | null;
  /** Set when the patient is shared by a class: the memory holds visits with several different students. */
  team?: { scope: string; studentName: string } | null;
  /** Extra context injected for journey encounters (prior shared state). */
  journey?: {
    runId: string;
    stageId: string;
    priorContext: string;
    patientMemory: string;
    /** How the patient should think of the clinician in this stage, e.g. "cardiologist". */
    roleTitle?: string;
    /** Shown to the student in the waiting room instead of the case's own brief and tasks. */
    brief?: string;
    tasks?: string[];
    /** Why the patient is seeing this clinician today, in the patient's words. Replaces the case's opening line. */
    patientReason?: string;
    /** Booked reason for this stage's visit, shown in the chart header. */
    reason?: string;
    /** True when an AI clinician, not the student, is conducting this stage. */
    ai?: boolean;
  } | null;
}

export interface DomainScore {
  key: string;
  name: string;
  score: number | null; // null = N/A
  max: number;
  rationale: string;
  highlights?: { text: string; tone: "positive" | "negative" | "partial" }[];
  evidence: { turn: number; quote: string; note: string }[];
}

export interface Feedback {
  rubricId: string;
  rubricType: "domain4" | "checklist";
  domains: DomainScore[];
  total: number;
  max: number;
  percent: number;
  needsReview: boolean;
  reviewReasons: string[];
  elicited: { id: string; chart: string; importance: Importance; turn: number }[];
  missed: { id: string; topic: string; chart: string; importance: Importance }[];
  actionsDone: { id: string; name: string; importance: Importance }[];
  actionsMissed: { id: string; name: string; importance: Importance }[];
  unnecessaryOrders: string[];
  /** Items that were already visible in the chart from the start; not scored as missed. */
  inChart?: { facts: { id: string; chart: string }[]; actions: { id: string; name: string }[] };
  /** Set when the patient ended the call (and why); scoring did not change. */
  callEndedBy?: PatientEnded;
  objectives: { id: string; text: string; met: "met" | "partial" | "not_met"; comment: string }[];
  interview: { structure: string; sequencing: string; questionMix: string };
  strengths: { text: string; turn?: number; highlights?: DomainScore["highlights"] }[];
  improvements: { text: string; turn?: number; highlights?: DomainScore["highlights"] }[];
  safetyConcerns: { text: string; turn?: number }[];
  accuracyIssues: { claim: string; correction: string; turn?: number }[];
  wrapUpReview: string;
  mismatches?: { id: string; patientClaim: string; recordEvidence: string; noticed: boolean; comment: string }[];
  nextAttempt: string[];
  summary: string;
  summaryHighlights?: DomainScore["highlights"];
}

export type UserRole = "admin" | "faculty" | "student";
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  profession_id: string | null;
}
