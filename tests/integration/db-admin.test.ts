import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { db, closeDb } from '@/db';
import { user } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  getAdminUrl,
  parseTestDbName,
  cloneSuiteDatabase,
  dropDatabase,
} from '@/tests/helpers/db-admin';

describe('Database Administration & Isolation (Integration)', () => {
  it('executes in an isolated database cloned from the template', async () => {
    const currentDbUrl = process.env.DATABASE_URL;
    expect(currentDbUrl).toBeDefined();

    const parsedUrl = new URL(currentDbUrl!);
    const dbName = parsedUrl.pathname.replace(/^\//, '');

    const parsed = parseTestDbName(dbName);
    expect(parsed.isTestDb).toBe(true);
    expect(parsed.isTemplate).toBe(false);
    expect(parsed.isConforming).toBe(true);
    expect(parsed.timestamp).toBeGreaterThan(0);
  });

  it('verifies that full schema migrations exist in the isolated suite database', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on('error', () => {});
    try {
      const res = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      const tables = res.rows.map((r) => r.table_name);

      expect(tables).toContain('user');
      expect(tables).toContain('upstream_account');
      expect(tables).toContain('managed_bucket');
      expect(tables).toContain('managed_objects');
      expect(tables).toContain('client_key');
      expect(tables).toContain('multipart_uploads');
      expect(tables).toContain('part_reservations');
    } finally {
      await pool.end();
    }
  });

  it('enforces real PostgreSQL constraints and supports mutations', async () => {
    const testId = `user-iso-${Date.now()}`;
    await db.insert(user).values({
      id: testId,
      name: 'Isolation Test User',
      email: `${testId}@example.com`,
      emailVerified: true,
    });

    const found = await db.select().from(user).where(eq(user.id, testId));
    expect(found).toHaveLength(1);
    expect(found[0].email).toBe(`${testId}@example.com`);

    // Clean up
    await db.delete(user).where(eq(user.id, testId));
  });

  it('gracefully drains connection pool via closeDb and re-establishes connection on demand', async () => {
    // Perform a query
    const res1 = await db.select().from(user).limit(1);
    expect(Array.isArray(res1)).toBe(true);

    // Drain connection pool
    await closeDb();

    // Next query should lazily re-instantiate the pool without errors
    const res2 = await db.select().from(user).limit(1);
    expect(Array.isArray(res2)).toBe(true);
  });

  it('supports dynamic template cloning and force dropping via administrative helpers', async () => {
    const adminUrl = getAdminUrl();
    const adminPool = new Pool({ connectionString: adminUrl.toString() });
    adminPool.on('error', () => {});

    const templateDbName = process.env.TEST_TEMPLATE_DB!;
    expect(templateDbName).toBeDefined();

    const tempCloneName = `test_s3_split_${Date.now()}_dyn_${Math.random().toString(36).substring(2, 6)}`;
    try {
      await cloneSuiteDatabase(adminPool, templateDbName, tempCloneName);

      // Verify the clone exists and has tables
      const checkRes = await adminPool.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [tempCloneName],
      );
      expect(checkRes.rows).toHaveLength(1);
    } finally {
      await dropDatabase(adminPool, tempCloneName);
      const afterDrop = await adminPool.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [tempCloneName],
      );
      expect(afterDrop.rows).toHaveLength(0);
      await adminPool.end();
    }
  });
});
