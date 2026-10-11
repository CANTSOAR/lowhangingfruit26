import { redirect } from "next/navigation";
import { Logo } from "@/components/Brand";
import DesktopNotice from "@/components/DesktopNotice";
import { LinkButton } from "@/components/ui";
import { getUser, isFaculty } from "@/lib/auth";
import { courseByJoinCode, enroll } from "@/lib/courses/join";
import JoinForm from "./JoinForm";

export const metadata = { title: "Join a class - Poscere" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50">
      <DesktopNotice />
      <div className="mx-auto w-full max-w-sm px-4 py-6 sm:py-12">
        <div className="mb-6">
          <Logo />
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-slate-500">Synthetic patients for education only. Not for clinical use.</p>
      </div>
    </div>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const course = courseByJoinCode((await params).code);
  if (!course) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-slate-900">This join link does not work</h1>
        <p className="mt-2 text-sm text-slate-600">No class uses that code. It may have been replaced or mistyped. Ask your instructor for the current link or code.</p>
        <LinkButton href="/login" variant="secondary" className="mt-5 min-h-11 w-full">
          Go to sign in
        </LinkButton>
      </Shell>
    );
  }

  const user = await getUser();
  if (user && !isFaculty(user)) {
    enroll(course.id, user.id);
    redirect(`/student?joined=${course.id}`);
  }
  if (user) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-slate-900">{course.name}</h1>
        <p className="mt-2 text-sm text-slate-600">
          You are signed in as {user.name}, a faculty account. Faculty accounts do not join classes as students. Sign out and open this link again to join with a student account.
        </p>
        <LinkButton href="/faculty" variant="secondary" className="mt-5 min-h-11 w-full">
          Back to faculty home
        </LinkButton>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-xs font-medium uppercase tracking-wide text-brand-700">You are invited to join</p>
      <h1 className="mt-1 text-2xl font-semibold leading-tight text-slate-900">{course.name}</h1>
      {course.instructor && <p className="mt-1 text-sm text-slate-600">Instructor: {course.instructor}</p>}
      <p className="mb-6 mt-3 text-sm text-slate-600">Create a student account and you will land in the class with your assignments ready.</p>
      <JoinForm code={course.join_code} />
    </Shell>
  );
}
