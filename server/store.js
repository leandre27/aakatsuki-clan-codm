// Persistance SQLite (module node:sqlite intégré à Node, aucune dépendance).
// Une table par entité. L'historique des points et le journal sont en ajout seul :
// des déclencheurs SQL refusent toute modification ou suppression.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const COLLECTIONS = ['users', 'transactions', 'activities', 'tournaments', 'rewards', 'requests', 'distinctions', 'announcements', 'notifications', 'discipline', 'seasons', 'audit'];
const APPEND_ONLY = new Set(['transactions', 'audit']);
const TABLE = { transactions: 'point_transactions', audit: 'audit_logs', requests: 'reward_requests', discipline: 'disciplinary_actions' };
const tbl = (c) => TABLE[c] || c;

export function openStore(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'akatsuki.db');
  const sql = new DatabaseSync(file);
  sql.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  for (const c of COLLECTIONS) {
    const extra = c === 'transactions'
      ? `, user_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.userId')) VIRTUAL,
         points INTEGER GENERATED ALWAYS AS (json_extract(data, '$.points')) VIRTUAL,
         at TEXT GENERATED ALWAYS AS (json_extract(data, '$.at')) VIRTUAL`
      : c === 'users' ? `, email TEXT GENERATED ALWAYS AS (json_extract(data, '$.email')) VIRTUAL` : '';
    sql.exec(`CREATE TABLE IF NOT EXISTS ${tbl(c)} (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL CHECK (json_valid(data))${extra})`);
  }
  sql.exec('CREATE INDEX IF NOT EXISTS tx_user ON point_transactions(user_id)');
  // Identifiant de connexion unique ; e-mail unique quand il est renseigné (facultatif)
  if (!sql.prepare('PRAGMA table_xinfo(users)').all().some((c) => c.name === 'login')) {
    sql.exec(`ALTER TABLE users ADD COLUMN login TEXT GENERATED ALWAYS AS (json_extract(data, '$.login')) VIRTUAL`);
  }
  sql.exec('DROP INDEX IF EXISTS users_email');
  sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_set ON users(email) WHERE email IS NOT NULL AND email <> ''`);
  sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_login ON users(login) WHERE login IS NOT NULL');
  for (const t of ['point_transactions', 'audit_logs']) {
    sql.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT, 'historique en ajout seul'); END`);
    sql.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT, 'historique en ajout seul'); END`);
  }
  sql.exec('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)))');

  const st = {};
  for (const c of COLLECTIONS) {
    st[c] = {
      all: sql.prepare(`SELECT id, data FROM ${tbl(c)} ORDER BY seq`),
      ins: sql.prepare(`INSERT INTO ${tbl(c)} (id, data) VALUES (?, ?)`),
      upd: sql.prepare(`UPDATE ${tbl(c)} SET data = ? WHERE id = ?`),
      del: sql.prepare(`DELETE FROM ${tbl(c)} WHERE id = ?`),
    };
  }
  const getSettings = sql.prepare("SELECT data FROM settings WHERE k = 'main'");
  const putSettings = sql.prepare("INSERT INTO settings (k, data) VALUES ('main', ?) ON CONFLICT(k) DO UPDATE SET data = excluded.data");

  let state = null;
  let last = null; // dernière version écrite de chaque ligne (JSON)

  function load() {
    const s = { version: 2 };
    const l = {};
    for (const c of COLLECTIONS) {
      l[c] = new Map();
      s[c] = st[c].all.all().map((r) => { l[c].set(r.id, r.data); return JSON.parse(r.data); });
    }
    const row = getSettings.get();
    s.settings = row ? JSON.parse(row.data) : null;
    l.settings = row?.data || null;
    state = s; last = l;
    return state;
  }

  // Écrit uniquement les lignes modifiées, dans une transaction. En cas d'échec,
  // la base reste intacte et l'état mémoire est rechargé depuis la base.
  function persist() {
    const next = {};
    sql.exec('BEGIN IMMEDIATE');
    try {
      for (const c of COLLECTIONS) {
        const seen = new Set();
        next[c] = new Map();
        for (const r of state[c]) {
          if (!r || typeof r.id !== 'string') throw new Error(`Ligne sans identifiant dans ${c}`);
          if (seen.has(r.id)) throw new Error(`Identifiant en double dans ${c}`);
          seen.add(r.id);
          const j = JSON.stringify(r);
          next[c].set(r.id, j);
          const prev = last[c].get(r.id);
          if (prev === j) continue;
          if (prev === undefined) st[c].ins.run(r.id, j);
          else st[c].upd.run(j, r.id); // refusé par déclencheur sur les tables en ajout seul
        }
        for (const id of last[c].keys()) if (!seen.has(id)) st[c].del.run(id);
      }
      const sj = JSON.stringify(state.settings);
      if (sj !== last.settings) putSettings.run(sj);
      sql.exec('COMMIT');
      for (const c of COLLECTIONS) last[c] = next[c];
      last.settings = sj;
    } catch (e) {
      sql.exec('ROLLBACK');
      load();
      throw e;
    }
  }

  function replaceAll(data) {
    sql.exec('BEGIN IMMEDIATE');
    try {
      // seule la réinitialisation de la démo vide les tables en ajout seul
      for (const t of ['point_transactions', 'audit_logs']) { sql.exec(`DROP TRIGGER IF EXISTS ${t}_no_delete`); }
      for (const c of COLLECTIONS) sql.exec(`DELETE FROM ${tbl(c)}`);
      for (const t of ['point_transactions', 'audit_logs']) sql.exec(`CREATE TRIGGER ${t}_no_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT, 'historique en ajout seul'); END`);
      for (const c of COLLECTIONS) for (const r of data[c]) st[c].ins.run(r.id, JSON.stringify(r));
      putSettings.run(JSON.stringify(data.settings));
      sql.exec('COMMIT');
    } catch (e) { sql.exec('ROLLBACK'); throw e; }
    load();
  }

  function backup(dirBackups, keep = 14) {
    mkdirSync(dirBackups, { recursive: true });
    const name = `akatsuki-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.db`;
    const target = join(dirBackups, name).replaceAll("'", "''");
    sql.exec(`VACUUM INTO '${target}'`);
    const files = readdirSync(dirBackups).filter((f) => /^akatsuki-.*\.db$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dirBackups, f));
    return name;
  }

  load();
  return {
    sql, file,
    get state() { return state; },
    isEmpty: () => !state.settings || state.users.length === 0,
    load, persist, replaceAll, backup,
    APPEND_ONLY,
  };
}
