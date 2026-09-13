import { Pool } from 'pg';

const pool = new Pool({
  host: '217.216.72.172',
  port: 41828,
  user: 'mooboard',
  password: 'MooBoard123!',
  database: 'ins_loader',
});

export default pool;
