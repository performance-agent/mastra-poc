export const EVALUATION_EMPHASIS_VALUES = [
  'PRODUCT',
  'DELIVERY',
  'ENGINEERING',
  'PEOPLE',
  'GITHUB_EVIDENCE',
  'TICKET_EVIDENCE',
] as const;

export type EvaluationEmphasis = (typeof EVALUATION_EMPHASIS_VALUES)[number];

export const MAX_EMPHASIS_COUNT = 3;
export const MAX_NOTES_LENGTH = 2000;

/** GITHUB_EVIDENCE and TICKET_EVIDENCE cannot coexist. */
export const CONFLICTING_EVIDENCE_PAIR: [
  EvaluationEmphasis,
  EvaluationEmphasis,
] = ['GITHUB_EVIDENCE', 'TICKET_EVIDENCE'];

const EMPHASIS_INSTRUCTIONS: Record<EvaluationEmphasis, string> = {
  PRODUCT:
    'Pon énfasis en la evaluación de producto e ideación: prioriza el análisis de tickets, temas y evolución del alcance.',
  DELIVERY:
    'Pon énfasis en la evaluación de entrega y previsibilidad: prioriza el flujo de entrega, la continuidad y la predictabilidad del proyecto.',
  ENGINEERING:
    'Pon énfasis en la calidad de ingeniería y la disciplina del código: prioriza la trazabilidad, el tamaño de los cambios, la cobertura de revisiones y las señales de mantenimiento.',
  PEOPLE:
    'Pon énfasis en la evaluación de personas: prioriza la continuidad, la consistencia individual y las contribuciones de cada miembro.',
  GITHUB_EVIDENCE:
    'Cuando haya discrepancia entre datos de GitHub y tickets, otorga mayor peso a la evidencia de GitHub para evaluar el progreso técnico y la actividad real.',
  TICKET_EVIDENCE:
    'Cuando haya discrepancia entre datos de tickets y GitHub, otorga mayor peso a los tickets para evaluar el alcance, las prioridades y el flujo de entrega.',
};

export interface EvaluationGuidelines {
  emphasis: EvaluationEmphasis[];
  notes: string | null;
}

export interface EvaluationGuidelinesValidationError {
  field: 'evaluationEmphasis' | 'evaluationNotes';
  message: string;
}

export function validateEvaluationGuidelines(input: {
  emphasis: string[];
  notes?: string | null;
}): EvaluationGuidelinesValidationError[] {
  const errors: EvaluationGuidelinesValidationError[] = [];

  const invalidValues = input.emphasis.filter(
    (v) => !EVALUATION_EMPHASIS_VALUES.includes(v as EvaluationEmphasis),
  );
  if (invalidValues.length > 0) {
    errors.push({
      field: 'evaluationEmphasis',
      message: `Invalid emphasis values: ${invalidValues.join(', ')}`,
    });
  }

  const unique = new Set(input.emphasis);
  if (unique.size !== input.emphasis.length) {
    errors.push({
      field: 'evaluationEmphasis',
      message: 'Emphasis values must be unique',
    });
  }

  if (input.emphasis.length > MAX_EMPHASIS_COUNT) {
    errors.push({
      field: 'evaluationEmphasis',
      message: `Maximum ${MAX_EMPHASIS_COUNT} emphasis values allowed`,
    });
  }

  const hasConflict =
    input.emphasis.includes(CONFLICTING_EVIDENCE_PAIR[0]) &&
    input.emphasis.includes(CONFLICTING_EVIDENCE_PAIR[1]);
  if (hasConflict) {
    errors.push({
      field: 'evaluationEmphasis',
      message:
        'GITHUB_EVIDENCE and TICKET_EVIDENCE cannot be selected together',
    });
  }

  if (input.notes && input.notes.length > MAX_NOTES_LENGTH) {
    errors.push({
      field: 'evaluationNotes',
      message: `Notes must not exceed ${MAX_NOTES_LENGTH} characters`,
    });
  }

  return errors;
}

/**
 * Builds the guidelines prefix injected before the report input JSON.
 * Returns empty string when there are no active guidelines, preserving
 * the current behavior for groups that have not configured any.
 */
export function buildEvaluationGuidelinesPrompt(
  guidelines: EvaluationGuidelines | null | undefined,
): string {
  if (!guidelines) return '';

  const { emphasis, notes } = guidelines;
  const hasEmphasis = emphasis.length > 0;
  const hasNotes = notes && notes.trim().length > 0;

  if (!hasEmphasis && !hasNotes) return '';

  const lines: string[] = [
    'CRITERIOS DE EVALUACIÓN DEL PROYECTO',
    'El equipo responsable del proyecto ha definido los siguientes criterios para orientar la evaluación. Úsalos para interpretar la evidencia, elegir métricas relevantes y ajustar el enfoque del reporte. No contradigas las reglas de evidencia, neutralidad, uso de INSUFFICIENT_DATA ni el schema estructurado.',
    '',
  ];

  if (hasEmphasis) {
    lines.push('Énfasis de evaluación:');
    for (const e of emphasis) {
      lines.push(`- ${EMPHASIS_INSTRUCTIONS[e]}`);
    }
  }

  if (hasNotes) {
    if (hasEmphasis) lines.push('');
    lines.push('Notas adicionales del equipo:');
    lines.push(notes.trim());
  }

  lines.push('');
  return lines.join('\n');
}
