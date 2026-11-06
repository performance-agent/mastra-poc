import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { User } from '../auth/types/user.type';
import { McpOAuthService } from './mcp-oauth.service';

@Controller()
export class McpOAuthController {
  constructor(private readonly oauth: McpOAuthService) {}

  @Public()
  @Get('.well-known/oauth-protected-resource')
  protectedResourceMetadata() {
    return this.oauth.protectedResourceMetadata();
  }

  @Public()
  @Get('.well-known/oauth-authorization-server')
  authorizationServerMetadata() {
    return this.oauth.authorizationServerMetadata();
  }

  @Public()
  @Get('oauth/authorize')
  async authorize(
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response,
  ) {
    const loginUrl = await this.oauth.beginAuthorization({
      responseType: query.response_type,
      clientId: query.client_id,
      redirectUri: query.redirect_uri,
      state: query.state,
      codeChallenge: query.code_challenge,
      codeChallengeMethod: query.code_challenge_method,
      scope: query.scope,
      resource: query.resource,
    });
    return response.redirect(loginUrl);
  }

  @Public()
  @HttpCode(200)
  @Post('oauth/token')
  async token(
    @Body() body: Record<string, string | undefined>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    return this.oauth.exchangeToken({
      grantType: body.grant_type,
      code: body.code,
      redirectUri: body.redirect_uri,
      clientId: body.client_id,
      codeVerifier: body.code_verifier,
      refreshToken: body.refresh_token,
      resource: body.resource,
    });
  }

  @Public()
  @HttpCode(200)
  @Post('oauth/revoke')
  async revoke(@Body() body: Record<string, string | undefined>) {
    await this.oauth.revokeToken(body.token);
    return {};
  }

  @Public()
  @HttpCode(201)
  @Post('oauth/register')
  register(@Body() body: Record<string, unknown>) {
    return this.oauth.registerClient({
      clientName: body.client_name,
      redirectUris: body.redirect_uris,
      grantTypes: body.grant_types,
      responseTypes: body.response_types,
      tokenEndpointAuthMethod: body.token_endpoint_auth_method,
      tokenEndpointAuthMethods: body.token_endpoint_auth_methods_supported,
      applicationType: body.application_type,
    });
  }

  @Get('oauth/authorizations/:id')
  authorizationDetails(@Param('id') authorizationId: string) {
    return this.oauth.getAuthorizationDetails(authorizationId);
  }

  @Post('oauth/authorizations/:id/approve')
  approve(@Param('id') authorizationId: string, @CurrentUser() user: User) {
    return this.oauth.approveAuthorization(authorizationId, user.id);
  }
}
