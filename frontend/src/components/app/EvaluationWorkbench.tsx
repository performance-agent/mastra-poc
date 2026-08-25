import {
  createContext,
  use,
  useId,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  CircleDashed,
  FileSearch,
  Gauge,
  LoaderCircle,
  Plus,
  SearchCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { api, errorMessage } from "@/lib/api";
import type {
  AssessmentCriterion,
  AssessmentVerdict,
  EvaluationReport,
  RuleAssessment,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EvaluationRule = { id: string; name: string; description: string; valuation: number };
type WorkbenchState = {
  rules: EvaluationRule[];
  setRules: Dispatch<SetStateAction<EvaluationRule[]>>;
  from: string;
  setFrom: (value: string) => void;
  to: string;
  setTo: (value: string) => void;
  report?: EvaluationReport;
  error?: string;
  isRunning: boolean;
  run: () => Promise<void>;
};

const WorkbenchContext = createContext<WorkbenchState | null>(null);

function useWorkbench() {
  const value = use(WorkbenchContext);
  if (!value) throw new Error("Evaluation components must be inside EvaluationWorkbench");
  return value;
}

function newRule(name = "", description = "", valuation = 5): EvaluationRule {
  return { id: crypto.randomUUID(), name, description, valuation };
}

function EvaluationProvider({
  workspaceId,
  groupName,
  groupId,
  children,
}: {
  workspaceId: string;
  groupName: string;
  groupId: string;
  children: ReactNode;
}) {
  const [rules, setRules] = useState(() => [
    newRule(
      `${groupName} delivery performance`,
      `Evaluate delivery activity, collaboration, and traceability for ${groupName}.`,
      8,
    ),
  ]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<EvaluationReport>();
  const [error, setError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);

  const run = async () => {
    const invalidPeriod = Boolean(from) !== Boolean(to) || (from && to && from > to);
    if (invalidPeriod) {
      setError("Choose both dates and make sure the end date is after the start date.");
      return;
    }

    setIsRunning(true);
    setError(undefined);
    try {
      const response = await api.evaluateWorkspace(
        workspaceId,
        {
          rules: rules.map(({ name, description, valuation }) => ({
            name: name.trim(),
            description: description.trim() || undefined,
            valuation,
          })),
          period: from && to ? { from, to } : undefined,
          groupId,
        },
        "report",
      );
      setReport(response as EvaluationReport);
      toast.success("Evaluation complete");
    } catch (caught) {
      const message = errorMessage(caught);
      setError(
        `${message}. Check your workspace access and the group's active resources, then try again.`,
      );
      toast.error("Evaluation could not be completed");
    } finally {
      setIsRunning(false);
    }
  };

  const value = { rules, setRules, from, setFrom, to, setTo, report, error, isRunning, run };

  return <WorkbenchContext value={value}>{children}</WorkbenchContext>;
}

export function EvaluationWorkbench(props: {
  workspaceId: string;
  groupName: string;
  groupId: string;
}) {
  return (
    <EvaluationProvider {...props}>
      <div className="evaluation-workbench overflow-hidden rounded-[1.35rem] border border-slate-300/70 bg-[#f7f9fb] shadow-[0_22px_70px_-38px_rgba(15,50,75,0.45)] dark:border-slate-700 dark:bg-[#111a21]">
        <WorkbenchHeader groupName={props.groupName} />
        <div className="grid min-w-0 lg:grid-cols-[minmax(310px,0.82fr)_minmax(0,1.35fr)]">
          <EvaluationSetup />
          <EvaluationOutput />
        </div>
      </div>
    </EvaluationProvider>
  );
}

function WorkbenchHeader({ groupName }: { groupName: string }) {
  return (
    <header className="relative overflow-hidden border-b border-[#b8c9d4] bg-[#dcecf3] px-5 py-6 text-[#132c3b] sm:px-7 dark:border-slate-700 dark:bg-[#19303d] dark:text-slate-50">
      <div className="absolute inset-y-0 right-0 w-1/3 bg-[repeating-linear-gradient(135deg,transparent_0,transparent_8px,rgba(28,87,116,0.08)_8px,rgba(28,87,116,0.08)_9px)]" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#32667f] dark:text-sky-300">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> Agent Evaluation Desk
          </div>
          <h2 className="text-balance font-serif text-3xl font-semibold leading-tight sm:text-4xl">
            Turn team signals into a defensible report.
          </h2>
          <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-[#496676] dark:text-slate-300">
            Define what matters for {groupName}. The agent finds relevant group evidence, tests each
            rule, and explains what supports its conclusion.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-[#99b7c7] bg-white/55 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider dark:border-slate-600 dark:bg-black/15">
          <span className="h-2 w-2 rounded-full bg-[#23856b] shadow-[0_0_0_4px_rgba(35,133,107,0.12)]" />
          Workspace connected
        </div>
      </div>
    </header>
  );
}

function EvaluationSetup() {
  const { rules, setRules, from, setFrom, to, setTo, isRunning, run, error } = useWorkbench();
  const canRun =
    rules.length > 0 &&
    rules.every((rule) => rule.name.trim() && rule.valuation >= 1 && rule.valuation <= 10);

  const updateRule = (id: string, patch: Partial<EvaluationRule>) => {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  return (
    <section
      aria-labelledby="evaluation-brief-title"
      className="border-b border-slate-200 p-5 sm:p-7 lg:border-b-0 lg:border-r dark:border-slate-700"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#607988]">
            Evaluation Brief
          </p>
          <h3 id="evaluation-brief-title" className="mt-1 text-lg font-semibold text-balance">
            What should the agent assess?
          </h3>
        </div>
        <Badge variant="outline" className="shrink-0 font-mono tabular-nums">
          {rules.length} {rules.length === 1 ? "rule" : "rules"}
        </Badge>
      </div>

      <div className="space-y-3">
        {rules.map((rule, index) => (
          <RuleEditor
            key={rule.id}
            rule={rule}
            index={index}
            canRemove={rules.length > 1}
            onChange={(patch) => updateRule(rule.id, patch)}
            onRemove={() => setRules((current) => current.filter((item) => item.id !== rule.id))}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        className="mt-2 w-full border border-dashed border-slate-300 text-[#315e73] dark:border-slate-600 dark:text-sky-300"
        onClick={() => setRules((current) => [...current, newRule()])}
      >
        <Plus aria-hidden="true" /> Add Another Rule
      </Button>

      <fieldset className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
        <legend className="px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#607988]">
          Evidence Window · Optional
        </legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <DateField label="From" value={from} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} min={from || undefined} />
        </div>
      </fieldset>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="mt-5 h-12 w-full bg-[#173d52] text-white shadow-[0_8px_24px_-10px_rgba(23,61,82,0.9)] hover:bg-[#24566e] dark:bg-sky-200 dark:text-slate-950 dark:hover:bg-sky-100"
        disabled={isRunning || !canRun}
        onClick={run}
      >
        {isRunning ? (
          <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        ) : (
          <SearchCheck aria-hidden="true" />
        )}
        {isRunning ? "Evaluating Workspace…" : "Generate Evaluation Report"}
        {!isRunning ? <ArrowRight aria-hidden="true" className="ml-auto" /> : null}
      </Button>
      <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">
        Available to workspace owners and admins. Results are not saved.
      </p>
    </section>
  );
}

function RuleEditor({
  rule,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  rule: EvaluationRule;
  index: number;
  canRemove: boolean;
  onChange: (patch: Partial<EvaluationRule>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <Card className="relative rounded-xl border-slate-200 bg-white p-4 shadow-none dark:border-slate-700 dark:bg-slate-900/60">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#5c7888]">
          Rule {String(index + 1).padStart(2, "0")}
        </span>
        {canRemove ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Remove rule ${index + 1}`}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-name`}>Rule Name</Label>
          <Input
            id={`${id}-name`}
            name={`rule-${index}-name`}
            autoComplete="off"
            value={rule.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="e.g. Pull requests receive timely reviews…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-description`}>Success Criteria</Label>
          <Textarea
            id={`${id}-description`}
            name={`rule-${index}-description`}
            autoComplete="off"
            rows={3}
            value={rule.description}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="Describe the behavior and evidence that count…"
          />
        </div>
        <div className="grid grid-cols-[1fr_4.5rem] items-end gap-3">
          <div>
            <Label htmlFor={`${id}-weight`}>Importance</Label>
            <p className="mt-1 text-xs text-muted-foreground">1 is contextual, 10 is critical.</p>
          </div>
          <Input
            id={`${id}-weight`}
            name={`rule-${index}-weight`}
            className="font-mono tabular-nums"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            value={rule.valuation}
            onChange={(event) => onChange({ valuation: Number(event.target.value) })}
          />
        </div>
      </div>
    </Card>
  );
}

function DateField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={`evaluation-${label.toLowerCase()}`}
        autoComplete="off"
        type="date"
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function EvaluationOutput() {
  const { report, isRunning } = useWorkbench();
  return (
    <section
      aria-labelledby="evaluation-report-title"
      aria-live="polite"
      aria-busy={isRunning}
      className="min-w-0 bg-white/70 p-5 sm:p-7 dark:bg-slate-950/25"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#607988]">
            Agent Findings
          </p>
          <h3 id="evaluation-report-title" className="mt-1 text-lg font-semibold">
            Evidence Report
          </h3>
        </div>
        {report ? <StatusMark status={report.status} /> : null}
      </div>
      {isRunning ? (
        <EvaluationLoading />
      ) : report ? (
        <ReportView report={report} />
      ) : (
        <ReportEmpty />
      )}
    </section>
  );
}

function ReportEmpty() {
  return (
    <div className="flex min-h-[430px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-[linear-gradient(rgba(91,128,148,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(91,128,148,0.055)_1px,transparent_1px)] bg-[size:24px_24px] px-6 text-center dark:border-slate-700">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#aac1ce] bg-[#eaf3f7] text-[#315f76] dark:border-slate-600 dark:bg-slate-800 dark:text-sky-300">
        <FileSearch aria-hidden="true" className="h-6 w-6" />
      </div>
      <h4 className="mt-4 font-serif text-2xl font-semibold text-balance">
        Your evidence trail starts here.
      </h4>
      <p className="mt-2 max-w-sm text-pretty text-sm leading-6 text-muted-foreground">
        Add the standards you care about, then run the agent. Findings, sources, and gaps will
        appear in this desk.
      </p>
    </div>
  );
}

function EvaluationLoading() {
  return (
    <div className="min-h-[430px] space-y-4" role="status">
      <div className="rounded-xl border border-[#bdd0da] bg-[#edf5f8] p-4 text-[#234f65] dark:border-slate-700 dark:bg-slate-800 dark:text-sky-200">
        <div className="flex items-center gap-3">
          <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          <div>
            <p className="font-semibold">The agent is following the evidence trail…</p>
            <p className="text-xs opacity-75">
              Selecting resources, gathering signals, and testing each criterion.
            </p>
          </div>
        </div>
      </div>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-28 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-slate-800"
        />
      ))}
      <span className="sr-only">Generating evaluation report…</span>
    </div>
  );
}

function ReportView({ report }: { report: EvaluationReport }) {
  const assessments = Object.values(report.assessments);
  const diagnosticCount = Object.values(report.diagnostics).reduce(
    (total, entries) => total + entries.length,
    0,
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <ReportMetric
          label="Rules Assessed"
          value={assessments.length}
          icon={<Gauge aria-hidden="true" />}
        />
        <ReportMetric
          label="Evidence Calls"
          value={report.execution?.successful ?? 0}
          icon={<SearchCheck aria-hidden="true" />}
        />
        <ReportMetric
          label="Open Issues"
          value={diagnosticCount + report.limitations.length}
          icon={<AlertCircle aria-hidden="true" />}
        />
      </div>
      {assessments.length ? (
        assessments.map((assessment, index) => (
          <AssessmentCard key={`${assessment.ruleName}-${index}`} assessment={assessment} />
        ))
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">No rules could be assessed.</p>
          <p className="mt-1">
            Review the limitations and make the rule more specific, then run the report again.
          </p>
        </div>
      )}
      {report.limitations.length ? (
        <ReportNotes title="Report Limitations" notes={report.limitations} />
      ) : null}
      {diagnosticCount ? (
        <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <span>Technical Diagnostics · {diagnosticCount}</span>
            <ChevronDown
              aria-hidden="true"
              className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <pre className="max-h-72 overflow-auto border-t p-4 text-xs leading-5 text-muted-foreground">
            {JSON.stringify(report.diagnostics, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function AssessmentCard({ assessment }: { assessment: RuleAssessment }) {
  const config = verdictConfig[assessment.verdict] ?? verdictConfig.not_evaluable;
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_10px_30px_-28px_rgba(15,50,75,0.8)] dark:border-slate-700 dark:bg-slate-900">
      <div className="grid sm:grid-cols-[8px_1fr]">
        <div className={config.rail} />
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h4 className="break-words text-lg font-semibold text-balance">
                {assessment.ruleName}
              </h4>
              <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                {assessment.overview}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider",
                config.badge,
              )}
            >
              {config.icon}
              {config.label}
            </span>
          </div>
          {assessment.criteria.length ? (
            <div className="mt-5 space-y-2">
              <h5 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Criteria Check
              </h5>
              {assessment.criteria.map((criterion, index) => (
                <CriterionRow key={`${criterion.criterion}-${index}`} criterion={criterion} />
              ))}
            </div>
          ) : null}
          {assessment.evidence.length ? (
            <details className="group mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-[#315f76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300">
                <span>
                  {assessment.evidence.length} Evidence{" "}
                  {assessment.evidence.length === 1 ? "Item" : "Items"}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <div className="mt-3 space-y-2">
                {assessment.evidence.map((evidence, index) => (
                  <div
                    key={`${evidence.source}-${index}`}
                    className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"
                  >
                    <p className="break-words font-mono text-[10px] font-semibold uppercase tracking-wider text-[#527387]">
                      {evidence.source}
                    </p>
                    <p className="mt-1 break-words text-sm">{evidence.observation}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                      {evidence.relevance}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {assessment.limitations.length ? (
            <ReportNotes title="Assessment Gaps" notes={assessment.limitations} compact />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function CriterionRow({ criterion }: { criterion: AssessmentCriterion }) {
  const met = criterion.status === "met";
  const partial = criterion.status === "partially_met";
  return (
    <div className="grid grid-cols-[1.25rem_1fr] gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
      {met ? (
        <Check aria-hidden="true" className="mt-0.5 h-4 w-4 text-emerald-600" />
      ) : partial ? (
        <CircleDashed aria-hidden="true" className="mt-0.5 h-4 w-4 text-amber-600" />
      ) : (
        <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 text-slate-500" />
      )}
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">{criterion.criterion}</p>
        <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">
          {criterion.finding}
        </p>
      </div>
    </div>
  );
}

function ReportMetric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-[#e6f0f4] text-[#315f76] [&_svg]:h-3.5 [&_svg]:w-3.5 dark:bg-slate-800 dark:text-sky-300">
        {icon}
      </div>
      <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 break-words text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function ReportNotes({
  title,
  notes,
  compact = false,
}: {
  title: string;
  notes: string[];
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
        compact ? "mt-4 p-3" : "p-4",
      )}
    >
      <h5 className="text-sm font-semibold">{title}</h5>
      <ul className="mt-1.5 space-y-1 pl-4 text-xs leading-5">
        {notes.map((note, index) => (
          <li key={`${note}-${index}`} className="list-disc break-words">
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusMark({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      {status.replaceAll("_", " ")}
    </span>
  );
}

const verdictConfig: Record<
  AssessmentVerdict,
  { label: string; badge: string; rail: string; icon: ReactNode }
> = {
  supported: {
    label: "Supported",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    rail: "bg-emerald-500",
    icon: <Check aria-hidden="true" className="h-3 w-3" />,
  },
  partially_supported: {
    label: "Partial",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    rail: "bg-amber-500",
    icon: <CircleDashed aria-hidden="true" className="h-3 w-3" />,
  },
  not_supported: {
    label: "Not Supported",
    badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    rail: "bg-red-500",
    icon: <AlertCircle aria-hidden="true" className="h-3 w-3" />,
  },
  not_evaluable: {
    label: "Not Evaluable",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    rail: "bg-slate-400",
    icon: <CircleDashed aria-hidden="true" className="h-3 w-3" />,
  },
};
