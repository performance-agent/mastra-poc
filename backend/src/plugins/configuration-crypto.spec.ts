import {
  decryptConfiguration,
  encryptConfiguration,
  omitConfigurationPaths,
  validateSecretsEncryptionKey,
} from './configuration-crypto';

describe('configuration encryption', () => {
  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
    else process.env.SECRETS_ENCRYPTION_KEY = originalKey;
  });

  it('encrypts only configured nested string paths without mutating input', () => {
    const input = {
      token: 'secret',
      webhook: { secret: 'nested', label: 'public' },
      count: 2,
    };
    const encrypted = encryptConfiguration(input, [
      'token',
      'webhook.secret',
      'count',
    ]) as typeof input;
    expect(encrypted.token).toMatch(/^enc:v1:/);
    expect(encrypted.webhook.secret).toMatch(/^enc:v1:/);
    expect(encrypted.webhook.label).toBe('public');
    expect(encrypted.count).toBe(2);
    expect(input.token).toBe('secret');
    expect(decryptConfiguration(encrypted)).toEqual(input);
  });

  it('does not encrypt an encrypted value twice', () => {
    const once = encryptConfiguration({ token: 'secret' }, ['token']);
    expect(encryptConfiguration(once, ['token'])).toEqual(once);
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptConfiguration({ token: 'secret' }, ['token']) as {
      token: string;
    };
    const payload = Buffer.from(
      encrypted.token.slice('enc:v1:'.length),
      'base64',
    );
    payload[payload.length - 1] ^= 1;
    expect(() =>
      decryptConfiguration({ token: `enc:v1:${payload.toString('base64')}` }),
    ).toThrow('Unable to decrypt configuration value');
  });

  it('validates the encryption key', () => {
    process.env.SECRETS_ENCRYPTION_KEY = 'invalid';
    expect(validateSecretsEncryptionKey).toThrow('SECRETS_ENCRYPTION_KEY');
  });

  it('omits sensitive paths without mutating input', () => {
    const input = {
      token: 'secret',
      nested: { secret: 'hidden', visible: true },
    };
    expect(omitConfigurationPaths(input, ['token', 'nested.secret'])).toEqual({
      nested: { visible: true },
    });
    expect(input.token).toBe('secret');
  });
});
