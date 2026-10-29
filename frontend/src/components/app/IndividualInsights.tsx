import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EvaluationReport } from "@/lib/types";
import { displayInsight, gradeLabel } from "@/lib/individual-insights";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const statuses = {
  on_track: "On track",
  needs_follow_up: "Needs follow-up",
  needs_support: "Needs support",
  insufficient_evidence: "Insufficient evidence",
};
function sourceLink(source: string, label: string) {
  try {
    const url = new URL(source);
    if (["http:", "https:"].includes(url.protocol))
      return (
        <a
          href={url.href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {label}
        </a>
      );
  } catch {
    /* Legacy sources can be plain labels. */
  }
  return <span>{label}</span>;
}

export function IndividualInsights({
  report,
  workspaceId,
}: {
  report: EvaluationReport;
  workspaceId: string;
}) {
  const job = useQuery({
    queryKey: ["individual-insights", workspaceId, report.individualInsightsJobId],
    queryFn: () => api.getIndividualInsightsJob(workspaceId, report.individualInsightsJobId!),
    enabled: !!report.individualInsightsJobId && !report.individualInsights,
    refetchInterval: (query) =>
      query.state.status === "error" ||
      ["succeeded", "failed"].includes(query.state.data?.status ?? "")
        ? false
        : 2000,
    retry: 2,
  });
  const holistic =
    job.data?.status === "succeeded" ? (job.data.result ?? undefined) : report.individualInsights;
  const individualStatus = holistic
    ? holistic.generationStatus === "unavailable"
      ? "Unavailable"
      : "Completed"
    : job.data?.status === "failed" ||
        job.isError ||
        report.individualInsightsJobStatus === "failed"
      ? "Unavailable"
      : (job.data?.status ?? report.individualInsightsJobStatus) === "running"
        ? "Generating"
        : "Pending";
  const grades = report.studentSummaries?.students ?? [];
  const people = holistic?.people ?? [];
  const ids = new Set(people.map((p) => p.identifier));
  const entries = [
    ...people.map((person) => ({
      identifier: person.identifier,
      name: person.name,
      person,
      grade: grades.find((g) => g.identifier === person.identifier),
    })),
    ...grades
      .filter((g) => !ids.has(g.identifier))
      .map((grade) => ({
        identifier: grade.identifier,
        name: grade.name,
        person: undefined,
        grade,
      })),
  ].map((entry) => ({
    ...entry,
    person: displayInsight(entry.identifier, entry.name, entry.person, entry.grade),
  }));
  return (
    <section aria-label="Individual insights" className="space-y-4">
      <h4 className="font-semibold">Individual insights</h4>
      {report.individualInsightsJobId && (
        <p role="status" className="text-sm text-muted-foreground">
          {individualStatus}
          {individualStatus === "Unavailable"
            ? ". The saved evaluation and grades remain available."
            : ""}
        </p>
      )}
      {job.data?.status === "failed" && job.data.error && (
        <p className="text-sm text-muted-foreground">{job.data.error}</p>
      )}
      {holistic?.generationStatus === "unavailable" && (
        <p className="text-sm text-muted-foreground">{holistic.limitations.at(-1)}</p>
      )}
      <p className="text-sm text-muted-foreground">
        {report.period
          ? `Synthesis of saved evaluations from ${report.period.from} through ${report.period.to} (UTC).`
          : "Synthesis of saved evaluations; no period was specified."}
      </p>
      {!holistic && (
        <p className="text-sm text-muted-foreground">
          Evidence summaries below use only the sources stored in this report.
        </p>
      )}
      {holistic && !entries.length && (
        <p className="text-sm text-muted-foreground">{holistic.limitations.at(-1)}</p>
      )}
      {entries.map(({ identifier, name, person, grade }) => (
        <article key={identifier} className="space-y-3 rounded-xl border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h5 className="font-semibold">
              {grade?.name && grade.name !== person?.actorId ? grade.name : name}
            </h5>
            {(person?.generationStatus === "succeeded" ||
              person?.status === "insufficient_evidence") &&
            person.status ? (
              <Badge variant="secondary">{statuses[person.status]}</Badge>
            ) : (
              <span className="text-sm text-muted-foreground">
                {person.contentKind === "factual_fallback"
                  ? "Evidence summary"
                  : "Incomplete synthesis"}
              </span>
            )}
          </div>
          <p className="text-sm font-medium">{gradeLabel(report, grade)}</p>
          {person && (
            <>
              <p className="text-sm leading-6">{person.synthesis.map((s) => s.text).join(" ")}</p>
              {(person.contentKind === "factual_fallback" ||
                person.generationStatus !== "succeeded" ||
                person.evidenceAvailability === "partial" ||
                person.evidenceAvailability === "unavailable") && (
                <p role="status" className="text-sm text-muted-foreground">
                  Narrative synthesis unavailable; saved observations remain available.
                </p>
              )}
              <p className="text-sm leading-6">
                <span className="font-medium">Next action: </span>
                {person.nextAction?.text}
              </p>
            </>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                View supporting evidence
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
              <SheetTitle>Supporting evidence</SheetTitle>
              <SheetDescription>
                Stored sources and guideline-based grading. These grades do not determine the
                holistic status.
              </SheetDescription>
              <p className="my-4 break-all text-xs text-muted-foreground">
                Source identity: {identifier}
              </p>
              {person && (
                <div className="space-y-3">
                  {[
                    ...person.synthesis.map((s, i) => ({ ...s, label: `Synthesis ${i + 1}` })),
                    ...(person.nextAction ? [{ ...person.nextAction, label: "Next action" }] : []),
                  ].map((item) => (
                    <div key={item.label} className="text-sm">
                      <p className="font-medium">{item.label}</p>
                      <p>{item.text}</p>
                      <ul className="mt-1 space-y-1">
                        {item.references.map((ref) => {
                          const evidence = person.references.find((e) => e.id === ref);
                          return evidence ? (
                            <li key={ref}>
                              {evidence.url
                                ? sourceLink(evidence.url, evidence.label)
                                : evidence.label}
                            </li>
                          ) : null;
                        })}
                      </ul>
                    </div>
                  ))}
                  <h6 className="font-semibold">Stored activity</h6>
                  {!!person.blockFindings?.length && person.generationStatus !== "succeeded" && (
                    <div className="space-y-2 text-sm">
                      <h6 className="font-semibold">Retained findings — incomplete synthesis</h6>
                      {person.blockFindings.map((block, i) => (
                        <div key={i}>
                          {[...block.synthesis, block.nextAction].map((finding, j) => (
                            <p key={j}>
                              {finding.text}{" "}
                              {finding.references.map((ref) => {
                                const evidence = person.references.find((e) => e.id === ref);
                                return evidence ? (
                                  <span key={ref}>
                                    {" "}
                                    {sourceLink(evidence.url ?? evidence.label, evidence.label)}
                                  </span>
                                ) : null;
                              })}
                            </p>
                          ))}
                          {block.limitations.map((text, j) => (
                            <p key={j} className="text-muted-foreground">
                              {text}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <ul className="space-y-3">
                    {person.references.map((e) => (
                      <li key={e.id} className="rounded-lg border p-3 text-sm">
                        {e.url ? (
                          sourceLink(e.url, e.label)
                        ) : (
                          <>
                            {e.label}
                            <span className="block text-xs text-muted-foreground">
                              Source link not available in stored data
                            </span>
                          </>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {e.role}
                          {" · "}
                          {e.date ? new Date(e.date).toLocaleString() : "Date unavailable"}
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
                          {e.facts}
                        </pre>
                      </li>
                    ))}
                  </ul>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {holistic?.limitations.map((l, i) => (
                      <li key={`report:${i}`}>{l}</li>
                    ))}
                    {person.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                  {!!person.diagnostics?.length && (
                    <div className="text-xs text-muted-foreground">
                      <h6 className="font-semibold">Generation diagnostics</h6>
                      {person.diagnostics.map((d, i) => (
                        <p key={i}>
                          {d.stage}: {d.code}
                          {d.paths.length ? ` (${d.paths.join(", ")})` : ""}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-6 space-y-3 border-t pt-4">
                <h6 className="font-semibold">Guideline-based grading</h6>
                {grade ? (
                  <>
                    <p className="text-sm">
                      {grade.grade === null
                        ? "Insufficient evidence for a grade"
                        : `${grade.grade} / ${report.studentSummaries!.settings.maximum}`}{" "}
                      · Coverage {Math.round(grade.coverage * 100)}%
                    </p>
                    {grade.summary && <p className="text-sm">{grade.summary}</p>}
                    {grade.overview && (
                      <div className="text-sm">
                        <p>{grade.overview.conclusion}</p>
                        {[
                          ...grade.overview.contributions,
                          ...grade.overview.strengths,
                          ...grade.overview.attention,
                          ...grade.overview.limitations,
                        ].map((text, i) => (
                          <p key={i}>{text}</p>
                        ))}
                      </div>
                    )}
                    {grade.details.map((rule) => (
                      <div key={rule.ruleId} className="space-y-2 border-t pt-3 text-sm">
                        <p className="font-medium">{rule.ruleName}</p>
                        <p>{rule.rationale}</p>
                        {rule.criteria.map((c, i) => (
                          <div key={i}>
                            <p>
                              {c.criterion}: {c.status.replaceAll("_", " ")} — {c.finding}
                            </p>
                            <p className="break-words text-xs text-muted-foreground">
                              {c.evidenceReferences.join(", ")}
                            </p>
                          </div>
                        ))}
                        {rule.evidence.map((e, i) => (
                          <p key={i}>
                            {sourceLink(e.source, e.source)}: {e.observation}
                            <span className="block text-muted-foreground">{e.relevance}</span>
                          </p>
                        ))}
                        {rule.limitations?.map((l, i) => (
                          <p key={i} className="text-muted-foreground">
                            {l}
                          </p>
                        ))}
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No guideline grade is available for this identity.
                  </p>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </article>
      ))}
    </section>
  );
}
