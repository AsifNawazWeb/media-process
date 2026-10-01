import { CheckCircle2, Loader2, AlertTriangle, X } from "lucide-react";
import { useQueue } from "@/lib/queue-store";
import { formatBytes } from "@/lib/utils";
import type { QueueItem, ProcessStage } from "@/lib/types";

const STAGE_LABEL: Record<ProcessStage, string> = {
  queued: "Queued",
  decoding: "Decoding",
  matting: "AI matting",
  composing: "Composing",
  encoding: "Encoding",
  ready: "Ready",
  error: "Failed",
};

export function QueueList() {
  const items = useQueue((s) => s.items);
  const activeId = useQueue((s) => s.activeId);
  const setActive = useQueue((s) => s.setActive);
  const remove = useQueue((s) => s.remove);

  if (items.length === 0) return null;

  return (
    <ul className="flex max-h-full flex-col gap-1.5 overflow-y-auto p-1.5">
      {items.map((item) => {
        const url = item.originalUrl ?? "";
        return (
          <li key={item.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActive(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActive(item.id);
                }
              }}
              className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2 py-2 text-left transition ${
                activeId === item.id
                  ? "border-accent/60 bg-accent/10"
                  : "border-ink-700/70 bg-ink-850 hover:border-ink-600 hover:bg-ink-800"
              } ${item.stage === "error" ? "border-bad/50" : ""}`}
            >
              <Thumb url={url} stage={item.stage} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Icon stage={item.stage} />
                  <span className="truncate text-[12.5px] font-medium text-ink-100">{item.name}</span>
                </div>
                <StageRow item={item} />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(item.id);
                }}
                className="rounded-md p-1 text-ink-400 opacity-0 transition group-hover:opacity-100 hover:bg-ink-700 hover:text-ink-100 focus-visible:opacity-100"
                aria-label={`Remove ${item.name}`}
              >
                <X size={13} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Thumb({ url, stage }: { url: string; stage: ProcessStage }) {
  return (
    <div className="checker-bg relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-ink-700">
      {url ? (
         
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="h-full w-full bg-ink-800" />
      )}
      {stage !== "ready" && stage !== "queued" && (
        <div className="absolute inset-0 grid place-items-center bg-black/50">
          <Loader2 size={13} className="animate-spin text-white" />
        </div>
      )}
    </div>
  );
}

function Icon({ stage }: { stage: ProcessStage }) {
  if (stage === "ready") return <CheckCircle2 size={12} className="shrink-0 text-ok" />;
  if (stage === "error") return <AlertTriangle size={12} className="shrink-0 text-bad" />;
  return <Loader2 size={12} className="shrink-0 animate-spin text-accent" />;
}

function StageRow({ item }: { item: QueueItem }) {
  const busy =
    item.stage === "decoding" || item.stage === "matting" || item.stage === "composing" || item.stage === "encoding";
  const label =
    item.stage === "error" && item.error
      ? truncate(item.error, 34)
      : (item.note ?? STAGE_LABEL[item.stage]);
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <span className={`text-[11px] ${item.stage === "error" ? "text-bad" : "text-ink-400"}`}>
        {label}
      </span>
      <span className="text-[11px] text-ink-500">·</span>
      <span className="text-[11px] text-ink-500">{formatBytes(item.size)}</span>
      {busy && (
        <div className="relative ml-auto h-1 w-14 overflow-hidden rounded-full bg-ink-700">
          <div
            className={item.progress > 0 ? "h-full rounded-full bg-accent transition-all" : "bar-shimmer h-full w-full bg-accent/70"}
            style={item.progress > 0 ? { width: `${Math.round(item.progress * 100)}%` } : undefined}
          />
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
