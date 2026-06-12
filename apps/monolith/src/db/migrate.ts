import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL || 'postgres://hybrid:hybrid@localhost:5432/hybrid_auth';

console.log('Running migrations against:', databaseUrl);

const pool = new Pool({
  connectionString: databaseUrl,
});

const db = drizzle(pool);

async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: path.resolve(__dirname, './migrations') });
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
