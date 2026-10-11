import { registerClient, oauthError } from "@/lib/mcp/oauth";
export async function POST(req: Request) {
  try {
    const body = await req.text();
    if (body.length > 16000) throw new Error();
    return Response.json(registerClient(JSON.parse(body)), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return oauthError(e);
  }
}
