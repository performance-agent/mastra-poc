import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const READ_SCOPE = 'reports:read';
const WRITE_SCOPE = 'reports:write';
const SUPPORTED_SCOPES = [READ_SCOPE, WRITE_SCOPE] as const;
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

type AuthorizationRequest = {
  responseType?: string;
  clientId?: string;
  redirectUri?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  scope?: string;
  resource?: string;
};

type TokenRequest = {
  grantType?: string;
  code?: string;
  redirectUri?: string;
  clientId?: string;
  codeVerifier?: string;
  refreshToken?: string;
  resource?: string;
};

type ClientRegistrationRequest = {
  clientName?: unknown;
  redirectUris?: unknown;
  grantTypes?: unknown;
  responseTypes?: unknown;
  tokenEndpointAuthMethod?: unknown;
  applicationType?: unknown;
};

@Injectable()
export class McpOAuthService {
  readonly publicApiUrl = requiredUrl('PUBLIC_API_URL');
  readonly frontendUrl = requiredUrl('FRONTEND_URL');
  readonly resource = `${this.publicApiUrl}/api/mcp`;

  constructor(private readonly prisma: PrismaService) {}

  async connectionDetails(userId: string) {
    const tokens = await this.prisma.mcpOAuthToken.findMany({
      where: {
        userId,
        resource: this.resource,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { clientId: true },
      distinct: ['clientId'],
    });
    const clients = await this.prisma.mcpOAuthClient.findMany({
      where: { id: { in: tokens.map((token) => token.clientId) } },
      select: { id: true, clientName: true },
    });
    return {
      serverUrl: this.resource,
      clients: tokens.map((token) => ({
        id: token.clientId,
        name:
          clients.find((client) => client.id === token.clientId)?.clientName ??
          'MCP client',
      })),
    };
  }

  protectedResourceMetadata() {
    return {
      resource: this.resource,
      authorization_servers: [this.publicApiUrl],
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ['header'],
    };
  }

  authorizationServerMetadata() {
    return {
      issuer: this.publicApiUrl,
      authorization_endpoint: `${this.publicApiUrl}/oauth/authorize`,
      token_endpoint: `${this.publicApiUrl}/oauth/token`,
      revocation_endpoint: `${this.publicApiUrl}/oauth/revoke`,
      registration_endpoint: `${this.publicApiUrl}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
      scopes_supported: [...SUPPORTED_SCOPES],
    };
  }

  async beginAuthorization(input: AuthorizationRequest) {
    if (input.responseType !== 'code') {
      throw oauthError(
        'unsupported_response_type',
        'response_type must be code',
      );
    }
    if (
      !input.clientId ||
      !input.redirectUri ||
      !input.codeChallenge ||
      input.codeChallengeMethod !== 'S256'
    ) {
      throw oauthError(
        'invalid_request',
        'client_id, redirect_uri and PKCE S256 are required',
      );
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge)) {
      throw oauthError('invalid_request', 'Invalid PKCE code_challenge');
    }
    if (input.resource !== this.resource) {
      throw oauthError('invalid_target', 'Invalid OAuth resource');
    }

    const client = await this.validateOAuthClient(
      input.clientId,
      input.redirectUri,
    );
    const scope = normalizeScope(input.scope);

    const authorization = await this.prisma.mcpOAuthAuthorization.create({
      data: {
        clientId: input.clientId,
        clientName: client.clientName,
        redirectUri: input.redirectUri,
        state: input.state ?? '',
        codeChallenge: input.codeChallenge,
        scope,
        resource: this.resource,
        expiresAt: new Date(Date.now() + AUTHORIZATION_TTL_MS),
      },
      select: { id: true },
    });

    const loginUrl = new URL('/login', this.frontendUrl);
    loginUrl.searchParams.set('oauth_request', authorization.id);
    return loginUrl.toString();
  }

  async getAuthorizationDetails(authorizationId: string) {
    const authorization = await this.prisma.mcpOAuthAuthorization.findUnique({
      where: { id: authorizationId },
      select: {
        clientName: true,
        redirectUri: true,
        scope: true,
        expiresAt: true,
        approvedAt: true,
        consumedAt: true,
      },
    });
    if (
      !authorization ||
      authorization.expiresAt <= new Date() ||
      authorization.approvedAt ||
      authorization.consumedAt
    ) {
      throw oauthError(
        'invalid_request',
        'Authorization request is invalid or expired',
      );
    }
    return {
      clientName: authorization.clientName,
      redirectHost: redirectDisplayHost(authorization.redirectUri),
      loopbackRedirect: isLoopbackRedirectUri(authorization.redirectUri),
      scopes: authorization.scope.split(' ').filter(Boolean),
    };
  }

  async registerClient(input: ClientRegistrationRequest) {
    const redirectUris = stringArray(input.redirectUris, 'redirect_uris', 10);
    if (!redirectUris.length) {
      throw oauthError('invalid_client_metadata', 'redirect_uris is required');
    }
    const grantTypes = optionalStringArray(
      input.grantTypes,
      ['authorization_code', 'refresh_token'],
      'grant_types',
    );
    if (
      !grantTypes.includes('authorization_code') ||
      grantTypes.some(
        (grantType) =>
          !['authorization_code', 'refresh_token'].includes(grantType),
      )
    ) {
      throw oauthError('invalid_client_metadata', 'Unsupported grant_types');
    }
    const responseTypes = optionalStringArray(
      input.responseTypes,
      ['code'],
      'response_types',
    );
    if (responseTypes.length !== 1 || responseTypes[0] !== 'code') {
      throw oauthError(
        'invalid_client_metadata',
        'response_types must be ["code"]',
      );
    }
    const tokenEndpointAuthMethod =
      input.tokenEndpointAuthMethod === undefined
        ? 'none'
        : input.tokenEndpointAuthMethod;
    if (tokenEndpointAuthMethod !== 'none') {
      throw oauthError(
        'invalid_client_metadata',
        'Only public clients using token_endpoint_auth_method none are supported',
      );
    }
    const applicationType = normalizeApplicationType(
      input.applicationType,
      redirectUris,
    );
    for (const redirectUri of redirectUris) {
      validateRedirectUri(redirectUri, applicationType);
    }
    const clientName =
      typeof input.clientName === 'string' && input.clientName.trim()
        ? input.clientName.trim().slice(0, 200)
        : 'MCP Client';
    const clientId = `mcp_${randomToken()}`;
    const created = await this.prisma.mcpOAuthClient.create({
      data: {
        id: clientId,
        clientName,
        redirectUris,
        grantTypes,
        responseTypes,
        tokenEndpointAuthMethod,
        applicationType,
      },
    });

    return {
      client_id: created.id,
      client_id_issued_at: Math.floor(created.createdAt.getTime() / 1000),
      client_name: created.clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: tokenEndpointAuthMethod,
      application_type: applicationType,
    };
  }

  async approveAuthorization(authorizationId: string, userId: string) {
    const authorization = await this.prisma.mcpOAuthAuthorization.findUnique({
      where: { id: authorizationId },
    });
    if (
      !authorization ||
      authorization.expiresAt <= new Date() ||
      authorization.approvedAt ||
      authorization.consumedAt
    ) {
      throw oauthError(
        'invalid_request',
        'Authorization request is invalid or expired',
      );
    }

    const code = randomToken();
    const updated = await this.prisma.mcpOAuthAuthorization.updateMany({
      where: {
        id: authorization.id,
        approvedAt: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        userId,
        codeHash: hashToken(code),
        approvedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw oauthError(
        'invalid_request',
        'Authorization request was already used',
      );
    }

    const redirectUrl = new URL(authorization.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (authorization.state) {
      redirectUrl.searchParams.set('state', authorization.state);
    }
    return { redirectUrl: redirectUrl.toString() };
  }

  exchangeToken(input: TokenRequest) {
    if (input.grantType === 'authorization_code') {
      return this.exchangeAuthorizationCode(input);
    }
    if (input.grantType === 'refresh_token') {
      return this.exchangeRefreshToken(input);
    }
    throw oauthError('unsupported_grant_type', 'Unsupported grant_type');
  }

  async validateAccessToken(token: string) {
    const storedToken = await this.prisma.mcpOAuthToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (
      !storedToken ||
      storedToken.kind !== 'ACCESS' ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= new Date() ||
      storedToken.resource !== this.resource
    ) {
      throw new UnauthorizedException('Invalid or expired MCP access token');
    }

    return {
      userId: storedToken.userId,
      clientId: storedToken.clientId,
      scopes: storedToken.scope.split(' ').filter(Boolean),
      expiresAt: Math.floor(storedToken.expiresAt.getTime() / 1000),
    };
  }

  async revokeToken(token?: string) {
    if (!token) return;
    await this.prisma.mcpOAuthToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async exchangeAuthorizationCode(input: TokenRequest) {
    if (
      !input.code ||
      !input.redirectUri ||
      !input.clientId ||
      !input.codeVerifier ||
      input.resource !== this.resource
    ) {
      throw oauthError(
        'invalid_request',
        'Incomplete authorization_code request',
      );
    }
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)) {
      throw oauthError('invalid_grant', 'Invalid PKCE code_verifier');
    }

    const authorization = await this.prisma.mcpOAuthAuthorization.findUnique({
      where: { codeHash: hashToken(input.code) },
    });
    if (
      !authorization ||
      !authorization.userId ||
      !authorization.approvedAt ||
      authorization.consumedAt ||
      authorization.expiresAt <= new Date() ||
      authorization.clientId !== input.clientId ||
      authorization.redirectUri !== input.redirectUri ||
      authorization.resource !== input.resource ||
      !safeEqual(pkceChallenge(input.codeVerifier), authorization.codeChallenge)
    ) {
      throw oauthError(
        'invalid_grant',
        'Authorization code is invalid or expired',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.mcpOAuthAuthorization.updateMany({
        where: {
          id: authorization.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw oauthError(
          'invalid_grant',
          'Authorization code was already used',
        );
      }
      return issueTokenPair(transaction, {
        userId: authorization.userId!,
        clientId: authorization.clientId,
        scope: authorization.scope,
        resource: authorization.resource,
      });
    });
  }

  private async exchangeRefreshToken(input: TokenRequest) {
    if (
      !input.refreshToken ||
      !input.clientId ||
      input.resource !== this.resource
    ) {
      throw oauthError('invalid_request', 'Incomplete refresh_token request');
    }

    const refreshToken = await this.prisma.mcpOAuthToken.findUnique({
      where: { tokenHash: hashToken(input.refreshToken) },
    });
    if (
      !refreshToken ||
      refreshToken.kind !== 'REFRESH' ||
      refreshToken.revokedAt ||
      refreshToken.expiresAt <= new Date() ||
      refreshToken.clientId !== input.clientId ||
      refreshToken.resource !== input.resource
    ) {
      throw oauthError('invalid_grant', 'Refresh token is invalid or expired');
    }

    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.mcpOAuthToken.updateMany({
        where: { id: refreshToken.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw oauthError('invalid_grant', 'Refresh token was already used');
      }
      return issueTokenPair(transaction, {
        userId: refreshToken.userId,
        clientId: refreshToken.clientId,
        scope: refreshToken.scope,
        resource: refreshToken.resource,
      });
    });
  }

  private async validateOAuthClient(clientId: string, redirectUri: string) {
    let clientUrl: URL;
    try {
      clientUrl = new URL(clientId);
    } catch {
      const client = await this.prisma.mcpOAuthClient.findUnique({
        where: { id: clientId },
      });
      if (!client) {
        throw oauthError('invalid_client', 'Unknown OAuth client');
      }
      const redirectUris = jsonStringArray(client.redirectUris);
      if (
        !redirectUris.some((registered) =>
          redirectUriMatches(registered, redirectUri),
        )
      ) {
        throw oauthError(
          'invalid_request',
          'redirect_uri is not registered by the client',
        );
      }
      return { clientName: client.clientName };
    }
    await validatePublicMetadataUrl(clientUrl);

    let metadata: unknown;
    try {
      const response = await fetch(clientUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      metadata = await response.json();
    } catch {
      throw oauthError('invalid_client', 'Unable to validate client metadata');
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw oauthError('invalid_client', 'Invalid client metadata document');
    }
    const clientMetadata = metadata as Record<string, unknown>;
    if (clientMetadata.client_id !== clientId) {
      throw oauthError(
        'invalid_client',
        'Client metadata client_id does not match its URL',
      );
    }
    const redirectUris = stringArray(
      clientMetadata.redirect_uris,
      'redirect_uris',
      20,
    );
    validateRedirectUri(
      redirectUri,
      isNativeRedirectUri(redirectUri) ? 'native' : 'web',
    );
    if (
      !redirectUris.some((registered) =>
        redirectUriMatches(registered, redirectUri),
      )
    ) {
      throw oauthError(
        'invalid_request',
        'redirect_uri is not registered by the client',
      );
    }
    const clientName = clientMetadata.client_name;
    if (typeof clientName !== 'string' || !clientName.trim()) {
      throw oauthError(
        'invalid_client',
        'Client metadata must include client_name',
      );
    }
    const tokenEndpointAuthMethod =
      clientMetadata.token_endpoint_auth_method ?? 'none';
    if (tokenEndpointAuthMethod !== 'none') {
      throw oauthError(
        'invalid_client',
        'Only public CIMD clients using token_endpoint_auth_method none are supported',
      );
    }
    const grantTypes = optionalStringArray(
      clientMetadata.grant_types,
      ['authorization_code'],
      'grant_types',
    );
    const responseTypes = optionalStringArray(
      clientMetadata.response_types,
      ['code'],
      'response_types',
    );
    if (
      !grantTypes.includes('authorization_code') ||
      !responseTypes.includes('code')
    ) {
      throw oauthError(
        'invalid_client',
        'Client metadata must support authorization_code and code',
      );
    }
    return { clientName: clientName.trim().slice(0, 200) };
  }
}

function normalizeScope(value?: string) {
  const requested = value?.split(/\s+/).filter(Boolean) ?? [
    READ_SCOPE,
    WRITE_SCOPE,
  ];
  const unique = [...new Set(requested)];
  if (
    !unique.includes(READ_SCOPE) ||
    unique.some(
      (scope) =>
        !SUPPORTED_SCOPES.includes(scope as (typeof SUPPORTED_SCOPES)[number]),
    )
  ) {
    throw oauthError('invalid_scope', 'Unsupported OAuth scope');
  }
  return unique.join(' ');
}

function stringArray(value: unknown, field: string, maxItems: number) {
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some(
      (item) => typeof item !== 'string' || !item.trim() || item.length > 2048,
    )
  ) {
    throw oauthError(
      'invalid_client_metadata',
      `${field} must be a string array`,
    );
  }
  return [...new Set(value as string[])];
}

function optionalStringArray(
  value: unknown,
  fallback: string[],
  field: string,
) {
  return value === undefined ? fallback : stringArray(value, field, 10);
}

function jsonStringArray(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw oauthError(
      'invalid_client',
      'Stored OAuth client metadata is invalid',
    );
  }
  return value as string[];
}

function normalizeApplicationType(value: unknown, redirectUris: string[]) {
  if (value !== undefined && value !== 'native' && value !== 'web') {
    throw oauthError(
      'invalid_client_metadata',
      'application_type must be native or web',
    );
  }
  if (value === 'native' || value === 'web') return value;
  return redirectUris.some(isNativeRedirectUri) ? 'native' : 'web';
}

function validateRedirectUri(value: string, applicationType: 'native' | 'web') {
  try {
    const url = new URL(value);
    if (url.hash) throw new Error('fragments are not allowed');
    if (url.username || url.password)
      throw new Error('userinfo is not allowed');
    if (applicationType === 'web' && url.protocol !== 'https:') {
      throw new Error('web clients must use HTTPS redirects');
    }
    if (
      applicationType === 'native' &&
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && isLoopbackHostname(url.hostname))
    ) {
      throw new Error(
        'native redirects must use HTTPS or an HTTP loopback host',
      );
    }
  } catch {
    throw oauthError('invalid_redirect_uri', `Invalid redirect_uri: ${value}`);
  }
}

function isNativeRedirectUri(value: string) {
  try {
    const url = new URL(value);
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

function isLoopbackRedirectUri(value: string) {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

function redirectDisplayHost(value: string) {
  try {
    const url = new URL(value);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return value;
  }
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1'
  );
}

async function validatePublicMetadataUrl(url: URL) {
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.pathname === '/' ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw oauthError(
      'invalid_client',
      'CIMD client_id must be a public HTTPS URL with a path',
    );
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw oauthError('invalid_client', 'CIMD client_id must use a public host');
  }
  try {
    const addresses = isIP(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true, verbatim: true });
    if (
      !addresses.length ||
      addresses.some(({ address }) => isPrivateIp(address))
    ) {
      throw new Error('private address');
    }
  } catch {
    throw oauthError(
      'invalid_client',
      'CIMD client_id host is not publicly resolvable',
    );
  }
}

function isPrivateIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.includes(':')) {
    if (normalized.startsWith('::ffff:')) {
      const mappedAddress = normalized.slice('::ffff:'.length);
      if (mappedAddress.includes('.')) return isPrivateIp(mappedAddress);
    }
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('2001:db8:')
    );
  }
  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function requiredUrl(name: 'PUBLIC_API_URL' | 'FRONTEND_URL') {
  const value = process.env[name]?.trim().replace(/\/$/, '');
  if (!value) throw new Error(`${name} is required for the MCP OAuth server`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  return url.toString().replace(/\/$/, '');
}

function oauthError(error: string, description: string) {
  return new BadRequestException({
    error,
    error_description: description,
  });
}

function randomToken() {
  return randomBytes(32).toString('base64url');
}

function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function issueTokenPair(
  transaction: Prisma.TransactionClient,
  identity: {
    userId: string;
    clientId: string;
    scope: string;
    resource: string;
  },
) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  await Promise.all([
    transaction.mcpOAuthToken.create({
      data: {
        tokenHash: hashToken(accessToken),
        kind: 'ACCESS',
        ...identity,
        expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
      },
    }),
    transaction.mcpOAuthToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        kind: 'REFRESH',
        ...identity,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    }),
  ]);

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
    refresh_token: refreshToken,
    scope: identity.scope,
  };
}

function redirectUriMatches(registered: string, requested: string) {
  if (registered === requested) return true;

  try {
    const a = new URL(registered);
    const b = new URL(requested);

    if (!isLoopbackHostname(a.hostname) || !isLoopbackHostname(b.hostname)) {
      return false;
    }

    return (
      a.protocol === b.protocol &&
      a.hostname === b.hostname &&
      a.pathname === b.pathname &&
      a.search === b.search
    );
  } catch {
    return false;
  }
}
