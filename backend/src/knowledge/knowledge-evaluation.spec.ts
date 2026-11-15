import type {
  BackendResourceCatalogAdapter,
  EvaluationPlan,
  ResourceExecutionNode,
} from '@pa/agent';
import { evaluationKnowledge } from './knowledge-evaluation';
import type { KnowledgeReportSnapshot } from './knowledge-prompt';
describe('knowledge sources in rule evaluations', () => {
  const snapshot: KnowledgeReportSnapshot = {
    capturedAt: '2026-11-03T00:00:00Z',
    unavailable: 0,
    sources: [
      {
        id: 'node',
        versionId: 'version',
        name: 'Requirements',
        usage: 'CONTEXT',
        origin: 'UPLOAD',
        scope: 'workspace',
        revision: 'v1',
        digest: 'sha',
        sourceUrl: null,
        capturedAt: '2026-11-03T00:00:00Z',
        totalCharacters: 100,
        includedCharacters: 20,
        excerpts: [
          {
            reference: 'knowledge:version:0',
            offset: 0,
            text: 'Required feature A',
          },
        ],
      },
    ],
  };
  const catalog = {
    getCatalogForWorkspace: jest
      .fn()
      .mockResolvedValue({
        workspaceId: 'w',
        resources: [],
        warnings: [{ code: 'no_active_resources', message: 'No plugins' }],
      }),
  } as unknown as BackendResourceCatalogAdapter;
  it('makes selected platform documents discoverable without creating plugin installations', async () => {
    const { catalog: adapter } = evaluationKnowledge(
      catalog,
      {} as ResourceExecutionNode,
      snapshot,
    );
    const result = await adapter.getCatalogForWorkspace('w');
    expect(result.resources).toEqual([
      expect.objectContaining({
        id: 'knowledge:version',
        resourceType: 'knowledge.document',
        availableOperations: [
          expect.objectContaining({ name: 'knowledge.read' }),
        ],
      }),
    ]);
    expect(result.warnings).toEqual([]);
  });
  it('executes against the exact captured excerpts and labels context as non-proof', async () => {
    const execution = {
      run: jest
        .fn()
        .mockResolvedValue({
          calls: [],
          status: 'completed',
          callCounts: { total: 0, successful: 0, failed: 0 },
        }),
    };
    const { execution: node } = evaluationKnowledge(
      catalog,
      execution,
      snapshot,
    );
    const plan = {
      reportType: 'standard_performance_report',
      context: { workspaceId: 'w' },
      rules: [],
      resourcePlan: [
        {
          id: 'use',
          resourceId: 'knowledge:version',
          operationName: 'knowledge.read',
          ruleIds: ['rule'],
          expectedEvidenceIds: ['expected'],
        },
      ],
      expectedEvidence: [],
      limitations: [],
    } as EvaluationPlan;
    const result = await node.run({ plan });
    expect(execution.run).toHaveBeenCalledWith({
      plan: expect.objectContaining({ resourcePlan: [] }),
    });
    expect(result.callCounts).toEqual({ total: 1, successful: 1, failed: 0 });
    expect(result.calls[0]).toMatchObject({
      status: 'succeeded',
      rawData: {
        sourceNamespace: 'knowledge',
        truncated: true,
        records: [
          {
            reference: 'knowledge:version:0',
            usage: 'CONTEXT',
            text: 'Required feature A',
          },
        ],
      },
    });
    expect(JSON.stringify(result)).toContain('never instructions');
  });
  it('rejects fabricated operations even on a valid selected version', async () => {
    const execution = {
      run: jest
        .fn()
        .mockResolvedValue({
          calls: [],
          status: 'completed',
          callCounts: { total: 0, successful: 0, failed: 0 },
        }),
    };
    const { execution: node } = evaluationKnowledge(
      catalog,
      execution,
      snapshot,
    );
    const result = await node.run({
      plan: {
        context: { workspaceId: 'w' },
        resourcePlan: [
          {
            id: 'use',
            resourceId: 'knowledge:version',
            operationName: 'knowledge.write',
            ruleIds: [],
            expectedEvidenceIds: [],
          },
        ],
      } as unknown as { plan: EvaluationPlan },
    });
    expect(result.calls[0].status).toBe('failed');
    expect(result.callCounts.successful).toBe(0);
  });
});
