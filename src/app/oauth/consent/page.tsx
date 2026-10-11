import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { consentRequest } from "@/lib/mcp/oauth";
import { READ, PATIENT_WRITE, FEEDBACK_WRITE } from "@/lib/mcp/tools";
export const dynamic = "force-dynamic";
const descriptions: Record<string, string> = {
  [READ]:
    "Read permitted patient charts, visit transcripts, learning analytics, and released feedback.",
  [PATIENT_WRITE]:
    "Create and edit your draft patients, archive editable patients, and restore archived patients. Publishing and faculty attestation stay in Patient Studio.",
  [FEEDBACK_WRITE]:
    "Add or replace faculty notes on visits you are authorized to review. Scores and feedback release settings stay unchanged.",
};
export default async function Consent({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const user = await requireUser();
  const { request } = await searchParams;
  let pending;
  try {
    pending = consentRequest(request || "", user);
  } catch {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold">Connection request expired</h1>
        <p className="mt-3">
          Return to ChatGPT and start connecting Poscere again.
        </p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-xl space-y-6 p-6 sm:p-10">
      <div>
        <p className="text-sm font-semibold text-blue-600">POSCERE × CHATGPT</p>
        <h1 className="mt-2 text-3xl font-semibold">Connect your account</h1>
        <p className="mt-3 text-slate-600">
          Signed in as {user.name} ({user.role}). Choose what ChatGPT can
          access.
        </p>
      </div>
      <form
        action="/api/oauth/consent"
        method="post"
        className="space-y-5 rounded-2xl border bg-white p-6"
      >
        <input type="hidden" name="request" value={pending.id} />
        <input type="hidden" name="csrf" value={pending.csrf || ""} />
        {pending.allowedScopes.map((scope) => (
          <label key={scope} className="flex items-start gap-3">
            <input
              type="checkbox"
              name="scope"
              value={scope}
              defaultChecked={scope === READ}
              className="mt-1 h-5 w-5"
            />
            <span>
              <strong className="block">
                {scope === READ
                  ? "Read records and results"
                  : scope === PATIENT_WRITE
                    ? "Edit patient profiles"
                    : "Write faculty feedback"}
              </strong>
              <span className="text-sm text-slate-600">
                {descriptions[scope]}
              </span>
            </span>
          </label>
        ))}
        {user.role === "student" && (
          <p className="text-sm text-slate-600">
            Student connections are read-only. Hidden case answers and held
            feedback are not shared.
          </p>
        )}
        <p className="text-sm text-slate-600">
          Access expires after 30 days. You can revoke it at any time in{" "}
          <Link href="/integrations" className="underline">
            Integrations
          </Link>
          .
        </p>
        <div className="flex gap-3">
          <button
            name="action"
            value="approve"
            className="rounded-full bg-blue-600 px-5 py-3 font-semibold text-white"
          >
            Allow selected access
          </button>
          <button
            name="action"
            value="deny"
            className="rounded-full border px-5 py-3"
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
