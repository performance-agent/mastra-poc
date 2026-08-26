import {
  buildEvaluationGuidelinesPrompt,
  CONFLICTING_EVIDENCE_PAIR,
  MAX_EMPHASIS_COUNT,
  MAX_NOTES_LENGTH,
  validateEvaluationGuidelines,
} from './evaluation-guidelines';

describe('validateEvaluationGuidelines', () => {
  it('accepts empty emphasis and no notes', () => {
    expect(validateEvaluationGuidelines({ emphasis: [] })).toHaveLength(0);
  });

  it('accepts valid emphasis values up to max count', () => {
    const errors = validateEvaluationGuidelines({
      emphasis: ['PRODUCT', 'DELIVERY', 'ENGINEERING'],
    });
    expect(errors).toHaveLength(0);
  });

  it(`rejects more than ${MAX_EMPHASIS_COUNT} values`, () => {
    const errors = validateEvaluationGuidelines({
      emphasis: ['PRODUCT', 'DELIVERY', 'ENGINEERING', 'PEOPLE'],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'evaluationEmphasis' }),
      ]),
    );
  });

  it('rejects duplicate values', () => {
    const errors = validateEvaluationGuidelines({
      emphasis: ['PRODUCT', 'PRODUCT'],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'evaluationEmphasis' }),
      ]),
    );
  });

  it('rejects unknown emphasis values', () => {
    const errors = validateEvaluationGuidelines({
      emphasis: ['UNKNOWN' as never],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'evaluationEmphasis' }),
      ]),
    );
  });

  it(`rejects ${CONFLICTING_EVIDENCE_PAIR.join(' + ')} together`, () => {
    const errors = validateEvaluationGuidelines({
      emphasis: ['GITHUB_EVIDENCE', 'TICKET_EVIDENCE'],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'evaluationEmphasis',
          message: expect.stringContaining('GITHUB_EVIDENCE'),
        }),
      ]),
    );
  });

  it(`rejects notes longer than ${MAX_NOTES_LENGTH} chars`, () => {
    const errors = validateEvaluationGuidelines({
      emphasis: [],
      notes: 'a'.repeat(MAX_NOTES_LENGTH + 1),
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'evaluationNotes' }),
      ]),
    );
  });

  it('accepts notes at the exact limit', () => {
    const errors = validateEvaluationGuidelines({
      emphasis: [],
      notes: 'a'.repeat(MAX_NOTES_LENGTH),
    });
    expect(errors).toHaveLength(0);
  });
});

describe('buildEvaluationGuidelinesPrompt', () => {
  it('returns empty string for null guidelines', () => {
    expect(buildEvaluationGuidelinesPrompt(null)).toBe('');
  });

  it('returns empty string for empty emphasis and no notes', () => {
    expect(buildEvaluationGuidelinesPrompt({ emphasis: [], notes: null })).toBe(
      '',
    );
  });

  it('returns empty string for empty emphasis and blank notes', () => {
    expect(
      buildEvaluationGuidelinesPrompt({ emphasis: [], notes: '   ' }),
    ).toBe('');
  });

  it('includes the constitution-safety header when there are guidelines', () => {
    const prompt = buildEvaluationGuidelinesPrompt({
      emphasis: ['PRODUCT'],
      notes: null,
    });
    expect(prompt).toContain('CRITERIOS DE EVALUACIÓN DEL PROYECTO');
    expect(prompt).toContain('No contradigas las reglas de evidencia');
  });

  it('includes the instruction for each selected chip', () => {
    const prompt = buildEvaluationGuidelinesPrompt({
      emphasis: ['DELIVERY', 'ENGINEERING'],
      notes: null,
    });
    expect(prompt).toContain('previsibilidad');
    expect(prompt).toContain('calidad de ingeniería');
  });

  it('includes notes text when provided', () => {
    const notes = 'Equipo de plataforma. PRs pequeños valen más que volumen.';
    const prompt = buildEvaluationGuidelinesPrompt({
      emphasis: [],
      notes,
    });
    expect(prompt).toContain(notes);
  });

  it('includes both chips and notes when both are provided', () => {
    const prompt = buildEvaluationGuidelinesPrompt({
      emphasis: ['PEOPLE'],
      notes: 'Contexto extra.',
    });
    expect(prompt).toContain('personas');
    expect(prompt).toContain('Contexto extra.');
  });

  it('GITHUB_EVIDENCE chip produces a GitHub-weighting instruction', () => {
    const prompt = buildEvaluationGuidelinesPrompt({
      emphasis: ['GITHUB_EVIDENCE'],
      notes: null,
    });
    expect(prompt).toContain('GitHub');
  });
});
