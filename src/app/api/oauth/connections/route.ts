import { apiUser } from "@/lib/auth";
import { connections, revokeConnection, origin } from "@/lib/mcp/oauth";
export async function GET() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  return Response.json({ connections: connections(user.id) });
}
export async function DELETE(req: Request) {
  if (req.headers.get("origin") !== origin())
    return new Response("Invalid origin", { status: 403 });
  const user = await apiUser();
  if (user instanceof Response) return user;
  const body = await req.json().catch(() => null);
  if (typeof body?.id !== "string")
    return new Response("Invalid request", { status: 400 });
  revokeConnection(user.id, body.id);
  return Response.json({ ok: true });
}
