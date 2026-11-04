import {
  buildEvaluationGuidelinesPrompt,
  type EvaluationGuidelines,
} from '../mastra/evaluation-guidelines';
import { GROUP_REPORT_GENERATION_PROMPT } from '../mastra/group-report-instructions';

export const EVALUATOR_EFFORTS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type EvaluatorEffortLevel = (typeof EVALUATOR_EFFORTS)[number];

export const EVALUATOR_SCOPES = ['WORKSPACE', 'GROUP'] as const;
export type EvaluatorScopeName = (typeof EVALUATOR_SCOPES)[number];

export const MAX_PERSONALITIES = 3;

const REPORT_OUTPUT_FLOOR = 8192;
const MEDIUM_OUTPUT_FLOOR = 12288;
const HIGH_OUTPUT_FLOOR = 16384;
/** Matches the stored-record cap. Every effort reads this many, not a smaller sample. */
export const FULL_EVIDENCE_SAMPLE = 1000;
/** Room for the stored history. Gemini's window is larger; this only stops a runaway package. */
export const FULL_INPUT_BYTES = 2_000_000;

export const REPORT_COMPACT_INSTRUCTION =
  'La respuesta anterior se cortó antes de cerrar el formulario. Reescribí el reporte completo y más corto. Una frase por cada texto. Como máximo dos ítems en cada lista. recommendations y questionAnswers tienen que estar, con todos sus campos. No dejes ningún campo requerido vacío.';

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
  personality: string;
  guidelines: EvaluationGuidelines;
  rules: GovernanceRule[];
  questions: string[];
}

/** Shared by platform generation and external MCP assistants. */
export function buildEvaluatorReportPrompt(
  source: {
    guidelines: EvaluationGuidelines | null;
    snapshot: EvaluatorSnapshot | null;
    voice: string | null;
    effort: EvaluatorEffortLevel;
  },
  options: { effortInstruction?: string; priorContext?: string; structure?: string } = {},
) {
  const effort =
    options.effortInstruction ??
    reportEffortPreset(source.effort, {
      inputBytes: FULL_INPUT_BYTES,
      outputTokens: 0,
    }).instruction;
  const structure = options.structure?.trim();
  const questions = structure
    ? ''
    : buildEvaluatorQuestionsPrompt(source.snapshot?.questions ?? []);
  const ending = structure
    ? `${structure}\n\n`
    : `${GROUP_REPORT_GENERATION_PROMPT}\n\n`;
  return `${buildEvaluationGuidelinesPrompt(source.guidelines)}${buildEvaluatorGovernancePrompt(source.snapshot?.rules ?? [])}${buildEvaluatorVoicePrompt(source.voice)}${questions}${effort ? `${effort}\n\n` : ''}${options.priorContext ?? ''}${ending}`;
}

export function reportEffortPreset(
  effort: EvaluatorEffortLevel,
  budget: ReportBudget,
): ReportEffortPreset {
  const shared = {
    sample: FULL_EVIDENCE_SAMPLE,
    inputBytes: Math.max(budget.inputBytes, FULL_INPUT_BYTES),
  };
  const sameEvidence =
    'Los tres niveles leen la misma evidencia guardada. Cambia qué tan largo es el reporte, no qué registros ves.';
  if (effort === 'LOW') {
    return {
      ...shared,
      outputTokens: Math.max(budget.outputTokens, REPORT_OUTPUT_FLOOR),
      instruction: `Nivel de esfuerzo bajo: escribí un reporte corto y rápido, solo con lo importante y en pocas frases. No desarrolles cada persona ni cada registro. Las listas pueden ser cortas o vacías. Completá todas las secciones del schema para que el reporte cierre, sin texto de relleno. ${sameEvidence}`,
    };
  }
  if (effort === 'HIGH') {
    return {
      ...shared,
      outputTokens: Math.max(budget.outputTokens, HIGH_OUTPUT_FLOOR),
      instruction: `Nivel de esfuerzo alto: explicá con más detalle lo que importa. No inventes evidencia ni escribas de más para llenar espacio. ${sameEvidence}`,
    };
  }
  return {
    ...shared,
    outputTokens: Math.max(budget.outputTokens, MEDIUM_OUTPUT_FLOOR),
    instruction: `Nivel de esfuerzo medio: incluí más contexto que en un reporte breve, sobre lo que importa. No hace falta cubrir cada registro ni completar un cupo de texto. ${sameEvidence}`,
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

export function buildEvaluatorVoicePrompt(instruction: string | null): string {
  const text = instruction?.trim() ?? '';
  if (!text) return '';
  return [
    'VOZ DEL EVALUADOR',
    'Esta voz elige qué enfatizar y cómo decirlo. Las afirmaciones y su confianza tienen que respetar la evidencia disponible. Un conteo parcial no es un total.',
    text,
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
