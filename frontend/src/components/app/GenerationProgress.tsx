import { Check, Circle, LoaderCircle, AlertCircle } from "lucide-react";
import type { GenerationJob } from "@/lib/types";

const labels: Record<string, string> = {
  preparing: "Preparing evaluation",
  rule_input: "Validating rules",
  resource_catalog: "Loading available resources",
  rule_understanding: "Interpreting rules",
  resource_selection: "Selecting resources",
  resource_operation_deduplication: "Combining evidence requests",
  evaluation_plan: "Planning evaluation",
  resource_execution: "Collecting evidence",
  rule_assessment: "Assessing rules and contributions",
  saving: "Saving report",
  generating: "Generating individual insights",
  validating: "Validating individual insights",
  finalizing: "Finalizing individual insights",
};
const evaluationStages = [
  "preparing",
  "rule_input",
  "resource_catalog",
  "rule_understanding",
  "resource_selection",
  "resource_operation_deduplication",
  "evaluation_plan",
  "resource_execution",
  "rule_assessment",
  "saving",
];
const synthesisStages = ["preparing", "generating", "validating", "finalizing"];

export function GenerationProgressPanel({
  job,
  synthesis = false,
  reconnecting = false,
  submitting = false,
  limited = false,
  trackingError,
}: {
  job?: GenerationJob<unknown> | null;
  synthesis?: boolean;
  reconnecting?: boolean;
  submitting?: boolean;
  limited?: boolean;
  trackingError?: string;
}) {
  const stages = synthesis ? synthesisStages : evaluationStages;
  const progress = job?.progress;
  const terminal = job?.status === "succeeded" || job?.status === "failed";
  const label = (stage: string) =>
    synthesis && stage === "preparing" ? "Preparing individual insights" : (labels[stage] ?? stage);
  const headline = trackingError
    ? "Progress unavailable"
    : submitting
      ? "Submitting evaluation"
      : !job
        ? "Recovering evaluation progress"
        : job.status === "queued"
          ? "Queued — waiting to start"
          : job.status === "failed"
            ? "Could not complete"
            : job.status === "succeeded"
              ? limited
                ? "Completed with limitations"
                : synthesis
                  ? "Individual insights completed"
                  : "Evaluation saved"
              : progress
                ? label(progress.stage)
                : "Starting";
  return (
    <div
      className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"
      data-testid={synthesis ? "synthesis-progress" : "evaluation-progress"}
    >
      <div role="status" aria-live="polite" aria-atomic="true" className="flex items-start gap-3">
        {job?.status === "failed" || trackingError ? (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
        ) : terminal ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <LoaderCircle
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        <div>
          <p className="text-sm font-semibold">{headline}</p>
          {progress && (
            <p className="mt-1 text-xs text-muted-foreground">
              {progress.completed.length} of {progress.total} steps completed
            </p>
          )}
          {reconnecting && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Connection interrupted. Retrying progress updates…
            </p>
          )}
        </div>
      </div>
      {trackingError && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {trackingError}
        </p>
      )}
      {progress && (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Generation steps">
          {stages.map((stage) => {
            const done = progress.completed.includes(stage);
            const active = progress.stage === stage && !done;
            const Icon = done ? Check : active && !terminal ? LoaderCircle : Circle;
            return (
              <li
                key={stage}
                className={`flex items-center gap-2 text-xs ${active ? "font-semibold" : "text-muted-foreground"}`}
              >
                <Icon
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 shrink-0 ${done ? "text-emerald-600" : active && !terminal ? "animate-spin motion-reduce:animate-none" : ""}`}
                />
                <span>
                  {label(stage)}
                  <span className="sr-only">
                    :{" "}
                    {done
                      ? "completed"
                      : active
                        ? terminal
                          ? "stopped"
                          : "in progress"
                        : terminal
                          ? "not executed"
                          : "pending"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {job?.status === "failed" && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {job.error ?? "Generation failed"}
          {synthesis ? ". The saved evaluation and grades remain available." : ""}
        </p>
      )}
    </div>
  );
}
