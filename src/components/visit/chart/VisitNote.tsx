"use client";

import type { ChartView } from "@/lib/engine/encounter";
import { type Result } from "./derive";
import { Bar, Empty, NewBadge, TD, TH, Value } from "./ui";

/** The visit note in progress: what the student has elicited and ordered so far, filed by section. */
export function VisitNote({ chart, fresh, newIds, resultWhen }: { chart: ChartView; fresh: Set<string>; newIds: Set<string>; resultWhen: (r: Result) => string }) {
  const empty = chart.sections.length === 0 && chart.results.length === 0;
  return (
    <div className="space-y-2 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border border-[#b9c4d1] bg-[#f2f5f8] px-3 py-2">
        <div>
          <div className="text-sm font-bold text-[#10253f]">Telehealth visit note</div>
          <div className="text-xs text-[#5d6b7c]">{chart.chiefComplaint}</div>
        </div>
        <span className="rounded-sm bg-[#fff4c2] px-2 text-xs font-bold leading-5 text-[#4a3800]">In progress</span>
      </div>
      {empty && (
        <div className="border border-[#b9c4d1] bg-white">
          <Empty>Nothing documented yet. What the patient tells you is filed here as you go.</Empty>
        </div>
      )}
      {chart.sections.map((s) => (
        <Bar key={s.category} title={s.label} right={<span className="text-xs text-[#44556b]">{s.items.length}</span>}>
          <ul>
            {s.items.map((it, i) => (
              <li key={it.id} className={`flex items-start gap-2 px-3 py-1.5 text-sm text-[#1a1a1a] ${i % 2 ? "bg-[#f5f8fb]" : ""} ${fresh.has(it.id) ? "flash-new" : ""}`}>
                <span className="mt-0.5 w-12 shrink-0 text-xs tabular-nums text-[#5d6b7c]" data-tooltip={it.how === "record" ? "Already on record from an earlier encounter" : `Turn ${it.turn}`}>
                  {it.how === "record" ? "On file" : `T${it.turn}`}
                </span>
                <span className="min-w-0 flex-1">{it.text}</span>
              </li>
            ))}
          </ul>
        </Bar>
      ))}
      {chart.results.length > 0 && (
        <Bar title="Objective: exams and results" right={<span className="text-xs text-[#44556b]">{chart.results.length}</span>}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${TH} w-1/3`}>Item</th>
                <th className={TH}>Finding</th>
              </tr>
            </thead>
            <tbody>
              {chart.results.map((r) => (
                <tr key={r.id} className={`border-b border-[#e3e9ef] odd:bg-white even:bg-[#f5f8fb] ${fresh.has(r.id) ? "flash-new" : ""}`}>
                  <td className={`${TD} font-semibold text-[#10253f]`}>
                    {r.name} {newIds.has(r.id) && <NewBadge />}
                    <div className="text-xs font-normal text-[#5d6b7c]">{resultWhen(r)}</div>
                  </td>
                  <td className={`${TD} whitespace-pre-wrap`}>{r.abnormal ? <Value v={r.result} flag="A" /> : r.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bar>
      )}
    </div>
  );
}

/** Chronological log of everything released during the visit. */
export function ActivityLog({ chart, logWhen }: { chart: ChartView; logWhen: (l: ChartView["log"][number]) => string }) {
  return (
    <div className="p-2">
      <Bar title="Chart activity" right={<span className="text-xs text-[#44556b]">{chart.log.length} entries</span>}>
        {chart.log.length === 0 ? (
          <Empty>Nothing yet. Everything released to you in this visit is listed here, in order.</Empty>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${TH} w-28`}>When</th>
                <th className={`${TH} w-24`}>Type</th>
                <th className={TH}>Entry</th>
              </tr>
            </thead>
            <tbody>
              {chart.log.map((l, i) => (
                <tr key={i} className="border-b border-[#e3e9ef] odd:bg-white even:bg-[#f5f8fb]">
                  <td className={`${TD} whitespace-nowrap text-xs text-[#5d6b7c]`}>{logWhen(l)}</td>
                  <td className={`${TD} text-xs font-semibold ${l.kind === "fact" ? "text-[#1a5eb0]" : l.kind === "result" ? "text-[#9a5b00]" : "text-[#5b3aa6]"}`}>{l.kind === "fact" ? "History" : l.kind === "result" ? "Result" : "Document"}</td>
                  <td className={`${TD} text-[#1a1a1a]`}>{l.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bar>
    </div>
  );
}
