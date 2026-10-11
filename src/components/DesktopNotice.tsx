"use client";

import { useState, useSyncExternalStore } from "react";

const KEY = "poscere.desktopNotice";

/** Small-screen notice, once per browser session. Never shown at md (768px) and wider. */
export default function DesktopNotice() {
  // False on the server and during hydration, then true on the client unless already dismissed.
  const allowed = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return !sessionStorage.getItem(KEY);
      } catch {
        return true;
      }
    },
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  if (!allowed || dismissed) return null;
  return (
    <div role="note" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs leading-snug text-amber-900 md:hidden">
      <p className="flex-1">Poscere is designed for a desktop browser. It works on a phone, but the chart and visit are easier on a larger screen.</p>
      <button
        type="button"
        aria-label="Dismiss this notice"
        className="-my-1 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded text-lg text-amber-800 hover:bg-amber-100"
        onClick={() => {
          try {
            sessionStorage.setItem(KEY, "1");
          } catch {
            /* storage unavailable: the notice returns on the next page */
          }
          setDismissed(true);
        }}
      >
        ×
      </button>
    </div>
  );
}
