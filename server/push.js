// Notifications push (Web Push) sans dépendance : chiffrement RFC 8291 (aes128gcm)
// et authentification VAPID RFC 8292 (JWT ES256), avec le module crypto de Node.
import { createECDH, createPrivateKey, createPublicKey, generateKeyPairSync, hkdfSync, createCipheriv, randomBytes, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');

// Services de push des navigateurs : le serveur n'envoie jamais ailleurs (anti-SSRF).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function allowedEndpoint(endpoint, extraPrefix = '') {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  if (extraPrefix && endpoint.startsWith(extraPrefix)) return true;
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch { return false; }
}

// Clés VAPID : variables d'environnement, sinon générées une fois et gardées dans DATA_DIR
export function loadVapid(dataDir, env = process.env) {
  let jwk;
  if (env.VAPID_PRIVATE_JWK) jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  else {
    const file = join(dataDir, 'vapid.json');
    if (existsSync(file)) jwk = JSON.parse(readFileSync(file, 'utf8'));
    else {
      jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
      writeFileSync(file, JSON.stringify(jwk), { mode: 0o600 });
    }
  }
  const privateKey = createPrivateKey({ key: jwk, format: 'jwk' });
  const pub = createPublicKey(privateKey).export({ format: 'jwk' });
  const publicKey = b64u(Buffer.concat([Buffer.from([4]), fromB64u(pub.x), fromB64u(pub.y)]));
  return { privateKey, publicKey };
}

function vapidHeader(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = sign('sha256', Buffer.from(`${header}.${payload}`), { key: vapid.privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${payload}.${b64u(sig)}, k=${vapid.publicKey}`;
}

// Chiffrement du message pour un abonné (RFC 8291). `_test` permet d'imposer sel et clé éphémère.
export function encrypt(payload, keys, _test = {}) {
  const uaPublic = fromB64u(keys.p256dh);
  const authSecret = fromB64u(keys.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Clés d’abonnement invalides');
  const ecdh = createECDH('prime256v1');
  if (_test.asPrivate) ecdh.setPrivateKey(_test.asPrivate); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = _test.salt || randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export function createPush({ sql, dataDir, subject, testPrefix = '' }) {
  sql.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL, user_agent TEXT)`);
  sql.exec('CREATE INDEX IF NOT EXISTS push_user ON push_subscriptions(user_id)');
  const vapid = loadVapid(dataDir);
  const upsert = sql.prepare(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at`);
  const byUser = sql.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
  const countUser = sql.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?');
  const oldest = sql.prepare('DELETE FROM push_subscriptions WHERE endpoint = (SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at LIMIT 1)');
  const del = sql.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
  const delOwned = sql.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?');

  async function deliver(sub, message) {
    try {
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal',
          ...(message.tag ? { Topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
          Authorization: vapidHeader(sub.endpoint, vapid, subject),
        },
        body: encrypt(JSON.stringify(message), sub),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404 || res.status === 410) del.run(sub.endpoint); // appareil désabonné
      else if (!res.ok) console.warn('Push refusé', res.status, new URL(sub.endpoint).host);
    } catch (e) { console.warn('Push impossible', e.message); }
  }

  return {
    publicKey: vapid.publicKey,
    subscribe(userId, sub, ua = '') {
      if (!sub || !allowedEndpoint(sub.endpoint, testPrefix)) return 'Service de notifications inconnu.';
      const keys = sub.keys || {};
      if (fromB64u(keys.p256dh || '').length !== 65 || fromB64u(keys.auth || '').length !== 16) return 'Abonnement invalide.';
      upsert.run(sub.endpoint, userId, keys.p256dh, keys.auth, Date.now(), String(ua).slice(0, 200));
      while (countUser.get(userId).n > 10) oldest.run(userId); // 10 appareils maximum par membre
      return null;
    },
    unsubscribe(userId, endpoint) { if (typeof endpoint === 'string') delOwned.run(endpoint, userId); },
    // Envoie à tous les appareils du membre, sans bloquer la réponse HTTP
    send(userId, message) {
      for (const s of byUser.all(userId)) deliver(s, message);
    },
  };
}
