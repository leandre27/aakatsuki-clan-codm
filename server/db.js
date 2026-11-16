// Accès à la base : MySQL / MariaDB en production (DATABASE_URL), SQLite intégré à Node
// sinon (développement et tests, aucune installation). Même interface pour les deux :
//   query(sql, params) → lignes   run(sql, params)   batch([[sql, params], …]) atomique
// Les requêtes utilisent des paramètres « ? », jamais de valeurs collées dans le SQL.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export async function openDB({ url, dir }) {
  return url ? openMySQL(url) : openSQLite(dir);
}

async function openMySQL(url) {
  const u = new URL(url);
  if (!['mysql:', 'mariadb:'].includes(u.protocol)) throw new Error('DATABASE_URL doit commencer par mysql://');
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({
    host: u.hostname, port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)),
    charset: 'utf8mb4_bin', timezone: 'Z', connectionLimit: 5, enableKeepAlive: true,
    supportBigNumbers: true, bigNumberStrings: false,
  });
  await pool.query('SELECT 1');
  return {
    dialect: 'mysql',
    async query(sql, params = []) { const [rows] = await pool.query(sql, params); return rows; },
    async run(sql, params = []) { await pool.query(sql, params); },
    async batch(ops) {
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        for (const [sql, params] of ops) await c.query(sql, params || []);
        await c.commit();
      } catch (e) { await c.rollback().catch(() => {}); throw e; } finally { c.release(); }
    },
    upsert: (table, cols, key) => `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${cols.filter((c) => !key.includes(c)).map((c) => `${c} = VALUES(${c})`).join(', ')}`,
    close: () => pool.end(),
  };
}

async function openSQLite(dir) {
  const { DatabaseSync } = await import('node:sqlite');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'akatsuki.db');
  const sql = new DatabaseSync(file);
  sql.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const stmt = (s) => sql.prepare(s);
  return {
    dialect: 'sqlite', file, raw: sql,
    async query(s, params = []) { return stmt(s).all(...params); },
    async run(s, params = []) { if (params.length) stmt(s).run(...params); else sql.exec(s); },
    // Exécuté d'un bloc, sans rendre la main : rien d'autre ne peut s'intercaler
    async batch(ops) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        for (const [s, params] of ops) { if (params?.length) stmt(s).run(...params); else sql.exec(s); }
        sql.exec('COMMIT');
      } catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
    upsert: (table, cols, key) => `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(${key.join(', ')}) DO UPDATE SET ${cols.filter((c) => !key.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')}`,
    close: () => sql.close(),
  };
}
