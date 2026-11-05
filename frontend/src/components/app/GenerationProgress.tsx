import { Check, Circle, LoaderCircle, AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
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
  collecting_evidence: "Collecting evidence",
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
const groupReportStages = ["preparing", "collecting_evidence", "generating", "saving"];

export function GenerationProgressPanel({
  job,
  synthesis = false,
  report = false,
  reconnecting = false,
  submitting = false,
  limited = false,
  trackingError,
  mascot,
}: {
  job?: GenerationJob<unknown> | null;
  synthesis?: boolean;
  report?: boolean;
  reconnecting?: boolean;
  submitting?: boolean;
  limited?: boolean;
  trackingError?: string;
  mascot?: ReactNode;
}) {
  const stages = report ? groupReportStages : synthesis ? synthesisStages : evaluationStages;
  const progress = job?.progress;
  const terminal = job?.status === "succeeded" || job?.status === "failed";
  const label = (stage: string) => {
    if (report && stage === "preparing") return "Preparing report";
    if (report && stage === "generating") return "Writing the report";
    if (synthesis && stage === "preparing") return "Preparing individual insights";
    return labels[stage] ?? stage;
  };
  const headline = trackingError
    ? "Progress unavailable"
    : submitting
      ? report
        ? "Submitting report"
        : "Submitting evaluation"
      : !job
        ? report
          ? "Recovering report progress"
          : "Recovering evaluation progress"
        : job.status === "queued"
          ? "Queued — waiting to start"
          : job.status === "failed"
            ? "Could not complete"
            : job.status === "succeeded"
              ? limited
                ? "Completed with limitations"
                : report
                  ? "Report saved"
                  : synthesis
                    ? "Individual insights completed"
                    : "Evaluation saved"
              : progress
                ? label(progress.stage)
                : "Starting";
  return (
    <div
      className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"
      data-testid={
        report ? "report-progress" : synthesis ? "synthesis-progress" : "evaluation-progress"
      }
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={
          mascot ? "flex flex-col items-center px-2 pb-5 text-center" : "flex items-start gap-3"
        }
      >
        {mascot ??
          (job?.status === "failed" || trackingError ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          ) : terminal ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <LoaderCircle
              className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ))}
        <div className={mascot ? "mt-3" : undefined}>
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
        <div
          className={`flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-8 ${
            mascot ? "border-t border-slate-200 pt-4 dark:border-slate-700" : "mt-4"
          }`}
        >
          {[0, 1].map((column) => (
            <ol
              key={column}
              className={`grid gap-y-2.5 ${column === 1 ? "sm:ml-auto" : ""}`}
              aria-label={column === 0 ? "Generation steps" : undefined}
            >
              {stages
                .filter((_, index) => index % 2 === column)
                .map((stage) => {
                  const done = progress.completed.includes(stage);
                  const active = progress.stage === stage && !done;
                  const Icon = done ? Check : active && !terminal ? LoaderCircle : Circle;
                  return (
                    <li
                      key={stage}
                      className={`flex items-center gap-2 text-xs ${
                        active
                          ? "font-semibold text-foreground"
                          : done
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }`}
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
          ))}
        </div>
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
