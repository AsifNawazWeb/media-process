import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useQueue } from "@/lib/queue-store";

export function Toasts() {
  const toasts = useQueue((s) => s.toasts);
  const dismiss = useQueue((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <ToastBar key={t.id} id={t.id} kind={t.kind} text={t.text} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastBar({
  id,
  kind,
  text,
  onDismiss,
}: {
  id: string;
  kind: "ok" | "error" | "info";
  text: string;
  onDismiss: (id: string) => void;
}) {
  const Icon = kind === "error" ? AlertTriangle : kind === "ok" ? CheckCircle2 : Info;
  const tone =
    kind === "error"
      ? "border-bad/40 bg-bad/10 text-bad"
      : kind === "ok"
        ? "border-ok/40 bg-ok/10 text-ok"
        : "border-ink-600 bg-ink-800 text-ink-200";
  return (
    <div
      id={`toast-${id}`}
      className={`pointer-events-auto flex animate-toast-in items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] leading-snug shadow-xl shadow-black/40 backdrop-blur ${tone}`}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{text}</div>
      <button
        onClick={() => onDismiss(id)}
        className="mt-0.5 shrink-0 opacity-60 transition hover:opacity-100"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
