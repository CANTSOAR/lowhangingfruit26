"use client";
import { useState } from "react";
import Dialog from "@/components/learning/Dialog";
import JoinCourse from "./JoinCourse";
export default function JoinCourseDialog() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Join a course" data-tooltip="Join a course" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M12 5v14M5 12h14" /></svg>
    </button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Join a course"><p className="mb-4 text-sm text-slate-600">Enter the course code your instructor gave you.</p><JoinCourse /></Dialog>
  </>;
}
