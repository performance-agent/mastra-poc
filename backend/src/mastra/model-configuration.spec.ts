import {
  MODEL_ENVIRONMENT_VARIABLES,
  modelFromEnvironment,
  resolveModelFromEnvironment,
  validateModelConfiguration,
} from './model-configuration';

describe('model configuration', () => {
  const managedVariables = [
    ...MODEL_ENVIRONMENT_VARIABLES,
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GROQ_API_KEY',
    'MISTRAL_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
  ] as const;
  const originalEnvironment = Object.fromEntries(
    managedVariables.map((variable) => [variable, process.env[variable]]),
  );

  beforeEach(() => {
    for (const variable of managedVariables) delete process.env[variable];
  });

  afterAll(() => {
    for (const variable of managedVariables) {
      const value = originalEnvironment[variable];
      if (value === undefined) delete process.env[variable];
      else process.env[variable] = value;
    }
  });

  it('resolves a configured model and trims surrounding whitespace', () => {
    process.env.GROUP_REPORT_MODEL = '  google/gemini-3.6-flash  ';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';

    expect(resolveModelFromEnvironment('GROUP_REPORT_MODEL')).toBe(
      'google/gemini-3.6-flash',
    );
  });

  it('reads the environment again whenever the dynamic model is resolved', () => {
    process.env.GROUP_REPORT_MODEL = 'custom-provider/first-model';
    const resolveModel = modelFromEnvironment('GROUP_REPORT_MODEL');

    expect(resolveModel()).toBe('custom-provider/first-model');

    process.env.GROUP_REPORT_MODEL = 'custom-provider/second-model';
    expect(resolveModel()).toBe('custom-provider/second-model');
  });

  it.each([
    undefined,
    '',
    'gemini-3.6-flash',
    '/gemini-3.6-flash',
    'google/',
    'google//gemini-3.6-flash',
    'google/gemini 3.6 flash',
  ])('rejects an absent or malformed model value: %p', (model) => {
    if (model !== undefined) process.env.GROUP_REPORT_MODEL = model;

    expect(() => resolveModelFromEnvironment('GROUP_REPORT_MODEL')).toThrow(
      /GROUP_REPORT_MODEL/,
    );
  });

  it.each([
    ['google/gemini-3.6-flash', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    ['groq/openai/gpt-oss-120b', 'GROQ_API_KEY'],
    ['mistral/mistral-small-latest', 'MISTRAL_API_KEY'],
    ['openai/gpt-5.5', 'OPENAI_API_KEY'],
    ['openrouter/openrouter/free', 'OPENROUTER_API_KEY'],
  ])('requires the credential for %s', (model, credentialVariable) => {
    process.env.GROUP_REPORT_MODEL = model;

    expect(() => resolveModelFromEnvironment('GROUP_REPORT_MODEL')).toThrow(
      `${credentialVariable} is required`,
    );
  });

  it('validates every required model during startup', () => {
    process.env.GROUP_REPORT_MODEL = 'google/gemini-3.6-flash';
    process.env.WEATHER_AGENT_MODEL = 'google/gemini-3.5-flash-lite';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';

    expect(validateModelConfiguration).not.toThrow();

    delete process.env.WEATHER_AGENT_MODEL;
    expect(validateModelConfiguration).toThrow(
      'WEATHER_AGENT_MODEL is required',
    );
  });

  it('allows other provider/model identifiers without a silent fallback', () => {
    process.env.GROUP_REPORT_MODEL = 'custom-provider/report-model';

    expect(resolveModelFromEnvironment('GROUP_REPORT_MODEL')).toBe(
      'custom-provider/report-model',
    );
  });
});
