import { describe, it, expect, vi } from 'vitest';
import {
  getAdminUrl,
  getDatabaseUrl,
  parseTestDbName,
  sweepOrphanDatabases,
  TWO_HOURS_MS,
} from '@/tests/helpers/db-admin';
import type { Pool } from 'pg';

describe('Database Administration Utilities (Unit)', () => {
  describe('getAdminUrl', () => {
    it('throws an error if server URL is missing', () => {
      const original = process.env.TEST_DATABASE_SERVER;
      delete process.env.TEST_DATABASE_SERVER;
      try {
        expect(() => getAdminUrl()).toThrow(/TEST_DATABASE_SERVER environment variable is not defined/);
      } finally {
        if (original) process.env.TEST_DATABASE_SERVER = original;
      }
    });

    it('defaults empty pathname to /postgres', () => {
      const url = getAdminUrl('postgresql://user:pass@localhost:5432');
      expect(url.pathname).toBe('/postgres');
      expect(url.hostname).toBe('localhost');
      expect(url.port).toBe('5432');
      expect(url.username).toBe('user');
      expect(url.password).toBe('pass');
    });

    it('defaults slash pathname to /postgres', () => {
      const url = getAdminUrl('postgresql://user:pass@localhost:5432/');
      expect(url.pathname).toBe('/postgres');
    });

    it('preserves existing database path if specified', () => {
      const url = getAdminUrl('postgresql://user:pass@localhost:5432/custom_admin');
      expect(url.pathname).toBe('/custom_admin');
    });
  });

  describe('getDatabaseUrl', () => {
    it('constructs a target database connection string', () => {
      const dbUrl = getDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/postgres', 'my_db');
      expect(dbUrl).toBe('postgresql://user:pass@127.0.0.1:5432/my_db');
    });
  });

  describe('parseTestDbName', () => {
    it('identifies non-test databases', () => {
      expect(parseTestDbName('postgres')).toEqual({
        isTestDb: false,
        isTemplate: false,
        isConforming: false,
      });
      expect(parseTestDbName('app')).toEqual({
        isTestDb: false,
        isTemplate: false,
        isConforming: false,
      });
      expect(parseTestDbName('test_benchmark_12345')).toEqual({
        isTestDb: false,
        isTemplate: false,
        isConforming: false,
      });
    });

    it('parses conforming template database names', () => {
      const parsed = parseTestDbName('test_s3_split_tpl_1720000000000_abc123');
      expect(parsed).toEqual({
        isTestDb: true,
        isTemplate: true,
        timestamp: 1720000000000,
        rand: 'abc123',
        isConforming: true,
      });
    });

    it('parses conforming suite database names', () => {
      const parsed = parseTestDbName('test_s3_split_1720000000000_xyz890');
      expect(parsed).toEqual({
        isTestDb: true,
        isTemplate: false,
        timestamp: 1720000000000,
        rand: 'xyz890',
        isConforming: true,
      });
    });

    it('identifies non-conforming test databases', () => {
      const parsed1 = parseTestDbName('test_s3_split_manual');
      expect(parsed1).toEqual({
        isTestDb: true,
        isTemplate: false,
        isConforming: false,
      });

      const parsed2 = parseTestDbName('test_s3_split_corrupted_name_123');
      expect(parsed2).toEqual({
        isTestDb: true,
        isTemplate: false,
        isConforming: false,
      });
    });
  });

  describe('sweepOrphanDatabases', () => {
    it('drops test databases older than 2 hours and purges non-conforming test databases', async () => {
      const now = 1720000000000;
      const threeHoursAgo = now - 3 * 60 * 60 * 1000;
      const thirtyMinsAgo = now - 30 * 60 * 1000;

      const mockDbRows = [
        { datname: `test_s3_split_tpl_${threeHoursAgo}_old1` }, // expired template -> drop
        { datname: `test_s3_split_${threeHoursAgo}_old2` }, // expired suite -> drop
        { datname: `test_s3_split_${thirtyMinsAgo}_recent` }, // fresh suite -> keep
        { datname: 'test_s3_split_malformed_unparseable' }, // non-conforming -> drop
      ];

      const executedQueries: string[] = [];
      const mockPool = {
        query: vi.fn(async (sql: string) => {
          executedQueries.push(sql);
          if (sql.includes('SELECT datname FROM pg_database')) {
            return { rows: mockDbRows };
          }
          return { rows: [] };
        }),
      } as unknown as Pool;

      const { dropped, kept } = await sweepOrphanDatabases(mockPool, TWO_HOURS_MS, now);

      expect(dropped).toEqual([
        `test_s3_split_tpl_${threeHoursAgo}_old1`,
        `test_s3_split_${threeHoursAgo}_old2`,
        'test_s3_split_malformed_unparseable',
      ]);
      expect(kept).toEqual([`test_s3_split_${thirtyMinsAgo}_recent`]);

      // Verify DROP DATABASE statements were issued
      const dropCalls = executedQueries.filter((q) => q.includes('DROP DATABASE'));
      expect(dropCalls).toHaveLength(3);
      expect(dropCalls[0]).toContain(`DROP DATABASE IF EXISTS "test_s3_split_tpl_${threeHoursAgo}_old1" WITH (FORCE)`);
    });
  });
});
