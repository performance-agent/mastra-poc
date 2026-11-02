jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { McpOAuthService } from './mcp-oauth.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('MCP account connection status', () => {
  it('reads only the current account active authorizations and returns no token values', async () => {
    const originalApi = process.env.PUBLIC_API_URL;
    const originalFrontend = process.env.FRONTEND_URL;
    process.env.PUBLIC_API_URL = 'https://api.example.test';
    process.env.FRONTEND_URL = 'https://example.test';
    try {
      const prisma = {
        mcpOAuthToken: {
          findMany: jest.fn().mockResolvedValue([{ clientId: 'c' }]),
        },
        mcpOAuthClient: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'c', clientName: 'Local agent' }]),
        },
      };
      const result = await new McpOAuthService(
        prisma as unknown as PrismaService,
      ).connectionDetails('me');
      expect(prisma.mcpOAuthToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'me',
            resource: 'https://api.example.test/api/mcp',
            revokedAt: null,
            expiresAt: { gt: expect.any(Date) },
          },
          select: { clientId: true },
        }),
      );
      expect(result).toEqual({
        serverUrl: 'https://api.example.test/api/mcp',
        clients: [{ id: 'c', name: 'Local agent' }],
      });
    } finally {
      if (originalApi === undefined) delete process.env.PUBLIC_API_URL;
      else process.env.PUBLIC_API_URL = originalApi;
      if (originalFrontend === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = originalFrontend;
    }
  });
});
