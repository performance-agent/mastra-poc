import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const MAX_KNOWLEDGE_BYTES = 20 * 1024 * 1024;
export const MAX_KNOWLEDGE_TEXT = 1_000_000;
export const knowledgeScopeSchema = z.object({
  workspaceId: z.string().min(1).max(100),
  groupId: z.string().min(1).max(100).optional(),
});
export type KnowledgeScope = z.infer<typeof knowledgeScopeSchema>;
export const knowledgeUsageSchema = z.enum(['CONTEXT', 'EVIDENCE', 'BOTH']);
export const knowledgeCreateSchema = knowledgeScopeSchema.extend({
  name: z.string().trim().min(1).max(240),
  parentId: z.string().min(1).max(100).nullable().optional(),
  usage: knowledgeUsageSchema.default('CONTEXT'),
});
export const knowledgeUploadSchema = knowledgeScopeSchema.extend({
  parentId: z.string().min(1).max(100).optional(),
  usage: knowledgeUsageSchema.default('CONTEXT'),
});
export const knowledgeUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(240).optional(),
    parentId: z.string().min(1).max(100).nullable().optional(),
    usage: knowledgeUsageSchema.optional(),
  })
  .strict();
export function parseKnowledge<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  return result.data;
}
export type KnowledgeSnapshotSource = {
  id: string;
  versionId: string;
  name: string;
  usage: 'CONTEXT' | 'EVIDENCE' | 'BOTH';
  origin: string;
  scope: 'workspace' | 'project';
  revision: string;
  digest: string;
  sourceUrl: string | null;
  capturedAt: string;
  syncedAt?: string | null;
  connectionStatus?: string | null;
  connectionError?: string | null;
};
export type KnowledgeSnapshot = {
  capturedAt: string;
  sources: KnowledgeSnapshotSource[];
  unavailable: number;
};
