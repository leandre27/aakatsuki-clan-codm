// Persistance : une table par entité, chaque ligne = un document JSON.
// L'état vit en mémoire ; chaque opération écrit seulement les lignes modifiées, dans une transaction.
// L'historique des points et le journal sont en ajout seul : l'application ne les modifie jamais,
// et des déclencheurs SQL le refusent aussi (quand l'utilisateur de la base a le droit d'en créer).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { openDB } from './db.js';

export const COLLECTIONS = ['users', 'transactions', 'activities', 'tournaments', 'rewards', 'requests', 'distinctions', 'announcements', 'notifications', 'discipline', 'seasons', 'audit', 'challenges'];
const APPEND_ONLY = new Set(['transactions', 'audit']);
const LOCKED_TABLES = ['point_transactions', 'audit_logs'];
const TABLE = { transactions: 'point_transactions', audit: 'audit_logs', requests: 'reward_requests', discipline: 'disciplinary_actions' };
const tbl = (c) => TABLE[c] || c;

async function schemaSQLite(db) {
  for (const c of COLLECTIONS) {
    const extra = c === 'transactions'
      ? `, user_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.userId')) VIRTUAL,
         points INTEGER GENERATED ALWAYS AS (json_extract(data, '$.points')) VIRTUAL,
         at TEXT GENERATED ALWAYS AS (json_extract(data, '$.at')) VIRTUAL`
      : c === 'users' ? `, email TEXT GENERATED ALWAYS AS (json_extract(data, '$.email')) VIRTUAL` : '';
    await db.run(`CREATE TABLE IF NOT EXISTS ${tbl(c)} (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL CHECK (json_valid(data))${extra})`);
  }
  await db.run('CREATE INDEX IF NOT EXISTS tx_user ON point_transactions(user_id)');
  if (!(await db.query('PRAGMA table_xinfo(users)')).some((c) => c.name === 'login')) {
    await db.run(`ALTER TABLE users ADD COLUMN login TEXT GENERATED ALWAYS AS (json_extract(data, '$.login')) VIRTUAL`);
  }
  await db.run('DROP INDEX IF EXISTS users_email');
  await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_set ON users(email) WHERE email IS NOT NULL AND email <> ''`);
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS users_login ON users(login) WHERE login IS NOT NULL');
  for (const t of LOCKED_TABLES) {
    await db.run(`CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT, 'historique en ajout seul'); END`);
    await db.run(`CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT, 'historique en ajout seul'); END`);
  }
  await db.run('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)))');
}

// Compatible MySQL 8+ et MariaDB 10.6+
async function schemaMySQL(db) {
  const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';
  const json = (p) => `JSON_UNQUOTE(JSON_EXTRACT(data, '$.${p}'))`;
  for (const c of COLLECTIONS) {
    const extra = c === 'transactions'
      ? `, user_id VARCHAR(64) GENERATED ALWAYS AS (${json('userId')}) STORED, INDEX tx_user (user_id)`
      : c === 'users'
        ? `, login VARCHAR(64) GENERATED ALWAYS AS (${json('login')}) STORED,
           email VARCHAR(255) GENERATED ALWAYS AS (NULLIF(${json('email')}, '')) STORED,
           UNIQUE KEY users_login (login), UNIQUE KEY users_email (email)`
        : '';
    await db.run(`CREATE TABLE IF NOT EXISTS ${tbl(c)} (seq BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, id VARCHAR(64) NOT NULL UNIQUE, data JSON NOT NULL${extra}) ${T}`);
  }
  await db.run(`CREATE TABLE IF NOT EXISTS settings (k VARCHAR(32) NOT NULL PRIMARY KEY, data JSON NOT NULL) ${T}`);
  // Les déclencheurs demandent un droit que les hébergeurs n'accordent pas toujours (journal binaire actif) :
  // sans eux, l'ajout seul reste garanti par l'application.
  const have = new Set((await db.query('SELECT TRIGGER_NAME AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()')).map((r) => r.n));
  try {
    for (const t of LOCKED_TABLES) for (const [op, verb] of [['no_update', 'UPDATE'], ['no_delete', 'DELETE']]) {
      if (!have.has(`${t}_${op}`)) await db.run(`CREATE TRIGGER ${t}_${op} BEFORE ${verb} ON ${t} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'historique en ajout seul'`);
    }
  } catch (e) {
    console.warn(`Déclencheurs d'ajout seul non créés (${e.code || e.message}). L'application les respecte quand même. Pour les activer : SET GLOBAL log_bin_trust_function_creators = 1, puis redémarrer le site.`);
  }
}

export async function openStore({ url, dir }) {
  const db = await openDB({ url, dir });
  await (db.dialect === 'mysql' ? schemaMySQL(db) : schemaSQLite(db));
  const asJSON = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
  const putSettings = db.upsert('settings', ['k', 'data'], ['k']);

  let state = null;
  let last = null; // dernière version enregistrée de chaque ligne (JSON) : sert aussi à annuler en mémoire

  function fromLast() {
    const s = { version: 2 };
    for (const c of COLLECTIONS) s[c] = [...last[c].values()].map((j) => JSON.parse(j));
    s.settings = last.settings ? JSON.parse(last.settings) : null;
    state = s;
    return state;
  }

  async function load() {
    const l = {};
    for (const c of COLLECTIONS) {
      l[c] = new Map();
      for (const r of await db.query(`SELECT id, data FROM ${tbl(c)} ORDER BY seq`)) l[c].set(r.id, JSON.stringify(JSON.parse(asJSON(r.data))));
    }
    const [row] = await db.query("SELECT data FROM settings WHERE k = 'main'");
    l.settings = row ? JSON.stringify(JSON.parse(asJSON(row.data))) : null;
    last = l;
    return fromLast();
  }

  // Écrit uniquement les lignes modifiées, dans une transaction. En cas d'échec,
  // la base reste intacte et l'état mémoire revient à la dernière version enregistrée.
  async function persist() {
    const next = {};
    const ops = [];
    try {
      for (const c of COLLECTIONS) {
        const seen = new Set();
        next[c] = new Map();
        for (const r of state[c]) {
          if (!r || typeof r.id !== 'string' || r.id.length > 64) throw new Error(`Ligne sans identifiant valide dans ${c}`);
          if (seen.has(r.id)) throw new Error(`Identifiant en double dans ${c}`);
          seen.add(r.id);
          const j = JSON.stringify(r);
          next[c].set(r.id, j);
          const prev = last[c].get(r.id);
          if (prev === j) continue;
          if (prev === undefined) ops.push([`INSERT INTO ${tbl(c)} (id, data) VALUES (?, ?)`, [r.id, j]]);
          else if (APPEND_ONLY.has(c)) throw new Error(`Historique en ajout seul : ${c}/${r.id} ne peut pas être modifié`);
          else ops.push([`UPDATE ${tbl(c)} SET data = ? WHERE id = ?`, [j, r.id]]);
        }
        for (const id of last[c].keys()) {
          if (seen.has(id)) continue;
          if (APPEND_ONLY.has(c)) throw new Error(`Historique en ajout seul : ${c}/${id} ne peut pas être supprimé`);
          ops.push([`DELETE FROM ${tbl(c)} WHERE id = ?`, [id]]);
        }
      }
      const sj = JSON.stringify(state.settings);
      if (sj !== last.settings) ops.push([putSettings, ['main', sj]]);
      if (ops.length) await db.batch(ops);
      for (const c of COLLECTIONS) last[c] = next[c];
      last.settings = sj;
    } catch (e) {
      fromLast();
      throw e;
    }
  }

  // Remplace toutes les données (premier démarrage, réinitialisation de la démo, restauration)
  async function replaceAll(data) {
    const ops = [];
    if (db.dialect === 'sqlite') {
      for (const t of LOCKED_TABLES) ops.push([`DROP TRIGGER IF EXISTS ${t}_no_delete`]);
      for (const c of COLLECTIONS) ops.push([`DELETE FROM ${tbl(c)}`]);
      for (const t of LOCKED_TABLES) ops.push([`CREATE TRIGGER ${t}_no_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT, 'historique en ajout seul'); END`]);
    } else {
      // TRUNCATE ne passe pas par les déclencheurs (et valide tout seul) : fait avant la transaction
      for (const c of COLLECTIONS) await db.run(`TRUNCATE TABLE ${tbl(c)}`);
    }
    for (const c of COLLECTIONS) for (const r of data[c] || []) ops.push([`INSERT INTO ${tbl(c)} (id, data) VALUES (?, ?)`, [r.id, JSON.stringify(r)]]);
    ops.push([putSettings, ['main', JSON.stringify(data.settings)]]);
    await db.batch(ops);
    await load();
  }

  // Sauvegarde : copie SQLite complète, ou export JSON compressé de toutes les données (MySQL)
  async function backup(dirBackups, keep = 14) {
    mkdirSync(dirBackups, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    let name;
    if (db.dialect === 'sqlite') {
      name = `akatsuki-${stamp}.db`;
      await db.run(`VACUUM INTO '${join(dirBackups, name).replaceAll("'", "''")}'`);
    } else {
      name = `akatsuki-${stamp}.json.gz`;
      const dump = { version: 2, at: new Date().toISOString(), settings: JSON.parse(last.settings) };
      for (const c of COLLECTIONS) dump[c] = [...last[c].values()].map((j) => JSON.parse(j));
      writeFileSync(join(dirBackups, name), gzipSync(JSON.stringify(dump)), { mode: 0o600 });
    }
    const files = readdirSync(dirBackups).filter((f) => /^akatsuki-.*\.(db|json\.gz)$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dirBackups, f));
    return name;
  }

  // Une seule opération d'écriture à la fois : l'état mémoire et la base restent alignés
  let queue = Promise.resolve();
  function exclusive(fn) {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  }

  await load();
  return {
    db, dialect: db.dialect,
    get state() { return state; },
    isEmpty: () => !state.settings || state.users.length === 0,
    load, reset: fromLast, persist, replaceAll, backup, exclusive,
    close: () => db.close(),
    APPEND_ONLY,
  };
}
