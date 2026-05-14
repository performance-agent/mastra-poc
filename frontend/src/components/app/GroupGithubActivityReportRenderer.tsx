import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { GroupGithubActivityReport, PerformanceReport } from "@/lib/types";
import type { ReactNode } from "react";

type Props = {
  report: PerformanceReport<GroupGithubActivityReport>;
};

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusClasses(status: "GOOD" | "WATCH" | "RISK") {
  if (status === "GOOD") return "border-success/20 bg-success/10 text-success";
  if (status === "WATCH") return "border-warning/25 bg-warning/10 text-warning";
  return "border-destructive/20 bg-destructive/10 text-destructive";
}

function priorityClasses(priority: "HIGH" | "MEDIUM" | "LOW") {
  if (priority === "HIGH") return "border-destructive/20 bg-destructive/10 text-destructive";
  if (priority === "MEDIUM") return "border-warning/25 bg-warning/10 text-warning";
  return "border-success/20 bg-success/10 text-success";
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background px-3 py-2">
      <div className="break-words text-lg font-semibold">{value}</div>
      <div className="break-words text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      <ul className="mt-2 space-y-1 break-words text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function WorkLink({
  item,
}: {
  item: {
    type: string;
    repository: string;
    number: number | null;
    title: string;
    url: string;
    reason: string;
    status?: string;
  };
}) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="block min-w-0 overflow-hidden rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-border bg-muted text-muted-foreground">
              {titleCase(item.type)}
            </Badge>
            {item.status ? (
              <span className="text-[11px] text-muted-foreground">{item.status}</span>
            ) : null}
          </div>
          <h4 className="mt-2 line-clamp-2 break-words text-sm font-semibold">
            {item.repository}
            {item.number ? ` #${item.number}` : ""}: {item.title}
          </h4>
          <p className="mt-1 break-words text-xs text-muted-foreground">{item.reason}</p>
        </div>
        <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </a>
  );
}

export function GroupGithubActivityReportRenderer({ report }: Props) {
  const data = report.data;
  const insights = [
    ["Delivery momentum", data.groupInsights.deliveryMomentum],
    ["Collaboration", data.groupInsights.collaboration],
    ["Risk and bottlenecks", data.groupInsights.riskAndBottlenecks],
    ["Focus", data.groupInsights.focus],
  ] as const;

  return (
    <div className="min-w-0 space-y-6 overflow-hidden">
      <Card className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="text-xs text-muted-foreground">
              Generated {report.createdAt ? new Date(report.createdAt).toLocaleString() : ""}
            </div>
            <h2 className="mt-2 break-words text-xl font-semibold">GitHub activity report</h2>
            <p className="mt-2 break-words text-sm text-muted-foreground">{data.summary}</p>
          </div>
          <div className="w-full shrink-0 rounded-xl border border-border bg-background p-4 text-center sm:w-auto sm:min-w-32">
            <div className="text-3xl font-semibold">{data.health.score}</div>
            <Badge className={statusClasses(data.health.status)}>
              {titleCase(data.health.status)}
            </Badge>
          </div>
        </div>
        <p className="mt-4 break-words text-sm text-muted-foreground">{data.health.summary}</p>
      </Card>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {insights.map(([title, insight]) => (
          <Card key={title} className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <h3 className="min-w-0 break-words text-sm font-semibold">{title}</h3>
              <Badge className={statusClasses(insight.status)}>{titleCase(insight.status)}</Badge>
            </div>
            <p className="mt-3 break-words text-sm text-muted-foreground">{insight.summary}</p>
            {"risks" in insight ? (
              <ListBlock title="Risks" items={insight.risks} />
            ) : (
              <ListBlock title="Signals" items={insight.signals} />
            )}
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">People</h3>
        <div className="grid gap-3">
          {data.people.map((person) => (
            <Card
              key={person.githubLogin}
              className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card"
            >
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="break-words text-sm font-semibold">@{person.githubLogin}</h4>
                    <Badge className="border-border bg-muted text-muted-foreground">
                      {titleCase(person.contributionProfile)}
                    </Badge>
                  </div>
                  <p className="mt-2 break-words text-sm text-muted-foreground">{person.summary}</p>
                </div>
              </div>
              <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Metric label="Merged PRs" value={person.metrics.mergedPullRequests} />
                <Metric label="Open PRs" value={person.metrics.openPullRequests} />
                <Metric label="Stale PRs" value={person.metrics.stalePullRequests} />
                <Metric
                  label="Issues"
                  value={person.metrics.openedIssues + person.metrics.closedIssues}
                />
                <Metric label="Commits" value={person.metrics.commits} />
              </div>
              <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-3">
                <ListBlock title="Strengths" items={person.strengths} />
                <ListBlock title="Risks" items={person.risks} />
                <ListBlock title="Suggested actions" items={person.suggestedActions} />
              </div>
              {person.notableItems.length ? (
                <div className="mt-4 grid min-w-0 gap-2 lg:grid-cols-2">
                  {person.notableItems.map((item, index) => (
                    <WorkLink key={`${person.githubLogin}-${index}`} item={item} />
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Notable work</h3>
          <div className="grid gap-2">
            {data.notableWork.map((item, index) => (
              <WorkLink key={`work-${index}`} item={item} />
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Recommendations</h3>
          <div className="space-y-2">
            {data.recommendations.map((recommendation) => (
              <Card
                key={recommendation.title}
                className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card"
              >
                <Badge className={priorityClasses(recommendation.priority)}>
                  {titleCase(recommendation.priority)}
                </Badge>
                <h4 className="mt-3 break-words text-sm font-semibold">{recommendation.title}</h4>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {recommendation.description}
                </p>
                <p className="mt-2 break-words text-xs font-medium">{recommendation.action}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Raw signals</h3>
        <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric label="Repositories" value={data.rawSignals.repositoriesAnalyzed} />
          <Metric label="Open PRs" value={data.rawSignals.openPullRequests} />
          <Metric label="Merged PRs" value={data.rawSignals.mergedPullRequests} />
          <Metric label="Open issues" value={data.rawSignals.openIssues} />
          <Metric label="Closed issues" value={data.rawSignals.closedIssues} />
          <Metric label="Stale PRs" value={data.rawSignals.stalePullRequests} />
          <Metric label="Recent commits" value={data.rawSignals.recentCommits} />
        </div>
      </section>
    </div>
  );
}
