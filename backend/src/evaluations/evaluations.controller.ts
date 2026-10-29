import { TaskAnalysisService } from './task-analysis.service';
import { TaskAnalysisDto } from './dto/task-analysis.dto';
import { Patch } from '@nestjs/common';
import { GradingSettingsDto } from './dto/grading-settings.dto';
import { gradingSettings } from './grading';
import { PrismaService } from '../prisma/prisma.service';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationViewDto } from './dto/evaluation-view.dto';
import { EvaluationsService } from './evaluations.service';
import { ListEvaluationsDto } from './dto/list-evaluations.dto';

@Controller('workspaces/:workspaceId/evaluations')
export class EvaluationsController {
  constructor(
    private readonly evaluations: EvaluationsService,
    private readonly prisma: PrismaService,
    private readonly tasks: TaskAnalysisService,
  ) {}

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post('task-analysis')
  analyzeTask(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: TaskAnalysisDto,
  ) {
    return this.tasks.enqueue(workspaceId, dto);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get('tasks')
  tasksList(
    @Param('workspaceId') workspaceId: string,
    @Query('groupId') groupId?: string,
    @Query('search') search?: string,
  ) {
    return this.tasks.list(workspaceId, groupId, search);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get('sync-status')
  async syncStatus(
    @Param('workspaceId') workspaceId: string,
    @Query('groupId') groupId?: string,
  ) {
    const resources = await this.prisma.pluginInstallationResource.findMany({
      where: {
        assignments: {
          some: groupId ? { groupId, group: { workspaceId } } : { workspaceId },
        },
      },
      select: { id: true },
    });
    return this.prisma.resourceSync.findMany({
      where: { resourceId: { in: resources.map((r) => r.id) } },
      select: {
        resourceId: true,
        operation: true,
        checkpoint: true,
        leaseUntil: true,
        nextRetryAt: true,
        error: true,
      },
    });
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get('grading-settings')
  async settings(@Param('workspaceId') workspaceId: string) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    return gradingSettings(ws.gradingSettings);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch('grading-settings')
  async updateSettings(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: GradingSettingsDto,
  ) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    const settings = gradingSettings(ws.gradingSettings, dto);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { gradingSettings: settings },
    });
    return settings;
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get('jobs/:jobId')
  jobStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.evaluations.jobStatus(workspaceId, jobId);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get()
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListEvaluationsDto,
  ) {
    return this.evaluations.findAll(workspaceId, query);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get(':evaluationId')
  findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('evaluationId') evaluationId: string,
  ) {
    return this.evaluations.findOne(workspaceId, evaluationId);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post()
  evaluate(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateEvaluationDto,
    @Query() query: EvaluationViewDto,
  ) {
    return this.evaluations.enqueue(workspaceId, dto, query.view);
  }
}
