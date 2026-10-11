import Preferences, { LearningProvider } from "@/components/learning/Preferences";
import Link from "next/link";
import AppNavigation from "./AppNavigation";
import type { ReactNode } from "react";
import { logout } from "@/app/(auth)/actions";
import { Logo } from "@/components/Brand";
import DesktopNotice from "@/components/DesktopNotice";
import { isFaculty } from "@/lib/auth";
import { profession } from "@/lib/professions";
import type { User } from "@/lib/types";

const FACULTY_NAV = [
  { href: "/faculty", label: "Home" },
  { href: "/faculty/cases", label: "Patient Studio" },
  { href: "/faculty/journeys", label: "Care Journeys" },
  { href: "/faculty/courses", label: "Courses" },
  { href: "/faculty/live", label: "Live Visits" },
  { href: "/episodes", label: "Episodes" },
];
const STUDENT_NAV = [
  { href: "/student", label: "Home" },
  { href: "/student/practice", label: "Practice" },
  { href: "/student/journeys", label: "Care Journeys" },
  { href: "/student/progress", label: "Progress" },
  { href: "/episodes", label: "My visits" },
];

export default function AppShell({
  user,
  children,
  wide,
}: {
  user: User;
  children: ReactNode;
  wide?: boolean;
}) {
  const faculty = isFaculty(user);
  const nav = faculty ? FACULTY_NAV : STUDENT_NAV;
  return (
    <LearningProvider userId={user.id}><div className="min-h-full">
      <DesktopNotice />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
          <Link href={faculty ? "/faculty" : "/student"}>
            <Logo />
          </Link>
          <AppNavigation items={nav} faculty={faculty} />
          <div className="ml-auto flex items-center gap-2 text-sm">
            <div className="hidden text-right leading-tight sm:block">
              <div className="font-medium text-slate-800">{user.name}</div>
              <div className="text-xs text-slate-500">
                {faculty ? "Faculty" : profession(user.profession_id).name}
              </div>
            </div>
            <Preferences userId={user.id} />
            <form action={logout}>
              <button className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className={wide ? "px-4 py-5" : "mx-auto max-w-7xl px-4 py-6"}>
        {children}
      </main>
    </div></LearningProvider>
  );
}
