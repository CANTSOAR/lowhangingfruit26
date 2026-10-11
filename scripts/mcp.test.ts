import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { User } from "../src/lib/types";

test("MCP permissions and OAuth lifecycle", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "poscere-mcp-"));
  process.env.DB_PATH = join(dir, "test.db");
  process.env.MCP_PUBLIC_ORIGIN = "http://127.0.0.1:3118";
  const { db, run, get } = await import("../src/lib/db");
  const { callTool, toolsFor, READ, PATIENT_WRITE, FEEDBACK_WRITE } =
    await import("../src/lib/mcp/tools");
  const oauth = await import("../src/lib/mcp/oauth");
  const { blankProfile } = await import("../src/lib/studio/profile");
  const users: User[] = [
    {
      id: "f",
      name: "Faculty",
      email: "f@example.test",
      role: "faculty",
      profession_id: "medicine",
    },
    {
      id: "s",
      name: "Student",
      email: "s@example.test",
      role: "student",
      profession_id: "medicine",
    },
    {
      id: "other",
      name: "Other",
      email: "other@example.test",
      role: "faculty",
      profession_id: "medicine",
    },
  ];
  for (const u of users)
    run(
      "INSERT INTO users (id,email,password_hash,name,role,profession_id) VALUES (?,?,?,?,?,?)",
      u.id,
      u.email,
      "unused",
      u.name,
      u.role,
      u.profession_id,
    );
  const faculty = {
      user: users[0],
      scopes: [READ, PATIENT_WRITE, FEEDBACK_WRITE],
    },
    student = { user: users[1], scopes: [READ] },
    other = { user: users[2], scopes: [READ, PATIENT_WRITE] };
  let patient: {
    caseId: string;
    revision: string;
    meta: { status: string };
    record: { title: string };
  };
  await t.test(
    "faculty CRUD, revision conflicts, ownership and student read-only enforcement",
    () => {
      patient = callTool(faculty, "create_patient", {
        profession_id: "medicine",
        title: "MCP TEST",
      }) as typeof patient;
      assert.equal(patient.meta.status, "draft");
      assert(!toolsFor(student).some((t) => t.name === "create_patient"));
      assert.throws(
        () =>
          callTool(student, "create_patient", {
            profession_id: "medicine",
            title: "no",
          }),
        /permission/,
      );
      assert.throws(
        () =>
          callTool({ ...student, scopes: [PATIENT_WRITE] }, "create_patient", {
            profession_id: "medicine",
            title: "no",
          }),
        /Faculty/,
      );
      assert.throws(
        () =>
          callTool(other, "get_patient_record", { case_id: patient.caseId }),
        /not visible/,
      );
      assert.throws(
        () =>
          callTool(other, "update_patient", {
            case_id: patient.caseId,
            expected_revision: patient.revision,
            changes: { title: "no" },
          }),
        /not editable/,
      );
      const old = patient.revision;
      patient = callTool(faculty, "update_patient", {
        case_id: patient.caseId,
        expected_revision: old,
        changes: { title: "Edited" },
      }) as typeof patient;
      assert.equal(patient.record.title, "Edited");
      assert.throws(
        () =>
          callTool(faculty, "update_patient", {
            case_id: patient.caseId,
            expected_revision: old,
            changes: { title: "stale" },
          }),
        /changed/,
      );
      assert.throws(
        () =>
          callTool(faculty, "update_patient", {
            case_id: patient.caseId,
            expected_revision: patient.revision,
            changes: { owner_id: "s" },
          }),
        /protected/,
      );
      patient = callTool(faculty, "delete_patient", {
        case_id: patient.caseId,
        expected_revision: patient.revision,
      }) as typeof patient;
      assert.equal(patient.meta.status, "archived");
      patient = callTool(faculty, "restore_patient", {
        case_id: patient.caseId,
        expected_revision: patient.revision,
      }) as typeof patient;
      assert.equal(patient.meta.status, "draft");
      assert(get("SELECT id FROM cases WHERE id=?", patient.caseId));
      run("UPDATE cases SET status='published' WHERE id=?", patient.caseId);
      const safe = JSON.stringify(
        callTool(student, "get_patient_record", { case_id: patient.caseId }),
      );
      assert(!safe.includes("answerKey"));
      assert(!safe.includes("facts"));
    },
  );
  const callback = "https://chatgpt.com/connector_platform_oauth_redirect";
  const client = oauth.registerClient({
    redirect_uris: [callback],
    token_endpoint_auth_method: "none",
  });
  const verifier = "a".repeat(43);
  const auth = () =>
    new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: callback,
      response_type: "code",
      code_challenge_method: "S256",
      code_challenge: oauth.digest(verifier),
      resource: oauth.resource(),
      scope: [READ, PATIENT_WRITE, FEEDBACK_WRITE].join(" "),
      state: "test-state",
    });
  const consent = (u = users[0]) => {
    const id = oauth.beginAuthorization(auth());
    const request = oauth.consentRequest(id, u);
    return { id, request };
  };
  const code = () => {
    const { id, request } = consent();
    return new URL(
      oauth.approveConsent(id, request.csrf!, users[0], faculty.scopes, true),
    ).searchParams.get("code")!;
  };
  const exchange = (value: string) =>
    new URLSearchParams({
      grant_type: "authorization_code",
      code: value,
      client_id: client.client_id,
      redirect_uri: callback,
      resource: oauth.resource(),
      code_verifier: verifier,
    });
  await t.test(
    "strict redirect, resource, PKCE, consent CSRF and account binding",
    () => {
      assert.throws(
        () =>
          oauth.registerClient({
            redirect_uris: ["https://evil.example/callback"],
          }),
        /callback/,
      );
      for (const [key, value] of [
        ["redirect_uri", "https://evil.example"],
        ["resource", "https://evil.example"],
        ["code_challenge_method", "plain"],
      ]) {
        const p = auth();
        p.set(key, value);
        assert.throws(() => oauth.beginAuthorization(p));
      }
      const { id, request } = consent();
      assert.throws(
        () => oauth.approveConsent(id, "bad", users[0], faculty.scopes, true),
        /consent/,
      );
      assert.throws(() => oauth.consentRequest(id, users[2]), /expired/);
      assert.throws(
        () =>
          oauth.approveConsent(
            id,
            request.csrf!,
            users[2],
            faculty.scopes,
            true,
          ),
        /consent/,
      );
      const result = new URL(
        oauth.approveConsent(id, request.csrf!, users[0], faculty.scopes, true),
      );
      assert.equal(result.searchParams.get("state"), "test-state");
      assert.equal(result.searchParams.get("iss"), oauth.origin());
      assert.throws(
        () =>
          oauth.approveConsent(
            id,
            request.csrf!,
            users[0],
            faculty.scopes,
            true,
          ),
        /consent/,
      );
      const c = result.searchParams.get("code")!;
      const bad = exchange(c);
      bad.set("code_verifier", "b".repeat(43));
      assert.throws(() => oauth.exchange(bad), /PKCE/);
      const wrong = exchange(c);
      wrong.set("client_id", "wrong");
      assert.throws(() => oauth.exchange(wrong), /client/);
      const token = oauth.exchange(exchange(c));
      assert(token.access_token);
      assert.throws(() => oauth.exchange(exchange(c)), /Invalid code/);
      const who = oauth.oauthPrincipal(
        new Request(oauth.resource(), {
          headers: { Authorization: `Bearer ${token.access_token}` },
        }),
      );
      assert.equal(who?.user.id, "f");
    },
  );
  await t.test(
    "student consent cannot grant writes and denial issues no code",
    () => {
      const { id, request } = consent(users[1]);
      assert.deepEqual(request.allowedScopes, [READ]);
      assert.throws(
        () =>
          oauth.approveConsent(
            id,
            request.csrf!,
            users[1],
            [PATIENT_WRITE],
            true,
          ),
        /Permission/,
      );
      const url = new URL(
        oauth.approveConsent(id, request.csrf!, users[1], [], false),
      );
      assert.equal(url.searchParams.get("error"), "access_denied");
      assert(!url.searchParams.has("code"));
    },
  );
  await t.test(
    "refresh rotation, replay revocation, token hashing and current roles",
    () => {
      const tokens = oauth.exchange(exchange(code()));
      const p = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: client.client_id,
        resource: oauth.resource(),
      });
      const newer = oauth.exchange(p);
      assert(newer.refresh_token !== tokens.refresh_token);
      const req = () =>
        new Request(oauth.resource(), {
          headers: { Authorization: `Bearer ${newer.access_token}` },
        });
      assert(oauth.oauthPrincipal(req()));
      run("UPDATE users SET role='student' WHERE id='f'");
      assert.deepEqual(oauth.oauthPrincipal(req())?.scopes, [READ]);
      run("UPDATE users SET role='faculty' WHERE id='f'");
      assert.throws(() => oauth.exchange(p), /reused/);
      assert.equal(oauth.oauthPrincipal(req()), null);
      assert(
        !get("SELECT hash FROM oauth_tokens WHERE hash=?", newer.access_token),
      );
      const active = oauth.exchange(exchange(code()));
      oauth.revokeToken(
        new URLSearchParams({
          token: active.access_token,
          client_id: client.client_id,
        }),
      );
      assert.equal(
        oauth.oauthPrincipal(
          new Request(oauth.resource(), {
            headers: { Authorization: `Bearer ${active.access_token}` },
          }),
        ),
        null,
      );
    },
  );
  await t.test("expired codes and tokens fail", () => {
    const c = code();
    run("UPDATE oauth_codes SET expires_at=0 WHERE hash=?", oauth.digest(c));
    assert.throws(() => oauth.exchange(exchange(c)));
    const tokens = oauth.exchange(exchange(code()));
    run(
      "UPDATE oauth_tokens SET expires_at=0 WHERE hash=?",
      oauth.digest(tokens.access_token),
    );
    assert.equal(
      oauth.oauthPrincipal(
        new Request(oauth.resource(), {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }),
      ),
      null,
    );
  });
  await t.test(
    "held feedback, own analytics and instructor note permissions",
    () => {
      const profile = blankProfile("medicine");
      profile.patient.name = "Synthetic";
      run(
        "UPDATE cases SET profile=? WHERE id=?",
        JSON.stringify(profile),
        patient.caseId,
      );
      run(
        "INSERT INTO courses (id,faculty_id,name,join_code) VALUES ('course','f','Test','MCPCODE')",
      );
      run(
        "INSERT INTO assignments (id,course_id,title,type,feedback_released) VALUES ('assignment','course','Test','exam',0)",
      );
      for (let i = 0; i < 3; i++)
        run(
          "INSERT INTO encounters (id,user_id,case_id,assignment_id,status,config,state,score,case_snapshot) VALUES (?,?,?,?,?,?,?,?,?)",
          `visit${i}`,
          i === 2 ? "other" : "s",
          patient.caseId,
          i === 0 ? "assignment" : null,
          "scored",
          JSON.stringify({
            professionId: "medicine",
            mode: "practice",
            knobs: { level: 3 },
          }),
          JSON.stringify({
            turn: 0,
            emotion: "calm",
            rapport: 50,
            disclosed: {},
            actions: {},
            artifacts: {},
            unmatchedOrders: [],
            comfort: 50,
          }),
          80,
          JSON.stringify(profile),
        );
      const analytics = callTool(student, "get_analytics", {}) as {
        sampledVisits: number;
        scoredVisits: number;
        heldFeedbackExcluded: number;
      };
      assert.equal(analytics.sampledVisits, 2);
      assert.equal(analytics.scoredVisits, 1);
      assert.equal(analytics.heldFeedbackExcluded, 1);
      assert.throws(
        () => callTool(student, "get_analytics", { participant_id: "other" }),
        /own analytics/,
      );
      assert.throws(
        () => callTool(student, "get_episode", { episode_id: "visit2" }),
        /not visible/,
      );
      callTool(faculty, "add_faculty_feedback", {
        episode_id: "visit0",
        note: "Test faculty note",
      });
      assert.equal(
        get<{ faculty_note: string }>(
          "SELECT faculty_note FROM encounters WHERE id='visit0'",
        )?.faculty_note,
        "Test faculty note",
      );
      assert.throws(
        () =>
          callTool(
            { ...other, scopes: [FEEDBACK_WRITE] },
            "add_faculty_feedback",
            { episode_id: "visit0", note: "no" },
          ),
        /not available/,
      );
      assert.throws(
        () =>
          callTool(faculty, "add_faculty_feedback", {
            episode_id: "visit1",
            note: "private",
          }),
        /not available/,
      );
      const held = callTool(student, "get_episode", {
        episode_id: "visit0",
      }) as { feedback: unknown; facultyReview: unknown };
      assert.equal(held.feedback, null);
      assert.equal(held.facultyReview, null);
    },
  );
  await t.test(
    "HTTP protocol handles invalid input, legacy read-only keys and OAuth discovery",
    async () => {
      const { POST } = await import("../src/app/api/mcp/route");
      const { createKey } = await import("../src/lib/apikeys");
      const key = createKey("f", "test");
      const request = (body: unknown, authorization?: string) =>
        new Request(oauth.resource(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authorization
              ? { Authorization: `Bearer ${authorization}` }
              : {}),
          },
          body: JSON.stringify(body),
        });
      const anonymous = await POST(request({}));
      assert.equal(anonymous.status, 401);
      assert(
        anonymous.headers
          .get("www-authenticate")
          ?.includes("resource_metadata"),
      );
      const invalid = await POST(request(null, key));
      assert.equal((await invalid.json()).error.code, -32600);
      const listed = await (
        await POST(
          request({ jsonrpc: "2.0", id: 1, method: "tools/list" }, key),
        )
      ).json();
      assert(
        !listed.result.tools.some(
          (t: { name: string }) => t.name === "create_patient",
        ),
      );
      assert.equal(
        (
          await POST(
            request(
              { jsonrpc: "2.0", method: "notifications/initialized" },
              key,
            ),
          )
        ).status,
        202,
      );
      const blocked = await POST(
        new Request(oauth.resource(), {
          method: "POST",
          headers: { Origin: "https://evil.example" },
          body: "{}",
        }),
      );
      assert.equal(blocked.status, 403);
    },
  );
  db().close();
  rmSync(dir, { recursive: true, force: true });
});
