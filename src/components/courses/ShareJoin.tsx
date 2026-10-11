"use client";
import { useState } from "react";
import { Button } from "@/components/ui";

/** Join link and QR code for a course. `qr` is an SVG string generated on the server from the link. */
export default function ShareJoin({ link, qr, code }: { link: string; qr: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3 p-4">
      <div
        role="img"
        aria-label="QR code for the class join link"
        className="mx-auto aspect-square w-full max-w-[14rem] overflow-hidden rounded-md border border-slate-200 bg-white [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: qr }}
      />
      <input readOnly value={link} aria-label="Join link" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700" />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard unavailable: the link is selectable above */
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a href={`/join/${code}/qr.svg`} download={`join-${code}.svg`} className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50">
          Download SVG
        </a>
      </div>
    </div>
  );
}
