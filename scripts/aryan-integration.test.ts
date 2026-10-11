import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { startSources, factStartVisible, actionStartVisible } from "../src/lib/engine/startVisible";
import { sameIssue, dedupeBySubject } from "../src/lib/journey/support";
import { dateParts } from "../src/components/visit/chart/derive";
import { patientBits } from "../src/components/visit/chart/Storyboard";
import { decideEnd, type EndInput } from "../src/lib/engine/ending";
import { knobsForLevel, INTERVIEW_STYLES } from "../src/lib/engine/difficulty";
import { feedbackParts } from "../src/lib/feedback-text";
import glossary from "../src/lib/glossary.json";
import type { CaseProfile, Fact, ClinicalAction } from "../src/lib/types";
import type { ChartView } from "../src/lib/engine/encounter";
const shell = (values: string[]) => ({ chartAtStart: values.map(value => ({ label: "Record", value })), artifacts: [], actions: [], facts: [] }) as unknown as CaseProfile;
test("start records cannot reverse negation, combine sources, or change quantities", () => {
  const src = startSources(shell(["Patient reports chest pain and shortness of breath at rest.", "Naproxen 250 mg daily."]));
  assert(!factStartVisible({ chart: "Patient denies chest pain and shortness of breath at rest." } as Fact, src).visible);
  assert(factStartVisible({ chart: "Patient reports chest pain and shortness of breath at rest." } as Fact, src).visible);
  assert(!factStartVisible({ chart: "Naproxen 500 mg daily." } as Fact, src).visible);
  assert(!factStartVisible({ chart: "Chest pain naproxen 250 mg daily." } as Fact, src).visible);
  const no = startSources(shell(["Patient denies chest pain at rest."]));
  assert(factStartVisible({ chart: "No chest pain at rest." } as Fact, no).visible);
  assert(!factStartVisible({ chart: "Chest pain at rest." } as Fact, no).visible);
});
test("an old report never exempts a live examination or a new order", () => {
  const c = shell([]);
  c.artifacts = [{ id: "old", title: "Old report", body: "Earlier normal findings", release: { when: "start" } }] as CaseProfile["artifacts"];
  const src = startSources(c);
  for (const [kind, name] of [["exam", "Perform lung examination"], ["vitals", "Take current vital signs"], ["lab", "Order repeat CBC"]]) {
    assert(!actionStartVisible({ kind, name, artifactIds: ["old"] } as ClinicalAction, src).visible);
  }
  assert(actionStartVisible({ kind: "record", name: "Review earlier report", artifactIds: ["old"] } as ClinicalAction, src).visible);
});
test("journey agendas retain separate medicine concerns and deduplicate real repeats", () => {
  const dose = "Warfarin dose is incorrect and needs prescriber review.";
  const interaction = "Warfarin interaction with ibuprofen needs medication review.";
  assert(!sameIssue(dose, interaction));
  assert.equal(dedupeBySubject([{text:dose},{text:interaction}]).kept.length, 2);
  assert(sameIssue(dose, dose));
  assert(!sameIssue("Warfarin 2 mg dose is incorrect.", "Warfarin 5 mg dose is incorrect."));
  assert(!sameIssue("Warfarin interaction with ibuprofen.", "Warfarin interaction with naproxen."));
});
test("chart identity stays authored and dates retain uncertainty", () => {
  const chart = { patient: { name: "Fictional Patient", age: 67, sex: "female" }, atStart: [] } as unknown as ChartView;
  assert.equal(patientBits(chart).mrn, "Not provided");
  assert.equal(patientBits(chart).dob, "Not provided");
  chart.atStart = [{label:"DOB",value:"1959-03-04"},{label:"MRN",value:"Author-123"}];
  assert.equal(patientBits(chart).dob, "1959-03-04");
  assert.equal(patientBits(chart).mrn, "Author-123");
  for (const day of ["2026-10-11", "2026-10-12"]) {
    const date = dateParts("Last month", new Date(day));
    assert.equal(date.label,"Last month"); assert.equal(date.days,null);
  }
  assert.equal(dateParts(undefined,new Date()).label,"Not provided");
});
test("patient ending protections keep initial turns, clinical questions and AI journeys open", () => {
  const input = { cfg: { mode:"practice", knobs:knobsForLevel(1,25) }, state:{turn:3,rapport:1}, gate:{question_type:"statement",signals:{judgmental:true,closing:false}}, message:"Hostile text", rapportAfter:0, hostileRun:5, answering:false, elapsedMin:100 } as EndInput;
  assert.equal(decideEnd(input),null);
  assert.equal(decideEnd({...input,state:{...input.state,turn:5}}),"upset");
  assert.equal(decideEnd({...input,cfg:{...input.cfg,journey:{ai:true} as NonNullable<EndInput["cfg"]["journey"]>},state:{...input.state,turn:5}}),null);
});
test("summary emphasis preserves words and distinguishes strengths, partial performance and gaps", () => {
  const text = "You began the encounter politely but it ended after only two turns, before you introduced your role. The written wrap-up was left entirely blank. To improve, use a clear introduction.";
  const parts = feedbackParts(text,"rubric");
  assert.equal(parts.map(p=>p.text).join(""),text);
  for(const tone of ["positive","partial","negative"]) assert(parts.some(p=>p.tone===tone));
  assert(!feedbackParts("You could have used a clear introduction.","rubric").some(p=>p.tone==="positive"));
});
test("every built-in rubric focus and checklist skill has a definition; medical abbreviations retain original text", () => {
  const rubric=JSON.parse(fs.readFileSync("data/rubrics/encounter_evaluation_rubric.json","utf8"));
  for(const d of rubric.domains) assert(d.key in glossary.focusAreas);
  for(const key of Object.values(glossary.focusAreas)) assert(glossary.terms[key as keyof typeof glossary.terms].definition.length>20);
  const text="HPI, OTC NSAIDs, melena, ferritin, high TIBC and microcytosis.";
  const parts=feedbackParts(text,"actions");
  assert.equal(parts.map(p=>p.text).join(""),text);
  assert.equal(parts.filter(p=>p.term).length,7);
});

test("difficulty face descriptions match disclosure, trust and hint settings", () => {
  assert.equal(INTERVIEW_STYLES.length, 6);
  for (let level = 1; level <= 5; level++) {
    assert(INTERVIEW_STYLES[level].label.length > 0);
    assert(INTERVIEW_STYLES[level].description.length > 30);
    assert.equal(knobsForLevel(level,25).timeLimitMin,25);
  }
  assert(knobsForLevel(1).volunteers);
  assert(!knobsForLevel(5).volunteers);
  assert(knobsForLevel(1).hints);
  assert(!knobsForLevel(5).hints);
  assert(knobsForLevel(5).hiddenAt > knobsForLevel(1).hiddenAt);
});
