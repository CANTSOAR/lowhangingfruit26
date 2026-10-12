# Poscere MCP connector

Endpoint: `https://d3k6ssmfceay1x.cloudfront.net/api/mcp` (Streamable HTTP, stateless JSON).

In ChatGPT's custom MCP setup, enter that URL, select OAuth and Dynamic Client Registration.
Request `poscere:read`, `patients:write`, and `feedback:write`. Sign in to Poscere and choose
which scopes to grant. Students can only grant read access. Revoke connections in Integrations.
Personal `rk_` keys remain read-only, including keys created before this release.

## Tools

- Read: `get_profile`, `search_episodes`, `get_episode`, `list_patients`, `get_patient_record`, `get_analytics`.
- Faculty patient editing: `create_patient`, `update_patient`, `delete_patient`, `restore_patient`.
- Faculty feedback: `add_faculty_feedback`.

New profiles are private drafts with no faculty attestation. Updates require an owned/shared
editable draft and the revision returned by `get_patient_record`. Top-level fields merge;
nested fields replace. Deletion archives reversibly and preserves visit history. Publication
and changes to published profiles stay in Patient Studio. Notes do not alter scores or release
held feedback. Learner analytics are limited to that learner, calculated over at most 100
matching recent visits; responses include counts and truncation information.

Private drafts belonging to another faculty member are excluded. Visit visibility follows
Episodes: faculty see recorded course/journey visits and their own test visits; students see
their own visits plus course-shared visits. Student analytics use only their own visits.

## Authentication

Discovery lives at `/.well-known/oauth-protected-resource` (also the `/api/mcp` suffix) and
`/.well-known/oauth-authorization-server`. The issuer is `MCP_PUBLIC_ORIGIN`, defaulting to the
CloudFront origin above; set it explicitly when using another deployment. Request headers are
never trusted to select an issuer. Local testing permits HTTP only on localhost/127.0.0.1.

The bounded ChatGPT-only OAuth implementation supports public-client DCR, authorization code
with mandatory S256 PKCE, explicit account-bound CSRF-protected consent, and resource binding.
Only `https://chatgpt.com/connector_platform_oauth_redirect` is accepted. Discovery advertises
issuer identification in the authorization response, which enables ChatGPT's stable callback.
There are no client secrets or token-in-URL shortcuts. Authorization codes last 2 minutes;
access tokens last 1 hour; grants expire absolutely after 30 days. Tokens/codes are stored as
SHA-256 hashes. Refresh tokens rotate; replay revokes the grant. Current account roles are
rechecked for every tool request, including after a role downgrade. Legacy keys never acquire
write privileges. The server does not fetch arbitrary client metadata or implement OIDC.

OAuth tables are created additively on first use in the existing SQLite DB. No existing patient,
visit, user or personal-key rows are migrated. Keep the normal database backups. To disable a
connection, revoke it in Integrations; revocation invalidates its access and refresh tokens.

## Verification

`npx tsx --test scripts/mcp.test.ts scripts/ux-regression.test.ts scripts/text-format.test.ts scripts/feedback-text.test.ts`

Tests use a temporary isolated database: CRUD/ownership/revisions, student write denial, hidden
feedback and analytics visibility, strict redirects/resources/PKCE, consent CSRF/account binding,
single-use codes, refresh rotation/replay, expiry, revocation, role downgrade, legacy key scope,
malformed RPC and cross-origin rejection. A production build and browser consent screens are
also checked. A working local endpoint is not evidence that a ChatGPT account is connected;
verify the OAuth callback, tool discovery and a reversible test draft edit in ChatGPT separately.
