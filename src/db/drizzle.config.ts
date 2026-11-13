
import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const requiredEnv = [
  'SQL_HOST',
  'SQL_PORT',
  'SQL_DB_NAME',
  'SQL_ADMIN_USER',
  'SQL_ADMIN_PASSWORD',
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`${key} must be set in environment variables.`);
  }
}

const sqlHost = process.env.SQL_HOST!;
const sqlPort = Number(process.env.SQL_PORT);
const sqlDbName = process.env.SQL_DB_NAME!;
const user = process.env.SQL_ADMIN_USER!;
const password = process.env.SQL_ADMIN_PASSWORD!;

if (!Number.isInteger(sqlPort) || sqlPort < 1 || sqlPort > 65535) {
  throw new Error('SQL_PORT must be a valid port number.');
}

console.log('Drizzle Kit PostgreSQL Configuration');
console.log(`Host     : ${sqlHost}`);
console.log(`Port     : ${sqlPort}`);
console.log(`Database : ${sqlDbName}`);
console.log(`User     : ${user}`);

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',

  dialect: 'postgresql',

  schemaFilter: ['public'],

  dbCredentials: {
    host: sqlHost,
    port: sqlPort,
    user,
    password,
    database: sqlDbName,
    ssl: false,
  },

  verbose: true,
  strict: true,
});
