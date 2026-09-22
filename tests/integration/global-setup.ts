import { Pool } from 'pg';
import path from 'path';
import {
  getAdminUrl,
  sweepOrphanDatabases,
  createTemplateDatabase,
  dropDatabase,
} from '@/tests/helpers/db-admin';

export interface GlobalSetupContext {
  provide?: (key: string, value: unknown) => void;
}

export default async function globalSetup(context?: GlobalSetupContext): Promise<() => Promise<void>> {
  // 1. Fail-fast check on TEST_DATABASE_SERVER presence
  const rawServerUrl = process.env.TEST_DATABASE_SERVER;
  if (!rawServerUrl || !rawServerUrl.trim()) {
    throw new Error(
      'TEST_DATABASE_SERVER environment variable is not defined.\n' +
        'Please configure TEST_DATABASE_SERVER in your environment to run integration tests.',
    );
  }

  const adminUrl = getAdminUrl(rawServerUrl);
  const adminPool = new Pool({ connectionString: adminUrl.toString() });

  // 2. Validate connectivity to the remote PostgreSQL test server
  try {
    await adminPool.query('SELECT 1');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await adminPool.end().catch(() => {});
    throw new Error(
      `Failed to connect to TEST_DATABASE_SERVER (${adminUrl.host}): ${message}.\n` +
        'Please verify that the test database server is reachable and credentials are valid.',
    );
  }

  // 3. Pre-flight sweep of orphaned test databases (TTL: 2 hours, plus malformed test databases)
  try {
    const sweepResult = await sweepOrphanDatabases(adminPool);
    if (sweepResult.dropped.length > 0) {
      console.log(`[test-db] Swept ${sweepResult.dropped.length} orphaned/stale test databases.`);
    }
  } catch (sweepErr) {
    console.warn('[test-db] Warning: Pre-flight orphan sweep encountered an issue:', sweepErr);
  }

  // 4. Create and migrate session-scoped template database
  const templateDbName = `test_s3_split_tpl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

  try {
    await createTemplateDatabase(adminPool, adminUrl, templateDbName, migrationsFolder);
  } catch (tplErr) {
    await adminPool.end().catch(() => {});
    throw new Error(`Failed to create and migrate template database ${templateDbName}: ${tplErr}`);
  }

  // 5. Expose template database name to Vitest workers
  if (context && typeof context.provide === 'function') {
    context.provide('testTemplateDb', templateDbName);
  }
  process.env.TEST_TEMPLATE_DB = templateDbName;

  // Signal handlers for best-effort cleanup
  const cleanupSignals = async () => {
    try {
      await dropDatabase(adminPool, templateDbName);
    } catch {
      // ignore on abort
    }
  };

  process.once('SIGINT', cleanupSignals);
  process.once('SIGTERM', cleanupSignals);

  // 6. Global teardown hook
  return async () => {
    process.removeListener('SIGINT', cleanupSignals);
    process.removeListener('SIGTERM', cleanupSignals);

    try {
      await dropDatabase(adminPool, templateDbName);
    } catch (dropErr) {
      console.warn(`[test-db] Failed to teardown template database ${templateDbName}:`, dropErr);
    } finally {
      await adminPool.end().catch(() => {});
    }
  };
}
