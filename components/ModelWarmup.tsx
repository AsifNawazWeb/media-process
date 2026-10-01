"use client";

import { useEffect, useState } from "react";
import { Cpu, HardDriveDownload, Info, ShieldCheck } from "lucide-react";
import { publicPath, preloadModel } from "@/lib/ai";
import { useSettings } from "@/lib/settings-store";

type WarmState = "checking" | "idle" | "loading" | "ready" | "missing";

/**
 * Warm-up card shown while the studio is idle: `preload()` downloads wasm +
 * the selected model into the browser cache so the first real matte doesn't
 * stall. Verifies /imgly assets are actually deployed.
 */
export function ModelWarmup() {
  const model = useSettings((s) => s.settings.model);
  const [state, setState] = useState<WarmState>("checking");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let alive = true;
    // asynchronous adoption — no synchronous setState in the effect body
    void (async () => {
      try {
        const res = await fetch(`${publicPath()}resources.json`, { method: "HEAD" });
        if (alive) setState(res.ok ? "idle" : "missing");
      } catch {
        if (alive) setState("missing");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function warm() {
    setState("loading");
    setPct(0);
    try {
      await preloadModel(model, (_key, current, total) => {
        if (total > 0) setPct(Math.round((current / total) * 100));
      });
      setState("ready");
    } catch {
      setState("missing");
    }
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-2xl rounded-xl border border-ink-700/70 bg-ink-900/60 p-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
            state === "ready"
              ? "bg-ok/15 text-ok"
              : state === "missing"
                ? "bg-bad/15 text-bad"
                : "bg-accent/15 text-accent"
          }`}
        >
          {state === "ready" ? <ShieldCheck size={17} /> : state === "missing" ? <Info size={17} /> : <Cpu size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-medium text-ink-100">
            {state === "missing" ? "AI model assets not found" : "Local AI engine"}
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">
            {state === "missing" ? (
              <>
                public/imgly is empty or unreachable. Run{" "}
                <code className="rounded bg-ink-800 px-1 font-mono text-[11px] text-ink-200">npm run setup:model</code>{" "}
                to vendor the ONNX/WASM assets, then restart the dev server.
              </>
            ) : state === "ready" ? (
              <>Model warmed up in cache — the first cutout will start instantly.</>
            ) : state === "loading" ? (
              <>Downloading model… {pct}% (one-time, cached by the browser)</>
            ) : state === "checking" ? (
              <>Checking local assets…</>
            ) : (
              <>
                ISNet segmentation runs <strong className="text-ink-200">entirely in your browser</strong> via
                WebAssembly. Model data is served from this app and cached after first use — nothing is ever uploaded.
              </>
            )}
          </p>

          {state === "loading" && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-700">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}

          {(state === "idle" || state === "checking") && (
            <button onClick={warm} className="btn-ghost mt-3 text-accent">
              <HardDriveDownload size={13} /> Preload model
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
