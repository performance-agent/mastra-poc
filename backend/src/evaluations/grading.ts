import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { EvaluationFlowResult, RuleAssessmentCriterion } from '@pa/agent';

export const gradingSchema = z
  .object({
    minimum: z.number().finite().default(0),
    maximum: z.number().finite().default(10),
    passingGrade: z.number().finite().default(4),
    rounding: z
      .enum(['integer', 'one_decimal', 'two_decimals', 'none'])
      .default('integer'),
    minimumCoverage: z.number().min(0).max(1).default(1),
    summaryLength: z.number().int().min(40).max(2000).default(240),
    met: z.number().min(0).max(1).default(1),
    partially_met: z.number().min(0).max(1).default(0.5),
    not_met: z.number().min(0).max(1).default(0),
  })
  .strict()
  .refine(
    (s) =>
      s.maximum > s.minimum &&
      s.passingGrade >= s.minimum &&
      s.passingGrade <= s.maximum,
    'Scale maximum must exceed minimum; passing grade must be within scale',
  );
export function gradingSettings(saved?: unknown, overrides?: unknown) {
  const parsed = gradingSchema.safeParse({
    ...(saved && typeof saved === 'object' ? saved : {}),
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  });
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  return parsed.data;
}

export function studentSummaries(
  result: EvaluationFlowResult,
  settings: ReturnType<typeof gradingSettings>,
  requestedRules: Array<{ valuation: number }>,
) {
  const plans =
    result.evaluationPlanResult &&
    result.evaluationPlanResult.status !== 'invalid'
      ? result.evaluationPlanResult.plan.rules
      : [];
  const students = resolvedMembers(result);
  return {
    schemaVersion: 1 as const,
    settings,
    students: [...students].map(([identifier, student]) => {
      let expected = 0,
        known = 0,
        numerator = 0,
        denominator = 0;
      const details = plans.map((plan) => {
        const member = student.rules.get(plan.id);
        const normalize = (value: string) =>
          value.trim().replace(/\s+/g, ' ').toLowerCase();
        const criteria: RuleAssessmentCriterion[] =
          plan.evaluationQuestions.map((question) => {
            const matches =
              member?.criteria.filter(
                (c) => normalize(c.criterion) === normalize(question),
              ) ?? [];
            return matches.length === 1
              ? matches[0]
              : {
                  criterion: question,
                  finding: 'Insufficient evidence',
                  status: 'unknown',
                  evidenceReferences: [],
                };
          });
        const baseline = Math.max(1, criteria.length);
        expected += baseline;
        const scored = criteria.filter(
          (c) => c.status !== 'unknown' && c.evidenceReferences.length > 0,
        );
        known += scored.length;
        const score = scored.length
          ? scored.reduce(
              (sum, c) =>
                sum + settings[c.status as 'met' | 'partially_met' | 'not_met'],
              0,
            ) / scored.length
          : null;
        if (score !== null) {
          numerator += score * plan.rule.valuation;
          denominator += plan.rule.valuation;
        }
        return {
          ruleId: plan.id,
          ruleName: plan.rule.name,
          valuation: plan.rule.valuation,
          score,
          criteria,
          rationale: member?.rationale ?? 'Insufficient evidence',
          limitations: member?.limitations ?? [],
          evidence: member?.evidence ?? [],
        };
      });
      expected += Math.max(0, requestedRules.length - plans.length);
      const coverage = expected ? known / expected : 0;
      const sufficient =
        denominator > 0 && coverage >= settings.minimumCoverage;
      const raw = sufficient
        ? settings.minimum +
          (numerator / denominator) * (settings.maximum - settings.minimum)
        : null;
      const factor =
        settings.rounding === 'integer'
          ? 1
          : settings.rounding === 'one_decimal'
            ? 10
            : 100;
      const grade =
        raw === null
          ? null
          : settings.rounding === 'none'
            ? raw
            : Math.max(
                settings.minimum,
                Math.min(settings.maximum, Math.round(raw * factor) / factor),
              );
      return {
        identifier,
        name: student.name,
        grade,
        coverage,
        passed: grade === null ? null : grade >= settings.passingGrade,
        status: grade === null ? 'insufficient_evidence' : 'graded',
        summary: details
          .map((rule) => rule.rationale)
          .join(' ')
          .slice(0, settings.summaryLength),
        details,
      };
    }),
  };
}

export function resolvedMembers(
  result: EvaluationFlowResult,
  includeUnassessed = false,
) {
  const assessments = result.ruleAssessmentResult?.assessments ?? {};
  const identities = new Map<string, Set<string>>();
  for (const call of result.resourceExecutionResult?.calls ?? []) {
    if (call.status !== 'succeeded') continue;
    const data = call.rawData as {
      sourceNamespace?: string;
      records?: Array<Record<string, unknown>>;
    };
    if (!data || typeof data !== 'object') continue;
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const record = value as Record<string, unknown>;
      for (const [field, actor] of Object.entries(record)) {
        if (
          ['author', 'assignee', 'reporter'].includes(field) &&
          typeof actor === 'string' &&
          actor.trim().length > 0
        ) {
          const canonical = `${data.sourceNamespace ?? call.resourceId}:${actor}`;
          for (const alias of [actor, canonical]) {
            const ids = identities.get(alias) ?? new Set<string>();
            ids.add(canonical);
            identities.set(alias, ids);
          }
        } else if (typeof actor === 'object') visit(actor);
      }
    };
    visit(data.records);
  }
  const students = new Map<
    string,
    {
      name: string;
      rules: Map<
        string,
        (typeof assessments)[string]['memberAssessments'][number]
      >;
    }
  >();
  for (const [ruleId, assessment] of Object.entries(assessments))
    for (const member of assessment.memberAssessments) {
      const ids = identities.get(member.memberIdentifier);
      if (!ids || ids.size !== 1) continue; // Never manufacture identity from display names.
      const id = [...ids][0];
      const student = students.get(id) ?? {
        name: member.memberName,
        rules: new Map(),
      };
      student.name = member.memberName;
      if (student.rules.has(ruleId)) continue;
      student.rules.set(ruleId, member);
      students.set(id, student);
    }
  if (includeUnassessed) {
    for (const ids of identities.values())
      for (const identifier of ids) {
        if (!students.has(identifier))
          students.set(identifier, {
            name: identifier.split(':').at(-1) ?? identifier,
            rules: new Map(),
          });
      }
  }
  return students;
}
