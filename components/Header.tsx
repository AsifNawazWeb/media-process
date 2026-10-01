"use client";

import { useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Package, Scissors, Trash2, Zap } from "lucide-react";
import { useQueue } from "@/lib/queue-store";
import { useSettings } from "@/lib/settings-store";
import { downloadZip, saveSingle } from "@/lib/exporter";
import { kick } from "@/lib/processor";
import { ingestFiles } from "@/lib/ingest";
import { outputLabel, outputName } from "@/lib/utils";
import { INPUT_ACCEPT, type QueueItem } from "@/lib/types";

export function Header() {
  const items = useQueue((s) => s.items);
  const clearAll = useQueue((s) => s.clearAll);
  const toast = useQueue((s) => s.toast);
  const activeId = useQueue((s) => s.activeId);
  const setActive = useQueue((s) => s.setActive);
  const settings = useSettings((s) => s.settings);

  const ready = items.filter((i) => i.stage === "ready");
  const busy = items.some((i) => i.stage !== "ready" && i.stage !== "error" && i.stage !== "queued");
  const [zipping, setZipping] = useState(false);
  const [zipDone, setZipDone] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = items.find((i) => i.id === activeId) ?? items[0] ?? null;

  async function onZip() {
    if (zipping) return;
    setZipDone(0);
    setZipping(true);
    try {
      const res = await downloadZip((p) => setZipDone(p.done));
      if (res.ok) toast("ok", `ZIP saved with ${res.count} image${res.count > 1 ? "s" : ""}.`);
      else toast("error", "Nothing processed to export yet.");
    } catch (err) {
      toast("error", `ZIP failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setZipping(false);
    }
  }

  function onRetry(item: QueueItem) {
    // keep blobs of the original only
    useQueue.getState().patch(item.id, { stage: "queued", error: undefined, note: undefined, progress: 0 });
    kick();
  }

  return (
    <header className="flex items-center gap-3 border-b border-ink-700 bg-ink-900 px-4 py-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
        <Scissors size={16} />
      </span>
      <div className="min-w-0">
        <h1 className="text-[14px] leading-tight font-semibold text-ink-50">
          Cutout Studio
        </h1>
        <p className="hidden text-[11px] leading-tight text-ink-400 sm:block">
          On-device background removal & format conversion
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {items.length > 1 && (
          <select
            value={active?.id ?? ""}
            onChange={(e) => setActive(e.target.value)}
            aria-label="Active image"
            className="max-w-40 truncate rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-[12px] text-ink-100 outline-none lg:hidden"
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        )}

        {busy && (
          <span className="hidden items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-[11.5px] text-accent sm:flex">
            <Loader2 size={12} className="animate-spin" />
            Processing…
          </span>
        )}

        {active && active.stage === "error" && (
          <button onClick={() => onRetry(active)} className="btn-ghost text-warn hover:bg-warn/10">
            <Zap size={13} /> Retry
          </button>
        )}

        {active?.stage === "ready" && (
          <button
            onClick={() => {
              if (saveSingle(active)) {
                toast("ok", `Saved ${outputName(active.name, settings.format, outputLabel(settings))}.`);
              }
            }}
            className="btn-ghost"
            title="Download this image"
          >
            <Download size={13} /> Save
          </button>
        )}

        {ready.length > 1 && (
          <button
            onClick={onZip}
            disabled={zipping || busy}
            className="btn-primary"
            title="Pack all processed images into a .zip"
          >
            {zipping ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {zipDone > 0 ? `Zipping ${zipDone}…` : "Zipping…"}
              </>
            ) : (
              <>
                <Package size={14} /> Download ZIP ({ready.length})
              </>
            )}
          </button>
        )}

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
        <button
          onClick={() => inputRef.current?.click()}
          className="btn-ghost"
          title="Add images"
        >
          <ImagePlus size={13} /> Add
        </button>

        {items.length > 0 && (
          <button onClick={clearAll} className="btn-ghost" title="Clear queue">
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>
    </header>
  );
}
