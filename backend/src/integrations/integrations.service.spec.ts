import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { GithubService } from './github/github.service';
import { PluginRegistryService } from '../plugin-runtime/plugin-registry.service';
import { PrismaConnectionSetupSessionStore } from '../plugin-runtime/prisma-connection-setup-session.store';
import { PrismaConnectionBindingStore } from '../plugin-runtime/prisma-connection-binding.store';
import { PluginRuntimeLoggerService } from '../plugin-runtime/plugin-runtime-logger.service';

jest.mock('./github/github.service', () => ({
  GithubService: class GithubService {},
}));

describe('IntegrationsService', () => {
  let service: IntegrationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: GithubService,
          useValue: {},
        },
        {
          provide: PluginRegistryService,
          useValue: { getRegisteredPlugins: jest.fn(() => []) },
        },
        {
          provide: PrismaConnectionSetupSessionStore,
          useValue: {},
        },
        {
          provide: PrismaConnectionBindingStore,
          useValue: {},
        },
        {
          provide: PluginRuntimeLoggerService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<IntegrationsService>(IntegrationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
