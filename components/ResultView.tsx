"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Columns2,
  Eye,
  Loader2,
  Maximize2,
  MoveHorizontal,
  RefreshCw,
  SplitSquareHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useSettings } from "@/lib/settings-store";
import { useQueue } from "@/lib/queue-store";
import { kick } from "@/lib/processor";
import { previewUrl } from "@/lib/blobcache";
import { formatBytes, resolveBackground } from "@/lib/utils";
import type { PreviewMode, ProcessStage, QueueItem } from "@/lib/types";

type ViewMode = "result" | PreviewMode;

/** Keep images at ~65% of the viewport, and never taller than the free space. */
const IMG_FIT = "max-h-[min(65vh,calc(100dvh-15rem))] max-w-full object-contain";
const IMG_FIT_PAIR = "max-h-[min(65vh,calc(100dvh-15rem))] max-w-[38vw] object-contain";

const STAGE_META: Record<ProcessStage, { label: string; detail: string }> = {
  queued: { label: "Queued", detail: "Waiting for the processor to pick this up…" },
  decoding: { label: "Decoding image", detail: "Reading pixels and preparing the canvas…" },
  matting: {
    label: "Removing background",
    detail: "The AI is separating the subject from the background…",
  },
  composing: { label: "Applying background", detail: "Placing the cutout on your chosen background…" },
  encoding: { label: "Encoding output", detail: "Compressing the final image…" },
  ready: { label: "Ready", detail: "" },
  error: { label: "Failed", detail: "" },
};

const STEPS: { key: ProcessStage; label: string }[] = [
  { key: "decoding", label: "Decode" },
  { key: "matting", label: "Cutout" },
  { key: "composing", label: "Style" },
  { key: "encoding", label: "Export" },
];

const BUSY: ProcessStage[] = ["queued", "decoding", "matting", "composing", "encoding"];

/**
 * Result viewer. While the pipeline runs it shows a compact fade-in progress
 * card; once ready it shows the processed image only, sized to fit the screen,
 * with an optional side-by-side / split comparison against the original.
 */
export function ResultView({ item }: { item: QueueItem }) {
  const settings = useSettings((s) => s.settings);
  const [view, setView] = useState<ViewMode>("result");
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [split, setSplit] = useState(50);
  const [panning, setPanning] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef({ x: 0, y: 0 });

  const [origUrl, setOrigUrl] = useState("");
  useEffect(() => {
    // originalUrl comes from an external cache; adopt it asynchronously
    const t = setTimeout(() => setOrigUrl(item.originalUrl ?? ""), 0);
    return () => clearTimeout(t);
  }, [item.originalUrl]);

  const [outUrl, setOutUrl] = useState("");
  // Resolve processed blob → object URL (synchronize external cache → state)
  useEffect(() => {
    let alive = true;
    let created = "";
    // async resolution avoids synchronous setState inside the effect body
    const t = setTimeout(() => {
      const url = previewUrl(item.processedKey);
      if (alive) {
        created = url;
        setOutUrl(url);
      } else {
        URL.revokeObjectURL(url);
      }
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
      if (created) URL.revokeObjectURL(created);
    };
  }, [item.processedKey]);

  const busy = BUSY.includes(item.stage);
  const canCompare = Boolean(origUrl && outUrl);
  // First run has no output yet → show the full progress card. Recompose keeps
  // showing the previous result so settings tweaks don't flash a loader.
  const showProgress = busy && !outUrl;
  const refreshing = busy && Boolean(outUrl);
  const bg = resolveBackground(settings);
  const checker = !bg;

  // wheel zoom
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(8, Math.max(0.1, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (showProgress || !outUrl) return;
    setPanning(true);
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!panning) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
  };
  const stopPan = () => setPanning(false);

  const resetView = () => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
    setSplit(50);
  };

  const meta = item.processedMeta;
  const dimText = useMemo(
    () =>
      meta
        ? `${meta.width}×${meta.height} · ${formatBytes(meta.bytes)} · ${meta.type.replace("image/", "").toUpperCase()}`
        : null,
    [meta],
  );

  const compareMode =
    view === "slider" && canCompare ? "slider" : view === "side" && canCompare ? "side" : "result";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopPan}
        onPointerLeave={stopPan}
        onDoubleClick={resetView}
        className={`relative grid min-h-0 flex-1 touch-none place-items-center overflow-hidden p-4 select-none sm:p-6 ${
          outUrl && !showProgress ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        {item.stage === "error" ? (
          <ErrorCard item={item} />
        ) : showProgress ? (
          <ProgressCard item={item} origUrl={origUrl} />
        ) : outUrl ? (
          <div
            className="grid max-h-full max-w-full place-items-center"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
          >
            {compareMode === "side" ? (
              <FitPair origUrl={origUrl} outUrl={outUrl} zoom={zoom} checker={checker} />
            ) : compareMode === "slider" ? (
              <FitSlider
                origUrl={origUrl}
                outUrl={outUrl}
                zoom={zoom}
                split={split}
                setSplit={setSplit}
                checker={checker}
              />
            ) : (
              <figure key={item.processedKey} className="animate-reveal max-h-full max-w-full">
                <img
                  src={outUrl}
                  alt="Processed result"
                  draggable={false}
                  className={`${IMG_FIT} rounded-lg border border-ink-700/70 transition-transform duration-150 ${
                    checker ? "checker-bg" : ""
                  }`}
                  style={{ transform: `scale(${zoom})` }}
                />
              </figure>
            )}
          </div>
        ) : (
          <Loader2 size={20} className="animate-spin text-ink-500" />
        )}
      </div>

      {/* status bar — only while a result exists */}
      {!showProgress && outUrl && (
        <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-ink-700 bg-ink-900/90 px-3 py-1.5 text-[11.5px] text-ink-400">
          <span className="flex items-center gap-1">
            <ZoomOut size={13} />
            <input
              type="range"
              min={0.1}
              max={8}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 accent-[var(--color-accent)]"
              aria-label="Zoom"
            />
            <ZoomIn size={13} />
          </span>
          <span className="w-10 text-ink-200">{Math.round(zoom * 100)}%</span>
          <Divider />
          <button
            onClick={resetView}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-ink-800 hover:text-ink-100"
          >
            <Maximize2 size={12} /> Reset view
          </button>
          <Divider />
          {refreshing ? (
            <span className="flex items-center gap-1.5 text-accent">
              <Loader2 size={12} className="animate-spin" /> Updating preview…
            </span>
          ) : (
            <span className="truncate">{dimText ?? "—"}</span>
          )}
          {item.scaledDown && item.scaledDown < 1 && (
            <span className="shrink-0 rounded bg-warn/15 px-1.5 py-0.5 text-warn">
              downscaled to {Math.round(item.scaledDown * 100)}%
            </span>
          )}

          <div className="ml-auto flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">
            <ViewTab active={view === "result"} onClick={() => setView("result")} icon={<Eye size={12} />}>
              Result
            </ViewTab>
            <ViewTab
              active={view === "side" && canCompare}
              disabled={!canCompare}
              onClick={() => setView("side")}
              icon={<Columns2 size={12} />}
            >
              Side by side
            </ViewTab>
            <ViewTab
              active={view === "slider" && canCompare}
              disabled={!canCompare}
              onClick={() => setView("slider")}
              icon={<SplitSquareHorizontal size={12} />}
            >
              Split
            </ViewTab>
          </div>
        </div>
      )}
    </div>
  );
}

function ViewTab({
  active,
  disabled,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={disabled ? "Available once the first result is ready" : undefined}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-ink-600 font-medium text-white" : "text-ink-300 hover:bg-ink-700 hover:text-ink-100"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function ProgressCard({ item, origUrl }: { item: QueueItem; origUrl: string }) {
  const stageIndex = STEPS.findIndex((s) => s.key === item.stage);
  const determinate = item.progress > 0.03;
  const pct = Math.round(item.progress * 100);
  const meta = STAGE_META[item.stage];

  return (
    <div className="glass-card animate-pop-in w-full max-w-sm rounded-2xl p-5">
      <div className="flex items-center gap-3.5">
        {origUrl ? (
          <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-ink-600 bg-ink-800">
            <img
              src={origUrl}
              alt=""
              draggable={false}
              className="h-full w-full scale-105 object-cover opacity-60 blur-[2px]"
            />
            <Loader2 size={16} className="absolute animate-spin text-white/90" />
          </span>
        ) : (
          <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
            <span className="animate-pulse-soft absolute inset-0 rounded-full bg-accent/25" />
            <Loader2 size={20} className="relative animate-spin" />
          </span>
        )}
        <div className="min-w-0 text-left">
          <h3 className="text-[14.5px] font-semibold text-ink-100">{meta.label}</h3>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-400">
            {item.note ?? meta.detail}
          </p>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink-700">
        {determinate ? (
          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        ) : (
          <div className="bar-shimmer h-full w-full rounded-full bg-accent/70" />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
        <span className="truncate text-ink-500">{item.name}</span>
        <span className="shrink-0 font-mono text-ink-300">{pct}%</span>
      </div>

      <ol className="mt-4 flex items-end gap-1.5">
        {STEPS.map((s, i) => {
          const done = stageIndex > i;
          const active = stageIndex === i;
          return (
            <li key={s.key} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={`h-1.5 w-full rounded-full ${
                  done ? "bg-accent" : active ? "bar-shimmer bg-accent/80" : "bg-ink-700"
                }`}
              />
              <span
                className={`text-[10.5px] ${active ? "text-accent" : done ? "text-ink-300" : "text-ink-500"}`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ErrorCard({ item }: { item: QueueItem }) {
  function retry() {
    useQueue.getState().patch(item.id, {
      stage: "queued",
      error: undefined,
      note: undefined,
      progress: 0,
    });
    kick();
  }

  return (
    <div className="glass-card animate-pop-in w-full max-w-sm rounded-2xl p-5 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bad/15 text-bad">
        <AlertTriangle size={20} />
      </span>
      <h3 className="mt-3.5 text-[15px] font-semibold text-ink-100">Couldn&apos;t process this image</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed break-words text-ink-400">
        {item.error ?? "Something went wrong."}
      </p>
      <button onClick={retry} className="btn-primary mx-auto mt-4">
        <RefreshCw size={13} /> Try again
      </button>
    </div>
  );
}

function FitPair({
  origUrl,
  outUrl,
  zoom,
  checker,
}: {
  origUrl: string;
  outUrl: string;
  zoom: number;
  checker: boolean;
}) {
  return (
    <div className="flex max-h-full max-w-full items-center justify-center gap-3 sm:gap-5">
      <figure className="relative min-w-0">
        <img
          src={origUrl}
          alt="Original"
          draggable={false}
          className={`${IMG_FIT_PAIR} rounded-lg border border-ink-700/70 transition-transform`}
          style={{ transform: `scale(${zoom})` }}
        />
        <figcaption className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/90">
          Original
        </figcaption>
      </figure>
      <figure key={outUrl} className="animate-reveal relative min-w-0">
        <img
          src={outUrl}
          alt="Processed"
          draggable={false}
          className={`${IMG_FIT_PAIR} rounded-lg border border-ink-700/70 transition-transform ${
            checker ? "checker-bg" : ""
          }`}
          style={{ transform: `scale(${zoom})` }}
        />
        <figcaption className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/90">
          Processed
        </figcaption>
      </figure>
    </div>
  );
}

function FitSlider({
  origUrl,
  outUrl,
  zoom,
  split,
  setSplit,
  checker,
}: {
  origUrl: string;
  outUrl: string;
  zoom: number;
  split: number;
  setSplit: (v: number) => void;
  checker: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragSplit, setDragSplit] = useState(false);

  useEffect(() => {
    if (!dragSplit) return;
    const move = (e: PointerEvent) => {
      const r = frameRef.current?.getBoundingClientRect();
      if (r) setSplit(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    };
    const up = () => setDragSplit(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragSplit, setSplit]);

  return (
    <div
      ref={frameRef}
      className="relative inline-grid max-h-full max-w-full place-items-center overflow-hidden rounded-lg"
    >
      <img
        src={outUrl}
        alt="Processed"
        draggable={false}
        className={`${IMG_FIT} rounded-lg ${checker ? "checker-bg" : ""}`}
        style={{ transform: `scale(${zoom})` }}
      />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
        <img
          src={origUrl}
          alt="Original"
          draggable={false}
          className="absolute inset-0 h-full w-full rounded-lg object-contain"
          style={{ transform: `scale(${zoom})` }}
        />
      </div>
      <div
        className="absolute inset-y-0 z-10 w-px cursor-ew-resize bg-white/80"
        style={{ left: `${split}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          setDragSplit(true);
        }}
      >
        <div className="absolute top-1/2 left-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-black/20 bg-white/95 shadow-lg">
          <MoveHorizontal size={14} className="text-ink-900" />
        </div>
      </div>
      <SplitLabels />
    </div>
  );
}

function SplitLabels() {
  return (
    <>
      <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/90">
        Original
      </span>
      <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/90">
        Processed
      </span>
    </>
  );
}

function Divider() {
  return <span className="h-3.5 w-px bg-ink-700" />;
}
