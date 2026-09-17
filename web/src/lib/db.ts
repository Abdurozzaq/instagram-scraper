import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5433),
  user: process.env.PGUSER || 'instagram_app',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'ins_loader',
});

export default pool;
