import {
  getCorsAllowedOrigins,
  isCorsOriginAllowed,
} from './cors-options';

describe('cors options', () => {
  it('uses configured explicit origins', () => {
    expect(
      getCorsAllowedOrigins({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.test, https://omni.example.test',
      }),
    ).toEqual([
      'https://app.example.test',
      'https://omni.example.test',
    ]);
  });

  it('refuses a production deployment without an allowlist', () => {
    expect(() => getCorsAllowedOrigins({ NODE_ENV: 'production' })).toThrow(
      'CORS_ORIGINS is required in production',
    );
  });

  it('refuses wildcard CORS in production', () => {
    expect(() =>
      getCorsAllowedOrigins({
        NODE_ENV: 'production',
        CORS_ORIGINS: '*',
      }),
    ).toThrow('CORS_ORIGINS cannot contain * in production');
  });

  it('permits absent origins for non-browser requests only', () => {
    const env = {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.test',
    };
    expect(isCorsOriginAllowed(undefined, env)).toBe(true);
    expect(isCorsOriginAllowed('https://app.example.test', env)).toBe(true);
    expect(isCorsOriginAllowed('https://evil.example.test', env)).toBe(false);
  });
});
