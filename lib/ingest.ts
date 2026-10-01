import { useQueue } from "@/lib/queue-store";
import { kick } from "@/lib/processor";

/** Add files to the queue and wake the processor. */
export function ingestFiles(files: File[]): void {
  if (files.length === 0) return;
  useQueue.getState().addFiles(files);
  setTimeout(kick, 30);
}
