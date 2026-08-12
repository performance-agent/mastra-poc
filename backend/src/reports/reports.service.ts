import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mastra } from '../mastra';
import { groupReportSchema } from '../mastra/schemas/group-report.schema';
import { PluginRuntimeService } from '../plugins/runtime/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly groupReportAgent = mastra.getAgent('groupReportAgent');

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: PluginRuntimeService,
  ) {}

  createGroupReport(groupId: string, dto: CreateReportDto) {
    if (dto.type !== 'GROUP_REPORT') {
      throw new BadRequestException(
        'Only GROUP_REPORT can be generated. Legacy report types are read-only.',
      );
    }
    return this.createSoftwareReport(groupId);
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
    return { status: 'CREATING', type: 'GROUP_REPORT' as const, groupId };
  }

  private async createSoftwareReport(groupId: string) {
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
    const providerData = await this.runtime.provide(
      assignedResources,
      'history',
      undefined,
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
      reportMode: 'history',
      generatedAt: generatedAt.toISOString(),
      period: null,
      resources: providerData.resources,
      limitations: providerData.limitations,
      coverage: buildCoverage(providerData),
    };

    const prompt = `Generate a structured historical group report from the plugin-native datasets below.

Datasets are grouped by resource and native data type. Treat limitations and truncated datasets explicitly. Do not assume a provider, resource, record, identity, metric, or link shape. Use neutral labels and the requested output schema.

Input:
${JSON.stringify(reportInput)}`;
    const generatedReport = (
      await this.groupReportAgent.generate(
        [{ role: 'user', content: prompt }],
        { structuredOutput: { schema: groupReportSchema } },
      )
    ).object;
    const reportData = {
      ...generatedReport,
      coverage: reportInput.coverage,
    };

    return this.prisma.performanceReport.create({
      data: { groupId, type: 'GROUP_REPORT', data: reportData },
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

type ProviderData = Awaited<ReturnType<PluginRuntimeService['provide']>>;

function buildCoverage(providerData: ProviderData) {
  const datasets = providerData.resources.flatMap(
    (resource) => resource.datasets,
  );
  const timestamps = datasets
    .flatMap((dataset) => dataset.records)
    .map(recordTimestamp)
    .filter((value): value is number => value !== null);
  const firstTimestamp = timestamps.reduce<number | null>(
    (earliest, value) =>
      earliest === null ? value : Math.min(earliest, value),
    null,
  );
  const lastTimestamp = timestamps.reduce<number | null>(
    (latest, value) => (latest === null ? value : Math.max(latest, value)),
    null,
  );
  const limitations = providerData.limitations.map(
    (limitation) =>
      `${limitation.pluginId}/${limitation.resourceId}/${limitation.dataType}: ${limitation.message}`,
  );

  for (const resource of providerData.resources) {
    for (const dataset of resource.datasets) {
      if (dataset.truncated) {
        limitations.push(
          `${resource.pluginId}/${resource.id}/${dataset.dataType}: ${dataset.records.length} of ${dataset.count} records were analyzed`,
        );
      }
    }
  }

  return {
    resourcesAnalyzed: providerData.resources.length,
    datasetsAnalyzed: datasets.length,
    recordsAnalyzed: datasets.reduce(
      (total, dataset) => total + dataset.records.length,
      0,
    ),
    firstActivityAt:
      firstTimestamp === null ? null : new Date(firstTimestamp).toISOString(),
    lastActivityAt:
      lastTimestamp === null ? null : new Date(lastTimestamp).toISOString(),
    limitations,
  };
}

function recordTimestamp(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ['updatedAt', 'committedAt', 'authoredAt', 'createdAt']) {
    const candidate = record[key];
    if (typeof candidate !== 'string') continue;
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}
