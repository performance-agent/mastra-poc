import {
  AlertTriangle,
  CircleCheckBig,
  FileChartColumn,
  FileText,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/components/app/EmptyState";
import { LoadingState } from "@/components/app/LoadingState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  buildGroupReportDashboardData,
  type GroupReportConsistencyLevel,
  type GroupReportSource,
} from "@/lib/group-report-dashboard";
import type { GroupReportConfidence, GroupReportStatus } from "@/lib/types";

interface Props {
  reports: GroupReportSource[];
  isLoading: boolean;
  errorMessage?: string;
  isCreating: boolean;
  isWaitingForReport: boolean;
  onCreate: () => Promise<void>;
  onRefresh: () => void;
  onOpenReport: (reportId: string) => void;
}

const statusLabels: Record<GroupReportStatus, string> = {
  GOOD: "Good",
  WATCH: "Watch",
  RISK: "Risk",
  INSUFFICIENT_DATA: "Insufficient data",
};

const confidenceLabels: Record<GroupReportConfidence, string> = {
  HIGH: "High confidence",
  MEDIUM: "Medium confidence",
  LOW: "Low confidence",
  INSUFFICIENT: "Insufficient confidence",
};

const consistencyLabels: Record<GroupReportConsistencyLevel, string> = {
  CONSISTENT: "Consistent",
  VARIABLE: "Variable",
  SPORADIC: "Sporadic",
  INSUFFICIENT_DATA: "Insufficient data",
};

const statusColors: Record<GroupReportStatus, string> = {
  GOOD: "var(--success)",
  WATCH: "var(--warning)",
  RISK: "var(--destructive)",
  INSUFFICIENT_DATA: "var(--muted-foreground)",
};

const consistencyColors: Record<GroupReportConsistencyLevel, string> = {
  CONSISTENT: "var(--success)",
  VARIABLE: "var(--warning)",
  SPORADIC: "var(--destructive)",
  INSUFFICIENT_DATA: "var(--muted-foreground)",
};

const confidenceColors: Record<GroupReportConfidence, string> = {
  HIGH: "var(--success)",
  MEDIUM: "var(--warning)",
  LOW: "var(--destructive)",
  INSUFFICIENT: "var(--muted-foreground)",
};

const scoreChartConfig = {
  score: {
    label: "Overall score",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const peopleChartConfig = {
  GOOD: { label: statusLabels.GOOD, color: statusColors.GOOD },
  WATCH: { label: statusLabels.WATCH, color: statusColors.WATCH },
  RISK: { label: statusLabels.RISK, color: statusColors.RISK },
  INSUFFICIENT_DATA: {
    label: statusLabels.INSUFFICIENT_DATA,
    color: statusColors.INSUFFICIENT_DATA,
  },
} satisfies ChartConfig;

function statusClasses(status: GroupReportStatus) {
  if (status === "GOOD") return "border-success/20 bg-success/10 text-success";
  if (status === "WATCH") return "border-warning/25 bg-warning/10 text-warning";
  if (status === "RISK") return "border-destructive/20 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

function confidenceClasses(confidence: GroupReportConfidence) {
  if (confidence === "HIGH") return "border-success/20 bg-success/10 text-success";
  if (confidence === "MEDIUM") return "border-warning/25 bg-warning/10 text-warning";
  if (confidence === "LOW") return "border-destructive/20 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: GroupReportStatus }) {
  return <Badge className={statusClasses(status)}>{statusLabels[status]}</Badge>;
}

function formatDate(value?: string | null, includeTime = false) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return includeTime
    ? date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : date.toLocaleDateString("en-US", { dateStyle: "medium" });
}

interface DistributionItem {
  key: string;
  label: string;
  value: number;
  color: string;
}

function DistributionKpiCard({
  title,
  description,
  highlightLabel,
  highlightValue,
  total,
  items,
}: {
  title: string;
  description: string;
  highlightLabel: string;
  highlightValue: number;
  total: number;
  items: DistributionItem[];
}) {
  const percentage = total > 0 ? Math.round((highlightValue / total) * 100) : 0;
  const distributionLabel = items.map((item) => `${item.label}: ${item.value}`).join(", ");

  return (
    <Card className="min-w-0 rounded-xl p-4 shadow-card sm:p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {total > 0 ? (
        <>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{percentage}%</span>
            <span className="text-xs text-muted-foreground">{highlightLabel}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {highlightValue} of {total} {total === 1 ? "person" : "people"}
          </p>
          <div
            role="img"
            aria-label={distributionLabel}
            className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
          >
            {items
              .filter((item) => item.value > 0)
              .map((item) => (
                <span
                  key={item.key}
                  className="h-full"
                  style={{
                    backgroundColor: item.color,
                    flexBasis: 0,
                    flexGrow: item.value,
                  }}
                />
              ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {items.map((item) => (
              <div key={item.key} className="flex min-w-0 items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
                <span className="font-semibold tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
          No people assessments are available.
        </div>
      )}
    </Card>
  );
}

export function GroupOverviewDashboard({
  reports,
  isLoading,
  errorMessage,
  isCreating,
  isWaitingForReport,
  onCreate,
  onRefresh,
  onOpenReport,
}: Props) {
  const dashboard = buildGroupReportDashboardData(reports);

  if (isLoading) return <LoadingState />;

  if (errorMessage) {
    return (
      <EmptyState
        icon={<FileChartColumn className="h-4 w-4" />}
        title="Dashboard unavailable"
        description={errorMessage}
        actionLabel="Try again"
        onAction={onRefresh}
      />
    );
  }

  if (!dashboard.latest) {
    if (isWaitingForReport) {
      return (
        <Card className="rounded-xl p-6 shadow-card">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
            Generating the first group report…
          </div>
        </Card>
      );
    }
    return (
      <EmptyState
        icon={<FileChartColumn className="h-4 w-4" />}
        title="No dashboard data yet"
        description="Generate a Group Report to see the group's current status and score history. Legacy GitHub reports are not included."
        actionLabel={isCreating ? "Starting…" : "Generate Group Report"}
        onAction={isCreating ? undefined : onCreate}
      />
    );
  }

  const { latest, previous } = dashboard;
  const overall = latest.data.overallAssessment;
  const scoreDelta =
    overall.score !== null && previous?.data.overallAssessment.score != null
      ? overall.score - previous.data.overallAssessment.score
      : null;
  const history = dashboard.scoreHistory.map((point) => ({
    ...point,
    label: formatDate(point.createdAt),
  }));
  const peopleData = (Object.keys(statusLabels) as GroupReportStatus[]).map((status) => ({
    status,
    label: statusLabels[status],
    value: dashboard.peopleDistribution[status],
    fill: statusColors[status],
  }));
  const peopleTotal = peopleData.reduce((total, item) => total + item.value, 0);
  const consistencyData = (Object.keys(consistencyLabels) as GroupReportConsistencyLevel[]).map(
    (level) => ({
      key: level,
      label: consistencyLabels[level],
      value: dashboard.consistencyDistribution[level],
      color: consistencyColors[level],
    }),
  );
  const confidenceData = (Object.keys(confidenceLabels) as GroupReportConfidence[]).map(
    (confidence) => ({
      key: confidence,
      label: confidenceLabels[confidence],
      value: dashboard.confidenceDistribution[confidence],
      color: confidenceColors[confidence],
    }),
  );
  const scorePercentage = overall.score ?? 0;
  const positiveSignal = overall.positiveSignals[0] ?? null;
  const concern = overall.concerns[0] ?? null;
  const nextRecommendation =
    latest.data.recommendations.find((item) => item.priority === "HIGH") ??
    latest.data.recommendations.find((item) => item.priority === "MEDIUM") ??
    latest.data.recommendations[0] ??
    null;
  const hasTakeaways = Boolean(positiveSignal || concern || nextRecommendation);

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="group-dashboard-title">
      <Card className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <div
              role="img"
              aria-label={
                overall.score === null
                  ? "Overall score unavailable"
                  : `Overall score: ${overall.score} out of 100`
              }
              className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(var(--chart-1) ${scorePercentage}%, var(--muted) 0)`,
              }}
            >
              <div className="flex h-19 w-19 flex-col items-center justify-center rounded-full bg-card">
                <span className="text-2xl font-semibold tabular-nums">{overall.score ?? "—"}</span>
                <span className="text-[10px] text-muted-foreground">out of 100</span>
              </div>
            </div>

            <div className="min-w-0 max-w-3xl">
              <p className="text-xs text-muted-foreground">
                Generated {formatDate(latest.createdAt, true)}
              </p>
              <h2 id="group-dashboard-title" className="mt-1 text-xl font-semibold">
                Group overview
              </h2>
              <p className="mt-2 wrap-break-word text-sm text-muted-foreground">
                {overall.summary}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={overall.status} />
                <Badge className={confidenceClasses(overall.confidence)}>
                  {confidenceLabels[overall.confidence]}
                </Badge>
                {scoreDelta !== null ? (
                  <span className="text-xs text-muted-foreground">
                    {scoreDelta > 0 ? "+" : ""}
                    {scoreDelta} from previous report
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Current group dimensions">
                {dashboard.dimensions.map((dimension) => (
                  <span
                    key={dimension.label}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px]"
                  >
                    <span className="text-muted-foreground">{dimension.label}</span>
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: statusColors[dimension.current] }}
                    />
                    <span className="font-medium">{statusLabels[dimension.current]}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <TooltipProvider delayDuration={250}>
            <div className="flex shrink-0 gap-2 self-end lg:self-start">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="View full report"
                    onClick={() => onOpenReport(latest.id)}
                  >
                    <FileText aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">View full report</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={
                      isCreating || isWaitingForReport
                        ? "Generating new report"
                        : "Generate new report"
                    }
                    onClick={onCreate}
                    disabled={isCreating || isWaitingForReport}
                  >
                    {isCreating || isWaitingForReport ? (
                      <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles aria-hidden="true" className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isCreating || isWaitingForReport
                    ? "Generating new report"
                    : "Generate new report"}
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </Card>

      {isWaitingForReport ? (
        <Card className="rounded-xl border-primary/20 bg-primary/5 p-3 shadow-card">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />A new report is being
            generated. This dashboard will refresh automatically.
          </div>
        </Card>
      ) : null}

      {hasTakeaways ? (
        <Card className="min-w-0 rounded-xl p-4 shadow-card sm:p-5">
          <div className="flex items-center gap-2">
            <Lightbulb aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Key takeaways</h3>
          </div>
          <div className="mt-3 divide-y divide-border">
            {positiveSignal ? (
              <div className="grid gap-1 py-2 first:pt-0 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-success">
                  <CircleCheckBig aria-hidden="true" className="h-3.5 w-3.5" /> Positive signal
                </div>
                <p className="wrap-break-word text-sm text-muted-foreground">{positiveSignal}</p>
              </div>
            ) : null}
            {concern ? (
              <div className="grid gap-1 py-2 first:pt-0 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-warning">
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" /> Concern
                </div>
                <p className="wrap-break-word text-sm text-muted-foreground">{concern}</p>
              </div>
            ) : null}
            {nextRecommendation ? (
              <div className="grid gap-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> Next action
                </div>
                <p className="wrap-break-word text-sm text-muted-foreground">
                  {nextRecommendation.action}
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card className="min-w-0 rounded-xl p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Score history</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Each point is a cumulative snapshot, not an independent period.
              </p>
            </div>
            <Badge className="border-border bg-muted text-muted-foreground">
              {dashboard.reports.length} {dashboard.reports.length === 1 ? "report" : "reports"}
            </Badge>
          </div>
          {history.length > 0 ? (
            <ChartContainer
              config={scoreChartConfig}
              className="mt-4 h-[230px] w-full aspect-auto"
              aria-label="Overall score history"
            >
              <LineChart accessibilityLayer data={history} margin={{ left: 4, right: 16, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={30} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Line
                  dataKey="score"
                  type="monotone"
                  stroke="var(--color-score)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <div className="mt-4 flex h-[230px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              No numeric scores are available yet.
            </div>
          )}
        </Card>

        <Card className="min-w-0 rounded-xl p-4 shadow-card sm:p-5">
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">People status</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest assessment distribution. This is not a ranking.
          </p>
          {peopleTotal > 0 ? (
            <>
              <div className="relative mx-auto mt-2 h-[170px] max-w-[240px]">
                <ChartContainer
                  config={peopleChartConfig}
                  className="h-full w-full aspect-auto"
                  aria-label={`Assessment status distribution for ${peopleTotal} people`}
                >
                  <PieChart accessibilityLayer>
                    <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
                    <Pie
                      data={peopleData}
                      dataKey="value"
                      nameKey="status"
                      innerRadius={52}
                      outerRadius={72}
                      strokeWidth={2}
                    >
                      {peopleData.map((item) => (
                        <Cell key={item.status} fill={item.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold tabular-nums">{peopleTotal}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {peopleTotal === 1 ? "person" : "people"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {peopleData.map((item) => (
                  <div key={item.status} className="flex min-w-0 items-center gap-2 text-xs">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.fill }}
                    />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {item.label}
                    </span>
                    <span className="font-semibold tabular-nums">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-4 flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
              No people assessments are available.
            </div>
          )}
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <DistributionKpiCard
          title="Contribution consistency"
          description="Regularity observed in the evidence captured by the latest report."
          highlightLabel="consistent"
          highlightValue={dashboard.consistencyDistribution.CONSISTENT}
          total={peopleTotal}
          items={consistencyData}
        />
        <DistributionKpiCard
          title="Assessment confidence"
          description="Evidence confidence behind the latest personal assessments."
          highlightLabel="high confidence"
          highlightValue={dashboard.confidenceDistribution.HIGH}
          total={peopleTotal}
          items={confidenceData}
        />
      </div>
    </section>
  );
}
