/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { FirebaseService } from '../firebase/firebase.service';
import type { McpAuthenticatedRequest } from '../mcp/mcp-auth.types';
import { McpOAuthService } from '../mcp/mcp-oauth.service';
import { UsersService } from '../users/users.service';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
    private readonly mcpOAuth: McpOAuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (this.isMcpRequest(request)) {
      return this.authenticateMcpRequest(context, request, token);
    }

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const decodedToken = await this.firebaseService.verifyIdToken(token);
      const email = decodedToken.email?.trim();

      if (!email) {
        throw new UnauthorizedException(
          'Authenticated user is missing an email',
        );
      }

      const name = decodedToken.name?.trim() || email.split('@')[0] || 'User';

      let user = await this.usersService.findOneByFirebaseUid(decodedToken.uid);

      if (!user) {
        user = await this.usersService.create({
          name,
          email,
          firebaseUid: decodedToken.uid,
          photoUrl: decodedToken.picture,
        });
      }

      request['user'] = { ...decodedToken, id: user.id };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(
        'Failed to authenticate request',
        error instanceof Error ? error.stack : undefined,
      );
      throw new UnauthorizedException();
    }
    return true;
  }

  private async authenticateMcpRequest(
    context: ExecutionContext,
    request: Request,
    token?: string,
  ) {
    const response = context.switchToHttp().getResponse<Response>();
    const challenge = `Bearer resource_metadata="${this.mcpOAuth.publicApiUrl}/.well-known/oauth-protected-resource", scope="reports:read reports:write"`;
    if (!token) {
      response.setHeader('WWW-Authenticate', challenge);
      throw new UnauthorizedException('MCP bearer token is required');
    }

    try {
      const identity = await this.mcpOAuth.validateAccessToken(token);
      if (!identity.scopes.includes('reports:read')) {
        throw new UnauthorizedException('Missing reports:read scope');
      }
      const authenticatedRequest = request as McpAuthenticatedRequest;
      authenticatedRequest.auth = {
        token,
        clientId: identity.clientId,
        scopes: identity.scopes,
        expiresAt: identity.expiresAt,
        extra: { userId: identity.userId },
      };
      request['user'] = { id: identity.userId };
      return true;
    } catch {
      response.setHeader('WWW-Authenticate', challenge);
      throw new UnauthorizedException('Invalid or expired MCP access token');
    }
  }

  private isMcpRequest(request: Request) {
    return request.originalUrl.split('?')[0] === '/api/mcp';
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const raw = request.headers.authorization;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) {
      return undefined;
    }
    const [type, token] = value.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
