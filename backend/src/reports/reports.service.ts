import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { SoftwareReportDataService } from './software-report-data.service';
import { PluginRegistryService } from '../plugin-runtime/plugin-registry.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly softwareReportDataService: SoftwareReportDataService,
  ) {}

  /**
   * @deprecated Legacy report endpoint. Generation is delegated to the
   * Software Reports plugin and canonical software pack resources.
   */
  async createGroupReport(groupId: string, createReportDto: CreateReportDto) {
    const group = await this.prismaService.group.findUnique({
      where: { id: groupId },
      include: { workspace: true },
    });
    if (!group) throw new NotFoundException('Group not found');

    const reportKey = this.reportKeyForLegacyType(createReportDto.type);
    const plugin = await this.pluginRegistry.requirePlugin('software-reports');
    const report = plugin.reports?.[reportKey];
    if (!report) {
      throw new BadRequestException(
        `Software report is not available: ${reportKey}`,
      );
    }

    const reportData = await report.run(
      this.softwareReportDataService.createContext({
        organizationId: group.workspace.organizationId,
        pluginId: plugin.manifest.id,
        scope: { type: 'group', id: groupId },
      }),
    );

    const jsonReportData = JSON.parse(JSON.stringify(reportData));

    return this.prismaService.performanceReport.create({
      data: {
        organizationId: group.workspace.organizationId,
        workspaceId: group.workspaceId,
        groupId,
        type: createReportDto.type,
        data: jsonReportData,
      },
    });
  }

  createGroupReportAsync(groupId: string, createReportDto: CreateReportDto) {
    void this.createGroupReport(groupId, createReportDto).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to create ${createReportDto.type} report for group ${groupId}: ${message}`,
        stack,
      );
    });

    return {
      status: 'CREATING',
      type: createReportDto.type,
      groupId,
    };
  }

  findOne(id: string) {
    return this.prismaService.performanceReport.findUnique({
      where: {
        id,
      },
    });
  }

  findAllByGroup(groupId: string) {
    return this.prismaService.performanceReport.findMany({
      where: {
        groupId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private reportKeyForLegacyType(type: string) {
    switch (type) {
      case 'GITHUB_ACTIVITY':
        return 'engineeringActivity';
      case 'GITHUB_HISTORY':
        return 'executiveSummary';
      default:
        throw new BadRequestException('Unsupported report type');
    }
  }
}
