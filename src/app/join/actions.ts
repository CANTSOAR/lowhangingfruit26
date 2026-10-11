"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createUser, startSession } from "@/lib/auth";
import { courseByJoinCode, enroll } from "@/lib/courses/join";

// Same checks as the register action, plus a small per-address limit because this path creates
// accounts from a public link. In memory, so it resets on restart; enough to blunt a script.
const hits = new Map<string, number[]>();
function tooMany(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 12;
}

/** Creates a STUDENT account (never faculty, whatever the form says) and enrolls it in the course. */
export async function joinAndRegister(_prev: string | null, form: FormData): Promise<string | null> {
  const course = courseByJoinCode(form.get("code"));
  if (!course) return "This join link is not valid any more. Ask your instructor for a new one.";
  const h = await headers();
  if (tooMany((h.get("x-forwarded-for") || "").split(",")[0].trim() || "local")) return "Too many attempts. Wait a few minutes and try again.";
  const name = String(form.get("name") || "");
  const email = String(form.get("email") || "");
  const password = String(form.get("password") || "");
  if (!name.trim() || name.length > 120 || !/^\S+@\S+\.\S+$/.test(email)) return "Enter your name and a valid email.";
  if (password.length < 8) return "Use a password of at least 8 characters.";
  try {
    const user = await createUser({ email, password, name, role: "student", professionId: course.profession_id || "medicine" });
    enroll(course.id, user.id);
    await startSession(user.id);
  } catch (e) {
    return (e as Error).message;
  }
  redirect(`/student?joined=${course.id}`);
}
