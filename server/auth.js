// Mots de passe (scrypt), sessions (jeton aléatoire, seul son empreinte est stockée)
// et limitation des tentatives.
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 10; i++) out += abc[bytes[i] % abc.length];
  return out + String(bytes[10] % 10) + String(bytes[11] % 10);
}
export const newSalt = () => randomBytes(16).toString('hex');
export function hashPassword(password, salt) {
  return new Promise((resolve, reject) =>
    scrypt(String(password).normalize('NFKC'), salt, 64, SCRYPT, (err, key) => (err ? reject(err) : resolve(key.toString('hex')))));
}
const DUMMY_SALT = newSalt();
export async function verifyPassword(password, salt, hash) {
  // Pour un compte inconnu on calcule quand même un hash : même durée de réponse.
  const h = await hashPassword(password, salt || DUMMY_SALT);
  if (!hash) return false;
  const a = Buffer.from(h, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
export function checkPasswordPolicy(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (pw.length > 200) return 'Mot de passe trop long.';
  if (!/[A-Za-zÀ-ÿ]/.test(pw) || !/\d/.test(pw)) return 'Le mot de passe doit contenir des lettres et au moins un chiffre.';
  return null;
}

const sha = (t) => createHash('sha256').update(t).digest('hex');
export const SESSION_DAYS = 30;

export async function sessions(db) {
  if (db.dialect === 'mysql') {
    await db.run(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
      user_agent VARCHAR(200), INDEX sessions_user (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
  } else {
    await db.run(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_agent TEXT)`);
    await db.run('CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)');
  }
  return {
    async create(userId, ua = '') {
      const token = randomBytes(32).toString('base64url');
      const now = Date.now();
      await db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)', [sha(token), userId, now, now + SESSION_DAYS * 864e5, String(ua).slice(0, 200)]);
      return token;
    },
    async resolve(token) {
      if (!token || token.length > 100) return null;
      const [row] = await db.query('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', [sha(token)]);
      if (!row) return null;
      if (Number(row.expires_at) < Date.now()) { await db.run('DELETE FROM sessions WHERE token_hash = ?', [sha(token)]); return null; }
      return row.user_id;
    },
    async destroy(token) { if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', [sha(token)]); },
    async destroyOthers(userId, keepToken) { await db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [userId, sha(keepToken || '')]); },
    async purge() { await db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]); },
  };
}

// Limitation en mémoire : suffisant pour un seul serveur.
const buckets = new Map();
export function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  buckets.set(key, list);
  return list.length >= max;
}
export function hit(key) { const l = buckets.get(key) || []; l.push(Date.now()); buckets.set(key, l); }
export function clear(key) { buckets.delete(key); }
setInterval(() => { const now = Date.now(); for (const [k, l] of buckets) if (!l.some((t) => now - t < 36e5)) buckets.delete(k); }, 6e5).unref();
