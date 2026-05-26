const DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3001',
];

type CorsEnvironment = {
  NODE_ENV?: string;
  CORS_ORIGINS?: string;
};

export function getCorsAllowedOrigins(
  env: CorsEnvironment = process.env,
): string[] {
  const configured = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (env.NODE_ENV === 'production') {
    if (configured.length === 0) {
      throw new Error('CORS_ORIGINS is required in production');
    }
    if (configured.includes('*')) {
      throw new Error('CORS_ORIGINS cannot contain * in production');
    }
  }

  return configured.length > 0 ? configured : DEVELOPMENT_ORIGINS;
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  env: CorsEnvironment = process.env,
): boolean {
  return !origin || getCorsAllowedOrigins(env).includes(origin);
}
