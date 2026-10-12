import { revokeToken, oauthError } from "@/lib/mcp/oauth";
export async function POST(req: Request) {
  try {
    const body = await req.text();
    if (body.length > 16000) throw new Error();
    revokeToken(new URLSearchParams(body));
    return new Response(null, { status: 200 });
  } catch (e) {
    return oauthError(e);
  }
}
