"use client";

import { useState } from "react";
import { Check, ChevronDown, Gauge, Layers, Palette, Pipette } from "lucide-react";
import { useSettings } from "@/lib/settings-store";
import { BG_PRESETS, normalizeHex, resolveBackground } from "@/lib/utils";
import type { OutputFormat } from "@/lib/types";
import { useQueue } from "@/lib/queue-store";

const FORMATS: { id: OutputFormat; label: string }[] = [
  { id: "webp", label: "WebP" },
  { id: "png", label: "PNG" },
  { id: "jpg", label: "JPG" },
  { id: "avif", label: "AVIF" },
];

export function Toolbar() {
  const settings = useSettings((s) => s.settings);
  const setBackground = useSettings((s) => s.setBackground);
  const setCustomColor = useSettings((s) => s.setCustomColor);
  const setFormat = useSettings((s) => s.setFormat);
  const setQuality = useSettings((s) => s.setQuality);
  const setModel = useSettings((s) => s.setModel);

  const items = useQueue((s) => s.items);

  const [hexDraft, setHexDraft] = useState(settings.customColor);
  // derive draft from external store synchronously on each render
  const [lastSynced, setLastSynced] = useState(settings.customColor);
  if (lastSynced !== settings.customColor) {
    setLastSynced(settings.customColor);
    setHexDraft(settings.customColor);
  }

  const lossless = settings.format === "png";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-ink-700 bg-ink-900 px-4 py-2.5">
      {/* Background */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
          <Palette size={12} /> Background
        </span>
        <div className="flex items-center gap-1.5">
          {BG_PRESETS.map((p) => (
            <button
              key={p.kind}
              onClick={() => setBackground(p.kind)}
              title={p.label}
              className={`swatch ${settings.background === p.kind ? "swatch-active" : ""}`}
              aria-pressed={settings.background === p.kind}
            >
              {p.kind === "transparent" ? (
                <span className="checker-bg h-full w-full rounded-[4px]" />
              ) : (
                <span className="h-full w-full rounded-[4px]" style={{ background: p.swatch }} />
              )}
              {settings.background === p.kind && (
                <span className="absolute -right-0.5 -bottom-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-accent text-white">
                  <Check size={9} strokeWidth={3} />
                </span>
              )}
            </button>
          ))}

          {/* custom color */}
          <label
            className={`swatch relative cursor-pointer ${settings.background === "custom" ? "swatch-active" : ""}`}
            title="Custom color"
          >
            <span
              className="h-full w-full rounded-[4px]"
              style={{ background: resolveBackground(settings) ?? "#ffffff" }}
            />
            <Pipette size={10} className="absolute inset-0 m-auto text-white mix-blend-difference" />
            <input
              type="color"
              value={settings.customColor}
              onChange={(e) => {
                setCustomColor(e.target.value);
                setBackground("custom");
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>

          <div
            className={`flex items-center rounded-md border bg-ink-850 px-2 transition ${
              settings.background === "custom" ? "border-accent/60" : "border-ink-700"
            }`}
          >
            <span className="text-[11px] text-ink-400">#</span>
            <input
              value={hexDraft.replace(/^#/, "")}
              placeholder="hex"
              spellCheck={false}
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={() => {
                const norm = normalizeHex(hexDraft);
                if (norm) {
                  setCustomColor(norm);
                  setBackground("custom");
                } else {
                  setHexDraft(settings.customColor);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const norm = normalizeHex(hexDraft);
                  if (norm) {
                    setCustomColor(norm);
                    setBackground("custom");
                    (e.target as HTMLInputElement).blur();
                  }
                }
              }}
              className="w-14 bg-transparent py-1 text-[12px] font-mono text-ink-100 outline-none"
              maxLength={6}
            />
          </div>
        </div>
      </div>

      <Divider />

      {/* Format */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">Format</span>
        <div className="flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                settings.format === f.id
                  ? "bg-accent text-white shadow"
                  : "text-ink-300 hover:bg-ink-700 hover:text-ink-100"
              }`}
              aria-pressed={settings.format === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quality */}
      <div
        className={`flex min-w-36 flex-1 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1 sm:max-w-40 ${
          lossless ? "opacity-45" : ""
        }`}
        title={lossless ? "PNG is lossless — quality slider not applicable" : undefined}
      >
        <Gauge size={12} className="shrink-0 text-ink-400" />
        <input
          type="range"
          min={1}
          max={100}
          value={settings.quality}
          disabled={lossless}
          onChange={(e) => setQuality(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--color-accent)]"
          aria-label="Quality"
        />
        <span className="w-8 text-right font-mono text-[11.5px] text-ink-200">{settings.quality}</span>
      </div>

      <Divider />

      {/* Model */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
          <Layers size={12} /> Model
        </span>
        <Select
          value={settings.model}
          onChange={(v) => setModel(v as typeof settings.model)}
          options={[
            { value: "isnet_fp16", label: "Balanced · ~88MB" },
            { value: "isnet_quint8", label: "Fast · ~44MB" },
          ]}
          disabled={items.some(
            (i) => i.stage !== "ready" && i.stage !== "error" && i.stage !== "queued",
          )}
        />
      </div>

      <span className="ml-auto hidden text-[11px] text-ink-500 xl:block">
        Runs fully on-device · nothing is uploaded
      </span>
    </div>
  );
}

function Divider() {
  return <span className="hidden h-5 w-px bg-ink-700 sm:block" />;
}

function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-ink-700 bg-ink-850 py-1 pr-7 pl-2.5 text-[12px] text-ink-100 outline-none transition hover:border-ink-600 focus:border-accent/60 disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-400"
      />
    </div>
  );
}
