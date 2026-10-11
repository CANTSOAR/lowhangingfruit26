"use client";

import { useState } from "react";
import type { ChartView } from "@/lib/engine/encounter";
import { find, hasAllergy, parseTeam, parseVitals, splitList } from "./derive";
import { LINK } from "./ui";

export type PatientBits = ReturnType<typeof patientBits>;

export function patientBits(chart: ChartView) {
  const p = chart.patient;
  const allergyText = find(chart, /allerg/i);
  const team = splitList(find(chart, /care team|pcp/i));
  const pcp = team.find((t) => /pcp|primary/i.test(t)) || team[0];
  const parts = p.name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : p.name;
  return {
    display: parts.length > 1 ? `${last}, ${parts.slice(0, -1).join(" ")}` : p.name,
    initials: parts.map((x) => x[0]).slice(0, 2).join("").toUpperCase(),
    sexLabel: /^f/i.test(p.sex) ? "Female" : /^m/i.test(p.sex) ? "Male" : p.sex,
    dob: find(chart, /^(dob|date of birth)$/i) || "Not provided",
    mrn: find(chart, /^(mrn|medical record number)$/i) || "Not provided",
    allergyText,
    allergic: hasAllergy(allergyText),
    code: find(chart, /code status/i),
    pcp: pcp ? parseTeam(pcp) : null,
    problems: splitList(find(chart, /problem/i)),
    vitals: parseVitals(find(chart, /^last vitals/i)),
    vitalsRaw: find(chart, /^last vitals/i),
  };
}

function Avatar({ chart, bits, size }: { chart: ChartView; bits: PatientBits; size: number }) {
  const [broken, setBroken] = useState(false);
  const src = chart.patient.portrait;
  return src && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setBroken(true)} style={{ width: size, height: size }} className="shrink-0 rounded-sm border border-[#9aa8b8] object-cover" />
  ) : (
    <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-sm border border-[#9aa8b8] bg-[#cdd8e5] text-sm font-bold text-[#2b4468]">
      {bits.initials}
    </span>
  );
}

function Head({ children, tone }: { children: React.ReactNode; tone?: "red" }) {
  return <div className={`border-y px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${tone === "red" ? "border-[#e0aaaa] bg-[#f6d7d7] text-[#8a1010]" : "border-[#b3c4d8] bg-[#d5e0ed] text-[#16365c]"}`}>{children}</div>;
}

/** The persistent left patient panel. Collapsed, it is a slim rail that still shows who the patient is and whether they have allergies. */
export default function Storyboard({ chart, bits, open, onToggle, onGo }: { chart: ChartView; bits: PatientBits; open: boolean; onToggle: () => void; onGo: (tab: "snapshot") => void }) {
  const p = chart.patient;
  if (!open)
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-[#9aa8b8] bg-[#e4e9ef] py-2" aria-label="Patient panel (collapsed)">
        <button onClick={onToggle} data-tooltip="Show patient panel" aria-label="Show patient panel" className="grid h-7 w-7 place-items-center rounded border border-[#9aa8b8] bg-white text-[#2b4468] hover:bg-[#eef2f6]">
          »
        </button>
        <Avatar chart={chart} bits={bits} size={32} />
        {bits.allergic && (
          <span data-tooltip={`Allergies: ${bits.allergyText}`} className="rounded-sm bg-[#c62828] px-1 text-xs font-bold text-white">
            Alg
          </span>
        )}
      </aside>
    );
  return (
    <aside className="flex w-[11.5rem] shrink-0 flex-col overflow-y-auto border-r border-[#9aa8b8] bg-[#f2f5f8] text-[13px] leading-snug" aria-label="Patient panel">
      <div className="flex items-start gap-2 border-b border-[#b9c4d1] bg-[#e4e9ef] p-2">
        <Avatar chart={chart} bits={bits} size={44} />
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-bold leading-tight text-[#10253f]">{bits.display}</div>
          <div className="mt-0.5 text-xs text-[#44556b]">
            {p.age} y.o. {bits.sexLabel}
            {p.pronouns ? ` (${p.pronouns})` : ""}
          </div>
        </div>
        <button onClick={onToggle} data-tooltip="Hide patient panel" aria-label="Hide patient panel" className="grid h-6 w-6 shrink-0 place-items-center rounded border border-[#9aa8b8] bg-white text-[#2b4468] hover:bg-[#eef2f6]">
          «
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 px-2 py-1.5 text-xs">
        <dt className="text-[#5d6b7c]">DOB</dt>
        <dd className="font-medium text-[#1a1a1a]">{bits.dob}</dd>
        <dt className="text-[#5d6b7c]">MRN</dt>
        <dd className="font-medium text-[#1a1a1a]">{bits.mrn}</dd>
        {bits.code && (
          <>
            <dt className="text-[#5d6b7c]">Code</dt>
            <dd className="font-medium text-[#1a1a1a]">{bits.code}</dd>
          </>
        )}
      </dl>

      <Head tone={bits.allergic ? "red" : undefined}>Allergies</Head>
      <div className={`px-2 py-1.5 ${bits.allergic ? "font-semibold text-[#b00000]" : "text-[#1a1a1a]"}`}>{bits.allergyText || "Not on file"}</div>

      {bits.pcp && (
        <>
          <Head>PCP</Head>
          <div className="px-2 py-1.5">
            <div className="font-medium text-[#1a1a1a]">{bits.pcp.who}</div>
            {bits.pcp.role && <div className="text-xs text-[#5d6b7c]">{bits.pcp.role}</div>}
          </div>
        </>
      )}

      <Head>Reason for visit</Head>
      <div className="px-2 py-1.5 text-[#1a1a1a]">{chart.chiefComplaint}</div>

      <Head>Problem list</Head>
      <div className="px-2 py-1.5">
        {bits.problems.length === 0 ? (
          <span className="text-xs italic text-[#5d6b7c]">None on file</span>
        ) : (
          <ul className="list-disc space-y-0.5 pl-4">
            {bits.problems.slice(0, 4).map((x, i) => (
              <li key={i} data-tooltip={x} className="text-[#1a1a1a]">
                <span className="line-clamp-2">{x}</span>
              </li>
            ))}
          </ul>
        )}
        {bits.problems.length > 4 && (
          <button onClick={() => onGo("snapshot")} className={`mt-1 text-xs ${LINK}`}>
            +{bits.problems.length - 4} more
          </button>
        )}
      </div>

      <Head>Last vitals</Head>
      <div className="px-2 py-1.5">
        {bits.vitals ? (
          <>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
              {bits.vitals.pairs.slice(0, 7).map((x, i) => (
                <div key={i} className="contents">
                  <span className="text-[#5d6b7c]">{x.k}</span>
                  <span className="font-medium text-[#1a1a1a]">{x.v}</span>
                </div>
              ))}
            </div>
            {bits.vitals.context && <div className="mt-1 text-xs italic text-[#5d6b7c]">{bits.vitals.context}</div>}
          </>
        ) : (
          <span className={bits.vitalsRaw ? "text-xs text-[#1a1a1a]" : "text-xs italic text-[#5d6b7c]"}>{bits.vitalsRaw || "None recorded"}</span>
        )}
      </div>
    </aside>
  );
}
