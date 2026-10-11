import { headers } from "next/headers";
import AppShell from "@/components/AppShell";
import AccessKeys from "@/components/episodes/AccessKeys";
import { AssistantBrands } from "@/components/learning/AssistantLogos";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
export default async function Integrations() {
  const user = await requireUser();
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost";
  const protocol =
    h.get("x-forwarded-proto") ||
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return (
    <AppShell user={user}>
      <PageHeader
        title="Integrations"
        subtitle="Connect your own assistant to visits you can access."
        action={
          <LinkButton href="/episodes" variant="secondary">
            Back to visits
          </LinkButton>
        }
      />
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5 text-brand-600"><path d="m9 15 6-6M7 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M17 7l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0) scale(.92)" /></svg>Connect an assistant</span>}
          subtitle="Personal access keys for the episode API and MCP endpoint."
        />
        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 font-medium"><AssistantBrands /></div>
          <AccessKeys origin={`${protocol}://${host}`} />
        </div>
      </Card>
    </AppShell>
  );
}
