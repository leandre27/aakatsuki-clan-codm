// Serveur 影 AaKATSUKI 影 : API, sessions et fichiers du site. Node 22+, aucune dépendance.
import http from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFile, stat, writeFile, readdir, unlink, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join, resolve, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../js/core.js';
import { openStore } from './store.js';
import * as auth from './auth.js';
import { snapshot } from './snapshot.js';
import { seedDemo, seedClan } from './seed.js';
import { ROSTER } from './roster.js';
import { createPush } from './push.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// En développement, les réglages locaux (.env, jamais envoyé sur GitHub) sont lus automatiquement.
// Une variable déjà définie n'est jamais remplacée. En production, ils viennent de l'environnement.
if (process.env.NODE_ENV !== 'production' && existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const env = process.env;
const PROD = env.NODE_ENV === 'production';
const DEMO = env.DEMO === '1';
const PORT = Number(env.PORT) || 3000;
const HOST = env.HOST || (PROD ? '0.0.0.0' : '127.0.0.1');
const TRUST_PROXY = env.TRUST_PROXY === '1';
const DATA_DIR = resolve(env.DATA_DIR || join(ROOT, 'data'));
const BACKUP_DIR = join(DATA_DIR, 'backups');
// Images des cartes de présentation : hors des versions déployées, gardées d'une mise en ligne à l'autre
const MEDIA_DIR = join(DATA_DIR, 'media');
mkdirSync(MEDIA_DIR, { recursive: true });
// Nom du dossier de la version en service (déploiement : releases/<commit>), vérifié après chaque mise en ligne
const RELEASE = basename(ROOT);

// ---------- Données ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
// MySQL / MariaDB si DATABASE_URL est défini (production), sinon SQLite dans DATA_DIR
const store = await openStore({ url: env.DATABASE_URL || '', dir: DATA_DIR });
const sessions = await auth.sessions(store.db);
const push = await createPush({
  db: store.db, dataDir: DATA_DIR,
  subject: env.PUSH_SUBJECT || (env.ADMIN_EMAIL ? `mailto:${env.ADMIN_EMAIL}` : 'mailto:admin@aakatsuki.app'),
  testPrefix: env.PUSH_TEST_PREFIX || '',
});
// Les notifications créées pendant une opération ne partent qu'une fois l'opération enregistrée.
let outbox = [];
const tagFor = (link) => (link || 'clan').replace(/^#\//, '').split('?')[0].replace(/\//g, '-') || 'clan';
function flushPush() {
  const items = outbox; outbox = [];
  for (const n of items) push.send(n.userId, { title: '影 AaKATSUKI 影', body: n.text, url: n.link || '#/notifications', tag: tagFor(n.link), id: n.id });
}
let actor = null;
core.configure({
  getDB: () => store.state, getActor: () => actor,
  onNotify: (n) => outbox.push(n),
  onCommit: () => { dirty = true; },
});
let dirty = false;
function asActor(user, fn) {
  actor = user; core.resetCache();
  try { return fn(); } finally { actor = null; }
}
// Exécute une opération métier (synchrone, en mémoire), puis l'enregistre en base.
// Une seule à la fois ; en cas d'erreur, rien n'est enregistré, la mémoire revient en arrière
// et aucune notification ne part.
function runMutation(user, fn) {
  return store.exclusive(async () => {
    dirty = false; outbox = [];
    let result;
    try { result = asActor(user, fn); } catch (e) {
      outbox = []; store.reset(); core.resetCache();
      if (e instanceof core.UserError) throw new HttpError(400, e.message);
      throw e;
    }
    if (dirty) {
      try { await store.persist(); } catch (e) { outbox = []; core.resetCache(); throw e; }
      flushPush();
    }
    return result;
  });
}
// Modification directe de l'état par le serveur (mots de passe), enregistrée de la même façon
const writeDirect = (fn) => runMutation(null, () => { fn(); dirty = true; });
const findUser = (id) => store.state.users.find((u) => u.id === id) || null;

if (store.isEmpty()) {
  if (DEMO) {
    await store.replaceAll(await seedDemo());
    console.log('Base créée avec les données de démonstration.');
  } else {
    // Un compte par membre du clan, mot de passe provisoire à changer à la première connexion.
    // La feuille des identifiants n'existe qu'une fois, dans DATA_DIR : à distribuer puis supprimer.
    const { state: initial, credentials } = await seedClan(ROSTER, auth.tempPassword);
    await store.replaceAll(initial);
    const sheet = join(DATA_DIR, 'identifiants.txt');
    const ROLE_LABEL = { superadmin: 'Maître de clan', admin: 'Adjoint' };
    const lines = credentials.map((c) => [
      `${c.pseudo}${c.roles[0] in ROLE_LABEL ? ` (${ROLE_LABEL[c.roles[0]]})` : ''}`,
      `  Identifiant : ${c.login}`,
      `  Mot de passe provisoire : ${c.password}`,
      '',
    ].join('\n'));
    writeFileSync(sheet, [
      'Identifiants de connexion 影 AaKATSUKI 影',
      'Chaque membre se connecte avec son identifiant et ce mot de passe provisoire,',
      'puis choisit son propre mot de passe. Envoie-les en message privé, jamais dans le groupe.',
      'Supprime ce fichier une fois les identifiants remis.',
      '', ...lines].join('\n'), { mode: 0o600 });
    console.log(`Base créée avec ${credentials.length} membres. Identifiants : ${sheet}`);
  }
}
if (PROD && DEMO) console.warn('ATTENTION : mode démonstration actif en production (comptes publics). Mets DEMO=0.');

async function jobs() {
  try {
    await runMutation(null, () => {
      core.ensureUpcoming(); core.remindTournaments(); core.remindActivities(); core.expireChallenges();
      const d = new Date();
      if (d.getDay() === 0 && d.getHours() >= 20) core.weeklyDigest(); // dimanche soir
    });
    await sessions.purge();
    await purgeMedia();
  } catch (e) { console.error('Tâche planifiée', e); }
}
// Images envoyées mais jamais utilisées (ou remplacées) : supprimées au bout d'un jour
async function purgeMedia() {
  const used = new Set();
  for (const u of store.state.users) for (const k of core.CARD_SLOTS_KEYS) if (u.card?.[k]) used.add(basename(u.card[k]));
  for (const f of await readdir(MEDIA_DIR).catch(() => [])) {
    if (used.has(f) || !MEDIA_NAME.test(f)) continue;
    const s = await stat(join(MEDIA_DIR, f)).catch(() => null);
    if (s && Date.now() - s.mtimeMs > 864e5) await unlink(join(MEDIA_DIR, f)).catch(() => {});
  }
}
async function dailyBackup() {
  try { console.log('Sauvegarde :', await store.exclusive(() => store.backup(BACKUP_DIR, Number(env.BACKUP_KEEP) || 14))); } catch (e) { console.error('Sauvegarde impossible', e); }
}
await jobs();
setInterval(jobs, 36e5);
if (env.BACKUPS !== '0') { await dailyBackup(); setInterval(dailyBackup, 864e5); }

// ---------- Sécurité HTTP ----------
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const importmap = indexHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] ?? '';
const CSP = [
  "default-src 'self'",
  `script-src 'self' https://cdn.jsdelivr.net 'sha256-${createHash('sha256').update(importmap).digest('base64')}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
const SW_CSP = "default-src 'self'; connect-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com";
function secure(res, req) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
const isHttps = (req) => req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
const ipOf = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';

function send(req, res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = { 'Content-Type': type, ...extra };
  if (buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && /json|javascript|css|html|svg/.test(type)) {
    buf = gzipSync(buf); headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}
const json = (req, res, status, obj, extra) => send(req, res, status, obj, undefined, { 'Cache-Control': 'no-store', ...extra });

// ---------- Fichiers statiques ----------
const TYPES = { '.webmanifest': 'application/manifest+json; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SAFE_PATH = /^(?:index\.html|sw\.js|manifest\.webmanifest|(?:css|js|js\/views|assets)\/[A-Za-z0-9][A-Za-z0-9._-]*)$/;
const fileCache = new Map();
async function serveStatic(req, res, pathname) {
  let p; try { p = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)); } catch { return json(req, res, 400, { error: 'Chemin invalide.' }); }
  const type = TYPES[extname(p)];
  if (!SAFE_PATH.test(p) || p.includes('..') || !type) return json(req, res, 404, { error: 'Introuvable.' });
  const file = join(ROOT, p);
  const s = await stat(file).catch(() => null);
  if (!s?.isFile()) return json(req, res, 404, { error: 'Introuvable.' });
  const etag = `"${s.size.toString(36)}-${Math.floor(s.mtimeMs).toString(36)}"`;
  const cache = p.startsWith('assets/') ? 'public, max-age=86400' : 'no-cache';
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache }); return res.end(); }
  let buf = fileCache.get(file + etag);
  if (!buf) { buf = await readFile(file); fileCache.set(file + etag, buf); }
  const extra = { ETag: etag, 'Cache-Control': cache };
  // Le service worker va chercher Three.js et les polices pour les garder hors ligne
  if (p === 'sw.js') { extra['Content-Security-Policy'] = SW_CSP; extra['Service-Worker-Allowed'] = '/'; }
  send(req, res, 200, buf, type, extra);
}

// ---------- Images des cartes de présentation ----------
const MEDIA_NAME = /^[a-f0-9]{32}\.(webp|jpg|png)$/;
const MEDIA_TYPES = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };
function sniffImage(b) {
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.toString('hex', 0, 8) === '89504e470d0a1a0a') return 'png';
  return null;
}
async function serveMedia(req, res, name) {
  if (!MEDIA_NAME.test(name)) return json(req, res, 404, { error: 'Introuvable.' });
  const buf = await readFile(join(MEDIA_DIR, name)).catch(() => null);
  if (!buf) return json(req, res, 404, { error: 'Introuvable.' });
  // Nom = empreinte du contenu : le fichier ne change jamais
  send(req, res, 200, buf, MEDIA_TYPES[extname(name).slice(1)], { 'Cache-Control': 'public, max-age=31536000, immutable', ETag: `"${name}"` });
}

// ---------- Requêtes ----------
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const COOKIE = 'akt_sid';
const setCookie = (req, token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) || PROD ? '; Secure' : ''}`;

const BANNED = new Set(['__proto__', 'constructor', 'prototype']);
function readBody(req, limit = 1_000_000) {
  if (/^\/api\/media$/.test(req.url)) limit = 4_000_000;
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(new HttpError(415, 'Contenu JSON attendu.'));
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Requête trop volumineuse.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}', (k, v) => (BANNED.has(k) ? undefined : v))); } catch { reject(new HttpError(400, 'JSON invalide.')); }
    });
    req.on('error', reject);
  });
}
// Protection CSRF : JSON obligatoire (pas de formulaire cross-site possible) + même origine
function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function state(user) {
  return { me: user?.id || null, data: snapshot(store.state, user), demo: DEMO, vapidPublicKey: push.publicKey };
}

// Liste blanche des mutations appelables et forme de leurs arguments
const RPC = {
  awardPoints: ['o'], correctTx: ['s', 's'], approve: ['s'], refuse: ['s', 's'], setStatus: ['s', 's', 's'], setRoles: ['s', 'a'],
  updateUser: ['s', 'o'], toggleActivity: ['s'], cancelActivity: ['s', 's?'], createActivity: ['o'], saveTournament: ['o'], setTStatus: ['s', 's'],
  registerT: ['s', 'o?'], joinTeam: ['s', 's'], unregisterT: ['s'], setRegStatus: ['s', 's', 's', 's?'], addMatch: ['s', 'o'],
  publishResults: ['s', 'a'], requestReward: ['s'], cancelRequest: ['s'], processRequest: ['s', 's', 's?'], saveReward: ['o'],
  toggleReward: ['s'], acceptProposal: [], awardDistinction: ['o'], createAnnouncement: ['o'], archiveAnnouncement: ['s'],
  markAllRead: [], markRead: ['s'], addSanction: ['o'], saveRules: ['a'], saveGrades: ['a'], saveWeekly: ['a'],
  saveRolePerms: ['o'], saveRulebook: ['a'], closeSeason: ['o'], weeklyDigest: ['o?'], saveCard: ['s', 'o'],
  challenge: ['o'], answerChallenge: ['s', 's'], cancelChallenge: ['s'], reportWinner: ['s', 's'], confirmResult: ['s', 's'], settleChallenge: ['s', 's'],
};
function checkArgs(spec, args) {
  if (!Array.isArray(args) || args.length > spec.length) return false;
  return spec.every((t, i) => {
    const v = args[i];
    if (t.endsWith('?') && v === undefined) return true;
    if (t[0] === 's') return typeof v === 'string' && v.length <= 4000;
    if (t[0] === 'a') return Array.isArray(v) && v.length <= 500;
    if (t[0] === 'o') return v !== null && typeof v === 'object' && !Array.isArray(v);
    return false;
  });
}

async function api(req, res, url) {
  const sid = cookies(req)[COOKIE];
  const uid = await sessions.resolve(sid);
  const user = uid ? findUser(uid) : null;
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/health') return json(req, res, 200, { ok: true, release: RELEASE });
  if (route === 'GET /api/state') return json(req, res, 200, { state: state(user) });
  if (req.method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
  if (!sameOrigin(req)) throw new HttpError(403, 'Origine refusée.');
  const body = await readBody(req);
  const ip = ipOf(req);

  if (url.pathname === '/api/auth/login') {
    // Identifiant du clan ou adresse e-mail
    const id = String(body.login ?? body.email ?? '').trim().toLowerCase().slice(0, 200);
    const kIp = `login:${ip}`, kAcc = `login:${ip}:${id}`;
    if (auth.limited(kAcc, 8, 15 * 6e4) || auth.limited(kIp, 30, 15 * 6e4)) throw new HttpError(429, 'Trop de tentatives. Réessaie dans 15 minutes.');
    const u = id ? store.state.users.find((x) => x.login === id || (x.email && x.email === id)) : null;
    const ok = await auth.verifyPassword(String(body.password || '').slice(0, 200), u?.salt, u?.passHash);
    if (!u || !ok) { auth.hit(kAcc); auth.hit(kIp); throw new HttpError(401, 'Identifiant ou mot de passe incorrect.'); }
    if (u.status === 'excluded') throw new HttpError(403, 'Ce compte a été exclu du clan.');
    if (u.status === 'refused') throw new HttpError(403, 'Ta demande d’inscription a été refusée.');
    auth.clear(kAcc);
    const token = await sessions.create(u.id, req.headers['user-agent']);
    return json(req, res, 200, { state: state(findUser(u.id)) }, { 'Set-Cookie': setCookie(req, token, auth.SESSION_DAYS * 86400) });
  }
  if (url.pathname === '/api/auth/logout') {
    await sessions.destroy(sid);
    return json(req, res, 200, { state: state(null) }, { 'Set-Cookie': setCookie(req, '', 0) });
  }
  if (url.pathname === '/api/auth/register') {
    if (auth.limited(`reg:${ip}`, 5, 36e5)) throw new HttpError(429, 'Trop d’inscriptions depuis cette connexion. Réessaie plus tard.');
    const bad = auth.checkPasswordPolicy(body.password);
    if (bad) throw new HttpError(400, bad);
    const salt = auth.newSalt();
    const passHash = await auth.hashPassword(String(body.password), salt);
    const f = {};
    for (const k of ['pseudo', 'login', 'email', 'firstName', 'lastName', 'uid', 'level', 'mode', 'specialty', 'availability', 'avatar']) if (body[k] != null) f[k] = k === 'avatar' ? body[k] : String(body[k]).slice(0, 200);
    const u = await runMutation(null, () => core.register(f, { passHash, salt }));
    auth.hit(`reg:${ip}`);
    const token = await sessions.create(u.id, req.headers['user-agent']);
    return json(req, res, 200, { state: state(findUser(u.id)) }, { 'Set-Cookie': setCookie(req, token, auth.SESSION_DAYS * 86400) });
  }
  if (url.pathname === '/api/auth/password') {
    if (!user) throw new HttpError(401, 'Connecte-toi pour continuer.');
    if (auth.limited(`pw:${user.id}`, 5, 15 * 6e4)) throw new HttpError(429, 'Trop de tentatives. Réessaie dans 15 minutes.');
    if (!(await auth.verifyPassword(String(body.current || ''), user.salt, user.passHash))) { auth.hit(`pw:${user.id}`); throw new HttpError(400, 'Mot de passe actuel incorrect.'); }
    const bad = auth.checkPasswordPolicy(body.next);
    if (bad) throw new HttpError(400, bad);
    const salt = auth.newSalt();
    const passHash = await auth.hashPassword(String(body.next), salt);
    await writeDirect(() => {
      const u = findUser(user.id);
      Object.assign(u, { salt, passHash, mustChangePassword: false });
      store.state.audit.push({ id: core.uid('au'), at: new Date().toISOString(), actorId: u.id, action: 'Mot de passe modifié', target: u.pseudo, details: 'Autres sessions déconnectées.' });
    });
    await sessions.destroyOthers(user.id, sid);
    return json(req, res, 200, { state: state(findUser(user.id)) });
  }
  if (url.pathname === '/api/auth/admin-reset') {
    if (!user || !core.can('members.manage', user)) throw new HttpError(403, 'Action non autorisée pour ton rôle.');
    const target = findUser(String(body.userId || ''));
    if (!target || target.id === user.id) throw new HttpError(400, 'Membre introuvable.');
    // Un responsable ne peut pas prendre la main sur un compte qui a des droits : seuls les super administrateurs le peuvent
    if (core.isStaff(target) && !user.roles.includes('superadmin')) throw new HttpError(403, 'Seul un super administrateur peut réinitialiser le compte d’un responsable.');
    const temp = auth.tempPassword();
    const salt = auth.newSalt();
    const passHash = await auth.hashPassword(temp, salt);
    await writeDirect(() => {
      const t = findUser(target.id);
      Object.assign(t, { salt, passHash, mustChangePassword: true });
      store.state.audit.push({ id: core.uid('au'), at: new Date().toISOString(), actorId: user.id, action: 'Mot de passe réinitialisé', target: t.pseudo, details: 'Mot de passe provisoire remis par un responsable, sessions fermées.' });
    });
    await sessions.destroyOthers(target.id, '');
    return json(req, res, 200, { temp, state: state(findUser(user.id)) });
  }
  if (url.pathname === '/api/push/subscribe') {
    if (!user) throw new HttpError(401, 'Connecte-toi pour continuer.');
    const err = await push.subscribe(user.id, body.subscription, req.headers['user-agent']);
    if (err) throw new HttpError(400, err);
    return json(req, res, 200, { ok: true });
  }
  if (url.pathname === '/api/push/unsubscribe') {
    if (user) await push.unsubscribe(user.id, body.endpoint);
    return json(req, res, 200, { ok: true });
  }
  if (url.pathname === '/api/media') {
    if (!user) throw new HttpError(401, 'Connecte-toi pour continuer.');
    if (user.mustChangePassword) throw new HttpError(403, 'Choisis d’abord ton mot de passe.');
    if (!['active', 'suspended', 'inactive'].includes(user.status)) throw new HttpError(403, 'Réservé aux membres du clan.');
    if (auth.limited(`media:${user.id}`, 40, 36e5)) throw new HttpError(429, 'Trop d’images envoyées. Réessaie dans une heure.');
    const buf = Buffer.from(String(body.data || ''), 'base64');
    const ext = sniffImage(buf);
    if (!ext) throw new HttpError(400, 'Image invalide (JPEG, PNG ou WebP).');
    if (buf.length > 2_500_000) throw new HttpError(413, 'Image trop lourde (2,5 Mo maximum).');
    auth.hit(`media:${user.id}`);
    const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 32)}.${ext}`;
    const file = join(MEDIA_DIR, name);
    if (existsSync(file)) await utimes(file, new Date(), new Date());
    else await writeFile(file, buf, { mode: 0o644 });
    return json(req, res, 200, { url: `/media/${name}` });
  }

  const m = url.pathname.match(/^\/api\/rpc\/([A-Za-z]+)$/);
  if (m && Object.hasOwn(RPC, m[1])) {
    if (!user) throw new HttpError(401, 'Connecte-toi pour continuer.');
    if (user.mustChangePassword) throw new HttpError(403, 'Choisis d’abord ton mot de passe.');
    const args = body.args;
    if (!checkArgs(RPC[m[1]], args)) throw new HttpError(400, 'Paramètres invalides.');
    const result = await runMutation(user, () => core[m[1]](...args));
    return json(req, res, 200, { result: result && typeof result === 'object' && 'id' in result && 'registrations' in result ? { id: result.id } : result ?? null, state: state(findUser(user.id)) });
  }
  throw new HttpError(404, 'Introuvable.');
}


const server = http.createServer(async (req, res) => {
  secure(res, req);
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (url.pathname.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) await serveMedia(req, res, url.pathname.slice(7));
    else if (req.method === 'GET' || req.method === 'HEAD') await serveStatic(req, res, url.pathname);
    else json(req, res, 405, { error: 'Méthode non autorisée.' });
  } catch (e) {
    if (e instanceof HttpError) json(req, res, e.status, { error: e.message });
    else { console.error(e); json(req, res, 500, { error: 'Erreur interne du serveur.' }); }
  }
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.listen(PORT, HOST, () => console.log(`影 AaKATSUKI 影 · http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}${DEMO ? ' (démo)' : ''}`));
const stop = () => { server.close(); store.exclusive(() => store.close()).finally(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
