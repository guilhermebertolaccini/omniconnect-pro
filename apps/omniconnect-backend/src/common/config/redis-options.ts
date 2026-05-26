export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getRedisConnectionOptions(env: NodeJS.ProcessEnv): RedisConnectionOptions {
  const urlLike = env.REDIS_URL || (env.REDIS_HOST?.startsWith('redis://') ? env.REDIS_HOST : undefined);

  if (urlLike) {
    const url = new URL(urlLike);
    const dbFromPath = url.pathname.replace('/', '');

    return {
      host: url.hostname,
      port: parseInteger(url.port, 6379),
      username: url.username ? decodeURIComponent(url.username) : env.REDIS_USERNAME,
      password: url.password ? decodeURIComponent(url.password) : env.REDIS_PASSWORD,
      db: dbFromPath ? parseInteger(dbFromPath, 0) : parseInteger(env.REDIS_DB, 0),
    };
  }

  return {
    host: env.REDIS_HOST || 'localhost',
    port: parseInteger(env.REDIS_PORT, 6379),
    username: env.REDIS_USERNAME,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB ? parseInteger(env.REDIS_DB, 0) : undefined,
  };
}
