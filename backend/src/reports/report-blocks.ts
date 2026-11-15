import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { groupReportContentSchema } from '../mastra/schemas/group-report.schema';

export const REPORT_BLOCK_KINDS = [
  'SUMMARY',
  'OVERALL',
  'PRODUCT',
  'PROJECT',
  'ENGINEERING',
  'PEOPLE',
  'RECOMMENDATIONS',
  'QUESTIONS',
  'CUSTOM',
] as const;

export type ReportBlockKind = (typeof REPORT_BLOCK_KINDS)[number];

export type ReportBlockConfig = {
  id: string;
  kind: ReportBlockKind;
  title?: string;
  prompt?: string;
};

const catalog = new Set<ReportBlockKind>(
  REPORT_BLOCK_KINDS.filter((kind) => kind !== 'CUSTOM'),
);

export function readReportBlocks(value: unknown): ReportBlockConfig[] | null {
  try {
    return normalizeReportBlocks(value);
  } catch {
    return null;
  }
}

export function requireReportBlocks(value: unknown): ReportBlockConfig[] | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return normalizeReportBlocks(value);
}

function normalizeReportBlocks(value: unknown): ReportBlockConfig[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new BadRequestException('Report blocks must be a list');
  if (value.length === 0) return null;
  if (value.length > 12) {
    throw new BadRequestException('A report can have up to 12 blocks');
  }
  const seen = new Set<string>();
  const ids = new Set<string>();
  const blocks: ReportBlockConfig[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException('Each report block needs a kind');
    }
    const record = item as { id?: unknown; kind?: unknown; title?: unknown; prompt?: unknown };
    const kind = record.kind;
    if (typeof kind !== 'string' || !REPORT_BLOCK_KINDS.includes(kind as ReportBlockKind)) {
      throw new BadRequestException('Unknown report block');
    }
    const id = typeof record.id === 'string' ? record.id.trim().slice(0, 40) : '';
    if (!id || ids.has(id)) throw new BadRequestException('Each report block needs its own id');
    ids.add(id);
    if (kind !== 'CUSTOM') {
      if (seen.has(kind)) throw new BadRequestException('Each standard block can be used once');
      seen.add(kind);
      blocks.push({ id, kind: kind as ReportBlockKind });
      continue;
    }
    const title = typeof record.title === 'string' ? record.title.trim().slice(0, 80) : '';
    const prompt = typeof record.prompt === 'string' ? record.prompt.trim().slice(0, 500) : '';
    if (!title || !prompt) {
      throw new BadRequestException('A custom block needs a title and what it should look at');
    }
    blocks.push({ id, kind: 'CUSTOM', title, prompt });
  }
  return blocks;
}

const shape = groupReportContentSchema.shape;

function blockSchema(block: ReportBlockConfig) {
  const id = z.literal(block.id);
  switch (block.kind) {
    case 'SUMMARY':
      return z.object({ id, kind: z.literal('SUMMARY'), summary: shape.summary });
    case 'OVERALL':
      return z.object({
        id,
        kind: z.literal('OVERALL'),
        overallAssessment: shape.overallAssessment,
      });
    case 'PRODUCT':
      return z.object({
        id,
        kind: z.literal('PRODUCT'),
        productAssessment: shape.productAssessment,
      });
    case 'PROJECT':
      return z.object({
        id,
        kind: z.literal('PROJECT'),
        projectAssessment: shape.projectAssessment,
      });
    case 'ENGINEERING':
      return z.object({
        id,
        kind: z.literal('ENGINEERING'),
        engineeringAssessment: shape.engineeringAssessment,
      });
    case 'PEOPLE':
      return z.object({ id, kind: z.literal('PEOPLE'), people: shape.people });
    case 'RECOMMENDATIONS':
      return z.object({
        id,
        kind: z.literal('RECOMMENDATIONS'),
        recommendations: shape.recommendations,
      });
    case 'QUESTIONS':
      return z.object({
        id,
        kind: z.literal('QUESTIONS'),
        questionAnswers: shape.questionAnswers,
      });
    case 'CUSTOM':
      return z.object({
        id,
        kind: z.literal('CUSTOM'),
        title: z.literal(block.title ?? ''),
        summary: z.string(),
        positiveSignals: z.array(z.string()),
        concerns: z.array(z.string()),
        limitations: z.array(z.string()),
      });
  }
}

export function reportBlocksSchema(blocks: ReportBlockConfig[]) {
  const fields: Record<string, ReturnType<typeof blockSchema>> = {};
  for (const block of blocks) fields[block.id] = blockSchema(block);
  return z.object({
    blocks: z.object(fields),
    evidence: shape.evidence,
  });
}

export function outlinedReport<T extends { blocks: Record<string, unknown> | unknown[] }>(
  value: T,
  blocks: ReportBlockConfig[],
): T & { blocks: unknown[]; evidence?: Array<{ reference?: string | null }> } {
  const listed = Array.isArray(value.blocks)
    ? value.blocks
    : blocks.map((block) => value.blocks[block.id]);
  return { ...value, blocks: listed };
}

const LABELS: Record<Exclude<ReportBlockKind, 'CUSTOM'>, string> = {
  SUMMARY: 'Resumen',
  OVERALL: 'Evaluación general',
  PRODUCT: 'Producto',
  PROJECT: 'Proyecto',
  ENGINEERING: 'Ingeniería',
  PEOPLE: 'Personas',
  RECOMMENDATIONS: 'Recomendaciones',
  QUESTIONS: 'Preguntas',
};

export function reportStructurePrompt(blocks: ReportBlockConfig[], questions: string[]) {
  const lines = [
    'ESTRUCTURA DE ESTE EVALUADOR',
    'Escribí únicamente estos bloques, en este orden. No agregues secciones que no estén en la lista.',
    'La evidencia va en el array evidence. section es OVERALL, PRODUCT, PROJECT, ENGINEERING o PEOPLE.',
    'En un bloque propio, subject es el título exacto de ese bloque y section es OVERALL.',
    '',
  ];
  lines.push('Cada bloque va en blocks, con su id como nombre del campo.');
  blocks.forEach((block, index) => {
    if (block.kind === 'CUSTOM') {
      lines.push(`${index + 1}. id "${block.id}". Bloque propio "${block.title}". ${block.prompt}`);
      return;
    }
    lines.push(`${index + 1}. id "${block.id}". ${LABELS[block.kind]}.`);
    if (block.kind !== 'QUESTIONS') return;
    const asked = questions.map((question) => question.trim()).filter(Boolean);
    if (asked.length === 0) {
      lines.push('No hay preguntas. questionAnswers queda vacío.');
      return;
    }
    lines.push('Respondé estas preguntas en questionAnswers, copiando el texto y en este orden.');
    asked.forEach((question, questionIndex) => {
      lines.push(`${questionIndex + 1}. ${question}`);
    });
  });
  lines.push('El contenido visible va en español.');
  return lines.join('\n');
}

export function isOutlinedReport(
  content: unknown,
): content is { blocks: unknown[]; evidence?: Array<{ reference?: string | null }> } {
  if (!content || typeof content !== 'object' || !('blocks' in content)) return false;
  const blocks = (content as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  const kind = (blocks[0] as { kind?: unknown } | undefined)?.kind;
  return kind === 'CUSTOM' || (typeof kind === 'string' && catalog.has(kind as ReportBlockKind));
}
