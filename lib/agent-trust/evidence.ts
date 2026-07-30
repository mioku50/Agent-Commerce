import { createHash } from "node:crypto";
import type { EvidenceItem } from "./types.ts";

export function createEvidenceItem(
  input: Omit<EvidenceItem, "id">,
): EvidenceItem {
  const id = createHash("sha256")
    .update([
      input.category,
      input.signal,
      input.title,
      input.detail,
      input.source,
      input.observedAt,
    ].join("\n"))
    .digest("hex")
    .slice(0, 20);
  return { id: `ev_${id}`, ...input };
}
export function evidenceConfidence(
  items: readonly EvidenceItem[],
): "high" | "medium" | "low" {
  const sources = new Set(items.map((item) => item.source));
  if (items.length >= 5 && sources.size >= 2) return "high";
  if (items.length >= 2) return "medium";
  return "low";
}
