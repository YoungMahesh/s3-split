import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

export const TEST_DB_PREFIX = 'test_s3_split_';
export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export interface ParsedDbName {
  isTestDb: boolean;
  isTemplate: boolean;
  timestamp?: number;
  rand?: string;
  isConforming: boolean;
}

/**
 * Normalizes the administrative database URL from TEST_DATABASE_SERVER.
 * If no database path is given, defaults to /postgres.
 */
export function getAdminUrl(serverUrlString?: string): URL {
  const raw = serverUrlString || process.env.TEST_DATABASE_SERVER;
  if (!raw) {
    throw new Error(
      'TEST_DATABASE_SERVER environment variable is not defined. Please configure TEST_DATABASE_SERVER in your environment to run integration tests.',
    );
  }
  const url = new URL(raw);
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/postgres';
  }
  return url;
}

/**
 * Returns a connection URL for a specific database on the test server.
 */
export function getDatabaseUrl(serverUrlString: string, dbName: string): string {
  const url = new URL(serverUrlString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

/**
 * Parses a database name to check if it matches test database naming conventions.
 */
export function parseTestDbName(dbName: string): ParsedDbName {
  if (!dbName.startsWith(TEST_DB_PREFIX)) {
    return { isTestDb: false, isTemplate: false, isConforming: false };
  }

  const templateMatch = dbName.match(/^test_s3_split_tpl_(\d+)_([a-zA-Z0-9]+)$/);
  if (templateMatch) {
    const timestamp = parseInt(templateMatch[1], 10);
    return {
      isTestDb: true,
      isTemplate: true,
      timestamp,
      rand: templateMatch[2],
      isConforming: Number.isFinite(timestamp),
    };
  }

  const suiteMatch = dbName.match(/^test_s3_split_(\d+)_([a-zA-Z0-9]+)$/);
  if (suiteMatch) {
    const timestamp = parseInt(suiteMatch[1], 10);
    return {
      isTestDb: true,
      isTemplate: false,
      timestamp,
      rand: suiteMatch[2],
      isConforming: Number.isFinite(timestamp),
    };
  }

  return {
    isTestDb: true,
    isTemplate: false,
    isConforming: false,
  };
}

/**
 * Drops a database using WITH (FORCE) after terminating any remaining backend connections.
 */
export async function dropDatabase(adminPool: Pool, dbName: string): Promise<void> {
  // Terminate any active sessions connected to this database
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  // Force drop database
  await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
}

/**
 * Pre-flight orphan sweeper: queries the PostgreSQL database catalog for test databases,
 * drops any test databases older than maxAgeMs (default: 2 hours), and purges unparseable
 * non-conforming test databases matching the prefix. Non-test databases are never touched.
 */
export async function sweepOrphanDatabases(
  adminPool: Pool,
  maxAgeMs = TWO_HOURS_MS,
  now = Date.now(),
): Promise<{ dropped: string[]; kept: string[] }> {
  const result = await adminPool.query<{ datname: string }>(
    `SELECT datname FROM pg_database WHERE datname LIKE $1`,
    [`${TEST_DB_PREFIX}%`],
  );

  const dropped: string[] = [];
  const kept: string[] = [];

  for (const row of result.rows) {
    const datname = row.datname;
    const parsed = parseTestDbName(datname);

    if (!parsed.isTestDb) {
      kept.push(datname);
      continue;
    }

    if (!parsed.isConforming) {
      // Purge non-conforming / unparseable test database
      await dropDatabase(adminPool, datname);
      dropped.push(datname);
      continue;
    }

    if (parsed.timestamp !== undefined) {
      const age = now - parsed.timestamp;
      if (age > maxAgeMs) {
        // Dropped because it exceeded the TTL
        await dropDatabase(adminPool, datname);
        dropped.push(datname);
        continue;
      }
    }

    kept.push(datname);
  }

  return { dropped, kept };
}

/**
 * Creates and initializes a template database with all Drizzle migrations applied,
 * terminates all active connections, and sets ALLOW_CONNECTIONS = false.
 */
export async function createTemplateDatabase(
  adminPool: Pool,
  adminUrl: URL,
  templateDbName: string,
  migrationsFolder: string,
): Promise<void> {
  await adminPool.query(`CREATE DATABASE "${templateDbName}"`);

  const tplUrl = getDatabaseUrl(adminUrl.toString(), templateDbName);
  const tplPool = new Pool({ connectionString: tplUrl });
  tplPool.on('error', () => {});
  const db = drizzle({ client: tplPool });

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await tplPool.end();
  }

  // Terminate any remaining sessions on the template
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [templateDbName],
  );

  // Disallow connections so native template cloning works without connection lock conflicts
  await adminPool.query(`ALTER DATABASE "${templateDbName}" ALLOW_CONNECTIONS = false`);
}

/**
 * Clones an isolated suite database from the pre-migrated template database.
 */
export async function cloneSuiteDatabase(
  adminPool: Pool,
  templateDbName: string,
  suiteDbName: string,
): Promise<void> {
  await adminPool.query(`CREATE DATABASE "${suiteDbName}" TEMPLATE "${templateDbName}"`);
}
