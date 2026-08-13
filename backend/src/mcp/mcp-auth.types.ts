import type { Request } from 'express';

export type McpAuthenticatedRequest = Request & {
  auth?: {
    token: string;
    clientId: string;
    scopes: string[];
    expiresAt: number;
    extra: { userId: string };
  };
};
