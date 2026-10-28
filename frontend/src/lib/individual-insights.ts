import type { EvaluationReport } from "./types";
import { evidenceSummary } from "./evidence-summary";

type Person = NonNullable<EvaluationReport["individualInsights"]>["people"][number];
type Grade = NonNullable<EvaluationReport["studentSummaries"]>["students"][number];

// Display-only compatibility adapter. Never fetches, generates, or changes saved data.
export function displayInsight(
  identifier: string,
  name: string,
  person?: Person,
  grade?: Grade,
): Person {
  const references = person?.references.filter((e) => e.identifier === identifier) ?? [];
  if (person?.contentKind !== "factual_fallback" && person?.synthesis.some((s) => s.text.trim()))
    return {
      ...person,
      references,
      nextAction: person.nextAction ?? evidenceSummary(identifier, references).nextAction,
    };
  // Details are already scoped to this exact student identity. Describe them as
  // stored observations, never as independently verified authorship/completion.
  if (!references.length) {
    for (const rule of grade?.details ?? []) {
      rule.evidence.forEach((e, i) =>
        references.push({
          id: `saved:${rule.ruleId}:${i}`,
          identifier,
          resourceId: "",
          recordId: "",
          role: "stored guideline observation",
          label: `${e.source}: ${e.observation}`,
          url: e.source,
          date: null,
          facts: e.observation,
        }),
      );
    }
  }
  const evidenceAvailability =
    person?.evidenceAvailability ?? (references.length ? "available" : "unavailable");
  const fallback = evidenceSummary(identifier, references, evidenceAvailability);
  const [provider, installationId, ...actor] = identifier.split(":");
  return {
    ...person,
    identifier,
    name,
    provider,
    installationId: installationId ?? "",
    actorId: actor.join(":"),
    generationStatus: person?.generationStatus ?? "unavailable",
    contentKind: "factual_fallback",
    evidenceAvailability,
    status: person?.status ?? null,
    ...fallback,
    references,
    limitations: [
      ...(person?.limitations ?? []),
      ...fallback.limitations,
      "Derived only from this saved report; no newer activity was fetched.",
    ],
    diagnostics: person?.diagnostics,
    blockFindings: person?.blockFindings,
  };
}

export function gradeLabel(report: EvaluationReport, grade?: Grade) {
  if (!grade)
    return "Not graded · Coverage unavailable · No guideline assessment for this identity.";
  const settings = report.studentSummaries!.settings;
  if (grade.grade !== null) return `Guideline grade: ${grade.grade} / ${settings.maximum}`;
  const scorable = grade.details.some(
    (rule) =>
      (rule.valuation === undefined || rule.valuation > 0) &&
      rule.criteria.some((c) => c.status !== "unknown" && c.evidenceReferences.length > 0),
  );
  return `Not graded · Coverage ${Math.round(grade.coverage * 100)}% · ${
    !scorable
      ? "No scorable criteria."
      : `Below the configured minimum of ${Math.round(settings.minimumCoverage * 100)}%.`
  }`;
}
