import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { all, db, get, run } from "@/lib/db";
import { isFaculty } from "@/lib/auth";
import type { User } from "@/lib/types";
import { READ, PATIENT_WRITE, FEEDBACK_WRITE, type Principal } from "./tools";

export const scopes = [READ, PATIENT_WRITE, FEEDBACK_WRITE];
export const origin = () => {
  const url = new URL(
    process.env.MCP_PUBLIC_ORIGIN || "https://d3k6ssmfceay1x.cloudfront.net",
  );
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("Invalid MCP_PUBLIC_ORIGIN");
  return url.origin;
};
export const resource = () => `${origin()}/api/mcp`;
const now = () => Math.floor(Date.now() / 1000);
const random = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: string, message: string): never {
  throw new OAuthError(code, message);
}
let initialized = false;
function schema() {
  if (initialized) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, redirect_uri TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_requests (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, state TEXT NOT NULL, challenge TEXT NOT NULL, scopes TEXT NOT NULL, expires_at INTEGER NOT NULL, user_id TEXT, csrf TEXT);
    CREATE TABLE IF NOT EXISTS oauth_codes (hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, user_id TEXT NOT NULL, scopes TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_grants (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, user_id TEXT NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS oauth_tokens (hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL, kind TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS oauth_tokens_grant ON oauth_tokens(grant_id);
  `);
  initialized = true;
}
export function metadata() {
  return {
    issuer: origin(),
    authorization_endpoint: `${origin()}/api/oauth/authorize`,
    token_endpoint: `${origin()}/api/oauth/token`,
    registration_endpoint: `${origin()}/api/oauth/register`,
    revocation_endpoint: `${origin()}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: scopes,
    authorization_response_iss_parameter_supported: true,
  };
}
export function protectedMetadata() {
  return {
    resource: resource(),
    authorization_servers: [origin()],
    scopes_supported: scopes,
    bearer_methods_supported: ["header"],
    resource_name: "Poscere",
  };
}
export function registerClient(input: unknown) {
  schema();
  const a = input as Record<string, unknown>;
  // This is a ChatGPT connector, not an open redirect registration service. No remote metadata is fetched.
  const redirects = a?.redirect_uris;
  if (
    !Array.isArray(redirects) ||
    redirects.length !== 1 ||
    redirects[0] !== "https://chatgpt.com/connector_platform_oauth_redirect"
  )
    fail("invalid_redirect_uri", "Use ChatGPT's stable OAuth callback.");
  if (a.token_endpoint_auth_method && a.token_endpoint_auth_method !== "none")
    fail(
      "invalid_client_metadata",
      "Public clients use PKCE with token_endpoint_auth_method none.",
    );
  if (
    a.grant_types &&
    (!Array.isArray(a.grant_types) ||
      a.grant_types.some(
        (t) => !["authorization_code", "refresh_token"].includes(t),
      ))
  )
    fail("invalid_client_metadata", "Unsupported grant type.");
  if (
    a.response_types &&
    (!Array.isArray(a.response_types) ||
      a.response_types.some((t) => t !== "code"))
  )
    fail("invalid_client_metadata", "Only authorization code is supported.");
  // Idempotent public registration prevents unbounded storage from unauthenticated DCR.
  const id = "chatgpt_public_pkce";
  run(
    "INSERT OR IGNORE INTO oauth_clients (id,redirect_uri,created_at) VALUES (?,?,?)",
    id,
    redirects[0],
    now(),
  );
  return {
    client_id: id,
    client_name: "ChatGPT",
    redirect_uris: redirects,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}
export function beginAuthorization(p: URLSearchParams) {
  schema();
  const client = get<{ redirect_uri: string }>(
    "SELECT redirect_uri FROM oauth_clients WHERE id=?",
    p.get("client_id"),
  );
  if (!client || p.get("redirect_uri") !== client.redirect_uri)
    fail("invalid_request", "Unknown client or redirect URI.");
  if (
    p.get("response_type") !== "code" ||
    p.get("code_challenge_method") !== "S256" ||
    !/^[A-Za-z0-9_-]{43}$/.test(p.get("code_challenge") || "")
  )
    fail("invalid_request", "Authorization code with S256 PKCE is required.");
  if (p.get("resource") !== resource() || p.getAll("resource").length !== 1)
    fail("invalid_target", "The resource must be this MCP endpoint.");
  const requested = [
    ...new Set((p.get("scope") || READ).split(" ").filter(Boolean)),
  ];
  if (!requested.length || requested.some((s) => !scopes.includes(s)))
    fail("invalid_scope", "Unsupported scope.");
  if ((p.get("state") || "").length > 2048)
    fail("invalid_request", "State is too long.");
  run("DELETE FROM oauth_requests WHERE expires_at < ?", now());
  if (
    (get<{ n: number }>("SELECT count(*) n FROM oauth_requests")?.n || 0) >=
    1000
  )
    fail("temporarily_unavailable", "Try again shortly.");
  const id = random();
  run(
    "INSERT INTO oauth_requests (id,client_id,redirect_uri,state,challenge,scopes,expires_at) VALUES (?,?,?,?,?,?,?)",
    id,
    p.get("client_id"),
    client.redirect_uri,
    p.get("state") || "",
    p.get("code_challenge"),
    requested.join(" "),
    now() + 600,
  );
  return id;
}
interface Pending {
  id: string;
  client_id: string;
  redirect_uri: string;
  state: string;
  challenge: string;
  scopes: string;
  expires_at: number;
  user_id: string | null;
  csrf: string | null;
}
export function consentRequest(id: string, user: User) {
  schema();
  return db().transaction(() => {
    const row = get<Pending>(
      "SELECT * FROM oauth_requests WHERE id=? AND expires_at>?",
      id,
      now(),
    );
    if (!row || (row.user_id && row.user_id !== user.id))
      fail(
        "invalid_request",
        "Connection request expired. Start again in ChatGPT.",
      );
    if (!row.user_id) {
      row.user_id = user.id;
      row.csrf = random();
      run(
        "UPDATE oauth_requests SET user_id=?,csrf=? WHERE id=?",
        user.id,
        row.csrf,
        id,
      );
    }
    return {
      ...row,
      allowedScopes: row.scopes
        .split(" ")
        .filter((s) => s === READ || isFaculty(user)),
    };
  })();
}
export function approveConsent(
  id: string,
  csrf: string,
  user: User,
  selected: string[],
  approved: boolean,
) {
  schema();
  return db().transaction(() => {
    const row = get<Pending>(
      "SELECT * FROM oauth_requests WHERE id=? AND expires_at>?",
      id,
      now(),
    );
    if (!row || row.user_id !== user.id || !row.csrf || !equal(row.csrf, csrf))
      fail("invalid_request", "Invalid or expired consent.");
    const granted = [...new Set(selected)];
    if (
      approved &&
      (!granted.length ||
        granted.some(
          (s) =>
            !row.scopes.split(" ").includes(s) ||
            (s !== READ && !isFaculty(user)),
        ))
    )
      fail("invalid_scope", "Permission is not available to this account.");
    run("DELETE FROM oauth_requests WHERE id=?", id);
    const url = new URL(row.redirect_uri);
    url.searchParams.set("state", row.state);
    url.searchParams.set("iss", origin());
    if (!approved) url.searchParams.set("error", "access_denied");
    else {
      const code = random();
      run(
        "INSERT INTO oauth_codes (hash,client_id,redirect_uri,challenge,user_id,scopes,expires_at) VALUES (?,?,?,?,?,?,?)",
        digest(code),
        row.client_id,
        row.redirect_uri,
        row.challenge,
        user.id,
        granted.join(" "),
        now() + 120,
      );
      url.searchParams.set("code", code);
    }
    return url.toString();
  })();
}
function issue(grantId: string, grantedScopes: string, expiry: number) {
  const access = random(),
    refresh = random();
  run(
    "INSERT INTO oauth_tokens (hash,grant_id,kind,expires_at) VALUES (?,?,?,?)",
    digest(access),
    grantId,
    "access",
    Math.min(now() + 3600, expiry),
  );
  run(
    "INSERT INTO oauth_tokens (hash,grant_id,kind,expires_at) VALUES (?,?,?,?)",
    digest(refresh),
    grantId,
    "refresh",
    expiry,
  );
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: Math.min(3600, expiry - now()),
    refresh_token: refresh,
    scope: grantedScopes,
  };
}
interface GrantToken {
  grant_id: string;
  client_id: string;
  user_id: string;
  scopes: string;
  kind: string;
  used: number;
  expires_at: number;
  grant_expiry: number;
  revoked: number;
}
export function exchange(p: URLSearchParams) {
  schema();
  if (p.get("resource") !== resource() || p.getAll("resource").length !== 1)
    fail("invalid_target", "Incorrect resource.");
  if (p.get("grant_type") === "authorization_code")
    return db().transaction(() => {
      const hash = digest(p.get("code") || "");
      const row = get<{
        client_id: string;
        redirect_uri: string;
        challenge: string;
        user_id: string;
        scopes: string;
        expires_at: number;
      }>("SELECT * FROM oauth_codes WHERE hash=?", hash);
      const verifier = p.get("code_verifier") || "";
      if (
        !row ||
        row.expires_at <= now() ||
        row.client_id !== p.get("client_id") ||
        row.redirect_uri !== p.get("redirect_uri") ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
        !equal(row.challenge, digest(verifier))
      )
        fail(
          "invalid_grant",
          "Invalid code, client, redirect, or PKCE verifier.",
        );
      run("DELETE FROM oauth_codes WHERE hash=?", hash);
      const id = random(),
        expiry = now() + 30 * 86400;
      run(
        "INSERT INTO oauth_grants (id,client_id,user_id,scopes,created_at,expires_at) VALUES (?,?,?,?,?,?)",
        id,
        row.client_id,
        row.user_id,
        row.scopes,
        now(),
        expiry,
      );
      return issue(id, row.scopes, expiry);
    })();
  if (p.get("grant_type") !== "refresh_token")
    fail("unsupported_grant_type", "Unsupported grant type.");
  // Return an error sentinel so replay revocation commits instead of rolling back with an exception.
  const result = db().transaction(() => {
    const hash = digest(p.get("refresh_token") || "");
    const row = get<GrantToken>(
      "SELECT t.*,g.client_id,g.user_id,g.scopes,g.revoked,g.expires_at grant_expiry FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.hash=?",
      hash,
    );
    if (
      !row ||
      row.kind !== "refresh" ||
      row.client_id !== p.get("client_id") ||
      row.revoked ||
      row.expires_at <= now() ||
      row.grant_expiry <= now()
    )
      return null;
    if (row.used) {
      run("UPDATE oauth_grants SET revoked=1 WHERE id=?", row.grant_id);
      return null;
    }
    if (p.get("scope") && p.get("scope") !== row.scopes) return null;
    run("UPDATE oauth_tokens SET used=1 WHERE hash=?", hash);
    return issue(row.grant_id, row.scopes, row.grant_expiry);
  })();
  return (
    result ||
    fail(
      "invalid_grant",
      "Refresh token is expired, revoked, reused, or belongs to another client.",
    )
  );
}
export function oauthPrincipal(req: Request): Principal | null {
  schema();
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
    req.headers.get("authorization") || "",
  )?.[1];
  if (!token) return null;
  const row = get<User & { scopes: string }>(
    "SELECT u.id,u.email,u.name,u.role,u.profession_id,g.scopes FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id JOIN users u ON u.id=g.user_id WHERE t.hash=? AND t.kind='access' AND t.expires_at>? AND g.expires_at>? AND g.revoked=0",
    digest(token),
    now(),
    now(),
  );
  if (!row) return null;
  return {
    user: row,
    scopes: row.scopes.split(" ").filter((s) => s === READ || isFaculty(row)),
  };
}
export function revokeToken(p: URLSearchParams) {
  schema();
  run(
    "UPDATE oauth_grants SET revoked=1 WHERE client_id=? AND id IN (SELECT grant_id FROM oauth_tokens WHERE hash=?)",
    p.get("client_id"),
    digest(p.get("token") || ""),
  );
}
export function connections(userId: string) {
  schema();
  return all<{
    id: string;
    scopes: string;
    created_at: number;
    expires_at: number;
  }>(
    "SELECT id,scopes,created_at,expires_at FROM oauth_grants WHERE user_id=? AND revoked=0 AND expires_at>? ORDER BY created_at DESC",
    userId,
    now(),
  );
}
export function revokeConnection(userId: string, id: string) {
  schema();
  run("UPDATE oauth_grants SET revoked=1 WHERE user_id=? AND id=?", userId, id);
}
export function oauthError(error: unknown) {
  return Response.json(
    {
      error: error instanceof OAuthError ? error.code : "invalid_request",
      error_description:
        error instanceof OAuthError ? error.message : "Invalid request.",
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
