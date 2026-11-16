// Tests d'intégration : démarre un vrai serveur sur une base temporaire.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import http from 'node:http';
import { createECDH, randomBytes, hkdfSync, createDecipheriv, createPublicKey, verify } from 'node:crypto';
import { encrypt } from '../server/push.js';

// Faux service de push : enregistre ce que le serveur envoie
const MOCK_PORT = PORT_BASE() + 100;
function PORT_BASE() { return globalThis.__aktPort ??= 3900 + Math.floor(Math.random() * 90); }
const received = [];
const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => { received.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(req.url.includes('gone') ? 410 : 201); res.end(); });
});

// Base testée : MySQL si TEST_DATABASE_URL est défini (npm run test:mysql, et en CI), sinon SQLite
const MYSQL_URL = process.env.TEST_DATABASE_URL || '';
async function resetMySQL() {
  const mysql = await import('mysql2/promise');
  const c = await mysql.createConnection(MYSQL_URL);
  const [rows] = await c.query('SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  for (const { t } of rows) await c.query(`DROP TABLE \`${t}\``);
  return c;
}
const PORT = PORT_BASE();
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = mkdtempSync(join(tmpdir(), 'akt-test-'));
let proc;

function start() {
  return new Promise((resolve, reject) => {
    proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { env: { ...process.env, DATABASE_URL: MYSQL_URL, PORT: String(PORT), DATA_DIR: DIR, DEMO: '1', BACKUPS: '0', NODE_ENV: 'test', PUSH_TEST_PREFIX: `http://127.0.0.1:${MOCK_PORT}/push/` }, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (d) => { if (String(d).includes('http://')) resolve(); });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('exit', (c) => reject(new Error(`serveur arrêté (${c})`)));
  });
}
const stop = () => new Promise((r) => { proc.removeAllListeners('exit'); proc.on('exit', r); proc.kill('SIGTERM'); });
before(async () => {
  if (MYSQL_URL) await (await resetMySQL()).end();
  await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));
  await start();
});
after(async () => { mock.close(); await stop(); rmSync(DIR, { recursive: true, force: true }); });

class Client {
  cookie = '';
  async req(path, body, { method, headers = {} } = {}) {
    const r = await fetch(BASE + path, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  }
  login(email, password) { return this.req('/api/auth/login', { email, password }); }
  rpc(name, ...args) { return this.req(`/api/rpc/${name}`, { args }); }
}
const admin = new Client(), member = new Client(), anon = new Client();

test('état public : aucune donnée sensible', async () => {
  const { status, body } = await anon.req('/api/state');
  assert.equal(status, 200);
  const raw = JSON.stringify(body.state.data);
  for (const k of ['passHash', '"salt"', '"email"', '"uid"']) assert.ok(!raw.includes(k), `fuite : ${k}`);
  assert.ok(body.state.data.users.every((u) => ['active', 'suspended', 'inactive'].includes(u.status)), 'membres en attente visibles');
  assert.equal(body.state.data.audit.length, 0);
  assert.equal(body.state.data.notifications.length, 0);
});

test('en-têtes de sécurité', async () => {
  const r = await fetch(BASE + '/');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('fichiers serveur et traversée de dossier refusés', async () => {
  for (const p of ['/server/index.js', '/data/akatsuki.db', '/package.json', '/js/..%2Fserver%2Fauth.js', '/.claude/launch.json']) {
    assert.equal((await fetch(BASE + p)).status, 404, p);
  }
});

test('fichiers de l’appli installable', async () => {
  const m = await fetch(BASE + '/manifest.webmanifest');
  assert.equal(m.status, 200);
  assert.match(m.headers.get('content-type'), /manifest\+json/);
  assert.equal((await m.json()).display, 'standalone');
  const sw = await fetch(BASE + '/sw.js');
  assert.equal(sw.status, 200);
  assert.match(sw.headers.get('content-security-policy'), /connect-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  for (const i of ['/assets/icon-192.png', '/assets/icon-512.png', '/assets/icon-maskable-512.png']) assert.equal((await fetch(BASE + i)).status, 200, i);
});

test('connexion : mauvais mot de passe refusé, bon accepté avec cookie HttpOnly', async () => {
  const bad = await member.login('membre@akatsuki.test', 'faux');
  assert.equal(bad.status, 401);
  const ok = await member.login('membre@akatsuki.test', 'Membre2026!');
  assert.equal(ok.status, 200);
  assert.ok(member.cookie.startsWith('akt_sid='));
  assert.equal((await admin.login('chef@akatsuki.test', 'Akatsuki2026!')).status, 200);
});

test('limitation des tentatives de connexion', async () => {
  const c = new Client();
  let last;
  for (let i = 0; i < 10; i++) last = await c.login('vesper@akatsuki.test', `mauvais${i}`);
  assert.equal(last.status, 429);
});

test('un membre ne voit pas les e-mails des autres ni leurs notifications', async () => {
  const { body } = await member.req('/api/state');
  const others = body.state.data.users.filter((u) => u.id !== body.state.me);
  assert.ok(others.every((u) => u.email === undefined && u.uid === undefined));
  assert.ok(body.state.data.notifications.every((n) => n.userId === body.state.me));
  assert.equal(body.state.data.audit.length, 0);
});

test('un membre ne peut pas s’attribuer des points', async () => {
  const r = await member.rpc('awardPoints', { userIds: ['u7'], ruleId: 'help', reason: 'triche' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /non autorisée/);
});

test('un membre ne peut pas changer son rôle ni son statut', async () => {
  assert.equal((await member.rpc('setRoles', 'u7', ['superadmin'])).status, 400);
  assert.equal((await member.rpc('setStatus', 'u2', 'excluded', 'test')).status, 400);
  assert.equal((await member.rpc('updateUser', 'u7', { pseudo: 'Hacker', status: 'active', roles: ['superadmin'] })).status, 200);
  const { body } = await member.req('/api/state');
  const me = body.state.data.users.find((u) => u.id === 'u7');
  assert.equal(me.pseudo, 'Yoru'); assert.deepEqual(me.roles, ['member']);
});

test('attribution de points par un admin, sans doublon', async () => {
  const r1 = await admin.rpc('awardPoints', { userIds: ['u7', 'u8'], ruleId: 'help', reason: 'Aide aux nouveaux' });
  assert.equal(r1.status, 200); assert.deepEqual(r1.body.result.done, ['Yoru', 'Ryuga']);
  const r2 = await admin.rpc('awardPoints', { userIds: ['u7'], ruleId: 'help', reason: 'Aide aux nouveaux' });
  assert.deepEqual(r2.body.result.done, []); assert.deepEqual(r2.body.result.skipped, ['Yoru']);
});

test('l’historique des points est en ajout seul (déclencheurs SQL)', async (t) => {
  if (MYSQL_URL) {
    const mysql = await import('mysql2/promise');
    const c = await mysql.createConnection(MYSQL_URL);
    try {
      const [trg] = await c.query("SELECT COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()");
      if (!trg[0].n) return t.skip('déclencheurs non autorisés par ce serveur MySQL (log_bin_trust_function_creators) : ajout seul garanti par l’application');
      await assert.rejects(c.query("UPDATE point_transactions SET data = JSON_SET(data, '$.points', 9999)"), /ajout seul/);
      await assert.rejects(c.query('DELETE FROM audit_logs'), /ajout seul/);
    } finally { await c.end(); }
    return;
  }
  const db = new DatabaseSync(join(DIR, 'akatsuki.db'));
  assert.throws(() => db.exec("UPDATE point_transactions SET data = json_set(data, '$.points', 9999)"), /ajout seul/);
  assert.throws(() => db.exec('DELETE FROM point_transactions'), /ajout seul/);
  assert.throws(() => db.exec('DELETE FROM audit_logs'), /ajout seul/);
  db.close();
});

test('correction : nouvelle opération inverse, l’originale reste', async () => {
  const { body } = await admin.req('/api/state');
  const tx = body.state.data.transactions.filter((t) => t.userId === 'u8' && t.ruleId === 'help').at(-1);
  const r = await admin.rpc('correctTx', tx.id, 'Attribuée par erreur');
  assert.equal(r.status, 200);
  const after = r.body.state.data.transactions;
  assert.ok(after.some((t) => t.id === tx.id));
  assert.ok(after.some((t) => t.correctionOf === tx.id && t.points === -tx.points));
  assert.equal((await admin.rpc('correctTx', tx.id, 'Encore')).status, 400);
});

test('récompense : solde vérifié, débit à l’acceptation', async () => {
  assert.equal((await member.rpc('requestReward', 'rw7')).status, 400); // trop chère
  const r = await member.rpc('requestReward', 'rw1');
  assert.equal(r.status, 200);
  const q = r.body.state.data.requests.find((x) => x.rewardId === 'rw1' && x.status === 'pending');
  assert.equal((await member.rpc('processRequest', q.id, 'accept')).status, 400);
  const ok = await admin.rpc('processRequest', q.id, 'accept');
  assert.equal(ok.status, 200);
  assert.ok(ok.body.state.data.transactions.some((t) => t.requestId === q.id && t.points === -100));
});

test('protection CSRF et validation des entrées', async () => {
  const form = await fetch(`${BASE}/api/rpc/approve`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: admin.cookie }, body: 'args=u17' });
  assert.equal(form.status, 415);
  const cross = await admin.req('/api/rpc/approve', { args: ['u17'] }, { headers: { Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  assert.equal((await admin.rpc('approve', 42)).status, 400);
  assert.equal((await admin.req('/api/rpc/constructor', { args: [] })).status, 404);
  assert.equal((await admin.req('/api/rpc/configure', { args: [] })).status, 404);
  const proto = await admin.req('/api/rpc/createAnnouncement', '{"args":[{"title":"T","body":"B","__proto__":{"polluted":true}}]}');
  assert.equal(proto.status, 200);
  assert.equal(({}).polluted, undefined);
  assert.equal((await anon.rpc('approve', 'u17')).status, 401);
});

test('inscription : mot de passe robuste exigé, compte en attente sans droits', async () => {
  const c = new Client();
  const noLogin = await c.req('/api/auth/register', { pseudo: 'Nouveau', password: 'Solide2026', uid: '671234567', level: 50, mode: 'MJ', specialty: 'AR' });
  assert.equal(noLogin.status, 400);
  const taken = await c.req('/api/auth/register', { pseudo: 'Nouveau', login: 'yoru', password: 'Solide2026', uid: '671234567', level: 50, mode: 'MJ', specialty: 'AR' });
  assert.match(taken.body.error, /identifiant/i);
  const weak = await c.req('/api/auth/register', { pseudo: 'Nouveau', login: 'nouveau', email: 'n@exemple.test', password: 'abc', uid: '671234567', level: 50, mode: 'MJ', specialty: 'AR' });
  assert.equal(weak.status, 400);
  const ok = await c.req('/api/auth/register', { pseudo: 'Nouveau', login: 'nouveau', email: 'n@exemple.test', password: 'Solide2026', uid: '671234567', level: 50, mode: 'MJ', specialty: 'AR', status: 'active', roles: ['superadmin'] });
  assert.equal(ok.status, 200);
  const me = ok.body.state.data.users.find((u) => u.id === ok.body.state.me);
  assert.equal(me.status, 'pending'); assert.deepEqual(me.roles, ['member']);
  assert.equal((await c.rpc('requestReward', 'rw1')).status, 400);
  const c2 = new Client();
  assert.equal((await c2.req('/api/auth/login', { login: 'Nouveau', password: 'Solide2026' })).status, 200, 'connexion par identifiant');
});

test('réinitialisation du mot de passe par un responsable', async () => {
  assert.equal((await member.req('/api/auth/admin-reset', { userId: 'u8' })).status, 403);
  assert.equal((await admin.req('/api/auth/admin-reset', { userId: 'u1' })).status, 400);
  // Un responsable du recrutement ne peut pas réinitialiser un administrateur (prise de contrôle)
  const rec = new Client();
  assert.equal((await rec.req('/api/auth/login', { login: 'tenma', password: (await admin.req('/api/auth/admin-reset', { userId: 'u6' })).body.temp })).status, 200);
  assert.equal((await rec.req('/api/auth/admin-reset', { userId: 'u2' })).status, 403);
  const r = await admin.req('/api/auth/admin-reset', { userId: 'u8' });
  assert.equal(r.status, 200);
  assert.match(r.body.temp, /^[A-Za-z]{10}\d{2}$/);
  const c = new Client();
  const lg = await c.req('/api/auth/login', { login: 'ryuga', password: r.body.temp });
  assert.equal(lg.status, 200);
  assert.equal(lg.body.state.data.users.find((u) => u.id === 'u8').mustChangePassword, true);
  // Mot de passe provisoire : rien d'autre n'est possible avant de l'avoir changé
  assert.equal((await c.rpc('markAllRead')).status, 403);
  assert.equal((await c.req('/api/auth/password', { current: r.body.temp, next: 'Ryuga2026x' })).status, 200);
  assert.equal((await c.rpc('markAllRead')).status, 200);
});

// Déchiffrement côté « téléphone » (RFC 8291)
function decrypt(body, ua, auth) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain.at(-1), 2);
  return JSON.parse(plain.subarray(0, -1).toString());
}
const waitFor = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); } return null; };

test('chiffrement conforme au vecteur de test officiel RFC 8291', () => {
  const out = encrypt('When I grow up, I want to be a watermelon', { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
    { asPrivate: Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url'), salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url') });
  assert.equal(out.toString('base64url'), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('abonnement push : connexion requise et services de push uniquement (anti-SSRF)', async () => {
  const keys = { p256dh: createECDH('prime256v1').generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') };
  assert.equal((await anon.req('/api/push/subscribe', { subscription: { endpoint: `http://127.0.0.1:${MOCK_PORT}/push/x`, keys } })).status, 401);
  for (const endpoint of ['https://evil.example/x', 'http://169.254.169.254/latest', 'http://fcm.googleapis.com/x', 'file:///etc/passwd']) {
    assert.equal((await member.req('/api/push/subscribe', { subscription: { endpoint, keys } })).status, 400, endpoint);
  }
  assert.equal((await member.req('/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'court', auth: 'x' } } })).status, 400);
});

test('notification push de bout en bout : chiffrée, signée VAPID, lisible par le téléphone', async () => {
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const auth = randomBytes(16);
  const sub = { endpoint: `http://127.0.0.1:${MOCK_PORT}/push/yoru`, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
  assert.equal((await member.req('/api/push/subscribe', { subscription: sub })).status, 200);
  const gone = { endpoint: `http://127.0.0.1:${MOCK_PORT}/push/gone`, keys: sub.keys };
  assert.equal((await member.req('/api/push/subscribe', { subscription: gone })).status, 200);
  received.length = 0;
  const r = await admin.rpc('awardPoints', { userIds: ['u7'], ruleId: 'recruit', reason: 'Recrutement de Shinra' });
  assert.equal(r.status, 200);
  const msg = await waitFor(() => received.find((x) => x.path === '/push/yoru'));
  assert.ok(msg, 'aucune notification reçue');
  assert.equal(msg.headers['content-encoding'], 'aes128gcm');
  const payload = decrypt(msg.body, ua, auth);
  assert.equal(payload.title, '影 AaKATSUKI 影');
  assert.match(payload.body, /\+15 points/);
  assert.match(payload.url, /^#\//);
  // signature VAPID vérifiable avec la clé publique annoncée par le serveur
  const { body } = await member.req('/api/state');
  const raw = Buffer.from(body.state.vapidPublicKey, 'base64url');
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  const [, jwt] = msg.headers.authorization.match(/^vapid t=([^,]+), k=/);
  const [h, p, sig] = jwt.split('.');
  assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
  assert.equal(JSON.parse(Buffer.from(p, 'base64url')).aud, `http://127.0.0.1:${MOCK_PORT}`);
  // l'appareil qui a répondu 410 est supprimé : il ne reçoit plus rien
  await waitFor(() => received.some((x) => x.path === '/push/gone'));
  received.length = 0;
  await admin.rpc('awardPoints', { userIds: ['u7'], ruleId: 'help', reason: 'Coaching sniper' });
  await waitFor(() => received.some((x) => x.path === '/push/yoru'));
  assert.ok(!received.some((x) => x.path === '/push/gone'));
});

test('aucune notification si l’opération est refusée', async () => {
  received.length = 0;
  assert.equal((await admin.rpc('awardPoints', { userIds: ['u7'], ruleId: 'help', points: 999, reason: 'trop' })).status, 400);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(received.length, 0);
});

test('nouveau membre annoncé au clan, classement envoyé par un responsable seulement', async () => {
  received.length = 0;
  assert.equal((await admin.rpc('approve', 'u18')).status, 200);
  const msg = await waitFor(() => received.find((x) => x.path === '/push/yoru'));
  assert.ok(msg);
  assert.equal((await member.rpc('weeklyDigest')).status, 400);
  assert.equal((await member.rpc('weeklyDigest', { force: true })).status, 400);
});

test('déconnexion : ce téléphone ne reçoit plus les notifications du compte', async () => {
  const c = new Client();
  await c.login('membre@akatsuki.test', 'Membre2026!');
  await c.req('/api/push/unsubscribe', { endpoint: `http://127.0.0.1:${MOCK_PORT}/push/yoru` });
  received.length = 0;
  await admin.rpc('awardPoints', { userIds: ['u7'], ruleId: 'special', reason: 'Soirée' });
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(!received.some((x) => x.path === '/push/yoru'));
});

test('les données survivent à un redémarrage', async () => {
  await stop();
  await start();
  const c = new Client();
  await c.login('chef@akatsuki.test', 'Akatsuki2026!');
  const { body } = await c.req('/api/state');
  assert.ok(body.state.data.transactions.some((t) => t.ruleId === 'help' && t.reason === 'Aide aux nouveaux'));
  assert.ok(body.state.data.users.some((u) => u.pseudo === 'Nouveau'));
});

test('production : un compte par membre du clan, identifiants à distribuer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'akt-prod-'));
  const port = PORT + 50;
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { env: { ...process.env, DATABASE_URL: '', NODE_ENV: 'production', HOST: '127.0.0.1', DATA_DIR: dir, PORT: String(port), BACKUPS: '0', DEMO: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((res, rej) => { p.stdout.on('data', (d) => String(d).includes('http://') && res()); p.on('exit', rej); });
    const sheet = join(dir, 'identifiants.txt');
    assert.equal(statSync(sheet).mode & 0o777, 0o600, 'feuille lisible par le serveur seulement');
    const txt = readFileSync(sheet, 'utf8');
    const m = txt.match(/影AK-MINATO影 \(Maître de clan\)\n {2}Identifiant : minato\n {2}Mot de passe provisoire : (\S+)/);
    assert.ok(m, 'MINATO dans la feuille');
    assert.equal((txt.match(/Identifiant :/g) || []).length, 27);
    const pub = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
    assert.equal(pub.state.demo, false);
    assert.equal(pub.state.data.users.length, 27);
    assert.ok(pub.state.data.users.every((u) => u.login === undefined), 'identifiants cachés au public');
    const r = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'MINATO', password: m[1] }) });
    assert.equal(r.status, 200);
    const me = (await r.json()).state.data.users.find((u) => u.login === 'minato');
    assert.equal(me.mustChangePassword, true);
    assert.deepEqual(me.roles, ['superadmin', 'member']);
  } finally {
    p.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
});
