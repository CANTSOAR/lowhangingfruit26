"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

/** Where the mouth is in a portrait, as fractions of the image: centre, and the face width. */
export interface Mouth {
  x: number;
  y: number;
  w: number;
  /** Mouth width, as a fraction of the image width. */
  mw: number;
  /** False when the keypoints were too noisy to trust the lip line: stretch only, no dark slit. */
  slit: boolean;
}

// Portraits are AI-generated photos with the face anywhere from 25% to 45% down the frame, so the mouth is
// located per image with a small face detector. It loads on demand; if it cannot, the portrait still moves
// (head motion only) and nothing else changes.
interface Detector {
  detect(img: HTMLImageElement): {
    detections: {
      boundingBox?: { width: number };
      keypoints?: { x: number; y: number }[];
    }[];
  };
}
let detectorP: Promise<Detector | null> | null = null;
const found = new Map<string, Mouth | null>();

function loadDetector(): Promise<Detector | null> {
  detectorP ||= (async () => {
    try {
      const mod = await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ `${MP}/vision_bundle.mjs`
      );
      const fileset = await mod.FilesetResolver.forVisionTasks(`${MP}/wasm`);
      return (await mod.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: "IMAGE",
      })) as Detector;
    } catch (e) {
      console.warn("[avatar] face detector unavailable:", (e as Error).message);
      return null;
    }
  })();
  return detectorP;
}

async function locateMouth(img: HTMLImageElement): Promise<Mouth | null> {
  const key = img.currentSrc || img.src;
  if (found.has(key)) return found.get(key)!;
  let m: Mouth | null = null;
  try {
    const det = await loadDetector();
    let d = det?.detect(img).detections[0];
    let refined = false;
    if (
      det &&
      d?.boundingBox &&
      d.boundingBox.width / img.naturalWidth < 0.28
    ) {
      // Small faces get noisy keypoints: look again at an upscaled crop around the first hit and map back.
      const bb = d.boundingBox as {
        originX?: number;
        originY?: number;
        width: number;
        height?: number;
      };
      const side = Math.min(img.naturalWidth, bb.width * 2.6);
      const cx = (bb.originX ?? 0) + bb.width / 2,
        cy = (bb.originY ?? 0) + (bb.height ?? bb.width) / 2;
      const x0 = Math.max(0, Math.min(img.naturalWidth - side, cx - side / 2)),
        y0 = Math.max(0, Math.min(img.naturalHeight - side, cy - side / 2));
      const c = document.createElement("canvas");
      c.width = c.height = 384;
      c.getContext("2d")?.drawImage(img, x0, y0, side, side, 0, 0, 384, 384);
      const d2 = det.detect(c as unknown as HTMLImageElement).detections[0];
      if (d2?.boundingBox && d2.keypoints?.length) {
        const k = side / 384;
        refined = true;
        d = {
          boundingBox: { width: d2.boundingBox.width * k },
          keypoints: d2.keypoints.map((p) => ({
            x: (x0 + p.x * 384 * k) / img.naturalWidth,
            y: (y0 + p.y * 384 * k) / img.naturalHeight,
          })),
        };
      }
    }
    const mouth = d?.keypoints?.[3]; // BlazeFace order: eyes, nose, mouth, ears
    if (d && mouth && d.boundingBox) {
      const w = d.boundingBox.width / img.naturalWidth;
      const [e1, e2] = [d.keypoints?.[0], d.keypoints?.[1]];
      // Mouth width from the eye distance when we have it (about 0.85x), else a fraction of the face.
      const eyes =
        e1 && e2
          ? Math.hypot(
              (e1.x - e2.x) * img.naturalWidth,
              (e1.y - e2.y) * img.naturalHeight,
            ) / img.naturalWidth
          : 0;
      const mw =
        eyes > 0.05
          ? Math.min(0.62 * w, Math.max(0.3 * w, eyes * 0.85))
          : 0.45 * w;
      m = { x: mouth.x, y: mouth.y, w, mw, slit: !refined };
      if (
        m.x < 0.2 ||
        m.x > 0.8 ||
        m.y < 0.15 ||
        m.y > 0.7 ||
        m.w < 0.1 ||
        m.w > 0.7
      )
        m = null; // implausible, stay still
    }
  } catch {
    m = null;
  }
  found.set(key, m);
  return m;
}

/**
 * The patient's portrait, animated while they speak. `level` returns the current mouth openness (0-1) and is
 * polled every frame only while `talking`; styles are written straight to the DOM so speech never re-renders React.
 */
function Photo({
  src,
  alt,
  fill,
  imgRef,
  onLoad,
}: {
  src: string;
  alt: string;
  fill: boolean;
  imgRef?: React.Ref<HTMLImageElement>;
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      onLoad={onLoad}
      draggable={false}
      className={`absolute inset-0 h-full w-full ${fill ? "object-fill" : "object-cover object-[50%_30%]"}`}
    />
  );
}

export default function TalkingPortrait({
  src,
  alt,
  talking,
  enabled,
  level,
}: {
  src: string;
  alt: string;
  talking: boolean;
  enabled: boolean;
  level: () => number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const jaw = useRef<HTMLDivElement>(null);
  const gap = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{
    w: number;
    h: number;
    l: number;
    t: number;
    ar: number;
  } | null>(null);
  const [mouth, setMouth] = useState<Mouth | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // The photo may finish loading before React attaches (server-rendered), so also check on attach.
  const imgRef = useCallback((el: HTMLImageElement | null) => {
    img.current = el;
    if (el?.complete && el.naturalWidth)
      setNatural((n) => n || { w: el.naturalWidth, h: el.naturalHeight });
  }, []);
  const mouthRef = useRef<Mouth | null>(null);
  const live = useRef({ level, mouth, geo });
  useEffect(() => {
    live.current = { level, mouth, geo };
    mouthRef.current = mouth;
  });

  // Lay the stage over exactly the area the cropped photo occupies (object-cover, anchored 50% / 30%).
  useEffect(() => {
    const el = box.current;
    if (!el || !natural) return;
    const fit = () => {
      const W = el.clientWidth,
        H = el.clientHeight;
      if (!W || !H) return;
      const s = Math.max(W / natural.w, H / natural.h);
      const w = natural.w * s,
        h = natural.h * s;
      // Before the mouth is found, the plain 50% / 30% crop. After, slide the crop (inside the image) so the
      // mouth sits above the captions and call controls along the bottom.
      const t = mouthRef.current
        ? Math.min(0, Math.max(H - h, H * 0.5 - mouthRef.current.y * h))
        : (H - h) * 0.3;
      setGeo({ w, h, l: (W - w) * 0.5, t, ar: natural.w / natural.h });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [natural, mouth]);

  useEffect(() => {
    if (!enabled || !natural || !img.current) return;
    let dead = false;
    locateMouth(img.current).then((m) => !dead && setMouth(m));
    return () => {
      dead = true;
    };
  }, [enabled, natural, src]);

  useEffect(() => {
    if (!talking) return;
    const [st, jw, gp] = [stage.current, jaw.current, gap.current];
    let raf = 0,
      cur = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const reduce =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
        document.documentElement.dataset.motion === "reduced";
      if (st && reduce) st.style.transform = "";
      const { level, mouth, geo } = live.current;
      let target = 0;
      try {
        target = level();
      } catch {}
      // Open quickly, close a little slower, so it reads as a jaw and not a flicker.
      cur += (target - cur) * (target > cur ? 0.55 : 0.28);
      const sec = (now - t0) / 1000;
      if (st && !reduce) {
        const rot =
          Math.sin(sec * 1.1) * 0.35 + cur * 0.25 * Math.sin(sec * 2.3);
        st.style.transform = `translateY(${(-cur * 1.2).toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${(1.012 + cur * 0.006).toFixed(4)})`;
      }
      if (mouth && geo && jw) {
        // The lower face stretches down from the lip line (nothing moves at the line itself), and a thin
        // dark slit opens on it. The slit is absent for faces whose lip line could not be placed reliably.
        const lv = reduce ? 0 : cur;
        const fw = mouth.w * geo.w;
        jw.style.transform = `scaleY(${(1 + lv * 0.1).toFixed(4)})`;
        if (gp) {
          gp.style.opacity = String(
            Math.min(0.9, Math.max(0, lv - 0.08) * 1.5),
          );
          gp.style.transform = `translate(-50%, -50%) scaleY(${Math.max(0.05, lv).toFixed(3)})`;
          gp.style.height = `${(fw * 0.035).toFixed(2)}px`;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      // Settle back to rest instead of freezing mid-word.
      if (st) st.style.transform = "";
      if (jw) jw.style.transform = "";
      if (gp) gp.style.opacity = "0";
    };
  }, [talking, mouth]);

  const fw = mouth && geo ? mouth.w * geo.w : 0; // face width in px
  const place: React.CSSProperties = geo
    ? { left: geo.l, top: geo.t, width: geo.w, height: geo.h }
    : { inset: 0 };
  if (geo && mouth) place.transition = "top 400ms ease-in-out";
  const lipY = mouth && geo ? mouth.y * geo.h - fw * 0.03 : 0; // the keypoint sits a little below the line between the lips
  const cx = mouth && geo ? mouth.x * geo.w : 0;
  const half = fw * 0.42,
    feather = fw * 0.14;
  // Hard top edge exactly at the lip line; feathered at the sides and bottom only.
  const mask = `linear-gradient(to bottom, transparent ${lipY}px, #000 ${lipY}px, #000 ${lipY + fw * 0.3}px, transparent ${lipY + fw * 0.62}px), linear-gradient(to right, transparent ${cx - half}px, #000 ${cx - half + feather}px, #000 ${cx + half - feather}px, transparent ${cx + half}px)`;

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <div
        ref={stage}
        className="absolute will-change-transform [transform-origin:50%_85%]"
        style={place}
      >
        <Photo
          src={src}
          alt={alt}
          fill={!!geo}
          imgRef={imgRef}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
        />
        {mouth && geo && (
          <>
            {/* The lower face again, opaque from the lip line down, stretched from the lip line. */}
            <div
              ref={jaw}
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                transformOrigin: `50% ${lipY}px`,
                WebkitMaskImage: mask,
                maskImage: mask,
                WebkitMaskComposite: "source-in",
                maskComposite: "intersect",
              }}
            >
              <Photo src={src} alt="" fill={!!geo} />
            </div>
            {/* The dark of an open mouth, on the lip line. */}
            {mouth.slit && (
              <div
                ref={gap}
                aria-hidden
                className="pointer-events-none absolute opacity-0"
                style={{
                  left: cx,
                  top: lipY,
                  width: mouth.mw * geo.w * 0.7,
                  height: fw * 0.035,
                  borderRadius: "50%",
                  transform: "translate(-50%, -50%) scaleY(0.05)",
                  transformOrigin: "50% 50%",
                  background:
                    "radial-gradient(ellipse at center, rgba(34,10,12,0.95) 30%, rgba(34,10,12,0.5) 70%, transparent 100%)",
                  filter: "blur(0.6px)",
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
