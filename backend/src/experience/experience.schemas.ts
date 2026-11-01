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
const legacySetupSchema = z
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
export const setupSteps = [
  'welcome',
  'team',
  'plugins',
  'evaluator',
  'review',
] as const;
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    'Invalid date',
  );
export const setupV2Schema = z
  .object({
    version: z.literal(2),
    step: z.enum(setupSteps).default('welcome'),
    workspaceId: z.string().max(100).default(''),
    groupId: z.string().max(100).default(''),
    evaluatorId: z.string().max(100).default(''),
    dismissed: z.boolean().default(false),
    seen: z.boolean().default(false),
    completed: z.boolean().default(false),
    skipped: z.array(z.enum(setupSteps)).default([]),
    teamDraft: z
      .object({
        creating: z.boolean().default(true),
        workspaceName: z.string().max(160).default(''),
        groupName: z.string().max(160).default(''),
        description: z.string().max(2000).default(''),
        invitations: z.array(z.string().max(254)).max(50).default([]),
      })
      .strict()
      .default({
        creating: true,
        workspaceName: '',
        groupName: '',
        description: '',
        invitations: [],
      }),
    resourceIds: z.array(z.string().max(100)).max(1000).default([]),
    resourcesInitialized: z.boolean().default(false),
    evaluatorDraft: z
      .object({
        baseId: z.string().max(100),
        name: z.string().max(120),
        description: z.string().max(2000),
        avatar: z.number().int().min(0).max(49),
        personalityId: z.string().max(100),
        effort: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        evaluationEmphasis: z
          .array(
            z.enum([
              'PRODUCT',
              'DELIVERY',
              'ENGINEERING',
              'PEOPLE',
              'GITHUB_EVIDENCE',
              'TICKET_EVIDENCE',
            ]),
          )
          .max(3),
        evaluationNotes: z.string().max(2000),
        rules: z
          .array(
            z
              .object({
                name: z.string().max(120),
                description: z.string().max(2000),
                valuation: z.number().int().min(1).max(10),
              })
              .strict(),
          )
          .max(100),
        questions: z
          .array(z.object({ text: z.string().max(500) }).strict())
          .max(6),
      })
      .strict()
      .nullable()
      .default(null),
    period: z
      .object({
        preset: z.enum(['7', '30', '90', 'custom']).default('30'),
        from: dateOnly.optional(),
        to: dateOnly.optional(),
      })
      .strict()
      .default({ preset: '30' }),
  })
  .strict();
export const setupSchema = z
  .union([setupV2Schema, legacySetupSchema])
  .transform((value) => {
    if (value.version === 2) return value;
    return setupV2Schema.parse({
      ...value,
      version: 2,
      step:
        value.step === 0 && !value.seen && !value.dismissed
          ? 'welcome'
          : setupSteps[Math.max(1, value.step)],
      skipped: value.skipped.map((step) => setupSteps[Math.max(1, step)]),
      teamDraft: { creating: !value.workspaceId },
    });
  });
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
