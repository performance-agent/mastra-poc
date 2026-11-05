import { createHash } from 'node:crypto';
import { z } from 'zod';

export const COMPARISON_VERSION = 'people-comparison-v1';
export const comparativeAssessment = z.object({
  status: z.enum(['GOOD', 'WATCH', 'RISK', 'INSUFFICIENT_DATA']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']),
  summary: z.string().min(1),
  positiveSignals: z.array(z.string()),
  concerns: z.array(z.string()),
  limitations: z.array(z.string()),
});
const conclusion = z.object({
  assessment: comparativeAssessment,
  changeReason: z.string().min(1),
  suggestions: z.array(z.string()),
  evidenceIds: z.array(z.string()),
});
export const peopleComparisonSchema = z.object({
  summary: z.string().min(1),
  limitations: z.array(z.string()),
  groups: z.array(
    conclusion.extend({
      groupId: z.string(),
      rank: z.number().int().positive().nullable(),
      rankReason: z.string().min(1),
      people: z.array(conclusion.extend({ personId: z.string() })),
    }),
  ),
});
export type PeopleComparisonResult = z.infer<typeof peopleComparisonSchema>;

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Reports may have traditional fields or an ordered set of evaluator blocks. */
export function reportFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.blocks)) return data;
  const flattened: Record<string, unknown> = { ...data };
  for (const entry of data.blocks as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    for (const [key, content] of Object.entries(entry)) {
      if (!['id', 'kind', 'title'].includes(key)) flattened[key] = content;
    }
  }
  return flattened;
}

export type ComparisonSource = {
  groupId: string;
  name: string;
  reportId: string | null;
  contentHash: string;
  data: Record<string, unknown>;
  people: Array<{ personId: string; displayName: string; data: unknown }>;
  evidence: Array<{
    evidenceId: string;
    subject: string | null;
    data: unknown;
  }>;
};

/** Never accept generated identities or citations outside the immutable input package. */
export function validateComparison(
  result: PeopleComparisonResult,
  sources: ComparisonSource[],
) {
  if (result.groups.length !== sources.length)
    throw new Error('Comparison omitted groups');
  const seen = new Set<string>();
  const ranked = result.groups.filter((group) => group.rank !== null);
  const ranks = [...new Set(ranked.map((group) => group.rank!))].sort(
    (a, b) => a - b,
  );
  if (ranks.some((rank, index) => rank !== index + 1))
    throw new Error('Invalid comparison ranks');
  for (const group of result.groups) {
    const source = sources.find((item) => item.groupId === group.groupId);
    if (!source || seen.has(group.groupId))
      throw new Error('Invalid comparison group');
    seen.add(group.groupId);
    if (
      group.rank !== null &&
      (ranked.length < 2 ||
        group.rank > ranked.length ||
        !source.reportId ||
        group.assessment.status === 'INSUFFICIENT_DATA')
    ) {
      throw new Error('Invalid comparison rank');
    }
    const evidenceIds = new Set(source.evidence.map((item) => item.evidenceId));
    if (group.evidenceIds.some((id) => !evidenceIds.has(id)))
      throw new Error('Invalid group citation');
    if (
      group.assessment.status !== 'INSUFFICIENT_DATA' &&
      group.evidenceIds.length === 0
    )
      throw new Error('Group conclusion needs evidence');
    if (!source.reportId && group.assessment.status !== 'INSUFFICIENT_DATA')
      throw new Error('Missing report is not poor performance');
    if (group.people.length !== source.people.length)
      throw new Error('Comparison omitted people');
    const peopleSeen = new Set<string>();
    for (const person of group.people) {
      const original = source.people.find(
        (item) => item.personId === person.personId,
      );
      if (!original || peopleSeen.has(person.personId))
        throw new Error('Invalid comparison person');
      peopleSeen.add(person.personId);
      const ownEvidence = new Set(
        source.evidence
          .filter((item) => item.subject === original.displayName)
          .map((item) => item.evidenceId),
      );
      if (person.evidenceIds.some((id) => !ownEvidence.has(id)))
        throw new Error('Invalid person citation');
      if (
        person.assessment.status !== 'INSUFFICIENT_DATA' &&
        person.evidenceIds.length === 0
      )
        throw new Error('Individual conclusion needs own evidence');
    }
  }
}
