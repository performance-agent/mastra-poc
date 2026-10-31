import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Share2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EvaluatorMark } from "@/components/app/EvaluatorMark";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { GenerationProgressPanel } from "@/components/app/GenerationProgress";
import { GroupGithubActivityReportRenderer } from "@/components/app/GroupGithubActivityReportRenderer";
import { GroupGithubHistoryReportRenderer } from "@/components/app/GroupGithubHistoryReportRenderer";
import { GroupReportRenderer } from "@/components/app/GroupReportRenderer";
import { LoadingState } from "@/components/app/LoadingState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";
import type {
  Evaluator,
  GenerationJob,
  GroupGithubActivityReport,
  GroupGithubHistoryReport,
  GroupReport,
  PerformanceReport,
} from "@/lib/types";

type ReportRow = PerformanceReport<
  GroupReport | GroupGithubActivityReport | GroupGithubHistoryReport
>;

type Run = { evaluatorId: string; jobId: string; startedAt: number };

function reportEvaluatorId(report: ReportRow) {
  if (report.evaluatorId) return report.evaluatorId;
  if (report.type !== "GROUP_REPORT") return null;
  return (report.data as GroupReport).evaluator?.id ?? null;
}

export function ReportsPanel({
  groupId,
  onOpenEvaluators,
  canDelete = false,
}: {
  groupId: string;
  onOpenEvaluators: () => void;
  canDelete?: boolean;
}) {
  const qc = useQueryClient();
  const evaluatorsQ = useQuery({
    queryKey: ["group", groupId, "evaluators"],
    queryFn: () => api.listEvaluators(groupId),
  });
  const reportsQ = useQuery({
    queryKey: ["group", groupId, "reports"],
    queryFn: () => api.listGroupReports(groupId),
  });
  const evaluators = evaluatorsQ.data ?? [];
  const reports = reportsQ.data ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const seeded = useRef(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const [focus, setFocus] = useState<string>("general");
  const [openedReportId, setOpenedReportId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (seeded.current || evaluatorsQ.data == null || evaluatorsQ.data.length === 0) return;
    seeded.current = true;
    setPicked(evaluatorsQ.data.map((evaluator) => evaluator.id));
  }, [evaluatorsQ.data]);

  const activeJobsQ = useQuery({
    queryKey: ["group", groupId, "active-jobs"],
    queryFn: () => api.listActiveGroupReports(groupId),
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!activeJobsQ.isFetched || activeJobsQ.isFetching) return;
    const incoming = activeJobsQ.data ?? [];
    const known = new Set(runsRef.current.map((run) => run.jobId));
    const added = incoming.filter((job) => !known.has(job.jobId));
    if (added.length === 0) return;
    setRuns((current) => {
      const ids = new Set(current.map((run) => run.jobId));
      const extra = added.filter((job) => !ids.has(job.jobId));
      if (extra.length === 0) return current;
      return [
        ...current,
        ...extra.map((job) => ({
          evaluatorId: job.evaluatorId,
          jobId: job.jobId,
          startedAt: Date.now(),
        })),
      ];
    });
    if (runsRef.current.length === 0) {
      setOpenedReportId(null);
      setFocus(added[0].evaluatorId);
    }
  }, [activeJobsQ.data, activeJobsQ.isFetched, activeJobsQ.isFetching]);

  const jobQueries = useQueries({
    queries: runs.map((run) => ({
      queryKey: ["group", groupId, "generation-job", run.jobId],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.getGroupGenerationJob(groupId, run.jobId, signal),
      refetchInterval: (query: { state: { data?: GenerationJob<unknown> } }) =>
        query.state.data?.status === "succeeded" || query.state.data?.status === "failed"
          ? false
          : 1000,
    })),
  });

  const jobs = useMemo(() => {
    const map = new Map<string, GenerationJob<unknown>>();
    runs.forEach((run, index) => {
      const job = jobQueries[index]?.data;
      if (job) map.set(run.evaluatorId, job);
    });
    return map;
  }, [jobQueries, runs]);

  const finishedKey = runs
    .map((run) => `${run.jobId}:${jobs.get(run.evaluatorId)?.status ?? "pending"}`)
    .join("|");

  useEffect(() => {
    if (!finishedKey.includes("succeeded")) return;
    void qc.invalidateQueries({ queryKey: ["group", groupId, "reports"] });
  }, [finishedKey, groupId, qc]);

  const entries = useMemo(() => {
    const roster = evaluatorsQ.data ?? [];
    const saved = reportsQ.data ?? [];
    const rows: Array<{ key: string; label: string; evaluator: Evaluator | null }> = roster.map(
      (evaluator) => ({
        key: evaluator.id,
        label: evaluator.name,
        evaluator,
      }),
    );
    if (saved.some((report) => !reportEvaluatorId(report))) {
      rows.push({ key: "general", label: "General", evaluator: null });
    }
    return rows;
  }, [evaluatorsQ.data, reportsQ.data]);

  useEffect(() => {
    if (focus !== "general") return;
    if (entries.some((entry) => entry.key === "general")) return;
    if (entries[0]) setFocus(entries[0].key);
  }, [entries, focus]);

  const focusedReports = reports.filter((report) => {
    const id = reportEvaluatorId(report);
    return focus === "general" ? !id : id === focus;
  });
  const shown = focusedReports.find((report) => report.id === openedReportId) ?? null;
  const focusEvaluator = evaluators.find((evaluator) => evaluator.id === focus) ?? null;
  const focusRun = runs.find((run) => run.evaluatorId === focus) ?? null;
  const focusJob = focusRun ? jobs.get(focusRun.evaluatorId) : undefined;
  const showProgress = Boolean(focusRun) && focusJob?.status !== "succeeded";

  const cancelQueued = async () => {
    if (!focusRun || focusJob?.status !== "queued") return;
    setCancelling(true);
    try {
      await api.cancelQueuedGroupReport(groupId, focusRun.jobId);
      const jobId = focusRun.jobId;
      setRuns((current) => current.filter((run) => run.jobId !== jobId));
      qc.setQueryData(
        ["group", groupId, "active-jobs"],
        (current: Array<{ jobId: string }> | undefined) =>
          current?.filter((job) => job.jobId !== jobId) ?? [],
      );
      toast.success("Report cancelled");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCancelling(false);
    }
  };

  const generate = async () => {
    if (picked.length === 0) {
      toast.error("Choose at least one evaluator");
      return;
    }
    setSubmitting(true);
    const startedAt = Date.now();
    try {
      const response = await api.startEvaluatorReports(groupId, picked);
      setRuns((current) => [
        ...current.filter((run) => !picked.includes(run.evaluatorId)),
        ...response.jobs.map((job) => ({
          evaluatorId: job.evaluatorId,
          jobId: job.jobId,
          startedAt,
        })),
      ]);
      setOpenedReportId(null);
      setPickerOpen(false);
      setFocus(response.jobs[0]?.evaluatorId ?? focus);
      toast.success(
        response.jobs.length === 1 ? "Report started" : `${response.jobs.length} reports started`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const renameReport = async (title: string | null) => {
    if (!shown) return;
    try {
      await api.updateReport(shown.id, { title });
      await qc.invalidateQueries({ queryKey: ["group", groupId, "reports"] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const removeReport = async () => {
    if (!deleteReportId) return;
    setDeleting(true);
    try {
      await api.deleteReport(deleteReportId);
      if (openedReportId === deleteReportId) {
        const remaining = focusedReports.filter((report) => report.id !== deleteReportId);
        setOpenedReportId(remaining[0]?.id ?? null);
      }
      setDeleteReportId(null);
      await qc.invalidateQueries({ queryKey: ["group", groupId, "reports"] });
      toast.success("Report deleted");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  if (evaluatorsQ.isLoading || reportsQ.isLoading) return <LoadingState />;
  if (evaluatorsQ.error || reportsQ.error) {
    return (
      <ErrorState
        message={errorMessage(evaluatorsQ.error ?? reportsQ.error)}
        onRetry={() => {
          void evaluatorsQ.refetch();
          void reportsQ.refetch();
        }}
      />
    );
  }

  async function sharePage() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Reports", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this page");
    }
  }

  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="No reports yet"
          description="Create an evaluator, then generate a report."
          actionLabel={evaluators.length === 0 ? "Open evaluators" : undefined}
          onAction={evaluators.length === 0 ? onOpenEvaluators : undefined}
        />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
          <Card className="h-fit rounded-xl p-3 shadow-card">
            <div className="space-y-4">
              {entries.map((entry) => {
                const status = jobs.get(entry.key)?.status;
                const selected = focus === entry.key;
                const generating = status === "running" || status === "queued";
                const count = reports.filter((report) =>
                  entry.key === "general"
                    ? !reportEvaluatorId(report)
                    : reportEvaluatorId(report) === entry.key,
                ).length;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => {
                      setFocus(entry.key);
                      setOpenedReportId(null);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 text-left transition-[padding] duration-300 ${
                      selected
                        ? "py-3 text-foreground"
                        : "py-2 text-muted-foreground hover:text-foreground"
                    }`}
                    onMouseEnter={() => setHoveredKey(entry.key)}
                    onMouseLeave={() =>
                      setHoveredKey((current) => (current === entry.key ? null : current))
                    }
                  >
                    {entry.evaluator ? (
                      <EvaluatorMark
                        name={entry.evaluator.name}
                        avatar={entry.evaluator.avatar}
                        state={
                          generating ? "thinking" : hoveredKey === entry.key ? "hover" : "idle"
                        }
                        size={selected ? 48 : 36}
                      />
                    ) : (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        G
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {entry.label}
                      </span>
                      <span className="block text-[11px]">
                        {status === "queued"
                          ? "Queued"
                          : status === "running"
                            ? "Generating"
                            : `${count} reports`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid gap-2">
              <Button onClick={() => setPickerOpen(true)} disabled={evaluators.length === 0}>
                <FileText className="mr-1.5 h-4 w-4" /> Generate
              </Button>
              <Button variant="outline" onClick={() => void sharePage()}>
                <Share2 className="mr-1.5 h-4 w-4" /> Share
              </Button>
            </div>
          </Card>

          <div className="min-w-0 space-y-4">
            {shown ? (
              <>
                {shown.type === "GROUP_REPORT" ? (
                  <GroupReportRenderer
                    report={shown as PerformanceReport<GroupReport>}
                    onBack={() => setOpenedReportId(null)}
                    canDelete={canDelete}
                    onRename={canDelete ? (title) => void renameReport(title) : undefined}
                    onDelete={() => setDeleteReportId(shown.id)}
                  />
                ) : (
                  <>
                    <ReportHistoryBar
                      currentId={shown.id}
                      history={focusedReports}
                      canDelete={canDelete}
                      onOpenReport={setOpenedReportId}
                      onBack={() => setOpenedReportId(null)}
                      onDelete={() => setDeleteReportId(shown.id)}
                    />
                    {shown.type === "GITHUB_HISTORY" ? (
                      <GroupGithubHistoryReportRenderer
                        report={shown as PerformanceReport<GroupGithubHistoryReport>}
                      />
                    ) : (
                      <GroupGithubActivityReportRenderer
                        report={shown as PerformanceReport<GroupGithubActivityReport>}
                      />
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {showProgress && focusRun && (
                  <div>
                    <GenerationProgressPanel
                      report
                      mascot={
                        focusEvaluator ? (
                          <EvaluatorMark
                            name={focusEvaluator.name}
                            avatar={focusEvaluator.avatar}
                            state={focusJob?.status === "failed" ? "idle" : "generating"}
                            size={128}
                          />
                        ) : null
                      }
                      job={
                        focusJob ?? {
                          id: focusRun.jobId,
                          status: "queued",
                          progress: null,
                          result: null,
                          error: null,
                        }
                      }
                    />
                    {focusJob?.status === "queued" && canDelete && (
                      <div className="-mt-3 mb-4 flex justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={cancelling}
                          onClick={() => void cancelQueued()}
                        >
                          {cancelling ? "Cancelling..." : "Cancel"}
                        </Button>
                      </div>
                    )}
                    {focusJob?.status === "failed" && (
                      <p className="-mt-3 mb-2 text-sm text-red-700">
                        {focusJob.error ?? "Generation failed"}
                      </p>
                    )}
                  </div>
                )}
                {focusedReports.length === 0 ? (
                  <Card className="rounded-xl p-8 text-center shadow-card">
                    <p className="text-sm text-muted-foreground">
                      {focusEvaluator
                        ? `${focusEvaluator.name} does not have a report yet.`
                        : "No report for this evaluator yet."}
                    </p>
                  </Card>
                ) : (
                  <Card className="rounded-xl p-2 shadow-card">
                    {focusedReports.map((report, index) => (
                      <div key={report.id}>
                        {index > 0 && <div className="mx-3 h-px bg-border" />}
                        <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => setOpenedReportId(report.id)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-3 py-3 text-left"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {report.title?.trim() ||
                                  (report.createdAt
                                    ? new Date(report.createdAt).toLocaleString()
                                    : "Report")}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {report.title?.trim() && report.createdAt
                                  ? new Date(report.createdAt).toLocaleString()
                                  : report.type === "GROUP_REPORT"
                                    ? "Group report"
                                    : report.type === "GITHUB_HISTORY"
                                      ? "GitHub history"
                                      : "GitHub activity"}
                              </span>
                            </span>
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </button>
                          {canDelete && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="mr-1 shrink-0 hover:bg-red-600 hover:text-white"
                              aria-label="Delete report"
                              onClick={() => setDeleteReportId(report.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate reports</DialogTitle>
            <DialogDescription>
              Each selected evaluator writes its own report. They run one after another.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-80 gap-2 overflow-y-auto">
            {evaluators.map((evaluator) => {
              const checked = picked.includes(evaluator.id);
              return (
                <label
                  key={evaluator.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      setPicked((current) =>
                        value === true
                          ? [...current, evaluator.id]
                          : current.filter((id) => id !== evaluator.id),
                      )
                    }
                  />
                  <EvaluatorMark name={evaluator.name} avatar={evaluator.avatar} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{evaluator.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {evaluator.scope === "WORKSPACE" ? "Workspace" : "Project"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={generate} disabled={submitting || picked.length === 0}>
              {submitting ? "Starting..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteReportId !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteReportId(null);
        }}
        title="Delete this report?"
        description="The report is removed from this project. This does not change the evaluator."
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        destructive
        onConfirm={() => void removeReport()}
      />
    </div>
  );
}

function ReportHistoryBar({
  currentId,
  history,
  canDelete,
  onOpenReport,
  onBack,
  onDelete,
}: {
  currentId: string;
  history: ReportRow[];
  canDelete: boolean;
  onOpenReport: (id: string) => void;
  onBack: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      {history.length > 1 ? (
        <select
          aria-label="Report date"
          value={currentId}
          onChange={(event) => onOpenReport(event.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {history.map((report) => (
            <option key={report.id} value={report.id}>
              {report.createdAt ? new Date(report.createdAt).toLocaleString() : "Report"}
            </option>
          ))}
        </select>
      ) : null}
      {canDelete && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="hover:bg-red-600 hover:text-white"
          onClick={onDelete}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
        </Button>
      )}
    </div>
  );
}
