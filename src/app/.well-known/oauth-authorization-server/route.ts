export const dynamic = "force-dynamic";
import { metadata } from "@/lib/mcp/oauth";
export function GET() {
  return Response.json(metadata());
}
