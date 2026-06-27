import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mastra } from '../mastra';
import { groupGithubActivityReportSchema } from '../mastra/schemas/group-github-activity-report.schema';
import { groupGithubHistoryReportSchema } from '../mastra/schemas/group-github-history-report.schema';
import {
  PluginRuntimeService,
  type ReportMode,
} from '../plugins/runtime/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly activityAgent = mastra.getAgent(
    'groupGithubActivityReportAgent',
  );
  private readonly historyAgent = mastra.getAgent(
    'groupGithubHistoryReportAgent',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: PluginRuntimeService,
  ) {}

  createGroupReport(groupId: string, dto: CreateReportDto) {
    switch (dto.type) {
      case 'GITHUB_ACTIVITY':
        return this.createSoftwareReport(groupId, dto.type, 'activity');
      case 'GITHUB_HISTORY':
        return this.createSoftwareReport(groupId, dto.type, 'history');
      default:
        throw new BadRequestException('Unsupported report type');
    }
  }

  createGroupReportAsync(groupId: string, dto: CreateReportDto) {
    void this.createGroupReport(groupId, dto).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to create ${dto.type} report for group ${groupId}: ${message}`,
        stack,
      );
    });
    return { status: 'CREATING', type: dto.type, groupId };
  }

  private async createSoftwareReport(
    groupId: string,
    type: 'GITHUB_ACTIVITY' | 'GITHUB_HISTORY',
    mode: ReportMode,
  ) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        resourceAssignments: {
          include: {
            resource: { include: { pluginInstallation: true } },
          },
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found');

    const assignedResources = group.resourceAssignments
      .map((assignment) => assignment.resource)
      .filter((resource) => resource.active);
    if (!assignedResources.length) {
      throw new BadRequestException(
        'This group has no active plugin resources assigned',
      );
    }

    const generatedAt = new Date();
    const from =
      mode === 'activity'
        ? new Date(generatedAt.getTime() - 14 * 24 * 60 * 60 * 1000)
        : undefined;
    const providerData = await this.runtime.provide(
      assignedResources,
      mode,
      from,
    );
    const hasSuccessfulDataset = providerData.resources.some(
      (resource) => resource.datasets.length > 0,
    );
    if (!hasSuccessfulDataset) {
      throw new BadRequestException({
        message: 'No plugin data provider could produce report input',
        limitations: providerData.limitations,
      });
    }

    const reportInput = {
      group: { id: group.id, name: group.name },
      reportMode: mode,
      generatedAt: generatedAt.toISOString(),
      period:
        mode === 'activity'
          ? {
              from: from!.toISOString(),
              to: generatedAt.toISOString(),
              label: 'Last 14 days',
            }
          : null,
      resources: providerData.resources,
      limitations: providerData.limitations,
    };

    const prompt = `Generate a structured software engineering ${mode} report from the plugin-native datasets below.

Datasets are grouped by resource and data type. Treat limitations and truncated datasets explicitly. Do not assume every plugin uses GitHub-shaped records. Preserve the requested output schema for compatibility.

Input:
${JSON.stringify(reportInput)}`;
    const reportData =
      mode === 'activity'
        ? (
            await this.activityAgent.generate(
              [{ role: 'user', content: prompt }],
              {
                structuredOutput: { schema: groupGithubActivityReportSchema },
              },
            )
          ).object
        : (
            await this.historyAgent.generate(
              [{ role: 'user', content: prompt }],
              {
                structuredOutput: { schema: groupGithubHistoryReportSchema },
              },
            )
          ).object;

    return this.prisma.performanceReport.create({
      data: { groupId, type, data: reportData },
    });
  }

  findOne(id: string) {
    return this.prisma.performanceReport.findUnique({ where: { id } });
  }

  findAllByGroup(groupId: string) {
    return this.prisma.performanceReport.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
