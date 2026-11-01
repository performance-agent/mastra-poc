import { setupSchema } from './experience.schemas';
describe('setup version compatibility', () => {
  it('starts untouched accounts at welcome', () =>
    expect(setupSchema.parse({}).step).toBe('welcome'));
  it.each([
    [0, 'team'],
    [1, 'team'],
    [2, 'plugins'],
    [3, 'evaluator'],
    [4, 'review'],
  ])('migrates step %s while preserving its context', (step, expected) => {
    const result = setupSchema.parse({
      version: 1,
      step,
      seen: true,
      workspaceId: 'ws',
      groupId: 'group',
      evaluatorId: 'eval',
      skipped: [2],
    });
    expect(result).toMatchObject({
      version: 2,
      step: expected,
      workspaceId: 'ws',
      groupId: 'group',
      evaluatorId: 'eval',
      skipped: ['plugins'],
    });
  });
  it('rejects credentials and unknown draft fields', () => {
    expect(() =>
      setupSchema.parse({ version: 2, teamDraft: { apiToken: 'secret' } }),
    ).toThrow();
  });
  it('rejects invalid calendar dates in saved periods', () => {
    expect(() =>
      setupSchema.parse({
        version: 2,
        period: { preset: 'custom', from: '2026-02-30' },
      }),
    ).toThrow();
  });
  it('round trips non-sensitive drafts and selected resources', () => {
    const result = setupSchema.parse({
      version: 2,
      step: 'plugins',
      resourceIds: ['resource-a'],
      teamDraft: { workspaceName: 'Product', groupName: 'Engineering' },
    });
    expect(setupSchema.parse(result)).toEqual(result);
  });
});
