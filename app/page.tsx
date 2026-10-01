"use client";

import { useEffect, useRef } from "react";
import { useQueue } from "@/lib/queue-store";
import { useSettings } from "@/lib/settings-store";
import { DropZone, useGlobalFileDrop } from "@/components/DropZone";
import { QueueList } from "@/components/QueueList";
import { Toolbar } from "@/components/Toolbar";
import { ResultView } from "@/components/ResultView";
import { Header } from "@/components/Header";
import { Toasts } from "@/components/Toasts";
import { ModelWarmup } from "@/components/ModelWarmup";
import { kick, recompose } from "@/lib/processor";
import type { QueueItem } from "@/lib/types";

export default function Studio() {
  const items = useQueue((s) => s.items);
  const activeId = useQueue((s) => s.activeId);
  const active = items.find((i) => i.id === activeId) ?? items[0] ?? null;
  const over = useGlobalFileDrop();

  // Persisted settings are rehydrated client-side only (avoids hydration mismatch).
  useEffect(() => {
    void useSettings.persist.rehydrate();
  }, []);

  // Kick the processing pump whenever new queued items appear.
  useEffect(() => {
    const queued = items.filter((i) => i.stage === "queued").length;
    if (queued > 0) kick();
  }, [items]);

  // Re-style matted items (debounced) when visual settings change.
  const settings = useSettings((s) => s.settings);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const targets = useQueue.getState().items.filter((i) => i.cutoutKey);
      void (async () => {
        for (const target of targets) {
          try {
            await recompose(target.id, { activate: false, silent: true });
          } catch {
            /* processor reports errors */
          }
        }
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [settings.background, settings.customColor, settings.format, settings.quality]);

  const hasItems = items.length > 0;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      {over && (
        <div className="pointer-events-none fixed inset-0 z-40 ring-2 ring-inset ring-accent/60" />
      )}
      <Header />
      <div className="flex min-h-0 flex-1">
        {hasItems && (
          <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900/60 lg:flex">
            <QueueList />
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col bg-ink-950">
          {!hasItems ? (
            <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-10 sm:py-14">
              <DropZone />
              <ModelWarmup />
            </div>
          ) : active ? (
            <StudioWorkspace active={active} />
          ) : (
            <div className="grid flex-1 place-items-center text-ink-500">
              <span className="text-[13px]">Select an image from the queue</span>
            </div>
          )}
        </main>
      </div>
      <Toasts />
    </div>
  );
}

function StudioWorkspace({ active }: { active: QueueItem }) {
  return (
    <>
      <Toolbar />
      <ResultView key={active.id} item={active} />
    </>
  );
}
