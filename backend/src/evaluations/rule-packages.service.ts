import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RulePackageScope } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRulePackageDto,
  RulePackageRuleDto,
  RulePackageWriteScope,
  UpdateRulePackageDto,
} from './dto/rule-package.dto';

const packageInclude = {
  rules: { orderBy: { position: 'asc' as const } },
};

@Injectable()
export class RulePackagesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(workspaceId: string, ownerId: string) {
    return this.prisma.rulePackage.findMany({
      where: {
        OR: [
          { scope: RulePackageScope.PUBLIC },
          {
            ownerId,
            OR: [
              { scope: RulePackageScope.ALL_WORKSPACES },
              { scope: RulePackageScope.WORKSPACE, workspaceId },
            ],
          },
        ],
      },
      include: packageInclude,
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    });
  }

  create(workspaceId: string, ownerId: string, dto: CreateRulePackageDto) {
    const rules = this.normalizeRules(dto.rules);
    return this.prisma.rulePackage.create({
      data: {
        name: dto.name.trim(),
        evaluates: dto.evaluates.trim(),
        scope: dto.scope,
        ownerId,
        workspaceId:
          dto.scope === RulePackageWriteScope.WORKSPACE ? workspaceId : null,
        rules: { create: rules },
      },
      include: packageInclude,
    });
  }

  async update(
    workspaceId: string,
    ownerId: string,
    packageId: string,
    dto: UpdateRulePackageDto,
  ) {
    const existing = await this.assertEditable(workspaceId, ownerId, packageId);
    const rules = dto.rules ? this.normalizeRules(dto.rules) : undefined;
    const claim = existing.scope === RulePackageScope.PUBLIC;

    return this.prisma.rulePackage.update({
      where: { id: packageId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.evaluates !== undefined
          ? { evaluates: dto.evaluates.trim() }
          : {}),
        ...(claim
          ? {
              scope: RulePackageScope.WORKSPACE,
              ownerId,
              workspaceId,
            }
          : dto.scope !== undefined
            ? {
                scope: dto.scope,
                workspaceId:
                  dto.scope === RulePackageWriteScope.WORKSPACE
                    ? workspaceId
                    : null,
              }
            : {}),
        ...(rules
          ? {
              rules: {
                deleteMany: {},
                create: rules,
              },
            }
          : {}),
      },
      include: packageInclude,
    });
  }

  async remove(workspaceId: string, ownerId: string, packageId: string) {
    await this.assertEditable(workspaceId, ownerId, packageId);
    await this.prisma.rulePackage.delete({ where: { id: packageId } });
  }

  private async assertEditable(
    workspaceId: string,
    ownerId: string,
    packageId: string,
  ) {
    const value = await this.prisma.rulePackage.findUnique({
      where: { id: packageId },
      select: { ownerId: true, scope: true, workspaceId: true },
    });
    if (!value) throw new NotFoundException('Rule package not found');
    if (value.scope === RulePackageScope.PUBLIC) return value;
    if (value.ownerId !== ownerId) {
      throw new NotFoundException('Rule package not found');
    }
    if (
      value.scope === RulePackageScope.WORKSPACE &&
      value.workspaceId !== workspaceId
    ) {
      throw new NotFoundException('Rule package not found');
    }
    return value;
  }

  private normalizeRules(rules: RulePackageRuleDto[]) {
    const positions = new Set(rules.map((rule) => rule.position));
    if (positions.size !== rules.length) {
      throw new BadRequestException('Rule positions must be unique');
    }
    return [...rules]
      .sort((left, right) => left.position - right.position)
      .map((rule) => ({
        name: rule.name.trim(),
        description: rule.description?.trim(),
        valuation: rule.valuation,
        position: rule.position,
      }));
  }
}
