import {
  FULL_EVIDENCE_SAMPLE,
  FULL_INPUT_BYTES,
  buildEvaluatorGovernancePrompt,
  buildEvaluatorQuestionsPrompt,
  buildEvaluatorVoicePrompt,
  isEvaluatorVisibleToGroup,
  reportEffortPreset,
} from './evaluator-run';

describe('report effort', () => {
  const budget = { inputBytes: 48000, outputTokens: 4096 };

  it('reads the full stored history at medium effort and leaves room to write more', () => {
    expect(reportEffortPreset('MEDIUM', budget)).toMatchObject({
      sample: FULL_EVIDENCE_SAMPLE,
      inputBytes: FULL_INPUT_BYTES,
      outputTokens: 12288,
    });
    expect(reportEffortPreset('MEDIUM', budget).instruction).toContain(
      'más contexto',
    );
  });

  it('keeps the same evidence at low effort and writes a shorter report', () => {
    const preset = reportEffortPreset('LOW', budget);
    expect(preset).toMatchObject({
      sample: FULL_EVIDENCE_SAMPLE,
      inputBytes: FULL_INPUT_BYTES,
      outputTokens: 8192,
    });
    expect(preset.instruction).toContain('reporte corto');
    expect(preset.instruction).toContain('misma evidencia');
  });

  it('writes the longest report at high effort without lowering an already larger budget', () => {
    expect(reportEffortPreset('HIGH', budget)).toMatchObject({
      sample: FULL_EVIDENCE_SAMPLE,
      inputBytes: FULL_INPUT_BYTES,
      outputTokens: 16384,
    });
    expect(
      reportEffortPreset('HIGH', { inputBytes: 48000, outputTokens: 20000 })
        .outputTokens,
    ).toBe(20000);
    expect(reportEffortPreset('LOW', budget).sample).toBe(
      reportEffortPreset('HIGH', budget).sample,
    );
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

  it('lets the voice choose emphasis without overriding the evidence', () => {
    const prompt = buildEvaluatorVoicePrompt(
      'Decí lo que pasó, de forma directa, sin suavizar ni empujar.',
    );
    expect(prompt).toContain('VOZ DEL EVALUADOR');
    expect(prompt).toContain('elige qué enfatizar');
    expect(prompt).toContain('Un conteo parcial no es un total');
    expect(prompt).toContain('sin suavizar ni empujar');
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
