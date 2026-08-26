import {
  langSmithRunnerTag,
  resolveLangSmithRunnerId,
} from './langsmith-runner';

describe('LangSmith runner configuration', () => {
  it('trims the configured runner ID and creates its run tag', () => {
    const environment = { LANGSMITH_RUNNER_ID: '  local  ' };

    expect(resolveLangSmithRunnerId(environment)).toBe('local');
    expect(langSmithRunnerTag(environment)).toBe('runner:local');
  });

  it.each([undefined, '', '   '])(
    'rejects an absent or empty runner ID: %p',
    (runnerId) => {
      const environment =
        runnerId === undefined ? {} : { LANGSMITH_RUNNER_ID: runnerId };

      expect(() => resolveLangSmithRunnerId(environment)).toThrow(
        'LANGSMITH_RUNNER_ID is required',
      );
    },
  );
});
