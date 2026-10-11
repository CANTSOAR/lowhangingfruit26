export const dynamic = "force-dynamic";
import { protectedMetadata } from "@/lib/mcp/oauth";
export function GET() {
  return Response.json(protectedMetadata());
}
