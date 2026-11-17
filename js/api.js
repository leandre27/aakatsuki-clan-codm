// Client de l'API. Les lectures (classements, statistiques, droits d'affichage) sont
// calculées à partir de l'instantané envoyé par le serveur ; toutes les écritures
// passent par le serveur, qui revérifie les permissions et renvoie le nouvel état.
import * as core from './core.js';
export * from './core.js';

let state = null;
let meId = null;
let meta = {};
core.configure({ getDB: () => state, getActor: () => (meId && state ? state.users.find((u) => u.id === meId) || null : null) });

function apply(s) {
  state = s.data; meId = s.me;
  meta = { vapidPublicKey: s.vapidPublicKey || '' };
  core.resetCache();
}
export const info = () => meta;

// Annonces lues : mémorisées sur cet appareil, par compte (date de la dernière annonce vue)
const annKey = () => `akt.ann.seen.${meId || 'visiteur'}`;
export function announcementsFor() { return meId ? core.visibleAnnouncements() : core.publicAnnouncements(); }
export function annSeenAt() { return localStorage.getItem(annKey()) || ''; }
export const isAnnNew = (a) => a.authorId !== meId && a.at > annSeenAt();
export const annUnread = () => (meId ? announcementsFor().filter(isAnnNew).length : 0);
export function markAnnSeen() {
  const last = announcementsFor().reduce((m, a) => (a.at > m ? a.at : m), '');
  if (last > annSeenAt()) localStorage.setItem(annKey(), last);
}
export const ready = () => !!state;

// Présentations déjà vues sur cet appareil : la plus récente non vue se lance une fois à l'ouverture
const welKey = () => `akt.wel.seen.${meId || 'visiteur'}`;
const welSeen = () => { try { return JSON.parse(localStorage.getItem(welKey()) || '[]'); } catch { return []; } };
const welTag = (u) => `${u.id}:${u.card.publishedAt}`;
export function pendingWelcome() {
  const u = core.me();
  if (!u || !['active', 'suspended', 'inactive'].includes(u.status)) return null;
  const seen = welSeen();
  return core.recentCards(10).find((x) => x.id !== u.id && !seen.includes(welTag(x))) || null;
}
export function markWelcomeSeen(u) {
  if (!u?.card?.publishedAt) return;
  const seen = welSeen().filter((t) => !t.startsWith(`${u.id}:`));
  localStorage.setItem(welKey(), JSON.stringify([...seen, welTag(u)].slice(-60)));
}

// Image d'une carte de présentation : réduite dans le navigateur (WebP, sinon JPEG) puis envoyée
export async function uploadImage(file, maxSide = 1440) {
  const bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image illisible. Choisis un fichier JPEG, PNG ou WebP.')); i.src = URL.createObjectURL(file); });
  const k = Math.min(1, maxSide / Math.max(bmp.naturalWidth, bmp.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.naturalWidth * k); c.height = Math.round(bmp.naturalHeight * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  URL.revokeObjectURL(bmp.src);
  const toBlob = (type, q) => new Promise((r) => c.toBlob(r, type, q));
  let blob = await toBlob('image/webp', 0.86);
  // Sans WebP (Safari) : PNG garde la transparence d'une arme détourée, sinon JPEG
  if (!blob || blob.type !== 'image/webp') blob = file.type === 'image/png' ? await toBlob('image/png') : await toBlob('image/jpeg', 0.86);
  const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  return (await call('/api/media', { data })).url;
}

async function call(url, body, method = 'POST') {
  let r;
  try {
    r = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Serveur injoignable. Vérifie ta connexion internet.');
  }
  const j = await r.json().catch(() => ({}));
  if (j.state) apply(j.state);
  if (!r.ok) throw new Error(j.error || `Erreur serveur (${r.status}).`);
  return j;
}

// Hors ligne, le service worker renvoie le dernier état connu (en-tête X-Offline).
export async function load() {
  let r;
  try { r = await fetch('/api/state', { credentials: 'same-origin' }); } catch { throw new Error('Serveur injoignable. Vérifie ta connexion internet.'); }
  const j = await r.json().catch(() => ({}));
  if (j.state) apply(j.state);
  if (!r.ok) throw new Error(j.error || `Erreur serveur (${r.status}).`);
  meta.offline = r.headers.get('X-Offline') === '1';
  if (!meta.offline) localStorage.setItem('akt.lastSync', new Date().toISOString());
}
const forgetOffline = () => navigator.serviceWorker?.controller?.postMessage('clear-data');
export async function login(id, password) { await call('/api/auth/login', { login: id, password }); forgetOffline(); return core.me(); }
export async function register(f) { await call('/api/auth/register', f); return core.me(); }
export async function logout() {
  // Ce téléphone ne doit plus recevoir les notifications du compte qui se déconnecte
  try {
    const sub = await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription();
    if (sub) await call('/api/push/unsubscribe', { endpoint: sub.endpoint });
  } catch { /* hors ligne : le serveur nettoiera au prochain envoi refusé */ }
  await call('/api/auth/logout', {}); forgetOffline();
}
export async function pushSubscribe(subscription) { await call('/api/push/subscribe', { subscription }); }
export async function pushUnsubscribe(endpoint) { await call('/api/push/unsubscribe', { endpoint }); }
export async function changePassword(current, next) { await call('/api/auth/password', { current, next }); }
export async function adminResetPassword(userId) { return (await call('/api/auth/admin-reset', { userId })).temp; }

const rpc = (name) => async (...args) => (await call(`/api/rpc/${name}`, { args })).result;
export const awardPoints = rpc('awardPoints');
export const correctTx = rpc('correctTx');
export const approve = rpc('approve');
export const refuse = rpc('refuse');
export const setStatus = rpc('setStatus');
export const setRoles = rpc('setRoles');
export const updateUser = rpc('updateUser');
export const toggleActivity = rpc('toggleActivity');
export const createActivity = rpc('createActivity');
export const saveTournament = rpc('saveTournament');
export const setTStatus = rpc('setTStatus');
export const registerT = rpc('registerT');
export const joinTeam = rpc('joinTeam');
export const unregisterT = rpc('unregisterT');
export const setRegStatus = rpc('setRegStatus');
export const addMatch = rpc('addMatch');
export const publishResults = rpc('publishResults');
export const requestReward = rpc('requestReward');
export const cancelRequest = rpc('cancelRequest');
export const processRequest = rpc('processRequest');
export const saveReward = rpc('saveReward');
export const toggleReward = rpc('toggleReward');
export const acceptProposal = rpc('acceptProposal');
export const awardDistinction = rpc('awardDistinction');
export const createAnnouncement = rpc('createAnnouncement');
export const archiveAnnouncement = rpc('archiveAnnouncement');
export const markAllRead = rpc('markAllRead');
export const markRead = rpc('markRead');
export const addSanction = rpc('addSanction');
export const saveRules = rpc('saveRules');
export const saveGrades = rpc('saveGrades');
export const saveWeekly = rpc('saveWeekly');
export const saveRolePerms = rpc('saveRolePerms');
export const saveRulebook = rpc('saveRulebook');
export const closeSeason = rpc('closeSeason');
export const weeklyDigest = rpc('weeklyDigest');
export const saveCard = rpc('saveCard');
export const challenge = rpc('challenge');
export const answerChallenge = rpc('answerChallenge');
export const cancelChallenge = rpc('cancelChallenge');
export const reportWinner = rpc('reportWinner');
export const confirmResult = rpc('confirmResult');
export const settleChallenge = rpc('settleChallenge');
// Défis 1v1 qui attendent une action de ma part
export function challengeTodo() {
  const me = core.me(); if (!me) return 0;
  return (state?.challenges || []).filter((c) => (c.status === 'pending' && c.toId === me.id) || (c.status === 'accepted' && [c.fromId, c.toId].includes(me.id)) || (c.status === 'reported' && [c.fromId, c.toId].includes(me.id) && c.reportedBy !== me.id)).length;
}
