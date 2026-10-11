import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { longJson } from "../src/lib/http";
import type { User } from "../src/lib/types";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "poscere-ux-"));
  process.env.DB_PATH = join(dir, "test.db");
  const { db, run } = await import("../src/lib/db");
  const { searchEpisodes } = await import("../src/lib/episodes");
  const { publishedCaseCards } = await import("../src/lib/courses");
  const student: User = {
    id: "ux-student",
    name: "Test Learner",
    email: "ux@example.test",
    role: "student",
    profession_id: "medicine",
  };
  const faculty: User = { ...student, id: "ux-faculty", role: "faculty" };
  for (const u of [student, faculty])
    run(
      "INSERT INTO users (id,email,password_hash,name,role,profession_id) VALUES (?,?,?,?,?,?)",
      u.id,
      u.email + u.id,
      "unused",
      u.name,
      u.role,
      u.profession_id,
    );
  run(
    "INSERT INTO cases (id,title,status,profile) VALUES (?,?,?,?)",
    "ux-case",
    "SPOILER DIAGNOSIS",
    "published",
    JSON.stringify({
      patient: {
        name: "Fictional Patient",
        age: 30,
        portrait: "/portraits/test.png",
      },
      persona: { emotionalState: "SPOILER DIAGNOSIS" },
      summary: "ANSWER",
      answerKey: "SECRET",
      facts: [{ id: "secret", chart: "hidden finding" }],
    }),
  );
  run(
    "INSERT INTO courses (id,faculty_id,name,join_code) VALUES (?,?,?,?)",
    "ux-course",
    faculty.id,
    "Test Course",
    "UXCODE",
  );
  run(
    "INSERT INTO assignments (id,course_id,title,type,feedback_released) VALUES (?,?,?,?,?)",
    "ux-held",
    "ux-course",
    "Test Exam",
    "exam",
    0,
  );
  run(
    "INSERT INTO encounters (id,user_id,case_id,assignment_id,status,config,state,score,faculty_score,case_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?)",
    "ux-visit",
    student.id,
    "ux-case",
    "ux-held",
    "scored",
    JSON.stringify({
      professionId: "medicine",
      mode: "exam",
      knobs: { level: 3 },
    }),
    "{}",
    78,
    91,
    "{}",
  );

  test("student patient cards keep portraits and omit faculty answers and hidden findings", () => {
    const card = publishedCaseCards().find((c) => c.id === "ux-case")!;
    assert.equal(card.portrait, "/portraits/test.png");
    assert(!JSON.stringify(card).includes("SPOILER"));
    assert(!JSON.stringify(card).includes("hidden finding"));
    assert(!("summary" in card));
    assert(!("answerKey" in card));
  });
  test("episode cards and API hide held scores, preserve faculty access, and use released overrides", () => {
    const held = searchEpisodes(student, { caseId: "ux-case" })[0];
    assert.equal(held.score, null);
    assert.equal(held.feedbackHeld, true);
    assert.equal(held.caseTitle, "");
    assert.equal(searchEpisodes(faculty, { caseId: "ux-case" })[0].score, 91);
    run("UPDATE assignments SET feedback_released = 1 WHERE id = ?", "ux-held");
    const released = searchEpisodes(student, { caseId: "ux-case" })[0];
    assert.equal(released.score, 91);
    assert.equal(released.feedbackHeld, false);
    const stranger: User = { ...student, id: "unrelated" };
    assert.equal(searchEpisodes(stranger, { caseId: "ux-case" }).length, 0);
  });
  test("universal search matches all visible fields and never broadens visit permissions", () => {
    run(
      "INSERT INTO messages (encounter_id,turn,speaker,text) VALUES (?,?,?,?)",
      "ux-visit",
      1,
      "patient",
      "I have been feeling unusually tired lately.",
    );
    run(
      "UPDATE encounters SET wrapup = ? WHERE id = ?",
      JSON.stringify({ plan: "Discuss the next appointment" }),
      "ux-visit",
    );
    for (const query of [
      "fictional",
      "Test Learner",
      "Medicine (MD/DO student)",
      "tired",
      "appointment",
    ]) {
      assert.equal(searchEpisodes(student, { query }).length, 1, query);
      assert.equal(
        searchEpisodes({ ...student, id: "unrelated" }, { query }).length,
        0,
        `private: ${query}`,
      );
    }
    assert.match(
      searchEpisodes(student, { query: "tired" })[0].match || "",
      /unusually tired/,
    );
    assert.equal(
      searchEpisodes(student, { query: "SPOILER DIAGNOSIS" }).length,
      0,
    );
    assert.equal(searchEpisodes(student, { query: "not found" }).length, 0);
    assert.equal(
      searchEpisodes(student, { query: "tired", patient: "someone else" })
        .length,
      0,
    );
  });
  test("long operations deliver valid JSON", async () => {
    assert.deepEqual(await longJson(async () => ({ ok: true })).json(), {
      ok: true,
    });
  });
  test("disconnect cancels delivery while the server operation still completes", async () => {
    let finish!: () => void;
    let completed = false;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const response = longJson(async () => {
      await gate;
      completed = true;
      return { ok: true };
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    finish();
    await gate;
    await new Promise((resolve) => setImmediate(resolve));
    assert(completed);
  });
  test.after(() => {
    db().close();
    rmSync(dir, { recursive: true, force: true });
  });
}
void main();
