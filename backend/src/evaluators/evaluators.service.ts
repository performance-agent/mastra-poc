import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  type GroupEvaluationEmphasis,
} from '../../generated/prisma/enums';
import { AccessControlService } from '../access-control/access-control.service';
import { validateEvaluationGuidelines } from '../mastra/evaluation-guidelines';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireReportBlocks } from '../reports/report-blocks';
import { AVATAR_COUNT } from './default-evaluators';
import {
  CreateEvaluatorDto,
  PersonalityDto,
  UpdateEvaluatorDto,
} from './dto/evaluator.dto';
import {
  MAX_PERSONALITIES,
  type EvaluatorScopeName,
} from '../reports/evaluator-run';

const include = {
  rules: { orderBy: { position: 'asc' as const } },
  questions: { orderBy: { position: 'asc' as const } },
  personality: true,
};

@Injectable()
export class EvaluatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
  ) {}

  async listForGroup(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Project not found');
    return this.prisma.evaluator.findMany({
      where: {
        workspaceId: group.workspaceId,
        OR: [
          { scope: 'GROUP', groupId },
          { scope: 'WORKSPACE', groupId: null },
        ],
      },
      include,
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    });
  }

  async create(groupId: string, userId: string, dto: CreateEvaluatorDto) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Project not found');
    await this.assertCanManage(dto.scope, group.workspaceId, group.id, userId);
    const guidelines = this.guidelines(
      dto.evaluationEmphasis ?? [],
      dto.evaluationNotes,
    );
    const avatar =
      dto.avatar ??
      (await this.prisma.evaluator.count({
        where: { workspaceId: group.workspaceId },
      })) % AVATAR_COUNT;
    const personalityId = await this.personalityFor(
      group.workspaceId,
      dto.personalityId,
    );
    return this.prisma.evaluator.create({
      data: {
        name: dto.name.trim(),
        description: blankToNull(dto.description),
        scope: dto.scope,
        effort: dto.effort ?? 'MEDIUM',
        avatar,
        personalityId,
        evaluationEmphasis: guidelines.emphasis,
        evaluationNotes: guidelines.notes,
        disabledKnowledgeNodeIds: this.idList(dto.disabledKnowledgeNodeIds),
        disabledResourceIds: this.idList(dto.disabledResourceIds),
        reportBlocks: this.reportBlocks(dto.reportBlocks),
        workspaceId: group.workspaceId,
        groupId: dto.scope === 'GROUP' ? group.id : null,
        ownerId: userId,
        ...(dto.rules?.length
          ? {
              rules: {
                create: dto.rules.map((rule, position) =>
                  this.ruleData(rule, position),
                ),
              },
            }
          : {}),
        ...(this.questionRows(dto.questions).length
          ? {
              questions: {
                create: this.questionRows(dto.questions),
              },
            }
          : {}),
      },
      include,
    });
  }

  async update(id: string, userId: string, dto: UpdateEvaluatorDto) {
    const current = await this.prisma.evaluator.findUnique({
      where: { id },
      include,
    });
    if (!current) throw new NotFoundException('Evaluator not found');
    await this.assertCanManage(
      current.scope,
      current.workspaceId,
      current.groupId,
      userId,
    );

    const scope = dto.scope ?? current.scope;
    const groupId = await this.resolveGroupId(current, scope, dto.groupId);
    if (scope !== current.scope || groupId !== current.groupId) {
      await this.assertCanManage(scope, current.workspaceId, groupId, userId);
    }

    const guidelines = this.guidelines(
      dto.evaluationEmphasis ?? current.evaluationEmphasis,
      dto.evaluationNotes !== undefined
        ? dto.evaluationNotes
        : current.evaluationNotes,
    );

    return this.prisma.$transaction(async (tx) => {
      if (dto.rules !== undefined) {
        await tx.evaluatorRule.deleteMany({ where: { evaluatorId: id } });
        if (dto.rules.length > 0) {
          await tx.evaluatorRule.createMany({
            data: dto.rules.map((rule, position) => ({
              evaluatorId: id,
              ...this.ruleData(rule, position),
            })),
          });
        }
      }
      if (dto.questions !== undefined) {
        await tx.evaluatorQuestion.deleteMany({ where: { evaluatorId: id } });
        const questions = this.questionRows(dto.questions);
        if (questions.length > 0) {
          await tx.evaluatorQuestion.createMany({
            data: questions.map((question) => ({
              evaluatorId: id,
              ...question,
            })),
          });
        }
      }
      return tx.evaluator.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: blankToNull(dto.description) }
            : {}),
          scope,
          groupId,
          ...(dto.effort !== undefined ? { effort: dto.effort } : {}),
          ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
          ...(dto.personalityId !== undefined
            ? {
                personalityId: await this.personalityFor(
                  current.workspaceId,
                  dto.personalityId,
                ),
              }
            : {}),
          evaluationEmphasis: guidelines.emphasis,
          evaluationNotes: guidelines.notes,
          ...(dto.disabledKnowledgeNodeIds !== undefined
            ? {
                disabledKnowledgeNodeIds: this.idList(
                  dto.disabledKnowledgeNodeIds,
                ),
              }
            : {}),
          ...(dto.disabledResourceIds !== undefined
            ? { disabledResourceIds: this.idList(dto.disabledResourceIds) }
            : {}),
          ...(dto.reportBlocks !== undefined
            ? { reportBlocks: this.reportBlocks(dto.reportBlocks) }
            : {}),
        },
        include,
      });
    });
  }

  async remove(id: string, userId: string) {
    const current = await this.prisma.evaluator.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Evaluator not found');
    await this.assertCanManage(
      current.scope,
      current.workspaceId,
      current.groupId,
      userId,
    );
    await this.prisma.evaluator.delete({ where: { id } });
  }

  async listPersonalities(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Project not found');
    return this.prisma.evaluatorVoice.findMany({
      where: { workspaceId: group.workspaceId },
      orderBy: { position: 'asc' },
    });
  }

  async createPersonality(
    groupId: string,
    userId: string,
    dto: PersonalityDto,
  ) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Project not found');
    await this.assertWorkspaceManager(group.workspaceId, userId);
    const existing = await this.prisma.evaluatorVoice.findMany({
      where: { workspaceId: group.workspaceId },
      orderBy: { position: 'desc' },
    });
    if (existing.length >= MAX_PERSONALITIES) {
      throw new BadRequestException(
        'A workspace can have up to three personalities',
      );
    }
    const position = (existing[0]?.position ?? -1) + 1;
    return this.prisma.evaluatorVoice.create({
      data: {
        workspaceId: group.workspaceId,
        name: dto.name.trim(),
        instruction: dto.instruction.trim(),
        position,
      },
    });
  }

  async updatePersonality(id: string, userId: string, dto: PersonalityDto) {
    const voice = await this.prisma.evaluatorVoice.findUnique({
      where: { id },
    });
    if (!voice) throw new NotFoundException('Personality not found');
    await this.assertWorkspaceManager(voice.workspaceId, userId);
    return this.prisma.evaluatorVoice.update({
      where: { id },
      data: { name: dto.name.trim(), instruction: dto.instruction.trim() },
    });
  }

  async removePersonality(id: string, userId: string) {
    const voice = await this.prisma.evaluatorVoice.findUnique({
      where: { id },
    });
    if (!voice) throw new NotFoundException('Personality not found');
    await this.assertWorkspaceManager(voice.workspaceId, userId);
    const others = await this.prisma.evaluatorVoice.findMany({
      where: { workspaceId: voice.workspaceId, id: { not: id } },
      orderBy: { position: 'asc' },
    });
    const fallback = others[0];
    if (!fallback) {
      throw new BadRequestException('Keep at least one personality');
    }
    await this.prisma.$transaction([
      this.prisma.evaluator.updateMany({
        where: { personalityId: id },
        data: { personalityId: fallback.id },
      }),
      this.prisma.evaluatorVoice.delete({ where: { id } }),
    ]);
  }

  private async resolveGroupId(
    current: { workspaceId: string; groupId: string | null },
    scope: EvaluatorScopeName,
    requestedGroupId: string | undefined,
  ) {
    if (scope === 'WORKSPACE') return null;
    const groupId = requestedGroupId ?? current.groupId;
    if (!groupId) {
      throw new BadRequestException(
        'groupId is required when the scope is a project',
      );
    }
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group || group.workspaceId !== current.workspaceId) {
      throw new BadRequestException(
        'The project must belong to the same workspace',
      );
    }
    return group.id;
  }

  private reportBlocks(value: unknown) {
    const blocks = requireReportBlocks(value);
    return blocks ?? Prisma.DbNull;
  }

  private idList(ids: string[] | undefined) {
    return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
  }

  private guidelines(
    emphasis: GroupEvaluationEmphasis[],
    notes?: string | null,
  ) {
    const errors = validateEvaluationGuidelines({ emphasis, notes });
    if (errors.length > 0) {
      throw new BadRequestException(
        errors.map((error) => error.message).join('; '),
      );
    }
    const trimmed = notes?.trim() ?? '';
    return {
      emphasis,
      notes: trimmed.length > 0 ? trimmed : null,
    };
  }

  private ruleData(
    rule: { name: string; description?: string | null; valuation: number },
    position: number,
  ) {
    return {
      name: rule.name.trim(),
      description: blankToNull(rule.description),
      valuation: rule.valuation,
      position,
    };
  }

  private questionRows(questions: Array<{ text: string }> | undefined) {
    return (questions ?? [])
      .map((question) => question.text.trim())
      .filter((text) => text.length > 0)
      .map((text, position) => ({ text, position }));
  }

  private async personalityFor(workspaceId: string, personalityId?: string) {
    if (personalityId) {
      const voice = await this.prisma.evaluatorVoice.findFirst({
        where: { id: personalityId, workspaceId },
      });
      if (!voice) {
        throw new BadRequestException(
          'Personality not found in this workspace',
        );
      }
      return voice.id;
    }
    const fallback = await this.prisma.evaluatorVoice.findFirst({
      where: { workspaceId },
      orderBy: { position: 'asc' },
    });
    if (!fallback) {
      throw new BadRequestException('This workspace has no personalities');
    }
    return fallback.id;
  }

  private async assertWorkspaceManager(workspaceId: string, userId: string) {
    const allowed = await this.access.canAccessResource({
      userId,
      resource: 'workspace',
      resourceId: workspaceId,
      roles: [MembershipRole.OWNER, MembershipRole.ADMIN],
    });
    if (!allowed) {
      throw new ForbiddenException('You cannot change these personalities');
    }
  }

  private async assertCanManage(
    scope: EvaluatorScopeName,
    workspaceId: string,
    groupId: string | null,
    userId: string,
  ) {
    const allowed = await this.access.canAccessResource({
      userId,
      resource: scope === 'WORKSPACE' ? 'workspace' : 'group',
      resourceId: scope === 'WORKSPACE' ? workspaceId : (groupId ?? ''),
      roles: [MembershipRole.OWNER, MembershipRole.ADMIN],
    });
    if (!allowed) {
      throw new ForbiddenException('You cannot change this evaluator');
    }
  }
}

function blankToNull(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
