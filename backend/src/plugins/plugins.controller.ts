import { Controller, Get, Param } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';

@Controller('plugins')
export class PluginsController {
  constructor(private readonly registry: PluginRegistryService) {}

  @Get()
  findAll() {
    return this.registry.findAll();
  }

  @Get(':pluginId')
  findOne(@Param('pluginId') pluginId: string) {
    return this.registry.findOne(pluginId);
  }
}
