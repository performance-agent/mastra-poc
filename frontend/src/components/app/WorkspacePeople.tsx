import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, ExternalLink, RefreshCw, Users } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { WorkspacePeople as PeopleData, WorkspacePerson } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Avatar } from "./Avatar";
import { EvaluatorMark } from "./EvaluatorMark";
import { SearchInput } from "./SearchInput";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

const statuses = {
  GOOD: {
    label: "On track",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  WATCH: { label: "Follow-up", className: "bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  RISK: { label: "Needs support", className: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  INSUFFICIENT_DATA: {
    label: "Insufficient evidence",
    className: "bg-muted text-muted-foreground",
  },
};
function Status({ person }: { person: WorkspacePerson }) {
  const status = statuses[person.assessment.status] ?? statuses.INSUFFICIENT_DATA;
  return (
    <span
      className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}
    >
      {status.label}
    </span>
  );
}
function periodLabel(report: NonNullable<PeopleData["groups"][number]["report"]>) {
  return report.period
    ? `${report.period.from} – ${report.period.to} (UTC)`
    : "No period specified";
}
function Facts({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {items.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    </section>
  );
}
function safeUrl(value: string | null) {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function WorkspacePeople({
  organizationId,
  workspaceId,
}: {
  organizationId: string;
  workspaceId: string;
}) {
  const [evaluatorId, setEvaluatorId] = useState<string>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [opened, setOpened] = useState<{
    group: PeopleData["groups"][number];
    person: WorkspacePerson;
  } | null>(null);
  const query = useQuery({
    queryKey: ["workspace", workspaceId, "people", evaluatorId],
    queryFn: () => api.getWorkspacePeople(workspaceId, evaluatorId),
  });
  const selected = query.data?.evaluators.find((e) => e.id === query.data?.evaluatorId);
  const groups = useMemo(() => {
    if (!query.data?.evaluatorId) return [];
    const needle = search.trim().toLocaleLowerCase();
    return (query.data?.groups ?? [])
      .map((group) => {
        const matchesGroup = group.name.toLocaleLowerCase().includes(needle);
        const people = (group.report?.people ?? []).filter(
          (p) =>
            (matchesGroup || p.displayName.toLocaleLowerCase().includes(needle)) &&
            (status === "all" || status === p.assessment.status),
        );
        return {
          ...group,
          visiblePeople: people,
          visible:
            people.length > 0 || (matchesGroup && status === "all" && !group.report?.people.length),
        };
      })
      .filter((group) => group.visible);
  }, [query.data, search, status]);
  const reportLink = (group: PeopleData["groups"][number], label: string, primary = false) => (
    <Button
      asChild
      variant={primary ? "default" : "ghost"}
      size="sm"
      className={primary ? "" : "text-[var(--brand-ink)]"}
    >
      <Link
        to="/organizations/$organizationId/workspaces/$workspaceId/groups/$groupId"
        params={{ organizationId, workspaceId, groupId: group.id }}
        search={{ tab: "reports", reportId: group.report!.id }}
      >
        {label}
        <ArrowRight className="ml-2 size-4" />
      </Link>
    </Button>
  );
  if (query.isLoading) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        message={errorMessage(query.error)}
        onRetry={() => {
          if (query.error instanceof ApiError && query.error.statusCode === 404 && evaluatorId)
            setEvaluatorId(undefined);
          else void query.refetch();
        }}
      />
    );
  return (
    <section className="space-y-6" aria-label="Workspace people">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">People</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A quick view of each person, in the context of their project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected && <EvaluatorMark name={selected.name} avatar={selected.avatar} size={40} />}
          <div className="min-w-0 flex-1 sm:w-60">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="people-evaluator">
              Evaluator
            </label>
            <Select
              value={query.data?.evaluatorId ?? ""}
              onValueChange={(value) => {
                setEvaluatorId(value);
                setOpened(null);
              }}
              disabled={!query.data?.evaluators.length}
            >
              <SelectTrigger id="people-evaluator">
                <SelectValue placeholder="No evaluators available" />
              </SelectTrigger>
              <SelectContent>
                {query.data?.evaluators.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                    {e.scope === "GROUP"
                      ? ` · ${query.data.groups.find((g) => g.id === e.groupId)?.name ?? "Project"}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="self-end"
            aria-label="Refresh people"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-96">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search people or projects"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filter people by status" className="sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(statuses).map(([key, value]) => (
              <SelectItem key={key} value={key}>
                {value.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!query.data?.evaluators.length && (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No evaluators yet"
          description="Create an evaluator in a project to start building a picture of your team's work."
        />
      )}
      {query.data?.evaluators.length && !groups.length ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No people found"
          description="Try a different search or status. People appear after a project report has been saved."
        />
      ) : null}
      {groups.map((group) => (
        <section
          key={group.id}
          className="overflow-hidden rounded-2xl border bg-card shadow-card"
          aria-label={group.name}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <Users className="size-5 text-[var(--brand)]" />
              <div>
                <h3 className="font-semibold">{group.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {group.report
                    ? `${group.report.evaluator?.name ?? selected?.name} · ${periodLabel(group.report)} · Updated ${new Date(group.report.updatedAt).toLocaleDateString()}`
                    : selected?.name}
                </p>
              </div>
            </div>
            {group.report && reportLink(group, "View report")}
          </div>
          {group.visiblePeople.length ? (
            <>
              <div className="mx-5 hidden grid-cols-[minmax(140px,1fr)_minmax(180px,2fr)_minmax(140px,1fr)_160px_20px] gap-4 border-b pb-2 text-xs font-medium text-muted-foreground lg:grid">
                <span>Person</span>
                <span>Overview</span>
                <span>Saved metrics</span>
                <span>Status</span>
                <span />
              </div>
              <div className="divide-y px-3 pb-2">
                {group.visiblePeople.map((person, i) => (
                  <button
                    key={`${person.displayName}:${i}`}
                    type="button"
                    onClick={() => setOpened({ group, person })}
                    aria-label={`View ${person.displayName} in ${group.name}`}
                    className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[minmax(140px,1fr)_minmax(180px,2fr)_minmax(140px,1fr)_160px_20px] lg:items-center lg:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={person.displayName} />
                      <span className="text-sm font-semibold">{person.displayName}</span>
                    </div>
                    <span className="col-span-2 line-clamp-2 text-sm leading-relaxed lg:col-span-1">
                      {person.assessment.summary ||
                        person.contributionSummary ||
                        "Synthesis unavailable in this saved report."}
                    </span>
                    <span className="col-span-2 text-xs text-muted-foreground lg:col-span-1">
                      {person.metrics.length
                        ? person.metrics
                            .slice(0, 2)
                            .map((m) => `${m.value} ${m.label}`)
                            .join(" · ")
                        : "Metrics unavailable"}
                    </span>
                    <span className="col-start-2 row-start-1 self-center lg:col-start-auto lg:row-start-auto">
                      <Status person={person} />
                    </span>
                    <ChevronRight className="hidden size-4 text-muted-foreground lg:block" />
                    {person.suggestions[0] && (
                      <span className="col-span-2 text-xs text-muted-foreground lg:hidden">
                        Next: {person.suggestions[0]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="border-t px-5 py-6 text-sm text-muted-foreground">
              {!group.available
                ? "This evaluator belongs to another project."
                : !group.report
                  ? "No report from this evaluator yet."
                  : "No individual summaries are available in this saved report."}
            </p>
          )}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        Metrics describe saved activity; they do not determine status. Each project retains its own
        report period.
      </p>
      <Sheet
        open={!!opened}
        onOpenChange={(open) => {
          if (!open) setOpened(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {opened && (
            <div className="space-y-6 pb-8">
              <p className="pr-8 text-xs font-semibold uppercase tracking-wide text-[var(--brand-ink)]">
                {opened.group.name}
              </p>
              <div className="flex items-center gap-4">
                <Avatar name={opened.person.displayName} size="xl" />
                <div>
                  <SheetTitle className="text-2xl">{opened.person.displayName}</SheetTitle>
                  <div className="mt-2">
                    <Status person={opened.person} />
                  </div>
                </div>
              </div>
              <SheetDescription>
                {opened.group.report?.evaluator?.name ?? selected?.name} ·{" "}
                {opened.group.report && periodLabel(opened.group.report)}
              </SheetDescription>
              <section className="space-y-3 border-t pt-5">
                <h3 className="font-semibold">At a glance</h3>
                <p className="text-sm leading-relaxed">
                  {opened.person.assessment.summary ||
                    opened.person.contributionSummary ||
                    "Synthesis unavailable in this saved report."}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {opened.person.metrics.map((m, i) => (
                    <div key={i} className="rounded-xl border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className="mt-1 break-words text-xl font-semibold">{m.value}</p>
                    </div>
                  ))}
                </div>
                {!opened.person.metrics.length && (
                  <p className="text-sm text-muted-foreground">Metrics unavailable.</p>
                )}
              </section>
              <Facts
                title="Contributions"
                items={opened.person.contributionSummary ? [opened.person.contributionSummary] : []}
              />
              <Facts title="Strengths" items={opened.person.assessment.positiveSignals} />
              <Facts
                title="Follow-up"
                items={[...opened.person.assessment.concerns, ...opened.person.improvementAreas]}
              />
              {opened.person.consistency?.summary && (
                <Facts title="Consistency" items={[opened.person.consistency.summary]} />
              )}
              {!!opened.person.suggestions.length && (
                <div className="rounded-xl border border-[var(--brand)]/20 bg-[var(--brand-soft)] p-4">
                  <Facts title="Next action" items={opened.person.suggestions} />
                </div>
              )}
              <Facts
                title="Limitations"
                items={[
                  ...opened.person.assessment.limitations,
                  ...(opened.person.consistency?.limitations ?? []),
                ]}
              />
              {!!opened.person.evidence.length && (
                <section className="space-y-3">
                  <h3 className="font-semibold">Supporting evidence</h3>
                  {opened.person.evidence.map((e, i) => {
                    const url = safeUrl(e.url);
                    return (
                      <div key={i} className="rounded-xl border p-3 text-sm">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between gap-2 font-medium text-[var(--brand-ink)]"
                          >
                            {e.title}
                            <ExternalLink className="size-4 shrink-0" />
                          </a>
                        ) : (
                          <p className="font-medium">{e.title}</p>
                        )}
                        <p className="mt-1 text-muted-foreground">{e.observation}</p>
                      </div>
                    );
                  })}
                </section>
              )}
              <p className="text-xs text-muted-foreground">
                Based on the saved report. No newer activity fetched.
              </p>
              {opened.group.report && reportLink(opened.group, "Open full report", true)}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
