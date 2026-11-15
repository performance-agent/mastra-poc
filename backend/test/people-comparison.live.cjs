/* Run after npm run build with: node --env-file=.env test/people-comparison.live.cjs
 * Uses only synthetic evidence. Requires the existing model/provider configuration.
 */
const assert = require('node:assert/strict');
async function main() {
  const {
    peopleComparisonAgent,
  } = require('../dist/src/mastra/agents/people-comparison-agent.js');
  const {
    peopleComparisonSchema,
    validateComparison,
    COMPARISON_VERSION,
  } = require('../dist/src/workspaces/people-comparison.schema.js');
  const makeSource = (id, delivered) => ({
    groupId: id,
    name: `Synthetic team ${id}`,
    reportId: `r-${id}`,
    contentHash: id,
    data: {
      period: { from: '2026-10-01', to: '2026-10-31' },
      coverage: { resourcesAnalyzed: 1, recordsAnalyzed: 20, limitations: [] },
      overallAssessment: {
        status: 'GOOD',
        summary: 'The original report says everything is on track.',
      },
      summary:
        'Original favorable summary; reevaluate it against the saved evidence.',
    },
    people: [
      {
        personId: `r-${id}:0`,
        displayName: `Contributor ${id}`,
        data: {
          assessment: { status: 'GOOD' },
          contributionSummary: 'Contributed code changes.',
        },
      },
    ],
    evidence: [
      {
        evidenceId: `r-${id}:e0`,
        subject: `Contributor ${id}`,
        data: {
          section: 'PEOPLE',
          subject: `Contributor ${id}`,
          type: 'delivery-summary',
          resource: `synthetic-${id}`,
          reference: `release-${id}`,
          observation: delivered
            ? 'All 8 planned features were accepted and shipped; all changes reviewed, CI green, automated acceptance tests passed, no unresolved incidents.'
            : 'All 8 committed features missed the milestone. Work remains unmerged after four weeks; CI fails, there are no reviews or passing acceptance tests, and recorded critical defects remain unresolved. Activity exists but nothing was delivered.',
          interpretation: delivered
            ? 'Verified delivery and quality.'
            : 'Recorded delivery and quality failures despite the favorable original assessment.',
        },
      },
    ],
  });
  for (const [scenario, aDelivered, bDelivered] of [
    ['mixed', true, false],
    ['both-good', true, true],
    ['both-poor', false, false],
  ]) {
    const sources = [makeSource('a', aDelivered), makeSource('b', bDelivered)];
    const input = {
      version: COMPARISON_VERSION,
      criteria: {
        name: 'Synthetic delivery evaluator',
        rules: [
          {
            name: 'Verified accepted delivery and passing quality checks',
            valuation: 10,
          },
        ],
        notes:
          'An unmerged change with failing CI is not a delivered feature. Do not force differences when evidence is equivalent.',
      },
      sources,
    };
    const response = await peopleComparisonAgent.generate(
      JSON.stringify(input),
      {
        abortSignal: AbortSignal.timeout(60_000),
        maxSteps: 1,
        modelSettings: { maxOutputTokens: 8192, maxRetries: 1 },
        structuredOutput: { schema: peopleComparisonSchema },
      },
    );
    const result = peopleComparisonSchema.parse(response.object);
    validateComparison(result, sources);
    const a = result.groups.find((group) => group.groupId === 'a');
    const b = result.groups.find((group) => group.groupId === 'b');
    if (scenario === 'mixed') {
      assert.equal(a.assessment.status, 'GOOD');
      assert.notEqual(b.assessment.status, 'GOOD');
      assert.ok(a.rank !== null && b.rank !== null && a.rank < b.rank);
      assert.notEqual(b.people[0].assessment.status, 'GOOD');
    } else if (scenario === 'both-good') {
      assert.ok(
        result.groups.every((group) => group.assessment.status === 'GOOD'),
      );
    } else {
      assert.ok(
        result.groups.every((group) =>
          ['WATCH', 'RISK'].includes(group.assessment.status),
        ),
      );
    }
    console.log(
      JSON.stringify({
        scenario,
        groups: result.groups.map((group) => ({
          groupId: group.groupId,
          status: group.assessment.status,
          rank: group.rank,
          personStatus: group.people[0].assessment.status,
        })),
      }),
    );
  }
}
main().catch((error) => {
  console.error(
    'Live comparison check failed:',
    error.name,
    error.message?.slice(0, 200),
  );
  process.exitCode = 1;
});
