import { exchange, oauthError } from "@/lib/mcp/oauth";
export async function POST(req: Request) {
  try {
    const body = await req.text();
    if (body.length > 16000) throw new Error();
    return Response.json(exchange(new URLSearchParams(body)), {
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  } catch (e) {
    return oauthError(e);
  }
}
