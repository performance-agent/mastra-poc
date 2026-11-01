import { z } from 'zod';

export const blocks = [
  'setup',
  'welcome',
  'favorites',
  'recent',
  'evaluations',
] as const;
const layout = z
  .array(z.enum(blocks))
  .max(5)
  .refine((v) => new Set(v).size === v.length);
const shortcut = z
  .object({
    kind: z.enum(['workspace', 'group']),
    id: z.string().max(100),
    workspaceId: z.string().max(100),
    name: z.string().max(160),
  })
  .strict();
export const preferencesSchema = z
  .object({
    version: z.literal(1).default(1),
    theme: z.enum(['system', 'light', 'dark']).default('system'),
    motion: z.enum(['system', 'reduced']).default('system'),
    blocks: layout.nullable().default(null),
    favorites: z.array(shortcut).max(30).default([]),
    recent: z.array(shortcut).max(12).default([]),
  })
  .strict();
export const appearanceSchema = z
  .object({
    version: z.literal(1).default(1),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#7262d9'),
    cover: z.string().max(500).default(''),
    blocks: layout.default([...blocks]),
  })
  .strict();
export const setupSchema = z
  .object({
    version: z.literal(1).default(1),
    step: z.number().int().min(0).max(4).default(0),
    workspaceId: z.string().max(100).default(''),
    groupId: z.string().max(100).default(''),
    evaluatorId: z.string().max(100).default(''),
    dismissed: z.boolean().default(false),
    seen: z.boolean().default(false),
    completed: z.boolean().default(false),
    skipped: z.array(z.number().int().min(0).max(4)).default([]),
  })
  .strict();
export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    photoUrl: z.string().max(2000).nullable().optional(),
  })
  .strict();

export function upgradeDefaultLayout<
  T extends { blocks: readonly string[] | null },
>(value: T): T {
  return JSON.stringify(value.blocks) ===
    JSON.stringify(['welcome', 'favorites', 'recent', 'evaluations', 'setup'])
    ? { ...value, blocks: [...blocks] }
    : value;
}
