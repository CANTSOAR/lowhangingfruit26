import { headers } from "next/headers";
import QRCode from "qrcode";
import { get, run } from "@/lib/db";
import { decodeEntities } from "./save";

export interface JoinableCourse {
  id: string;
  name: string;
  profession_id: string | null;
  join_code: string;
  instructor: string;
}

/** Join codes are upper-case letters and digits; the link is forgiving about case and stray characters. */
export const cleanJoinCode = (raw: unknown): string => String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

/** The course a join code opens, with its instructor's name, or null when no course uses the code. */
export function courseByJoinCode(raw: unknown): JoinableCourse | null {
  const code = cleanJoinCode(raw);
  if (code.length < 4) return null;
  const c =
    get<JoinableCourse>(
      "SELECT co.id, co.name, co.profession_id, co.join_code, COALESCE(u.name, '') AS instructor FROM courses co LEFT JOIN users u ON u.id = co.faculty_id WHERE co.join_code = ?",
      code,
    ) || null;
  return c && { ...c, name: decodeEntities(c.name) };
}

/** Student enrollment in one course. Idempotent. Returns true when the row is new. */
export function enroll(courseId: string, userId: string): boolean {
  return run("INSERT OR IGNORE INTO enrollments (course_id, user_id) VALUES (?,?)", courseId, userId).changes > 0;
}

/** Public origin of this deployment, from the proxy headers (CloudFront sets x-forwarded-*). */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export const joinUrl = (origin: string, code: string) => `${origin}/join/${code}`;

/** QR code as an SVG string (generated locally, no network). */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
}
