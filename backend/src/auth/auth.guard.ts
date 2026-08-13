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
import type { Request } from 'express';
import { FirebaseService } from '../firebase/firebase.service';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request: Request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const decodedToken = await this.firebaseService.verifyIdToken(token);
      const email = decodedToken.email?.trim();

      if (!email) {
        throw new UnauthorizedException('Authenticated user is missing an email');
      }

      const name =
        decodedToken.name?.trim() || email.split('@')[0] || 'User';

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
