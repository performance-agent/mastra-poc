import { Building2, Layers } from "lucide-react";
import type { EvaluatorScope } from "@/lib/types";

export function EvaluatorScopeBadge({ scope }: { scope: EvaluatorScope }) {
  const workspace = scope === "WORKSPACE";
  const Icon = workspace ? Building2 : Layers;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${workspace ? "border-[var(--brand)]/20 bg-[var(--brand-soft)] text-[var(--brand-ink)]" : "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300"}`}
    >
      <Icon aria-hidden="true" className="size-3" />
      {workspace ? "Workspace" : "Project"}
    </span>
  );
}
