import { afterAll, inject } from 'vitest';
import { Pool } from 'pg';
import {
  getAdminUrl,
  getDatabaseUrl,
  cloneSuiteDatabase,
  dropDatabase,
} from '@/tests/helpers/db-admin';
import { closeDb } from '@/db';

// 1. Resolve template database name
const injectedTemplate = typeof inject === 'function' ? (inject as (k: string) => string | undefined)('testTemplateDb') : undefined;
const templateDbName = injectedTemplate || process.env.TEST_TEMPLATE_DB;

if (!templateDbName) {
  throw new Error(
    'Template database name was not provided. Ensure globalSetup is configured and executed for the integration test project.',
  );
}

const adminUrl = getAdminUrl();
const adminPool = new Pool({ connectionString: adminUrl.toString() });
adminPool.on('error', () => {});

// 2. Clone isolated suite database from the pre-migrated template
const suiteDbName = `test_s3_split_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
await cloneSuiteDatabase(adminPool, templateDbName, suiteDbName);

// 3. Inject dedicated suite connection string before any test file queries or application singletons run
const suiteDbUrl = getDatabaseUrl(adminUrl.toString(), suiteDbName);
process.env.DATABASE_URL = suiteDbUrl;

// Best-effort cleanup on aborted runs (SIGINT / SIGTERM)
let cleanedUp = false;
const cleanup = async () => {
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    await closeDb();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await dropDatabase(adminPool, suiteDbName);
    await adminPool.end().catch(() => {});
  } catch {
    // Best-effort on exit
  }
};

process.once('SIGINT', cleanup);
process.once('SIGTERM', cleanup);

// 4. Deterministic teardown at the end of the test suite
afterAll(async () => {
  process.removeListener('SIGINT', cleanup);
  process.removeListener('SIGTERM', cleanup);

  try {
    // Drain active client connection pool sockets first to avoid socket reset warnings
    await closeDb();
    // Allow brief grace period for socket close handshake
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Admin drops the suite database
    await dropDatabase(adminPool, suiteDbName);
  } finally {
    await adminPool.end().catch(() => {});
  }
});
