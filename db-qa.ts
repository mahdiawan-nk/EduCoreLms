
import 'dotenv/config';
import { Pool } from 'pg';

const config = {
  host: process.env.SQL_HOST || '127.0.0.1',
  port: Number(process.env.SQL_PORT || 5432),
  database: process.env.SQL_DB_NAME || 'polkam_database',
  user: process.env.SQL_USER || 'polkam_app',
  password: process.env.SQL_PASSWORD || '',
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
  max: 2,
};

const pool = new Pool(config);

async function runQA() {
  console.log('\n================================');
  console.log(' POSTGRESQL CONNECTION QA');
  console.log('================================');

  console.log('Host     :', config.host);
  console.log('Port     :', config.port);
  console.log('Database :', config.database);
  console.log('User     :', config.user);

  try {
    // 1. Connection
    const client = await pool.connect();

    console.log('\n[PASS] Database connection');

    try {
      // 2. PostgreSQL version
      const version = await client.query(
        'SELECT version() AS version'
      );

      console.log('[PASS] PostgreSQL version');
      console.log(version.rows[0].version);

      // 3. Database information
      const info = await client.query(`
        SELECT
          current_database() AS database,
          current_user AS username,
          inet_server_addr() AS server_ip,
          inet_server_port() AS server_port,
          current_setting('TimeZone') AS timezone
      `);

      console.table(info.rows);

      // 4. Read test
      await client.query('SELECT 1');

      console.log('[PASS] Read query');

      // 5. Schema permissions
      const permissions = await client.query(`
        SELECT
          has_schema_privilege(
            current_user, 'public', 'USAGE'
          ) AS can_usage,
          has_schema_privilege(
            current_user, 'public', 'CREATE'
          ) AS can_create
      `);

      console.log('[PASS] Schema permission check');
      console.table(permissions.rows);

      // 6. Write test (temporary table)
      await client.query('BEGIN');

      try {
        await client.query(`
          CREATE TEMP TABLE qa_test (
            id SERIAL PRIMARY KEY,
            message TEXT
          )
        `);

        await client.query(`
          INSERT INTO qa_test (message)
          VALUES ('PostgreSQL QA Successful')
        `);

        const result = await client.query(
          'SELECT * FROM qa_test'
        );

        console.log('[PASS] Write transaction');
        console.table(result.rows);

      } finally {
        await client.query('ROLLBACK');
      }

      // 7. Database size
      const size = await client.query(`
        SELECT pg_size_pretty(
          pg_database_size(current_database())
        ) AS database_size
      `);

      console.log('[PASS] Database size');
      console.table(size.rows);

    } finally {
      client.release();
    }

    console.log('\n================================');
    console.log(' QA COMPLETED SUCCESSFULLY');
    console.log('================================');

  } catch (error) {
    console.error('\n[FAIL] Database QA');

    if (error instanceof Error) {
      console.error('Error:', error.message);
    }

    process.exitCode = 1;

  } finally {
    await pool.end();
  }
}

runQA();
