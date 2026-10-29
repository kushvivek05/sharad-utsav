import 'dotenv/config';

type NodeEnvironment = 'development' | 'test' | 'production';

function getEnum<T extends string>(name: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback;
  if (!allowed.includes(value as T)) throw new Error(`${name} must be one of: ${allowed.join(', ')}.`);
  return value as T;
}

function getInteger(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return parsed;
}

function getBoolean(name: string, value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be "true" or "false".`);
}

function getOrigins(value: string | undefined): string[] {
  const origins = (value || 'http://localhost:3000').split(',').map(origin => origin.trim()).filter(Boolean);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error();
    } catch {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}.`);
    }
  }
  return origins;
}

function loadEnvironment() {
  const nodeEnv = getEnum('NODE_ENV', process.env.NODE_ENV, ['development', 'test', 'production'] as const, 'development');
  const mysqlPassword = process.env.MYSQL_PASSWORD || '';
  if (nodeEnv === 'production' && !mysqlPassword) throw new Error('MYSQL_PASSWORD is required in production.');

  const mysqlSsl = getBoolean('MYSQL_SSL', process.env.MYSQL_SSL);
  const mysqlSslCa = process.env.MYSQL_SSL_CA?.trim() || undefined;
  if (mysqlSslCa && !mysqlSsl) throw new Error('MYSQL_SSL must be true when MYSQL_SSL_CA is provided.');

  return Object.freeze({
    nodeEnv,
    port: getInteger('PORT', process.env.PORT, 4000, 1, 65535),
    corsOrigins: getOrigins(process.env.CORS_ORIGINS),
    mysql: Object.freeze({
      host: process.env.MYSQL_HOST?.trim() || '127.0.0.1',
      port: getInteger('MYSQL_PORT', process.env.MYSQL_PORT, 3306, 1, 65535),
      user: process.env.MYSQL_USER?.trim() || (nodeEnv === 'production' ? 'sharad_utsav_app' : 'root'),
      password: mysqlPassword,
      database: process.env.MYSQL_DATABASE?.trim() || 'sharad_utsav',
      poolSize: getInteger('MYSQL_POOL_SIZE', process.env.MYSQL_POOL_SIZE, 10, 1, 100),
      ssl: mysqlSsl,
      sslCaPath: mysqlSslCa,
    }),
    bookingStorePath: process.env.BOOKING_STORE_PATH?.trim() || undefined,
  });
}

export const env = loadEnvironment();
