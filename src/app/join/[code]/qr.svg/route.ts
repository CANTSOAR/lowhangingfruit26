import { courseByJoinCode, joinUrl, qrSvg, requestOrigin } from "@/lib/courses/join";

/**
 * The QR code for a course's join link, as a standalone SVG (for a slide or a handout).
 * Public on purpose: it encodes only the join link, which is what the QR is for.
 * Example: curl -o join.svg https://<host>/join/<CODE>/qr.svg
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const course = courseByJoinCode((await params).code);
  if (!course) return new Response("No course uses that code", { status: 404 });
  const svg = await qrSvg(joinUrl(await requestOrigin(), course.join_code));
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" } });
}
