import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function validateSecretsEncryptionKey(): void {
  encryptionKey();
}

export function encryptConfiguration(
  configuration: unknown,
  secretPaths: readonly string[],
): unknown {
  const output = clone(configuration);
  for (const path of secretPaths) {
    transformPath(output, path, (value) => {
      if (typeof value !== 'string' || value.startsWith(PREFIX)) return value;
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
      const encrypted = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
      ]);
      return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')}`;
    });
  }
  return output;
}

export function decryptConfiguration(configuration: unknown): unknown {
  return visit(clone(configuration), (value) => {
    if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
    const payload = Buffer.from(value.slice(PREFIX.length), 'base64');
    if (payload.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('Invalid encrypted configuration value');
    }
    const iv = payload.subarray(0, IV_LENGTH);
    const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = payload.subarray(IV_LENGTH + TAG_LENGTH);
    try {
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Unable to decrypt configuration value');
    }
  });
}

export function omitConfigurationPaths(
  configuration: unknown,
  paths: readonly string[],
): unknown {
  const output = clone(configuration);
  for (const path of paths) deletePath(output, path);
  return output;
}

function encryptionKey(): Buffer {
  const encoded = process.env.SECRETS_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('SECRETS_ENCRYPTION_KEY must be valid base64 for 32 bytes');
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error('SECRETS_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

function transformPath(
  value: unknown,
  path: string,
  transform: (value: unknown) => unknown,
) {
  const parts = path.split('.').filter(Boolean);
  if (!parts.length || !value || typeof value !== 'object') return;
  let parent = value as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = parent[part];
    if (!next || typeof next !== 'object') return;
    parent = next as Record<string, unknown>;
  }
  const key = parts.at(-1)!;
  if (Object.prototype.hasOwnProperty.call(parent, key))
    parent[key] = transform(parent[key]);
}

function deletePath(value: unknown, path: string) {
  transformPath(value, path, () => undefined);
  const parts = path.split('.').filter(Boolean);
  if (!parts.length || !value || typeof value !== 'object') return;
  let parent = value as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = parent[part];
    if (!next || typeof next !== 'object') return;
    parent = next as Record<string, unknown>;
  }
  delete parent[parts.at(-1)!];
}

function visit(
  value: unknown,
  transform: (value: unknown) => unknown,
): unknown {
  if (Array.isArray(value)) return value.map((item) => visit(item, transform));
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      (value as Record<string, unknown>)[key] = visit(child, transform);
    }
    return value;
  }
  return transform(value);
}
