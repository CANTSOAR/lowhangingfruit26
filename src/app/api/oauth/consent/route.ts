import { getUser } from "@/lib/auth";
import { approveConsent, origin, oauthError } from "@/lib/mcp/oauth";
export async function POST(req: Request) {
  if (req.headers.get("origin") !== origin())
    return new Response("Invalid origin", { status: 403 });
  const user = await getUser();
  if (!user) return new Response("Sign in again", { status: 401 });
  try {
    const form = await req.formData();
    const redirect = approveConsent(
      String(form.get("request") || ""),
      String(form.get("csrf") || ""),
      user,
      form.getAll("scope").map(String),
      form.get("action") === "approve",
    );
    return new Response(null, {
      status: 303,
      headers: {
        Location: redirect,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return oauthError(e);
  }
}
