// PostgreSQL integration: isolated entities, synthetic model output, real leases/jobs/access checks.
// Run after npm run build: node --env-file=.env test/people-comparison.integration.cjs
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const {
  AccessControlService,
} = require('../dist/src/access-control/access-control.service');
const {
  GenerationService,
} = require('../dist/src/generation/generation.service');
const {
  PeopleComparisonService,
} = require('../dist/src/workspaces/people-comparison.service');
const {
  WorkspacePeopleService,
} = require('../dist/src/workspaces/workspace-people.service');
const assessment = (status = 'GOOD') => ({
  status,
  confidence: status === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT' : 'HIGH',
  summary: 'Synthetic evidence assessment',
  positiveSignals: [],
  concerns: [],
  limitations: [],
});
async function until(check) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('Integration job timed out');
}
async function main() {
  const db = new PrismaService();
  const access = new AccessControlService(db);
  const jobs = new GenerationService(db);
  const comparisons = new PeopleComparisonService(db, access, jobs);
  const people = new WorkspacePeopleService(db, access, comparisons);
  const runId = randomUUID();
  let org;
  const users = [];
  let unblock = () => {};
  try {
    org = await db.organization.create({
      data: { name: `People comparison integration ${runId}` },
    });
    const workspace = await db.workspace.create({
      data: { organizationId: org.id, name: 'Synthetic workspace' },
    });
    for (const role of ['OWNER', 'VIEWER', 'project-only']) {
      users.push(
        await db.user.create({
          data: {
            name: role,
            email: `${role}-${runId}@example.invalid`,
            firebaseUid: `${runId}-${role}`,
          },
        }),
      );
    }
    await db.membership.create({
      data: { workspaceId: workspace.id, userId: users[0].id, role: 'OWNER' },
    });
    await db.membership.create({
      data: { workspaceId: workspace.id, userId: users[1].id, role: 'VIEWER' },
    });
    const groups = await Promise.all(
      ['A', 'B', 'Missing'].map((name) =>
        db.group.create({ data: { workspaceId: workspace.id, name } }),
      ),
    );
    await db.membership.create({
      data: { groupId: groups[0].id, userId: users[2].id, role: 'VIEWER' },
    });
    const voice = await db.evaluatorVoice.create({
      data: {
        workspaceId: workspace.id,
        name: 'Neutral',
        instruction: 'Neutral',
        position: 0,
      },
    });
    const evaluator = await db.evaluator.create({
      data: {
        workspaceId: workspace.id,
        scope: 'WORKSPACE',
        name: 'Integration evaluator',
        personalityId: voice.id,
      },
    });
    const sourceData = (name) => ({
      period: { from: '2026-10-01', to: '2026-10-31' },
      overallAssessment: assessment(),
      people: [
        {
          displayName: name,
          assessment: assessment(),
          metrics: [{ label: 'Saved metric', value: '8' }],
        },
      ],
      evidence: [
        {
          section: 'PEOPLE',
          subject: name,
          type: 'delivery',
          resource: 'synthetic',
          reference: '1',
          title: 'Saved evidence',
          url: null,
          observation: 'A saved delivery fact',
          interpretation: 'Synthetic interpretation',
        },
      ],
    });
    const reports = await Promise.all(
      groups
        .slice(0, 2)
        .map((group) =>
          db.performanceReport.create({
            data: {
              groupId: group.id,
              evaluatorId: evaluator.id,
              type: 'GROUP_REPORT',
              data: sourceData(group.name),
            },
          }),
        ),
    );
    const syntheticResult = (snapshot) => ({
      summary: 'Comparative integration result',
      limitations: [],
      groups: snapshot.sources.map((source) => {
        const status = !source.reportId
          ? 'INSUFFICIENT_DATA'
          : source.name === 'A'
            ? 'GOOD'
            : 'RISK';
        const evidenceIds = source.evidence.map((entry) => entry.evidenceId);
        return {
          groupId: source.groupId,
          rank: source.reportId ? (source.name === 'A' ? 1 : 2) : null,
          rankReason: 'Synthetic comparable delivery evidence',
          assessment: assessment(status),
          changeReason: 'Reconsidered the favorable original report',
          suggestions: [],
          evidenceIds,
          people: source.people.map((person) => ({
            personId: person.personId,
            assessment: assessment(status),
            changeReason: 'Own contribution evidence',
            suggestions: [],
            evidenceIds,
          })),
        };
      }),
    });
    let barrier = new Promise((resolve) => {
      unblock = resolve;
    });
    comparisons.compare = async (snapshot) => {
      await barrier;
      return syntheticResult(snapshot);
    };
    const responses = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        comparisons.generate(workspace.id, evaluator.id, users[0].id),
      ),
    );
    for (const response of responses)
      if (response.status === 'rejected') throw response.reason;
    const requests = responses.map((response) => response.value);
    const firstJob = requests.find((request) => request.jobId)?.jobId;
    assert.ok(firstJob);
    assert.equal(
      await db.generationJob.count({
        where: { workspaceId: workspace.id, kind: 'people_comparison' },
      }),
      1,
    );
    unblock();
    const settle = async (id, status = 'succeeded') =>
      until(async () => {
        const job = await db.generationJob.findUniqueOrThrow({ where: { id } });
        if (job.status === 'failed' && status !== 'failed')
          throw new Error(job.error);
        return job.status === status && job;
      });
    await settle(firstJob);
    let view = await people.list(workspace.id, users[0].id, evaluator.id);
    assert.equal(view.comparison.stale, false);
    assert.deepEqual(
      view.comparison.groups
        .filter((group) => group.rank)
        .sort((a, b) => a.rank - b.rank)
        .map((group) => group.assessment.status),
      ['GOOD', 'RISK'],
    );
    assert.equal(
      view.groups.find((group) => group.id === groups[1].id).report.people[0]
        .assessment.status,
      'GOOD',
    );
    assert.equal(
      view.comparison.groups.find((group) => group.groupId === groups[2].id)
        .assessment.status,
      'INSUFFICIENT_DATA',
    );
    assert.equal(
      (await people.list(workspace.id, users[1].id, evaluator.id)).capabilities
        .canGenerate,
      false,
    );
    await assert.rejects(
      () => comparisons.generate(workspace.id, evaluator.id, users[1].id),
      /owners and admins/,
    );
    const restricted = await people.list(
      workspace.id,
      users[2].id,
      evaluator.id,
    );
    assert.equal(restricted.comparison, null);
    assert.equal(restricted.groups.length, 1);
    await assert.rejects(
      () =>
        comparisons.jobStatus(
          workspace.id,
          evaluator.id,
          firstJob,
          users[2].id,
        ),
      /Workspace access required/,
    );

    await db.performanceReport.update({
      where: { id: reports[1].id },
      data: { data: { ...sourceData('B'), summary: 'Revised source' } },
    });
    assert.equal(
      (await comparisons.read(workspace.id, evaluator.id, users[0].id))
        .comparison.stale,
      true,
    );
    await comparisons.reconcile(workspace.id, evaluator.id);
    let state = await db.peopleComparison.findUniqueOrThrow({
      where: { evaluatorId: evaluator.id },
    });
    await settle(state.jobId);
    const lastGood = await db.peopleComparison.findUniqueOrThrow({
      where: { evaluatorId: evaluator.id },
    });
    assert.notEqual(lastGood.fingerprint, null);
    assert.equal(
      (await comparisons.read(workspace.id, evaluator.id, users[0].id))
        .comparison.stale,
      false,
    );

    comparisons.compare = async () => {
      throw new Error('Synthetic provider failure');
    };
    const failed = await comparisons.generate(
      workspace.id,
      evaluator.id,
      users[0].id,
    );
    await settle(failed.jobId, 'failed');
    state = await db.peopleComparison.findUniqueOrThrow({
      where: { evaluatorId: evaluator.id },
    });
    assert.equal(state.fingerprint, lastGood.fingerprint);
    assert.deepEqual(state.result, lastGood.result);
    assert.equal(state.leaseToken, null);

    comparisons.compare = async (snapshot) => syntheticResult(snapshot);
    const interrupted = await db.generationJob.create({
      data: {
        workspaceId: workspace.id,
        kind: 'people_comparison',
        input: {},
        status: 'running',
        expiresAt: new Date(0),
      },
    });
    await db.peopleComparison.update({
      where: { evaluatorId: evaluator.id },
      data: {
        jobId: interrupted.id,
        leaseToken: 'interrupted',
        leaseUntil: new Date(Date.now() + 600000),
      },
    });
    const recovered = await comparisons.generate(
      workspace.id,
      evaluator.id,
      users[0].id,
    );
    await settle(recovered.jobId);
    assert.equal(
      (await comparisons.read(workspace.id, evaluator.id, users[0].id))
        .comparison.stale,
      false,
    );
    console.log(
      'PASS: real PostgreSQL persistence, eight concurrent requests deduplicated, source revisions reconciled, restricted access isolated, failed result preserved, interrupted lease recovered.',
    );
  } finally {
    unblock();
    await jobs.tail;
    if (org) await db.organization.delete({ where: { id: org.id } });
    if (users.length)
      await db.user.deleteMany({
        where: { id: { in: users.map((user) => user.id) } },
      });
    jobs.onModuleDestroy();
    comparisons.onModuleDestroy();
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
