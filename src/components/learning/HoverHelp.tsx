"use client";
import { useEffect, useId, useRef } from "react";
/** Shared top-layer tooltip for short control help. No click is required. */
export default function HoverHelp() {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = popup.current;
    if (!tip) return;
    let owner: HTMLElement | null = null;
    let previousDescription: string | null = null;
    function hide() {
      tip!.hidePopover();
      if (owner) {
        if (previousDescription === null) owner.removeAttribute("aria-describedby");
        else owner.setAttribute("aria-describedby", previousDescription);
      }
      owner = null;
    }
    function show(element: HTMLElement) {
      const content = element.dataset.tooltip?.trim();
      if (!content) return hide();
      if (owner !== element) {
        hide(); owner = element;
        previousDescription = element.getAttribute("aria-describedby");
        element.setAttribute("aria-describedby", [previousDescription,id].filter(Boolean).join(" "));
      }
      tip!.textContent = content;
      tip!.style.width = `${Math.min(300,window.innerWidth-32)}px`;
      const rect = element.getBoundingClientRect();
      const above = rect.top - 16;
      const below = window.innerHeight - rect.bottom - 16;
      tip!.style.maxHeight = `${Math.max(24, Math.max(above, below))}px`;
      tip!.showPopover();
      tip!.style.left = `${Math.max(16,Math.min(rect.left+rect.width/2-tip!.offsetWidth/2,window.innerWidth-tip!.offsetWidth-16))}px`;
      tip!.style.top = `${above >= tip!.offsetHeight || above >= below ? Math.max(8, rect.top-tip!.offsetHeight-8) : rect.bottom+8}px`;
    }
    function enter(event: Event) {
      const target = event.target;
      if (!(target instanceof Element) || tip!.contains(target)) return;
      if (target.closest(".clinical-term, .term-help")) return hide();
      const element = target.closest<HTMLElement>("[data-tooltip]");
      if (element) show(element);
      else hide();
    }
    function leave(event: Event) {
      const next = (event as MouseEvent | FocusEvent).relatedTarget;
      if (next instanceof Node && (owner?.contains(next) || tip!.contains(next))) return;
      hide();
    }
    const observer = new MutationObserver(() => {if(owner?.isConnected) show(owner); else hide();});
    observer.observe(document.body,{attributes:true,subtree:true,attributeFilter:["data-tooltip"]});
    document.addEventListener("pointerover",enter);
    document.addEventListener("pointerout",leave);
    document.addEventListener("focusin",enter);
    document.addEventListener("focusout",leave);
    const escape = (event: KeyboardEvent) => {if(event.key === "Escape") hide();};
    document.addEventListener("keydown",escape);
    window.addEventListener("scroll",hide,true);
    window.addEventListener("resize",hide);
    return () => {
      hide(); observer.disconnect();
      document.removeEventListener("pointerover",enter);
      document.removeEventListener("pointerout",leave);
      document.removeEventListener("focusin",enter);
      document.removeEventListener("focusout",leave);
      document.removeEventListener("keydown",escape);
      window.removeEventListener("scroll",hide,true);
      window.removeEventListener("resize",hide);
    };
  },[id]);
  return <div ref={popup} id={id} popover="manual" role="tooltip" className="fixed m-0 overflow-auto rounded-xl border-0 bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-xl" />;
}
