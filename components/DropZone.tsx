"use client";

import { useEffect, useRef, useState } from "react";
import { ImageDown, ImagePlus, ShieldCheck, Wand2 } from "lucide-react";
import { ingestFiles } from "@/lib/ingest";
import { INPUT_ACCEPT } from "@/lib/types";

/**
 * Global drag/drop + paste ingestion. Mount exactly once (see app/page.tsx) so
 * files can be added whether or not the empty-state DropZone is rendered.
 */
export function useGlobalFileDrop(): boolean {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      depth.current++;
      if (e.dataTransfer?.types.includes("Files")) setOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      depth.current--;
      if (depth.current <= 0) {
        depth.current = 0;
        setOver(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (e.dataTransfer?.files) ingestFiles(Array.from(e.dataTransfer.files));
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) ingestFiles(files);
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  return over;
}

export function DropZone() {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="w-full max-w-2xl">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={INPUT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          ingestFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-ink-100 sm:text-[28px]">
          Remove image backgrounds in seconds
        </h2>
        <p className="mx-auto mt-2.5 max-w-lg text-[13.5px] leading-relaxed text-ink-400">
          Add a photo and get a clean, transparent cutout. The AI runs entirely on your device — your
          images are never uploaded anywhere.
        </p>
      </div>

      <button
        onClick={() => inputRef.current?.click()}
        className="group mt-7 grid w-full place-items-center gap-4 rounded-2xl border-2 border-dashed border-ink-600 bg-ink-900/60 p-8 transition hover:border-accent/50 hover:bg-ink-850 sm:p-12"
      >
        <span className="grid h-14 w-14 place-items-center rounded-xl border border-ink-600 bg-ink-800 text-accent shadow-inner transition group-hover:border-accent/50">
          <ImagePlus size={24} />
        </span>
        <span className="text-center">
          <span className="block text-base font-medium text-ink-100">Drop your images here</span>
          <span className="mt-1.5 block text-[13px] text-ink-400">
            click to browse — or paste from the clipboard with{" "}
            <kbd className="rounded border border-ink-600 bg-ink-850 px-1.5 py-0.5 font-mono text-[11px] text-ink-300">
              Ctrl/Cmd-V
            </kbd>
          </span>
        </span>
      </button>

      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        <Step
          n={1}
          icon={<ImagePlus size={15} />}
          title="Add an image"
          text="Drag & drop, browse your files, or paste from the clipboard. Batch uploads welcome."
        />
        <Step
          n={2}
          icon={<Wand2 size={15} />}
          title="AI removes the background"
          text="ISNet segmentation runs in your browser via WebAssembly — fast and private."
        />
        <Step
          n={3}
          icon={<ImageDown size={15} />}
          title="Style & download"
          text="Pick a background color or keep it transparent, choose a format, then save."
        />
      </ol>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11.5px] text-ink-500">
        <ShieldCheck size={13} className="text-ink-400" />
        Supports PNG, JPG, WebP, HEIC & TIFF · no uploads, no accounts, no limits
      </p>
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  text,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <li className="rounded-xl border border-ink-700/70 bg-ink-900/50 p-3.5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
          {icon}
        </span>
        <span className="text-[10.5px] font-semibold tracking-wider text-ink-500 uppercase">
          Step {n}
        </span>
      </div>
      <h3 className="mt-2.5 text-[13px] font-medium text-ink-100">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-400">{text}</p>
    </li>
  );
}
