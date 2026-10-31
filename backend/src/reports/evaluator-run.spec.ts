import {
  buildEvaluatorGovernancePrompt,
  buildEvaluatorQuestionsPrompt,
  buildEvaluatorVoicePrompt,
  isEvaluatorVisibleToGroup,
  reportEffortPreset,
} from './evaluator-run';

describe('report effort', () => {
  const budget = { inputBytes: 48000, outputTokens: 4096 };

  it('keeps the current sample and token budget at medium effort', () => {
    expect(reportEffortPreset('MEDIUM', budget)).toMatchObject({
      sample: 12,
      inputBytes: 48000,
      outputTokens: 4096,
    });
    expect(reportEffortPreset('MEDIUM', budget).instruction).toContain(
      'más contexto',
    );
  });

  it('reads a smaller sample at low effort and keeps room to finish the report', () => {
    const preset = reportEffortPreset('LOW', budget);
    expect(preset).toMatchObject({
      sample: 6,
      inputBytes: 48000,
      outputTokens: 4096,
    });
    expect(preset.instruction).toContain('reporte corto');
  });

  it('raises sample, input, and output at high effort without lowering an already larger budget', () => {
    expect(reportEffortPreset('HIGH', budget)).toMatchObject({
      sample: 24,
      inputBytes: 64800,
      outputTokens: 7168,
    });
    expect(
      reportEffortPreset('HIGH', { inputBytes: 48000, outputTokens: 9000 })
        .outputTokens,
    ).toBe(9000);
  });
});

describe('evaluator governance prompt', () => {
  it('stays empty when there are no rules', () => {
    expect(buildEvaluatorGovernancePrompt([])).toBe('');
  });

  it('describes rules as attention, not grades', () => {
    const prompt = buildEvaluatorGovernancePrompt([
      {
        name: 'Reviewed changes',
        description: 'Show a review.',
        valuation: 9,
      },
    ]);
    expect(prompt).toContain('GOBERNANZA DEL EVALUADOR');
    expect(prompt).toContain('[9] Reviewed changes: Show a review.');
    expect(prompt).toContain('no producen notas');
  });
});

describe('evaluator voice and questions', () => {
  it('stays quiet when the report has no evaluator voice', () => {
    expect(buildEvaluatorVoicePrompt(null)).toBe('');
  });

  it('asks for a direct voice without changing the facts', () => {
    const prompt = buildEvaluatorVoicePrompt('direct');
    expect(prompt).toContain('VOZ DEL EVALUADOR');
    expect(prompt).toContain('sin suavizar ni empujar');
    expect(prompt).toContain('No cambia los hechos');
  });

  it('requires an empty answer list when there are no questions', () => {
    expect(buildEvaluatorQuestionsPrompt([])).toContain('array vacío');
  });

  it('lists each question for the report to answer', () => {
    const prompt = buildEvaluatorQuestionsPrompt([' ¿Qué se entregó? ', '']);
    expect(prompt).toContain('1. ¿Qué se entregó?');
    expect(prompt).toContain('questionAnswers');
    expect(prompt).not.toContain('2.');
  });
});

describe('evaluator visibility', () => {
  const group = { id: 'group-1', workspaceId: 'workspace-1' };

  it('shows a workspace evaluator from the same workspace', () => {
    expect(
      isEvaluatorVisibleToGroup(
        {
          scope: 'WORKSPACE',
          workspaceId: 'workspace-1',
          groupId: null,
        },
        group,
      ),
    ).toBe(true);
  });

  it('hides a project evaluator from another project', () => {
    expect(
      isEvaluatorVisibleToGroup(
        {
          scope: 'GROUP',
          workspaceId: 'workspace-1',
          groupId: 'group-2',
        },
        group,
      ),
    ).toBe(false);
  });
});
