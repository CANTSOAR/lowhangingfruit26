"use client";
import { useEffect, useRef, type ReactNode } from "react";
/** Native modal supplies focus trapping, Escape, and focus restoration. */
export default function Dialog({
  open,
  onClose,
  title,
  children,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={() => onClose()}
      onClose={onClose}
      className="learning-dialog w-[calc(100%_-_2rem)] max-w-2xl rounded-3xl p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60"
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button
          type="button"
          aria-label={
            busy ? "Close dialog; processing continues" : "Close dialog"
          }
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xl disabled:opacity-30"
        >
          ×
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}
