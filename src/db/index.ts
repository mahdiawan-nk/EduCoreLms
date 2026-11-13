
import 'dotenv/config';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

function requiredEnv(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}`
    );
  }

  return value;
}

export const createPool = (): Pool => {
  if (!globalThis._postgresPool) {
    const host = requiredEnv('SQL_HOST');
    const port = Number(process.env.SQL_PORT || 5432);

    globalThis._postgresPool = new Pool({
      host,
      port,
      user: requiredEnv('SQL_USER'),
      password: requiredEnv('SQL_PASSWORD'),
      database: requiredEnv('SQL_DB_NAME'),

      max: 10,
      min: 0,

      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      query_timeout: 30000,

      application_name: 'polkam-lms',
      ssl: false,
    });

    globalThis._postgresPool.on('error', (err) => {
      console.error(
        'Unexpected error on idle PostgreSQL client:',
        err.message
      );
    });
  }

  return globalThis._postgresPool;
};

export const pool = createPool();

export const db = drizzle(pool, {
  schema,
});
