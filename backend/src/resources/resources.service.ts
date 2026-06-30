import { Injectable } from '@nestjs/common';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { PrismaService } from '../prisma/prisma.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { omitConfigurationPaths } from '../plugins/configuration-crypto';

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly registry: PluginRegistryService,
  ) {}
  async findAllByOrganization(organizationId: string) {
    return this.sanitize(
      await this.prismaService.pluginInstallationResource.findMany({
        where: {
          pluginInstallation: {
            organizationId,
          },
        },
        include: { pluginInstallation: true },
      }),
    );
  }

  async findAllByWorkspace(workspaceId: string) {
    return this.sanitize(
      await this.prismaService.pluginInstallationResource.findMany({
        where: {
          assignments: {
            some: {
              workspaceId,
            },
          },
        },
        include: { pluginInstallation: true },
      }),
    );
  }

  async findAllByGroup(groupId: string) {
    return this.sanitize(
      await this.prismaService.pluginInstallationResource.findMany({
        where: {
          assignments: {
            some: {
              groupId,
            },
          },
        },
        include: { pluginInstallation: true },
      }),
    );
  }

  async findOne(id: string) {
    const value =
      await this.prismaService.pluginInstallationResource.findUnique({
        where: { id },
        include: { pluginInstallation: true },
      });
    return value ? this.sanitizeOne(value) : value;
  }

  async update(id: string, updateResourceDto: UpdateResourceDto) {
    return this.sanitizeOne(
      await this.prismaService.pluginInstallationResource.update({
        where: { id },
        data: updateResourceDto,
        include: { pluginInstallation: true },
      }),
    );
  }

  private async sanitize<
    T extends {
      pluginInstallation: { pluginId: string; configuration: unknown };
    },
  >(values: T[]) {
    return Promise.all(values.map((value) => this.sanitizeOne(value)));
  }

  private async sanitizeOne<
    T extends {
      pluginInstallation: { pluginId: string; configuration: unknown };
    },
  >(value: T) {
    const plugin = await this.registry.get(value.pluginInstallation.pluginId);
    const paths = plugin.secrets.definitions
      .filter((definition) => definition.sensitive)
      .map((definition) => definition.key);
    return {
      ...value,
      pluginInstallation: {
        ...value.pluginInstallation,
        configuration: omitConfigurationPaths(
          value.pluginInstallation.configuration,
          paths,
        ),
      },
    };
  }
}
