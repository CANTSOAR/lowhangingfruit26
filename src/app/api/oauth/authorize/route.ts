import { beginAuthorization, origin, oauthError } from "@/lib/mcp/oauth";
export function GET(req: Request) {
  try {
    return Response.redirect(
      `${origin()}/oauth/consent?request=${beginAuthorization(new URL(req.url).searchParams)}`,
      302,
    );
  } catch (e) {
    return oauthError(e);
  }
}
