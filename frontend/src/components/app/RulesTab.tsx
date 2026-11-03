import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { KnowledgeSourcePicker, ReportKnowledgeSources } from "./KnowledgeSources";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { EvaluationTree, type TreePhase } from "@/components/app/EvaluationTree";
import { LoadingState } from "@/components/app/LoadingState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { LeafStatus } from "@/lib/tree-growth";
import type {
  AssessmentVerdict,
  EvaluationReport,
  GenerationJob,
  RuleAssessment,
  RulePackage,
} from "@/lib/types";

const STAGE_LABELS: Record<string, string> = {
  preparing: "Preparing",
  rule_input: "Checking the rules",
  resource_catalog: "Loading sources",
  rule_understanding: "Interpreting the rules",
  resource_selection: "Choosing sources",
  resource_operation_deduplication: "Combining evidence requests",
  evaluation_plan: "Planning the evaluation",
  resource_execution: "Reading stored evidence",
  rule_assessment: "Judging each rule",
  saving: "Saving",
};

const VERDICT_LABEL: Record<AssessmentVerdict, string> = {
  supported: "Met",
  partially_supported: "Partial",
  not_supported: "Not met",
  not_evaluable: "No data",
};

function leafFromVerdict(verdict?: AssessmentVerdict): LeafStatus {
  if (verdict === "supported") return "pass";
  if (verdict === "partially_supported") return "partial";
  if (verdict === "not_supported") return "fail";
  return "no-data";
}

function viewFor(job?: GenerationJob<EvaluationReport> | null): {
  phase: TreePhase;
  failAt: "evidence" | "rules" | "judgment" | "crown" | null;
  status: string;
} {
  if (!job) return { phase: "idle", failAt: null, status: "Choose a rule package and run it." };
  if (job.status === "queued") return { phase: "idle", failAt: null, status: "Queued" };
  if (job.status === "failed") {
    const stage = job.progress?.stage;
    const failAt =
      stage === "saving"
        ? "crown"
        : stage === "rule_assessment"
          ? "judgment"
          : stage === "rule_understanding" || stage === "resource_selection"
            ? "rules"
            : "evidence";
    return { phase: "failed", failAt, status: job.error ?? "The evaluation stopped." };
  }
  if (job.status === "succeeded") return { phase: "done", failAt: null, status: "Saved" };
  const stage = job.progress?.stage;
  const done = new Set(job.progress?.completed ?? []);
  const status = stage ? (STAGE_LABELS[stage] ?? stage) : "Starting";
  if (stage === "rule_assessment" || stage === "saving" || done.has("rule_assessment")) {
    return { phase: "judgment", failAt: null, status };
  }
  if (
    done.has("rule_understanding") ||
    [
      "resource_selection",
      "resource_operation_deduplication",
      "evaluation_plan",
      "resource_execution",
    ].includes(stage ?? "")
  ) {
    return { phase: "rules", failAt: null, status };
  }
  if (stage) return { phase: "evidence", failAt: null, status };
  return { phase: "idle", failAt: null, status };
}

function verdictsFor(labels: string[], report?: EvaluationReport | null): LeafStatus[] {
  const assessments = Object.values(report?.assessments ?? {});
  return labels.map((label) =>
    leafFromVerdict(assessments.find((item) => item.ruleName === label)?.verdict),
  );
}

export function RulesTab({
  workspaceId,
  groupId,
  canManage,
}: {
  workspaceId: string;
  groupId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const packagesQ = useQuery({
    queryKey: ["workspace", workspaceId, "rule-packages"],
    queryFn: () => api.listRulePackages(workspaceId),
    enabled: canManage,
  });
  const historyQ = useQuery({
    queryKey: ["workspace", workspaceId, "evaluations", groupId],
    queryFn: () => api.listEvaluations(workspaceId, groupId),
    enabled: canManage,
  });
  const [selectedId, setSelectedId] = useState<string>();
  const [jobId, setJobId] = useState<string>();
  const [historyReport, setHistoryReport] = useState<EvaluationReport | null>(null);
  const [editor, setEditor] = useState<RulePackage | "new" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [knowledgeIds, setKnowledgeIds] = useState<string[] | null>(null);
  const submitted = useRef<string | undefined>(undefined);

  const latestQ = useQuery({
    queryKey: ["workspace", workspaceId, "latest-evaluation-job", groupId],
    queryFn: ({ signal }) => api.getLatestEvaluationJob(workspaceId, groupId, signal),
    enabled: canManage && !jobId,
    staleTime: 0,
  });
  useEffect(() => {
    if (!jobId && latestQ.data) setJobId(latestQ.data.id);
  }, [jobId, latestQ.data]);

  const jobQ = useQuery({
    queryKey: ["workspace", workspaceId, "evaluation-job", groupId, jobId],
    queryFn: ({ signal }) => api.getEvaluationJob(workspaceId, jobId!, signal),
    enabled: canManage && !!jobId,
    refetchInterval: (query) =>
      ["succeeded", "failed"].includes(query.state.data?.status ?? "") ? false : 2000,
  });
  const job = jobQ.data;
  const running = Boolean(job && ["queued", "running"].includes(job.status));

  useEffect(() => {
    if (!job || !["succeeded", "failed"].includes(job.status)) return;
    void queryClient.invalidateQueries({
      queryKey: ["workspace", workspaceId, "evaluations", groupId],
    });
    if (submitted.current === job.id) {
      submitted.current = undefined;
      if (job.status === "succeeded") toast.success("Evaluation saved");
      else toast.error(job.error ?? "Evaluation could not be completed");
    }
  }, [job, queryClient, workspaceId, groupId]);

  const packages = packagesQ.data ?? [];
  const selected = packages.find((item) => item.id === selectedId) ?? packages[0];
  const liveReport = job?.status === "succeeded" ? job.result : null;
  const report = historyReport ?? liveReport;
  const labels = historyReport
    ? Object.values(historyReport.assessments).map((item) => item.ruleName)
    : (selected?.rules.map((rule) => rule.name) ?? []);
  const shownLabels = labels.length > 0 ? labels : (selected?.rules.map((rule) => rule.name) ?? []);
  const view = historyReport
    ? { phase: "done" as const, failAt: null, status: "Saved" }
    : viewFor(job);

  if (!canManage) {
    return (
      <EmptyState
        title="Workspace admins run rule evaluations"
        description="A rule package checks each rule against the stored evidence and keeps a separate result."
      />
    );
  }
  if (packagesQ.isLoading) return <LoadingState />;
  if (packagesQ.error) {
    return (
      <ErrorState message={errorMessage(packagesQ.error)} onRetry={() => packagesQ.refetch()} />
    );
  }

  const run = async () => {
    if (!selected || running || knowledgeIds === null) return;
    setHistoryReport(null);
    try {
      const response = await api.startEvaluationWorkspace(workspaceId, {
        groupId,
        knowledgeSelection: { sourceIds: knowledgeIds },
        rules: selected.rules.map((rule) => ({
          name: rule.name,
          description: rule.description?.trim() || undefined,
          valuation: rule.valuation,
        })),
      });
      submitted.current = response.jobId;
      setJobId(response.jobId);
      setSourcesOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const openHistory = async (evaluationId: string) => {
    if (running) return;
    try {
      const saved = await api.getEvaluation(workspaceId, evaluationId);
      setHistoryReport({
        ...saved.data.report,
        evaluationId: saved.id,
        createdAt: saved.createdAt,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
      <Card className="h-fit rounded-xl p-3 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Rule packages</h2>
          <Button size="sm" variant="outline" onClick={() => setEditor("new")}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New
          </Button>
        </div>
        {packages.length === 0 ? (
          <EmptyState
            title="No rule packages yet"
            description="Add the rules this project should be checked against."
            actionLabel="New package"
            onAction={() => setEditor("new")}
          />
        ) : (
          <div className="space-y-2">
            {packages.map((item) => {
              const active = selected?.id === item.id;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedId(item.id);
                    setHistoryReport(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setSelectedId(item.id);
                    setHistoryReport(null);
                  }}
                  className={`cursor-pointer rounded-xl border px-3 py-3 ${
                    active ? "border-foreground bg-background shadow-card" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.rules.length} {item.rules.length === 1 ? "rule" : "rules"}
                      </span>
                    </span>
                    <span className="flex shrink-0">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={`Edit ${item.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditor(item);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={`Delete ${item.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteId(item.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="space-y-4">
        {selected && shownLabels.length > 0 ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{selected.name}</h2>
                <p className="text-xs text-muted-foreground">{selected.evaluates}</p>
              </div>
              <Button
                onClick={() => {
                  setKnowledgeIds(null);
                  setSourcesOpen(true);
                }}
                disabled={running}
              >
                {running ? "Running" : "Run"}
              </Button>
            </div>
            <EvaluationTree
              key={historyReport?.evaluationId ?? jobId ?? selected?.id ?? "draft"}
              ruleLabels={shownLabels}
              phase={view.phase}
              verdicts={verdictsFor(shownLabels, report)}
              failAt={view.failAt}
              status={view.status}
            />
            {report && (
              <>
                <ReportKnowledgeSources snapshot={report.knowledgeSources} />
                <AssessmentList report={report} />
              </>
            )}
          </>
        ) : (
          <EmptyState
            title="Pick a package"
            description="The tree grows while each rule is checked against the stored evidence."
          />
        )}
        <HistoryList
          items={historyQ.data?.items ?? []}
          disabled={running}
          onOpen={(id) => void openHistory(id)}
        />
      </div>

      <PackageDialog
        open={editor !== null}
        workspaceId={workspaceId}
        value={editor && editor !== "new" ? editor : undefined}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSaved={(saved) => {
          setEditor(null);
          setSelectedId(saved.id);
          void queryClient.invalidateQueries({
            queryKey: ["workspace", workspaceId, "rule-packages"],
          });
        }}
      />
      <Dialog open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Knowledge for this rule evaluation</DialogTitle>
          </DialogHeader>
          <KnowledgeSourcePicker
            key={groupId}
            workspaceId={workspaceId}
            groupId={groupId}
            onChange={setKnowledgeIds}
          />
          <DialogFooter>
            <Button onClick={() => void run()} disabled={knowledgeIds === null || running}>
              Run evaluation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete this rule package?"
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await api.deleteRulePackage(workspaceId, deleteId);
            if (selectedId === deleteId) setSelectedId(undefined);
            setDeleteId(null);
            void queryClient.invalidateQueries({
              queryKey: ["workspace", workspaceId, "rule-packages"],
            });
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </div>
  );
}

function AssessmentList({ report }: { report: EvaluationReport }) {
  const assessments = Object.values(report.assessments);
  if (assessments.length === 0) return null;
  return (
    <div className="space-y-3">
      {assessments.map((assessment) => (
        <AssessmentCard key={assessment.ruleName} assessment={assessment} />
      ))}
    </div>
  );
}

function AssessmentCard({ assessment }: { assessment: RuleAssessment }) {
  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{assessment.ruleName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{assessment.overview}</p>
        </div>
        <span className="shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
          {VERDICT_LABEL[assessment.verdict]}
        </span>
      </div>
      {assessment.criteria.length > 0 && (
        <ul className="mt-3 space-y-2">
          {assessment.criteria.map((criterion) => (
            <li key={criterion.criterion} className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-sm font-medium">{criterion.criterion}</p>
              <p className="text-xs text-muted-foreground">{criterion.finding}</p>
            </li>
          ))}
        </ul>
      )}
      {assessment.evidence.length > 0 && (
        <ul className="mt-3 space-y-2">
          {assessment.evidence.map((item) => (
            <li key={`${item.source}-${item.observation}`} className="text-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {item.source}
              </p>
              <p>{item.observation}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function HistoryList({
  items,
  disabled,
  onOpen,
}: {
  items: Array<{ id: string; createdAt: string; status: string }>;
  disabled: boolean;
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Earlier evaluations</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onOpen(item.id)}
              className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm disabled:opacity-50"
            >
              <span>{new Date(item.createdAt).toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">{item.status}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PackageDialog({
  open,
  workspaceId,
  value,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  workspaceId: string;
  value?: RulePackage;
  onOpenChange: (open: boolean) => void;
  onSaved: (value: RulePackage) => void;
}) {
  const [name, setName] = useState("");
  const [evaluates, setEvaluates] = useState("");
  const [rules, setRules] = useState<
    Array<{ name: string; description: string; valuation: number }>
  >([{ name: "", description: "", valuation: 5 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(value?.name ?? "");
    setEvaluates(value?.evaluates ?? "");
    setRules(
      value?.rules.length
        ? value.rules.map((rule) => ({
            name: rule.name,
            description: rule.description ?? "",
            valuation: rule.valuation,
          }))
        : [{ name: "", description: "", valuation: 5 }],
    );
  }, [open, value]);

  const save = async () => {
    const payload = {
      name: name.trim(),
      evaluates: evaluates.trim(),
      scope: "WORKSPACE" as const,
      rules: rules.map((rule, index) => ({
        name: rule.name.trim(),
        description: rule.description.trim() || undefined,
        valuation: rule.valuation,
        position: index,
      })),
    };
    if (!payload.name || !payload.evaluates || payload.rules.some((rule) => !rule.name)) {
      toast.error("Name the package, what it evaluates, and every rule.");
      return;
    }
    setSaving(true);
    try {
      const saved = value
        ? await api.updateRulePackage(workspaceId, value.id, payload)
        : await api.createRulePackage(workspaceId, payload);
      onSaved(saved);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{value ? "Edit rule package" : "New rule package"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="package-name">Name</Label>
            <Input
              id="package-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="package-evaluates">What it evaluates</Label>
            <Input
              id="package-evaluates"
              value={evaluates}
              onChange={(event) => setEvaluates(event.target.value)}
            />
          </div>
          {rules.map((rule, index) => (
            <div key={index} className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor={`rule-name-${index}`}>Rule {index + 1}</Label>
                {rules.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={`Remove rule ${index + 1}`}
                    onClick={() =>
                      setRules((current) => current.filter((_, item) => item !== index))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <Input
                id={`rule-name-${index}`}
                value={rule.name}
                onChange={(event) =>
                  setRules((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <Textarea
                value={rule.description}
                placeholder="What has to be true"
                onChange={(event) =>
                  setRules((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, description: event.target.value } : item,
                    ),
                  )
                }
              />
              <Label htmlFor={`rule-weight-${index}`}>Weight, 1 to 10</Label>
              <Input
                id={`rule-weight-${index}`}
                type="number"
                min={1}
                max={10}
                value={rule.valuation}
                onChange={(event) =>
                  setRules((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, valuation: Number(event.target.value) || 1 }
                        : item,
                    ),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setRules((current) => [...current, { name: "", description: "", valuation: 5 }])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add rule
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
