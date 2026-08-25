import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import { z } from 'zod';
import { MembershipRole } from '../../generated/prisma/enums';
import { AccessControlService } from '../access-control/access-control.service';
import {
  GROUP_REPORT_GENERATION_PROMPT,
  GROUP_REPORT_INSTRUCTIONS,
} from '../mastra/group-report-instructions';
import { buildEvaluationGuidelinesPrompt } from '../mastra/evaluation-guidelines';
import { groupReportContentSchema } from '../mastra/schemas/group-report.schema';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

const readSecurity = [{ type: 'oauth2', scopes: ['reports:read'] }];
const writeSecurity = [
  { type: 'oauth2', scopes: ['reports:read', 'reports:write'] },
];

const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspace: z.object({ id: z.string(), name: z.string() }),
  organization: z.object({ id: z.string(), name: z.string() }),
  canCreateReport: z.boolean(),
});

@Injectable()
export class PerformanceMcpService {
  readonly server: MCPServer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly reports: ReportsService,
  ) {
    const listGroups = createTool({
      id: 'list_groups',
      description:
        'Lista los grupos de Performance Platform que el usuario autenticado puede consultar.',
      inputSchema: z.object({}),
      outputSchema: z.object({ groups: z.array(groupSchema) }),
      mcp: {
        annotations: {
          title: 'List accessible groups',
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        _meta: { securitySchemes: readSecurity },
      },
      execute: async (_input, context) => {
        const identity = mcpIdentity(context, 'reports:read');
        const groups = await this.prisma.group.findMany({
          where: this.accessControl.buildAllAccessibleGroupsWhere(
            identity.userId,
            [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.VIEWER],
          ),
          include: {
            workspace: { include: { organization: true } },
          },
          orderBy: { name: 'asc' },
        });

        return {
          groups: await Promise.all(
            groups.map(async (group) => ({
              id: group.id,
              name: group.name,
              workspace: {
                id: group.workspace.id,
                name: group.workspace.name,
              },
              organization: {
                id: group.workspace.organization.id,
                name: group.workspace.organization.name,
              },
              canCreateReport: await this.accessControl.canAccessResource({
                userId: identity.userId,
                resource: 'group',
                resourceId: group.id,
                roles: [MembershipRole.OWNER, MembershipRole.ADMIN],
              }),
            })),
          ),
        };
      },
    });

    const getGroupReportContext = createTool({
      id: 'get_group_report_context',
      description:
        'Obtiene las instrucciones, el schema y todo el historial disponible de los recursos asignados a un grupo accesible.',
      inputSchema: z.object({
        groupId: z.string().describe('ID obtenido desde list_groups.'),
      }),
      mcp: {
        annotations: {
          title: 'Get group report context',
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
        },
        _meta: { securitySchemes: readSecurity },
      },
      execute: async ({ groupId }, context) => {
        const identity = mcpIdentity(context, 'reports:read');
        await this.requireGroupRole(groupId, identity.userId, [
          MembershipRole.OWNER,
          MembershipRole.ADMIN,
          MembershipRole.VIEWER,
        ]);
        const prepared = await this.reports.prepareGroupReport(groupId);

        const guidelinesPrefix = buildEvaluationGuidelinesPrompt(
          prepared.evaluationGuidelines,
        );
        return {
          groupId,
          instructions: GROUP_REPORT_INSTRUCTIONS,
          generationPrompt: guidelinesPrefix
            ? `${guidelinesPrefix}${GROUP_REPORT_GENERATION_PROMPT}`
            : GROUP_REPORT_GENERATION_PROMPT,
          schema: z.toJSONSchema(groupReportContentSchema),
          input: prepared.reportInput,
          nextStep:
            'Genera únicamente el objeto report que cumple el schema y envíalo junto con groupId a create_group_report.',
        };
      },
    });

    const createGroupReport = createTool({
      id: 'create_group_report',
      description:
        'Valida y guarda un Group Report generado con get_group_report_context. Sólo OWNER y ADMIN pueden usarla.',
      inputSchema: z.object({
        groupId: z.string().describe('ID obtenido desde list_groups.'),
        report: groupReportContentSchema,
      }),
      outputSchema: z.object({
        id: z.string(),
        groupId: z.string(),
        type: z.literal('GROUP_REPORT'),
        createdAt: z.string(),
      }),
      mcp: {
        annotations: {
          title: 'Create group report',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
        _meta: { securitySchemes: writeSecurity },
      },
      execute: async ({ groupId, report }, context) => {
        const identity = mcpIdentity(context, 'reports:write');
        await this.requireGroupRole(groupId, identity.userId, [
          MembershipRole.OWNER,
          MembershipRole.ADMIN,
        ]);
        const created = await this.reports.createGroupReportFromContent(
          groupId,
          report,
        );
        return {
          id: created.id,
          groupId,
          type: 'GROUP_REPORT' as const,
          createdAt: created.createdAt.toISOString(),
        };
      },
    });

    this.server = new MCPServer({
      id: 'performance-platform',
      name: 'Performance Platform',
      version: '1.0.0',
      description:
        'Genera y persiste evaluaciones Group Report con los datos conectados a Performance Platform.',
      instructions:
        'Primero llama list_groups. Luego usa get_group_report_context para obtener instrucciones, schema e historial. Genera un reporte neutral en español, sin inventar evidencia, y envíalo a create_group_report. Sólo OWNER y ADMIN pueden guardar; VIEWER sólo puede consultar.',
      tools: {
        list_groups: listGroups,
        get_group_report_context: getGroupReportContext,
        create_group_report: createGroupReport,
      },
    });
  }

  private async requireGroupRole(
    groupId: string,
    userId: string,
    roles: MembershipRole[],
  ) {
    const allowed = await this.accessControl.canAccessResource({
      userId,
      resource: 'group',
      resourceId: groupId,
      roles,
    });
    if (!allowed) {
      throw new ForbiddenException('You cannot access this group');
    }
  }
}

function mcpIdentity(
  context: {
    mcp?: {
      extra?: {
        authInfo?: unknown;
      };
    };
  },
  requiredScope: 'reports:read' | 'reports:write',
) {
  const authInfo = context.mcp?.extra?.authInfo as
    | {
        scopes?: string[];
        extra?: { userId?: string };
      }
    | undefined;
  const userId = authInfo?.extra?.userId;
  if (!userId || !authInfo?.scopes?.includes(requiredScope)) {
    throw new UnauthorizedException(`Missing ${requiredScope} authorization`);
  }
  return { userId, scopes: authInfo.scopes };
}
