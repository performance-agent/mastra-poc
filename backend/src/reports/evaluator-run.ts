import type { EvaluationGuidelines } from '../mastra/evaluation-guidelines';

export const EVALUATOR_EFFORTS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type EvaluatorEffortLevel = (typeof EVALUATOR_EFFORTS)[number];

export const EVALUATOR_SCOPES = ['WORKSPACE', 'GROUP'] as const;
export type EvaluatorScopeName = (typeof EVALUATOR_SCOPES)[number];

export const EVALUATOR_PERSONALITIES = [
  'demanding',
  'direct',
  'careful',
] as const;
export type EvaluatorPersonalityName = (typeof EVALUATOR_PERSONALITIES)[number];

const HIGH_OUTPUT_TOKEN_CAP = 8192;

export interface ReportBudget {
  inputBytes: number;
  outputTokens: number;
}

export interface ReportEffortPreset {
  sample: number;
  inputBytes: number;
  outputTokens: number;
  instruction: string;
}

export interface GovernanceRule {
  name: string;
  description: string | null;
  valuation: number;
}

export interface EvaluatorSnapshot {
  id: string;
  name: string;
  scope: EvaluatorScopeName;
  effort: EvaluatorEffortLevel;
  avatar: number;
  personality: EvaluatorPersonalityName;
  guidelines: EvaluationGuidelines;
  rules: GovernanceRule[];
  questions: string[];
}

const PERSONALITY_VOICE: Record<EvaluatorPersonalityName, string> = {
  demanding:
    'Nombrá el problema primero y tratalo como algo que hay que frenar. El tono es exigente, sin suavizar el hallazgo.',
  direct: 'Decí lo que pasó, de forma directa, sin suavizar ni empujar.',
  careful:
    'Nombrá lo que funciona y dejá un solo próximo paso concreto. El tono es cuidadoso.',
};

export function reportEffortPreset(
  effort: EvaluatorEffortLevel,
  budget: ReportBudget,
): ReportEffortPreset {
  if (effort === 'LOW') {
    return {
      sample: 6,
      inputBytes: budget.inputBytes,
      outputTokens: budget.outputTokens,
      instruction:
        'Nivel de esfuerzo bajo: escribí un reporte corto y rápido, solo con lo importante y en pocas frases. No desarrolles cada persona ni cada registro. Las listas pueden ser cortas o vacías. Completá todas las secciones del schema para que el reporte cierre, sin texto de relleno.',
    };
  }
  if (effort === 'HIGH') {
    const expanded = Math.floor(budget.outputTokens * 1.75);
    return {
      sample: 24,
      inputBytes: Math.floor(budget.inputBytes * 1.35),
      outputTokens: Math.max(
        budget.outputTokens,
        Math.min(HIGH_OUTPUT_TOKEN_CAP, expanded),
      ),
      instruction:
        'Nivel de esfuerzo alto: usá más evidencia y explicá con más detalle lo que importa. No inventes evidencia ni escribas de más para llenar espacio.',
    };
  }
  return {
    sample: 12,
    inputBytes: budget.inputBytes,
    outputTokens: budget.outputTokens,
    instruction:
      'Nivel de esfuerzo medio: incluí más contexto que en un reporte breve, sobre lo que importa. No hace falta cubrir cada registro ni completar un cupo de texto.',
  };
}

export function buildEvaluatorGovernancePrompt(
  rules: GovernanceRule[],
): string {
  if (rules.length === 0) return '';
  const lines = [
    'GOBERNANZA DEL EVALUADOR',
    'Estas reglas definen cómo debe comportarse este evaluador y en qué debe fijarse. Aplicalas al interpretar la evidencia y al redactar el reporte. No agregan secciones, no cambian el schema y no producen notas. La importancia (1 a 10) indica prioridad de atención, no una calificación.',
    '',
  ];
  for (const rule of rules) {
    const detail = rule.description?.trim()
      ? `: ${rule.description.trim()}`
      : '';
    lines.push(`- [${rule.valuation}] ${rule.name.trim()}${detail}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function buildEvaluatorVoicePrompt(
  personality: EvaluatorPersonalityName | null,
): string {
  if (!personality) return '';
  return [
    'VOZ DEL EVALUADOR',
    'Esta voz cambia solo la redacción. No cambia los hechos, la evidencia, el schema ni las calificaciones.',
    PERSONALITY_VOICE[personality],
    '',
  ].join('\n');
}

export function buildEvaluatorQuestionsPrompt(questions: string[]): string {
  const asked = questions.map((question) => question.trim()).filter(Boolean);
  if (asked.length === 0) {
    return 'PREGUNTAS DEL EVALUADOR\nNo hay preguntas. questionAnswers debe ser un array vacío.\n\n';
  }
  const lines = [
    'PREGUNTAS DEL EVALUADOR',
    'Respondé cada pregunta en questionAnswers, en este orden y copiando el texto de question tal cual. Cada answer se apoya solo en la evidencia; si no alcanza, decilo. Estas respuestas no reemplazan el resto del reporte.',
    '',
  ];
  asked.forEach((question, index) => {
    lines.push(`${index + 1}. ${question}`);
  });
  lines.push('');
  return lines.join('\n');
}

export function isEvaluatorVisibleToGroup(
  evaluator: {
    scope: EvaluatorScopeName;
    workspaceId: string;
    groupId: string | null;
  },
  group: { id: string; workspaceId: string },
): boolean {
  if (evaluator.workspaceId !== group.workspaceId) return false;
  if (evaluator.scope === 'GROUP') return evaluator.groupId === group.id;
  return evaluator.groupId === null;
}
