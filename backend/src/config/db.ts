import { Pool, PoolClient, QueryResult } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'sevenpay_user',
  password: process.env.DB_PASSWORD || 'SuaSenhaSeguraAqui', // Coloque a senha que definiu no setup do Postgres
  database: process.env.DB_NAME || 'sevenpay_db',
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export const db = {
  query: (text: string, params?: any[]): Promise<QueryResult> => {
    return pool.query(text, params);
  },
  getClient: (): Promise<PoolClient> => {
    return pool.connect();
  },
  end: (): Promise<void> => {
    return pool.end();
  }
};

