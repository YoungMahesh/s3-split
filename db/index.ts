import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

let _pool: Pool | null = null;
let _db: (NodePgDatabase & { $client: Pool }) | null = null;

export function getPool(): Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    _pool.on('error', () => {
      // Prevent unhandled exceptions on idle clients during teardown or termination
    });
  }
  return _pool;
}

export function getDb(): NodePgDatabase & { $client: Pool } {
  if (!_db) {
    _db = drizzle({ client: getPool() });
  }
  return _db;
}

export const db: NodePgDatabase & { $client: Pool } = new Proxy({} as NodePgDatabase & { $client: Pool }, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
