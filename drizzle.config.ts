import { defineConfig } from 'drizzle-kit';

console.log({db_url: process.env.DATABASE_URL!})
export default defineConfig({
  out: './drizzle',
  schema: './db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
