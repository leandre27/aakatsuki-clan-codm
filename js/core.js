// Règles métier de 影 AaKATSUKI 影, partagées par le serveur et le navigateur.
// Sur le serveur, ces fonctions sont la seule porte d'écriture : chaque mutation
// vérifie les permissions de l'acteur de la requête puis appelle commit().
// Dans le navigateur, seules les fonctions de lecture sont utilisées (classements,
// statistiques, droits d'affichage) ; les mutations passent par l'API.
let env = { getDB: () => null, getActor: () => null, onCommit: () => {}, onNotify: () => {} };
export function configure(e) { env = { ...env, ...e }; cache = null; }
export function resetCache() { cache = null; }
const D = () => env.getDB();
let cache = null;
function commit() { cache = null; env.onCommit(); }
export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);
const nowISO = () => new Date().toISOString();
// Erreur « métier » : message affichable à l'utilisateur (refus, validation).
export class UserError extends Error {}
const fail = (m) => { throw new UserError(m); };

export const PERMS = {
  'members.view': 'Voir la liste des membres',
  'members.manage': 'Valider les inscriptions et gérer les statuts',
  'members.roles': 'Attribuer les rôles',
  'points.manage': 'Attribuer, retirer et corriger des points',
  'rules.manage': 'Modifier le barème, les grades et le calendrier',
  'tournaments.manage': 'Gérer tous les tournois',
  'tournaments.mj': 'Gérer les compétitions MJ',
  'tournaments.br': 'Gérer les compétitions BR',
  'rewards.manage': 'Gérer le catalogue et les demandes de récompenses',
  'announcements.manage': 'Publier des annonces',
  'discipline.manage': 'Enregistrer avertissements et sanctions',
  'audit.view': 'Consulter le journal des opérations',
  'settings.manage': 'Paramètres généraux et saisons',
};
export const ROLES = {
  superadmin: 'Super administrateur', admin: 'Administrateur', resp_mj: 'Responsable MJ', resp_br: 'Responsable BR',
  resp_rewards: 'Responsable des récompenses', resp_recruit: 'Responsable du recrutement', member: 'Membre',
};
export const STATUS = { pending: 'En attente', active: 'Actif', suspended: 'Suspendu', inactive: 'Inactif', excluded: 'Exclu', refused: 'Refusé' };
export const T_STATUS = { draft: 'Brouillon', open: 'Inscriptions ouvertes', closed: 'Inscriptions fermées', live: 'En cours', done: 'Terminé', cancelled: 'Annulé' };
export const T_TYPES = { '1v1': 'Tournoi 1 contre 1', '2v2': 'Tournoi 2 contre 2', sniper: 'Tournoi Sniper', mp: 'Compétition Multijoueur', br: 'Compétition Battle Royale', scrim: 'Scrim interne', challenge: 'Défi individuel', special: 'Tournoi spécial' };
export const TEAM_TYPES = ['2v2'];
export const R_STATUS = { pending: 'En attente', hold: 'Mise en attente', accepted: 'Acceptée', refused: 'Refusée', delivered: 'Remise' };
export const R_CATS = { bp: 'Passe de combat', cp: 'CP', gift: 'Cadeau', rare: 'Exceptionnelle', special: 'Spéciale' };
export const SPECIALTIES = ['Sniper', 'AR', 'SMG', 'Shotgun', 'Autre'];
export const MODES = { MJ: 'Multijoueur', BR: 'Battle Royale', 'MJ+BR': 'Les deux' };
export const DISTINCTIONS = ['MVP du mois', 'Meilleur sniper', 'Meilleur joueur MJ', 'Meilleur joueur BR', 'Joueur le plus régulier', 'Meilleur coéquipier', 'Meilleure progression', 'Meilleur recruteur'];
export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const data = () => D();
export const user = (id) => D().users.find((u) => u.id === id) || null;

// ---------- Session et permissions ----------
export function me() { return env.getActor(); }
export function can(p, u = me()) {
  if (!u) return false;
  if (u.roles.includes('superadmin')) return true;
  if (u.status !== 'active') return false;
  return u.roles.some((r) => (D().settings.rolePerms[r] || []).includes(p));
}
export const isSuper = (u = me()) => !!u?.roles.includes('superadmin');
export const isStaff = (u = me()) => !!u && Object.keys(PERMS).some((p) => can(p, u));
const must = (p) => { if (!can(p)) fail('Action non autorisée pour ton rôle.'); return me(); };
function mustActiveMember() {
  const u = me();
  if (!u) fail('Connecte-toi pour continuer.');
  if (u.status === 'suspended') fail('Ton compte est suspendu : cette action est bloquée.');
  if (u.status !== 'active') fail('Ton compte doit être actif pour cette action.');
  return u;
}

function audit(action, target, details = '') {
  D().audit.push({ id: uid('au'), at: nowISO(), actorId: me()?.id || null, action, target, details });
}
// Chaque notification interne part aussi en notification push (côté serveur, après enregistrement).
function notify(userId, text, link = '') {
  const n = { id: uid('no'), userId, text, at: nowISO(), read: false, link };
  D().notifications.push(n);
  env.onNotify(n);
}
function notifyPerm(perm, text, link) {
  for (const u of D().users) if (can(perm, u)) notify(u.id, text, link);
}

export const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,23}$/;
export const MAX_LEVEL = 500;
// Le serveur hache le mot de passe (scrypt) avant d'appeler cette fonction.
export function register(f, { passHash, salt }) {
  const db = D();
  const email = String(f.email || '').trim().toLowerCase();
  const login = String(f.login || '').trim().toLowerCase();
  const pseudo = String(f.pseudo || '').trim();
  const codUid = String(f.uid || '').replace(/\s/g, '');
  const level = Number(f.level);
  if (pseudo.length < 3 || pseudo.length > 20) fail('Le pseudo doit faire entre 3 et 20 caractères.');
  if (!/^\d{6,20}$/.test(codUid)) fail('L’UID doit contenir uniquement des chiffres (6 à 20).');
  if (!LOGIN_RE.test(login)) fail('Identifiant : 3 à 24 caractères, lettres minuscules, chiffres, point, tiret ou tiret bas.');
  if (db.users.some((u) => u.login === login)) fail('Cet identifiant est déjà pris.');
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) fail(`Le niveau doit être compris entre 1 et ${MAX_LEVEL}.`);
  if (!MODES[f.mode]) fail('Choisis ton mode de jeu principal.');
  if (!SPECIALTIES.includes(f.specialty)) fail('Choisis ta spécialité.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Adresse e-mail invalide.');
  if (email && db.users.some((u) => u.email === email)) fail('Un compte existe déjà avec cet e-mail.');
  if (db.users.some((u) => u.uid === codUid)) fail('Cet UID est déjà inscrit.');
  if (db.users.some((u) => u.pseudo.toLowerCase() === pseudo.toLowerCase())) fail('Ce pseudo est déjà pris.');
  if (f.avatar != null) checkImage(f.avatar);
  const u = {
    id: uid('u'), login, email, salt, passHash, pseudo,
    firstName: String(f.firstName || '').trim(), lastName: String(f.lastName || '').trim(),
    uid: codUid, level, mode: f.mode, specialty: f.specialty, availability: String(f.availability || '').trim(),
    color: ['#d6202a', '#8a1016', '#3a3a42', '#e9e4da'][db.users.length % 4], avatar: f.avatar || null,
    status: 'pending', roles: ['member'], createdAt: nowISO(), joinedAt: null,
  };
  db.users.push(u);
  audit('Inscription', pseudo, 'Nouvelle demande, statut En attente.');
  notifyPerm('members.manage', `Nouvelle demande d’inscription : ${pseudo}.`, '#/admin/membres?status=pending');
  commit();
  return u;
}

export function checkImage(v) {
  if (v === null) return;
  if (typeof v !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > 400000) fail('Image invalide (JPEG, PNG ou WebP, 300 Ko maximum).');
}
const str = (v, max = 500) => (v == null ? '' : String(v).slice(0, max));

// ---------- Statistiques et classements ----------
function startOf(kind) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (kind === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (kind === 'month') d.setDate(1);
  if (kind === 'prevMonth') { d.setDate(1); d.setMonth(d.getMonth() - 1); }
  return d.getTime();
}
export function correctedIds() {
  if (cache?.corrected) return cache.corrected;
  const set = new Set(D().transactions.filter((t) => t.correctionOf).map((t) => t.correctionOf));
  if (cache) cache.corrected = set;
  return set;
}
export const isCorrected = (t) => correctedIds().has(t.id);
export function stats() {
  if (cache) return cache;
  const db = D();
  const S = {};
  for (const u of db.users) S[u.id] = { balance: 0, permanent: 0, season: 0, week: 0, month: 0, prevMonth: 0, mj: 0, br: 0, reg30: 0, partSeason: 0, tournaments: 0, wins: 0, losses: 0, podiums: 0, scrimWins: 0 };
  const wk = startOf('week'), mo = startOf('month'), pm = startOf('prevMonth');
  const ss = new Date(db.settings.season.start).getTime();
  const d30 = Date.now() - 30 * 864e5;
  for (const t of db.transactions) {
    const s = S[t.userId]; if (!s) continue;
    const at = new Date(t.at).getTime();
    s.balance += t.points;
    // Récompenses et paris 1v1 : le solde bouge, pas le classement
    if (t.kind === 'reward' || t.kind === 'reset' || t.kind === 'bet') continue;
    s.permanent += t.points;
    if (at >= ss) { s.season += t.points; if (t.mode === 'MJ') s.mj += t.points; if (t.mode === 'BR') s.br += t.points; if (t.participation && t.points > 0) s.partSeason++; }
    if (at >= wk) s.week += t.points;
    if (at >= mo) s.month += t.points; else if (at >= pm) s.prevMonth += t.points;
    if (at >= d30 && t.participation && t.points > 0) s.reg30++;
    if (t.ruleId === 'scrim_win') s.scrimWins++;
  }
  for (const T of db.tournaments) {
    if (T.status !== 'done' || !T.results) continue;
    const regs = T.registrations.filter((r) => r.status === 'ok');
    const pod = T.results.podium || [];
    for (const r of regs) for (const id of [r.userId, r.mateId].filter(Boolean)) {
      if (!S[id]) continue;
      S[id].tournaments++;
      if (pod[0] === r.id) S[id].wins++; else S[id].losses++;
      if (pod.includes(r.id)) S[id].podiums++;
    }
  }
  cache = S;
  return S;
}
export const RANKINGS = [
  ['season', 'Saison', 'pts'], ['general', 'Général', 'pts'], ['week', 'Semaine', 'pts'], ['month', 'Mois', 'pts'],
  ['prevMonth', 'Mois dernier', 'pts'], ['mj', 'MJ', 'pts'], ['br', 'BR', 'pts'], ['sniper', 'Snipers', 'pts'],
  ['arsmg', 'AR / SMG', 'pts'], ['regular', 'Régularité', 'prés.'],
];
export function ranking(kind = 'season') {
  const S = stats();
  let list = D().users.filter((u) => u.status === 'active' || u.status === 'suspended');
  let val = (s) => s.season;
  switch (kind) {
    case 'general': val = (s) => s.permanent; break;
    case 'week': val = (s) => s.week; break;
    case 'month': val = (s) => s.month; break;
    case 'prevMonth': val = (s) => s.prevMonth; break;
    case 'mj': val = (s) => s.mj; break;
    case 'br': val = (s) => s.br; break;
    case 'sniper': list = list.filter((u) => u.specialty === 'Sniper'); break;
    case 'arsmg': list = list.filter((u) => u.specialty === 'AR' || u.specialty === 'SMG'); break;
    case 'regular': val = (s) => s.reg30; break;
  }
  return list
    .map((u) => ({ user: u, value: val(S[u.id]), s: S[u.id] }))
    .sort((a, b) => b.value - a.value || a.user.pseudo.localeCompare(b.user.pseudo))
    // Ex æquo au même rang ; sans point sur la période, pas encore classé
    .map((r, i, all) => ({ ...r, rank: r.value > 0 ? all.findIndex((x) => x.value === r.value) + 1 : null }));
}
export function rankOf(userId, kind = 'season') { return ranking(kind).find((r) => r.user.id === userId)?.rank || null; }

export function grade(points) {
  const g = [...D().settings.grades].sort((a, b) => a.min - b.min);
  let idx = 0;
  g.forEach((x, i) => { if (points >= x.min) idx = i; });
  return { ...g[idx], index: idx, next: g[idx + 1] || null, all: g };
}

// ---------- Points ----------
const balanceOf = (userId) => D().transactions.filter((t) => t.userId === userId).reduce((a, t) => a + t.points, 0);
function pushTx({ userId, points, ruleId = null, label, reason, mode = null, activityId = null, tournamentId = null, ref, kind = 'earn', participation = false, correctionOf = null, requestId = null }) {
  const db = D();
  const before = balanceOf(userId);
  const t = {
    id: uid('tx'), userId, points, ruleId, label, reason, mode, activityId, tournamentId, ref: ref || null, kind,
    participation, correctionOf, requestId, adminId: me()?.id || null, at: nowISO(), seasonId: db.settings.season.id,
    balanceBefore: before, balanceAfter: before + points,
  };
  db.transactions.push(t);
  if (kind !== 'reward' && kind !== 'bet') notify(userId, `${points > 0 ? '+' : ''}${points} points : ${label}`, '#/profil?tab=historique');
  return t;
}

export function awardPoints({ userIds, ruleId, points, reason = '', activityId = null, tournamentId = null, mode = null, allowDuplicate = false }) {
  must('points.manage');
  const db = D();
  const rule = db.settings.pointRules.find((r) => r.id === ruleId);
  if (!rule) fail('Choisis une activité du barème.');
  const pts = points === '' || points == null ? rule.points : Number(points);
  if (!Number.isFinite(pts) || pts === 0 || Math.abs(pts) > 500) fail('Nombre de points invalide (entre -500 et 500, hors zéro).');
  if (!Array.isArray(userIds) || !userIds.length || userIds.length > 200 || userIds.some((x) => typeof x !== 'string')) fail('Sélectionne au moins un membre.');
  reason = str(reason, 300);
  if (allowDuplicate && reason.trim().length < 5) fail('Une correction doit être justifiée par un motif.');
  if (pts !== rule.points && reason.trim().length < 5) fail('Un nombre de points différent du barème doit être justifié.');
  const act = activityId ? db.activities.find((a) => a.id === activityId) : null;
  const ref = activityId || tournamentId || `day:${nowISO().slice(0, 10)}`;
  const done = [], skipped = [];
  for (const id of userIds) {
    const u = user(id);
    if (!u || !['active', 'suspended', 'inactive'].includes(u.status)) { skipped.push(u?.pseudo || id); continue; }
    const dup = db.transactions.some((t) => t.userId === id && t.ruleId === ruleId && t.ref === ref && !isCorrected(t) && !t.correctionOf);
    if (dup && !allowDuplicate) { skipped.push(u.pseudo); continue; }
    pushTx({ userId: id, points: pts, ruleId, label: rule.label, reason: reason.trim() || rule.label, mode: mode || act?.mode || null, activityId, tournamentId, ref, kind: pts < 0 ? 'penalty' : 'earn', participation: !!rule.participation && pts > 0 });
    done.push(u.pseudo);
  }
  if (done.length) audit(pts < 0 ? 'Retrait de points' : 'Attribution de points', done.join(', '), `${pts > 0 ? '+' : ''}${pts} · ${rule.label}${act ? ` · ${act.title}` : ''}${reason ? ` · ${reason}` : ''}${allowDuplicate ? ' · correction autorisée' : ''}`);
  commit();
  return { done, skipped };
}

export function correctTx(txId, reason) {
  must('points.manage');
  const db = D();
  const t = db.transactions.find((x) => x.id === txId);
  if (!t) fail('Opération introuvable.');
  if (t.kind === 'reward' || t.kind === 'reset') fail('Les débits de récompense se corrigent depuis la demande.');
  if (t.kind === 'bet') fail('Les mises 1v1 se règlent depuis le défi.');
  if (isCorrected(t) || t.correctionOf) fail('Cette opération a déjà été corrigée.');
  if (!reason || reason.trim().length < 5) fail('Une correction doit être justifiée par un motif.');
  const c = pushTx({ userId: t.userId, points: -t.points, ruleId: t.ruleId, label: `Correction : ${t.label}`, reason: reason.trim(), mode: t.mode, activityId: t.activityId, tournamentId: t.tournamentId, ref: t.ref, kind: 'correction', correctionOf: t.id });
  audit('Correction de points', user(t.userId)?.pseudo, `Annule ${t.points > 0 ? '+' : ''}${t.points} (${t.label}) · ${reason.trim()}`);
  commit();
}

export function history(userId) { return D().transactions.filter((t) => t.userId === userId).sort((a, b) => b.at.localeCompare(a.at)); }

// ---------- Membres ----------
export function approve(id) {
  must('members.manage');
  const u = user(id); if (!u || u.status !== 'pending') fail('Demande introuvable.');
  u.status = 'active'; u.joinedAt = nowISO();
  notify(id, 'Bienvenue dans 影 AaKATSUKI 影 : ton inscription est validée. Crée ta carte de présentation pour que le clan te découvre.', '#/presentation');
  audit('Inscription validée', u.pseudo, 'En attente → Actif');
  notifyAll(`Nouveau membre : ${u.pseudo} rejoint 影 AaKATSUKI 影. Souhaitez-lui la bienvenue.`, `#/joueur/${u.id}`, (x) => x.id !== u.id);
  commit();
}
export function refuse(id, reason) {
  must('members.manage');
  const u = user(id); if (!u || u.status !== 'pending') fail('Demande introuvable.');
  if (!reason?.trim()) fail('Indique le motif du refus.');
  u.status = 'refused';
  notify(id, `Ta demande d’inscription a été refusée : ${reason}`, '');
  audit('Inscription refusée', u.pseudo, reason);
  commit();
}
export function setStatus(id, status, reason) {
  must('members.manage');
  const u = user(id); if (!u) fail('Membre introuvable.');
  if (!STATUS[status]) fail('Statut inconnu.');
  if (u.roles.includes('superadmin') && !isSuper()) fail('Seul un super administrateur peut modifier ce compte.');
  if (u.id === me().id) fail('Tu ne peux pas modifier ton propre statut.');
  if (!reason?.trim()) fail('Indique le motif du changement de statut.');
  const prev = u.status; u.status = status;
  if (status === 'active' && !u.joinedAt) u.joinedAt = nowISO();
  notify(id, `Ton statut est passé à « ${STATUS[status]} ». Motif : ${reason}`, '#/profil');
  audit('Statut modifié', u.pseudo, `${STATUS[prev]} → ${STATUS[status]}. Motif : ${reason}`);
  commit();
}
export function setRoles(id, roles) {
  must('members.roles');
  const u = user(id); if (!u) fail('Membre introuvable.');
  const next = [...new Set(['member', ...roles.filter((r) => ROLES[r])])];
  const touchesTop = (r) => ['superadmin', 'admin'].includes(r);
  const changed = [...next.filter((r) => !u.roles.includes(r)), ...u.roles.filter((r) => !next.includes(r))];
  if (changed.some(touchesTop) && !isSuper()) fail('Seul un super administrateur peut gérer les rôles administrateur.');
  if (u.id === me().id && u.roles.includes('superadmin') && !next.includes('superadmin')) fail('Tu ne peux pas te retirer ton propre rôle de super administrateur.');
  const prev = u.roles.map((r) => ROLES[r]).join(', ');
  u.roles = next;
  audit('Rôles modifiés', u.pseudo, `${prev} → ${next.map((r) => ROLES[r]).join(', ')}`);
  notify(id, `Tes rôles ont été mis à jour : ${next.map((r) => ROLES[r]).join(', ')}.`, '#/moi');
  commit();
}
const SELF_FIELDS = ['availability', 'mode', 'specialty', 'level', 'avatar', 'firstName', 'lastName'];
export function updateUser(id, f) {
  const self = me()?.id === id;
  if (!self) must('members.manage');
  const u = user(id); if (!u) fail('Membre introuvable.');
  const allowed = self && !can('members.manage') ? [...SELF_FIELDS] : [...SELF_FIELDS, 'pseudo', 'uid', 'login'];
  if (f.avatar !== undefined) checkImage(f.avatar);
  if (f.level != null) { const l = Number(f.level); if (!Number.isInteger(l) || l < 1 || l > MAX_LEVEL) fail('Niveau invalide.'); f.level = l; }
  if (f.mode != null && !MODES[f.mode]) fail('Mode invalide.');
  if (f.specialty != null && !SPECIALTIES.includes(f.specialty)) fail('Spécialité invalide.');
  if (f.pseudo != null && (f.pseudo.trim().length < 3 || D().users.some((x) => x.id !== id && x.pseudo.toLowerCase() === f.pseudo.trim().toLowerCase()))) fail('Pseudo invalide ou déjà pris.');
  if (f.login != null && allowed.includes('login')) {
    f.login = String(f.login).trim().toLowerCase();
    if (!LOGIN_RE.test(f.login) || D().users.some((x) => x.id !== id && x.login === f.login)) fail('Identifiant invalide ou déjà pris.');
  }
  // Compte créé depuis la liste du clan : le membre renseigne lui-même son UID une fois
  if (self && !u.uid && f.uid != null && !allowed.includes('uid')) allowed.push('uid');
  if (f.uid != null && allowed.includes('uid')) {
    f.uid = String(f.uid).replace(/\s/g, '');
    if (f.uid && (!/^\d{6,20}$/.test(f.uid) || D().users.some((x) => x.id !== id && x.uid === f.uid))) fail('UID invalide ou déjà inscrit.');
  }
  const changes = [];
  for (const k of allowed) if (f[k] !== undefined && f[k] !== u[k]) { changes.push(k); u[k] = typeof f[k] === 'string' && k !== 'avatar' ? f[k].trim() : f[k]; }
  if (changes.length && !self) audit('Profil modifié', u.pseudo, `Champs : ${changes.join(', ')}`);
  commit();
}

// ---------- Défis 1v1 ----------
// Un membre en défie un autre ; le défi accepté est annoncé au clan, le résultat
// déclaré par un joueur est confirmé par l'autre (ou tranché par un responsable).
export const CH_STATUS = { pending: 'En attente de réponse', accepted: 'À jouer', declined: 'Refusé', cancelled: 'Annulé', reported: 'Résultat à confirmer', disputed: 'Résultat contesté', done: 'Terminé' };
export const CH_OPEN = ['pending', 'accepted', 'reported', 'disputed'];
const challengeById = (id) => D().challenges.find((c) => c.id === id) || fail('Défi introuvable.');
const pseudoOf = (id) => user(id)?.pseudo || 'un joueur';
const otherOf = (c, id) => (c.fromId === id ? c.toId : c.fromId);
export const BET_MAX = 200;
const stakeText = (c) => (c.stake ? `, ${c.stake} points en jeu chacun` : '');
function betTx(userId, points, label, c) { pushTx({ userId, points, label, reason: label, kind: 'bet', ref: `ch:${c.id}` }); }
export function challenge({ toId, message = '', at = '', stake = 0 }) {
  const u = mustActiveMember();
  const bet = Number(stake) || 0;
  if (!Number.isInteger(bet) || bet < 0 || bet > BET_MAX) fail(`La mise doit être un nombre entier entre 0 et ${BET_MAX} points.`);
  if (bet && spendable(u.id) < bet) fail(`Tu n’as que ${spendable(u.id)} points disponibles pour miser.`);
  const o = user(toId);
  if (!o || o.status !== 'active') fail('Ce joueur ne peut pas être défié pour le moment.');
  if (o.id === u.id) fail('Tu ne peux pas te défier toi-même.');
  if (D().challenges.some((c) => CH_OPEN.includes(c.status) && [c.fromId, c.toId].includes(u.id) && [c.fromId, c.toId].includes(o.id))) fail(`Un défi est déjà en cours entre toi et ${o.pseudo}.`);
  if (D().challenges.filter((c) => c.fromId === u.id && c.status === 'pending').length >= 5) fail('Tu as déjà 5 défis qui attendent une réponse.');
  let date = null;
  if (at) { const d = new Date(at); if (Number.isNaN(d.getTime())) fail('Date invalide.'); date = d.toISOString(); }
  const c = { id: uid('ch'), fromId: u.id, toId: o.id, status: 'pending', message: str(message, 140).trim(), at: date, stake: bet, createdAt: nowISO() };
  D().challenges.push(c);
  notify(o.id, `${u.pseudo} te défie en 1v1${date ? `, ${when(date)}` : ''}${bet ? `, avec ${bet} points en jeu chacun (le vainqueur prend ${bet * 2})` : ''}. Accepte ou refuse le défi.`, '#/defis');
  commit();
  return { id: c.id };
}
export function answerChallenge(id, answer) {
  const u = mustActiveMember();
  const c = challengeById(id);
  if (c.toId !== u.id) fail('Ce défi ne t’est pas adressé.');
  if (c.status !== 'pending') fail('Ce défi n’attend plus de réponse.');
  const yes = answer === 'accept';
  // Les mises sont prélevées à l'acceptation et gardées jusqu'au résultat
  if (yes && c.stake) {
    if (spendable(u.id) < c.stake) fail(`Il te faut ${c.stake} points disponibles pour accepter cette mise (tu en as ${spendable(u.id)}).`);
    if (spendable(c.fromId) < c.stake) fail(`${pseudoOf(c.fromId)} n’a plus assez de points pour cette mise.`);
    betTx(c.fromId, -c.stake, `Mise 1v1 contre ${u.pseudo}`, c);
    betTx(u.id, -c.stake, `Mise 1v1 contre ${pseudoOf(c.fromId)}`, c);
  }
  c.status = yes ? 'accepted' : 'declined'; c.respondedAt = nowISO();
  if (yes) notifyAll(`Combat 1v1 : ${pseudoOf(c.fromId)} contre ${u.pseudo}${c.at ? `, ${when(c.at)}` : ''}${stakeText(c)}. Qui va l’emporter ?`, '#/defis');
  else notify(c.fromId, `${u.pseudo} a refusé ton défi 1v1.`, '#/defis');
  commit();
}
export function cancelChallenge(id) {
  const u = mustActiveMember();
  const c = challengeById(id);
  if (![c.fromId, c.toId].includes(u.id)) fail('Ce défi ne te concerne pas.');
  if (c.status === 'pending' ? c.fromId !== u.id : c.status !== 'accepted') fail('Ce défi ne peut plus être annulé.');
  // Défi annulé avant le combat : chacun récupère sa mise
  if (c.status === 'accepted' && c.stake) for (const id of [c.fromId, c.toId]) betTx(id, c.stake, `Mise 1v1 remboursée (défi annulé)`, c);
  c.status = 'cancelled'; c.cancelledBy = u.id; c.doneAt = nowISO();
  notify(otherOf(c, u.id), `${u.pseudo} a annulé le défi 1v1.`, '#/defis');
  commit();
}
function finishChallenge(c, winnerId) {
  c.status = 'done'; c.winnerId = winnerId; c.doneAt = nowISO();
  const loser = otherOf(c, winnerId);
  if (c.stake) betTx(winnerId, c.stake * 2, `Pari 1v1 gagné contre ${pseudoOf(loser)}`, c);
  notifyAll(`${pseudoOf(winnerId)} a gagné son 1v1 contre ${pseudoOf(loser)}${c.stake ? ` et remporte ${c.stake * 2} points` : ''}.`, '#/defis');
}
// Un joueur déclare le vainqueur. S'il reconnaît sa défaite, c'est terminé ; sinon l'adversaire confirme.
export function reportWinner(id, winnerId) {
  const u = mustActiveMember();
  const c = challengeById(id);
  if (![c.fromId, c.toId].includes(u.id)) fail('Ce défi ne te concerne pas.');
  if (c.status !== 'accepted') fail('Ce défi n’attend pas de résultat.');
  if (![c.fromId, c.toId].includes(winnerId)) fail('Le vainqueur doit être l’un des deux joueurs.');
  if (winnerId !== u.id) finishChallenge(c, winnerId);
  else {
    c.status = 'reported'; c.reportedBy = u.id; c.winnerId = winnerId; c.reportedAt = nowISO();
    notify(otherOf(c, u.id), `${u.pseudo} déclare avoir gagné votre 1v1. Confirme ou conteste le résultat.`, '#/defis');
  }
  commit();
}
export function confirmResult(id, answer) {
  const u = mustActiveMember();
  const c = challengeById(id);
  if (c.status !== 'reported' || otherOf(c, c.reportedBy) !== u.id) fail('Aucun résultat à confirmer.');
  if (answer === 'yes') finishChallenge(c, c.winnerId);
  else {
    c.status = 'disputed'; c.disputedAt = nowISO();
    notify(c.reportedBy, `${u.pseudo} conteste le résultat de votre 1v1. Un responsable va trancher.`, '#/defis');
    notifyPerm('tournaments.manage', `Résultat 1v1 contesté entre ${pseudoOf(c.fromId)} et ${pseudoOf(c.toId)} : à trancher.`, '#/defis');
  }
  commit();
}
// Un responsable valide le vainqueur d'un défi en cours ou contesté
export function settleChallenge(id, winnerId) {
  must('tournaments.manage');
  const c = challengeById(id);
  if (!['accepted', 'reported', 'disputed'].includes(c.status)) fail('Ce défi n’attend pas de résultat.');
  if (![c.fromId, c.toId].includes(winnerId)) fail('Le vainqueur doit être l’un des deux joueurs.');
  audit('Défi 1v1 tranché', `${pseudoOf(c.fromId)} contre ${pseudoOf(c.toId)}`, `Vainqueur : ${pseudoOf(winnerId)}`);
  finishChallenge(c, winnerId);
  commit();
}
// Défis sans réponse depuis 7 jours : annulés automatiquement (tâche horaire du serveur)
export function expireChallenges() {
  const limit = new Date(Date.now() - 7 * 864e5).toISOString();
  let n = 0;
  for (const c of D().challenges || []) {
    if (c.status === 'pending' && c.createdAt < limit) {
      c.status = 'cancelled'; c.doneAt = nowISO(); c.expired = true; n++;
      notify(c.fromId, `Ton défi 1v1 contre ${pseudoOf(c.toId)} a expiré sans réponse.`, '#/defis');
    }
  }
  if (n) commit();
}
export function challengeRecord(userId) {
  const done = (D().challenges || []).filter((c) => c.status === 'done' && [c.fromId, c.toId].includes(userId));
  return { wins: done.filter((c) => c.winnerId === userId).length, losses: done.filter((c) => c.winnerId !== userId).length };
}

// ---------- Carte de présentation ----------
// Quatre images comme les affiches du clan, jouées en animation 3D pour tout le clan.
export const CARD_SLOTS = {
  photo: { label: 'Ta photo', hint: 'Une photo de toi, visage bien visible.' },
  character: { label: 'Personnage favori', hint: 'Ton opérateur préféré dans le jeu.' },
  profile: { label: 'Profil CODM', hint: 'La capture d’écran de ton profil de joueur.' },
  weapon: { label: 'Arme favorite', hint: 'Ton arme préférée, de préférence sur fond uni.' },
};
export const CARD_SLOTS_KEYS = Object.keys(CARD_SLOTS);
const MEDIA_RE = /^\/media\/[a-f0-9]{32}\.(webp|jpg|png)$/;
export function saveCard(id, f) {
  const self = me()?.id === id;
  const staff = can('members.manage');
  if (!self && !staff) fail('Action non autorisée pour ton rôle.');
  const u = user(id); if (!u || !CLAN.includes(u.status)) fail('Membre introuvable.');
  const card = { ...(u.card || {}) };
  for (const k of CARD_SLOTS_KEYS) {
    if (f[k] === undefined) continue;
    if (f[k] !== null && f[k] !== '' && !(typeof f[k] === 'string' && MEDIA_RE.test(f[k]))) fail('Image invalide.');
    card[k] = f[k] || null;
  }
  for (const [k, max] of [['characterName', 40], ['weaponName', 40], ['motto', 90]]) if (f[k] !== undefined) card[k] = str(f[k], max).trim();
  if (!card.photo && !card.character) fail('Ajoute au moins ta photo ou ton personnage favori.');
  const first = !card.publishedAt;
  card.updatedAt = nowISO();
  // Première publication, ou nouvelle diffusion demandée par un responsable : tout le clan est prévenu
  const announce = first || (f.announce === true && staff);
  if (announce) card.publishedAt = card.updatedAt;
  u.card = card;
  if (announce) notifyAll(`Présentation : découvre ${u.pseudo}, nouveau visage de 影 AaKATSUKI 影.`, `#/bienvenue/${u.id}`, (x) => x.id !== u.id);
  if (!self || announce) audit(announce ? 'Carte de présentation publiée' : 'Carte de présentation modifiée', u.pseudo, announce ? 'Annoncée à tout le clan.' : '');
  commit();
  return { publishedAt: card.publishedAt };
}
// Présentations récentes (30 jours), les plus récentes d'abord
export function recentCards(days = 30) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  return D().users.filter((u) => u.card?.publishedAt && u.card.publishedAt > since && CLAN.includes(u.status)).sort((a, b) => b.card.publishedAt.localeCompare(a.card.publishedAt));
}

// ---------- Activités ----------
// Séances automatiques à venir alignées sur le programme : créneau supprimé ou changé de jour,
// la séance disparaît (les inscrits sont prévenus) ; heure ou intitulé changés, elle est mise à jour.
function syncWeekly() {
  const now = Date.now();
  const slots = new Map(D().settings.weekly.filter((w) => w.ruleId).map((w) => [w.id, w]));
  let changed = 0;
  D().activities = D().activities.filter((a) => {
    if (!a.auto || a.cancelled || new Date(a.date).getTime() <= now) return true;
    const w = slots.get(String(a.key || '').split('|')[1]);
    const d = new Date(a.date);
    if (w && (d.getDay() + 6) % 7 === w.day) {
      const [h, m] = w.time.split(':').map(Number); d.setHours(h, m, 0, 0);
      const next = { title: w.label, ruleId: w.ruleId, mode: w.mode, date: d.toISOString(), key: `${d.toISOString().slice(0, 10)}|${w.id}` };
      if (Object.keys(next).some((k) => a[k] !== next[k])) { Object.assign(a, next); changed++; }
      return true;
    }
    for (const id of a.registrations) notify(id, `La séance « ${a.title} » du ${when(a.date)} est retirée du programme.`, '#/calendrier');
    changed++;
    return false;
  });
  return changed;
}
export function ensureUpcoming() {
  const db = D(); let added = syncWeekly();
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(base.getTime() + i * 864e5);
    const wd = (d.getDay() + 6) % 7;
    for (const w of db.settings.weekly.filter((x) => x.day === wd && x.ruleId)) {
      const [h, m] = w.time.split(':').map(Number);
      const when = new Date(d); when.setHours(h, m, 0, 0);
      const key = `${when.toISOString().slice(0, 10)}|${w.id}`;
      if (db.activities.some((a) => a.key === key)) continue;
      db.activities.push({ id: uid('a'), key, title: w.label, ruleId: w.ruleId, mode: w.mode, date: when.toISOString(), registrations: [], auto: true });
      added++;
    }
  }
  if (added) commit();
}
export const upcomingActivities = (n = 10) => D().activities.filter((a) => new Date(a.date).getTime() > Date.now() - 3 * 36e5 && !a.cancelled).sort((a, b) => a.date.localeCompare(b.date)).slice(0, n);
export const recentActivities = () => D().activities.filter((a) => !a.cancelled && new Date(a.date).getTime() < Date.now() + 864e5 && new Date(a.date).getTime() > Date.now() - 21 * 864e5).sort((a, b) => b.date.localeCompare(a.date));
export function toggleActivity(id) {
  const u = mustActiveMember();
  const a = D().activities.find((x) => x.id === id); if (!a || a.cancelled) fail('Séance introuvable.');
  if (new Date(a.date).getTime() < Date.now()) fail('Cette séance a déjà commencé.');
  const i = a.registrations.indexOf(u.id);
  if (i >= 0) a.registrations.splice(i, 1); else a.registrations.push(u.id);
  commit();
  return i < 0;
}
// Annuler une séance à venir (ponctuelle ou issue du programme) : tout le clan est prévenu
export function cancelActivity(id, reason = '') {
  if (!can('points.manage') && !can('rules.manage')) fail('Action non autorisée pour ton rôle.');
  const a = D().activities.find((x) => x.id === id); if (!a || a.cancelled) fail('Séance introuvable.');
  if (new Date(a.date).getTime() < Date.now()) fail('Cette séance est déjà passée.');
  a.cancelled = true; a.cancelledAt = nowISO(); a.cancelReason = str(reason, 200).trim();
  audit('Séance annulée', a.title, `${new Date(a.date).toLocaleString('fr-FR')}${a.cancelReason ? ` · ${a.cancelReason}` : ''}`);
  notifyAll(`Séance annulée : ${a.title}, ${when(a.date)}.${a.cancelReason ? ` ${a.cancelReason}` : ''}`, '#/calendrier');
  commit();
}
export function createActivity({ title, ruleId, mode, date }) {
  if (!can('points.manage') && !can('rules.manage')) fail('Action non autorisée pour ton rôle.');
  if (!title?.trim() || !date) fail('Titre et date obligatoires.');
  if (!D().settings.pointRules.some((r) => r.id === ruleId)) fail('Choisis une activité du barème.');
  const a = { id: uid('a'), key: uid('k'), title: title.trim(), ruleId, mode: mode || null, date: new Date(date).toISOString(), registrations: [], auto: false };
  D().activities.push(a);
  audit('Activité programmée', a.title, new Date(a.date).toLocaleString('fr-FR'));
  notifyAll(`Nouvelle séance : ${a.title}, ${when(a.date)}.`, '#/calendrier');
  commit();
}
// Tout le clan : membres actifs, suspendus et inactifs (pas les comptes en attente, refusés ou exclus)
const CLAN = ['active', 'suspended', 'inactive'];
function notifyAll(text, link, filter = () => true) { for (const u of D().users) if (CLAN.includes(u.status) && filter(u)) notify(u.id, text, link); }
const when = (d) => new Date(d).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Tâche serveur : rappel à tout le clan le jour même, environ 3 heures avant chaque séance
export function remindActivities() {
  const now = Date.now(); let n = 0;
  for (const a of D().activities) {
    if (a.cancelled || a.reminded) continue;
    const at = new Date(a.date).getTime();
    if (at < now || at > now + 3 * 36e5) continue;
    const hour = new Date(a.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    notifyAll(`Aujourd’hui à ${hour} : ${a.title}. Inscris-toi depuis le calendrier.`, '#/calendrier');
    a.reminded = true; n++;
  }
  if (n) commit();
  return n;
}

// ---------- Tournois ----------
export const tournament = (id) => D().tournaments.find((t) => t.id === id) || null;
export function canManageT(t, u = me()) {
  return can('tournaments.manage', u) || (t?.mode === 'MJ' && can('tournaments.mj', u)) || (t?.mode === 'BR' && can('tournaments.br', u));
}
export const canManageAnyT = (u = me()) => can('tournaments.manage', u) || can('tournaments.mj', u) || can('tournaments.br', u);
export function tournamentsList() {
  const order = { live: 0, open: 1, closed: 2, draft: 3, done: 4, cancelled: 5 };
  return [...D().tournaments].sort((a, b) => order[a.status] - order[b.status] || (a.status === 'done' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
}
export const activeRegs = (t) => t.registrations.filter((r) => r.status !== 'removed');
export const regUsers = (r) => [r.userId, r.mateId].filter(Boolean);
export const regLabel = (t, r) => (TEAM_TYPES.includes(t.type) ? `${r.teamName || 'Équipe'} (${regUsers(r).map((id) => user(id)?.pseudo).join(' + ')})` : user(r.userId)?.pseudo || '?');
export const isRegistered = (t, userId) => activeRegs(t).some((r) => regUsers(r).includes(userId));

export function saveTournament(f) {
  const db = D();
  const isNew = !f.id;
  const t = isNew ? { id: uid('t'), registrations: [], matches: [], results: null, createdBy: me()?.id, status: 'draft' } : tournament(f.id);
  if (!t) fail('Tournoi introuvable.');
  const probe = { ...t, mode: f.mode };
  if (!canManageT(probe) || (!isNew && !canManageT(t))) fail('Tu ne peux gérer que les compétitions de ton périmètre.');
  if (!f.name?.trim()) fail('Le nom du tournoi est obligatoire.');
  if (!T_TYPES[f.type]) fail('Type de compétition invalide.');
  if (!f.date || !f.deadline) fail('Date du tournoi et date limite d’inscription obligatoires.');
  if (new Date(f.deadline) > new Date(f.date)) fail('La date limite d’inscription doit précéder le tournoi.');
  const max = Number(f.max); if (!Number.isInteger(max) || max < 2 || max > 128) fail('Nombre de places entre 2 et 128.');
  if (!isNew && max < activeRegs(t).length) fail('Le nombre de places ne peut pas être inférieur aux inscrits.');
  Object.assign(t, {
    name: f.name.trim(), type: f.type, mode: f.mode, description: f.description?.trim() || '', date: new Date(f.date).toISOString(),
    deadline: new Date(f.deadline).toISOString(), max, format: f.format?.trim() || '', rules: f.rules?.trim() || '', rewards: f.rewards?.trim() || '',
    managerId: f.managerId || me().id, allowJoin: !!f.allowJoin,
    points: { participation: +f.p_part || 0, first: +f.p_1 || 0, second: +f.p_2 || 0, third: +f.p_3 || 0 },
  });
  if (isNew) db.tournaments.push(t);
  audit(isNew ? 'Tournoi créé' : 'Tournoi modifié', t.name, `${T_TYPES[t.type]} · ${new Date(t.date).toLocaleString('fr-FR')}`);
  if (!isNew && t.status !== 'draft') notifyAll(`Tournoi mis à jour : ${t.name}, ${when(t.date)}.`, `#/tournoi/${t.id}`);
  commit();
  return t;
}
export function setTStatus(id, status) {
  const t = tournament(id); if (!t) fail('Tournoi introuvable.');
  if (!canManageT(t)) fail('Action non autorisée pour ce tournoi.');
  if (!T_STATUS[status] || status === 'done') fail('Pour terminer un tournoi, valide ses résultats.');
  if (t.status === 'done') fail('Un tournoi terminé ne peut plus changer de statut.');
  const prev = t.status; t.status = status;
  if (status === 'open') notifyAll(`Inscriptions ouvertes : ${t.name}, ${when(t.date)}. Clôture le ${new Date(t.deadline).toLocaleDateString('fr-FR')}.`, `#/tournoi/${t.id}`);
  if (status === 'closed') notifyAll(`Inscriptions closes : ${t.name}. ${activeRegs(t).length} inscrits.`, `#/tournoi/${t.id}`);
  if (status === 'live') notifyAll(`${t.name} commence maintenant. Les inscrits, rejoignez le salon.`, `#/tournoi/${t.id}`);
  if (status === 'cancelled') notifyAll(`${t.name} est annulé.`, `#/tournoi/${t.id}`);
  audit('Statut du tournoi', t.name, `${T_STATUS[prev]} → ${T_STATUS[status]}`);
  commit();
}
export function registerT(id, { teamName = '', mateId = '' } = {}) {
  const u = mustActiveMember();
  const t = tournament(id); if (!t) fail('Tournoi introuvable.');
  if (t.status !== 'open') fail('Les inscriptions ne sont pas ouvertes.');
  if (new Date(t.deadline).getTime() < Date.now()) fail('La date limite d’inscription est passée.');
  if (activeRegs(t).length >= t.max) fail('Il n’y a plus de place disponible.');
  if (isRegistered(t, u.id)) fail('Tu es déjà inscrit à ce tournoi.');
  const team = TEAM_TYPES.includes(t.type);
  if (team && !teamName.trim()) fail('Donne un nom à ton équipe.');
  if (mateId) {
    const m = user(mateId);
    if (!m || m.status !== 'active') fail('Coéquipier invalide.');
    if (isRegistered(t, mateId)) fail(`${m.pseudo} est déjà inscrit.`);
    if (mateId === u.id) fail('Choisis un autre coéquipier.');
  }
  t.registrations.push({ id: uid('r'), userId: u.id, teamName: teamName.trim(), mateId: mateId || null, status: 'pending', at: nowISO() });
  if (mateId) notify(mateId, `${u.pseudo} t’a inscrit avec lui en équipe « ${teamName} » pour ${t.name}.`, `#/tournoi/${t.id}`);
  if (t.managerId) notify(t.managerId, `Nouvelle inscription à ${t.name} : ${u.pseudo}.`, `#/tournoi/${t.id}`);
  audit('Inscription tournoi', t.name, u.pseudo + (team ? ` · équipe ${teamName}` : ''));
  commit();
}
export function joinTeam(tId, regId) {
  const u = mustActiveMember();
  const t = tournament(tId); const r = t?.registrations.find((x) => x.id === regId);
  if (!t || !r) fail('Équipe introuvable.');
  if (!t.allowJoin) fail('Le responsable n’autorise pas à rejoindre une équipe existante.');
  if (t.status !== 'open') fail('Les inscriptions ne sont pas ouvertes.');
  if (r.mateId) fail('Cette équipe est complète.');
  if (isRegistered(t, u.id)) fail('Tu es déjà inscrit à ce tournoi.');
  r.mateId = u.id;
  notify(r.userId, `${u.pseudo} a rejoint ton équipe « ${r.teamName} ».`, `#/tournoi/${t.id}`);
  audit('Équipe rejointe', t.name, `${u.pseudo} → ${r.teamName}`);
  commit();
}
export function unregisterT(tId) {
  const u = mustActiveMember();
  const t = tournament(tId); if (!t) fail('Tournoi introuvable.');
  if (!['open', 'closed'].includes(t.status)) fail('Tu ne peux plus te désinscrire.');
  const r = activeRegs(t).find((x) => regUsers(x).includes(u.id)); if (!r) fail('Tu n’es pas inscrit.');
  if (r.userId === u.id) r.status = 'removed'; else r.mateId = null;
  audit('Désinscription tournoi', t.name, u.pseudo);
  commit();
}
export function setRegStatus(tId, regId, status, reason = '') {
  const t = tournament(tId); if (!t || !canManageT(t)) fail('Action non autorisée pour ce tournoi.');
  const r = t.registrations.find((x) => x.id === regId); if (!r) fail('Inscription introuvable.');
  if (t.status === 'done') fail('Le tournoi est terminé.');
  if (status === 'removed' && !reason.trim()) fail('Indique le motif du retrait.');
  r.status = status;
  for (const id of regUsers(r)) notify(id, status === 'ok' ? `Ton inscription à ${t.name} est validée.` : `Tu as été retiré de ${t.name}. Motif : ${reason}`, `#/tournoi/${t.id}`);
  audit(status === 'ok' ? 'Inscription validée' : 'Participant retiré', t.name, `${regLabel(t, r)}${reason ? ` · ${reason}` : ''}`);
  commit();
}
export function addMatch(tId, { a, b, sa, sb, round }) {
  const t = tournament(tId); if (!t || !canManageT(t)) fail('Action non autorisée pour ce tournoi.');
  if (t.status === 'done') fail('Les résultats sont déjà validés.');
  if (!a || !b || a === b) fail('Choisis deux participants différents.');
  const x = Number(sa), y = Number(sb);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) fail('Scores invalides.');
  t.matches.push({ id: uid('m'), a, b, sa: x, sb: y, round: round?.trim() || 'Match' });
  audit('Match enregistré', t.name, `${regLabel(t, t.registrations.find((r) => r.id === a))} ${x} - ${y} ${regLabel(t, t.registrations.find((r) => r.id === b))}`);
  commit();
}
export function publishResults(tId, podium) {
  const t = tournament(tId); if (!t || !canManageT(t)) fail('Action non autorisée pour ce tournoi.');
  if (t.status === 'done' || t.results) fail('Les résultats de ce tournoi sont déjà validés.');
  if (!['live', 'closed'].includes(t.status)) fail('Le tournoi doit être en cours ou ses inscriptions fermées.');
  const ok = t.registrations.filter((r) => r.status === 'ok');
  const pod = podium.filter(Boolean);
  if (!pod[0]) fail('Indique au moins le vainqueur.');
  if (new Set(pod).size !== pod.length) fail('Un participant ne peut occuper qu’une place.');
  if (pod.some((id) => !ok.some((r) => r.id === id))) fail('Le podium doit contenir des participants validés.');
  const award = (r, pts, label, rid, participation = false) => {
    if (!pts) return;
    for (const id of regUsers(r)) pushTx({ userId: id, points: pts, ruleId: rid, label, reason: `${label} · ${t.name}`, mode: t.mode, tournamentId: t.id, ref: t.id, kind: 'earn', participation });
  };
  for (const r of ok) award(r, t.points.participation, 'Participation à un tournoi', 't_part', true);
  const lab = ['Victoire en tournoi', 'Deuxième place en tournoi', 'Troisième place en tournoi'];
  const pts = [t.points.first, t.points.second, t.points.third];
  pod.forEach((id, i) => award(ok.find((r) => r.id === id), pts[i], lab[i], `t_${i + 1}`));
  t.results = { podium: pod, ranking: [...pod, ...ok.filter((r) => !pod.includes(r.id)).map((r) => r.id)], validatedAt: nowISO(), validatedBy: me().id };
  t.status = 'done';
  const total = ok.reduce((a, r) => a + regUsers(r).length * t.points.participation, 0) + pod.reduce((a, id, i) => a + regUsers(ok.find((r) => r.id === id)).length * pts[i], 0);
  audit('Résultats validés', t.name, `${ok.length} participants · vainqueur ${regLabel(t, ok.find((r) => r.id === pod[0]))} · ${total} points distribués`);
  notifyAll(`Résultats publiés : ${t.name}. Vainqueur : ${regLabel(t, ok.find((r) => r.id === pod[0]))}.`, `#/tournoi/${t.id}`);
  commit();
}

// Classement de la semaine envoyé à tout le clan (dimanche soir, ou à la demande)
export function weeklyDigest({ force = false } = {}) {
  if (force || me()) must('announcements.manage'); // seule la tâche planifiée l'appelle sans utilisateur
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const key = start.toISOString().slice(0, 10);
  if (!force && D().settings.lastDigest === key) return false;
  const top = ranking('week').filter((r) => r.value > 0).slice(0, 3);
  if (!top.length) { if (force) fail('Aucun point gagné cette semaine.'); return false; }
  const podiumTxt = top.map((r) => `${r.rank}. ${r.user.pseudo} (${r.value} pts)`).join(', ');
  notifyAll(`Classement de la semaine : ${podiumTxt}. Viens voir ton rang.`, '#/classement?k=week');
  D().settings.lastDigest = key;
  audit('Classement envoyé', 'Classement de la semaine', podiumTxt);
  commit();
  return true;
}

// Tâche serveur : rappel 24 h avant le tournoi
export function remindTournaments() {
  const soon = Date.now() + 24 * 36e5; let n = 0;
  for (const t of D().tournaments) {
    if (!['open', 'closed'].includes(t.status) || t.reminded) continue;
    const at = new Date(t.date).getTime();
    if (at > soon || at < Date.now()) continue;
    const time = new Date(t.date).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    const regs = new Set(activeRegs(t).flatMap(regUsers));
    notifyAll(`Rappel : ${t.name} commence ${time}.${t.status === 'open' ? ' Inscriptions encore ouvertes.' : ''}`, `#/tournoi/${t.id}`, (u) => !regs.has(u.id));
    for (const id of regs) notify(id, `Rappel : ${t.name} commence ${time}. Tu es inscrit.`, `#/tournoi/${t.id}`);
    t.reminded = true; n++;
  }
  if (n) commit();
  return n;
}

// ---------- Récompenses ----------
export const reward = (id) => D().rewards.find((r) => r.id === id) || null;
export function rewardState(r) {
  const n = Date.now();
  if (!r.active) return 'off';
  if ((r.from && new Date(r.from).getTime() > n) || (r.to && new Date(r.to).getTime() < n)) return 'off';
  if (r.stock <= 0) return 'out';
  return 'on';
}
export const REWARD_STATE = { on: 'Disponible', off: 'Indisponible', out: 'Épuisé' };
export const rewardsList = () => [...D().rewards].sort((a, b) => a.cost - b.cost);
export const reserved = (userId) => D().requests.filter((q) => q.userId === userId && ['pending', 'hold'].includes(q.status)).reduce((a, q) => a + q.cost, 0);
export const spendable = (userId) => stats()[userId].balance - reserved(userId);
export function whyCantRequest(r, u = me()) {
  if (!u) return 'Connecte-toi';
  if (u.status !== 'active') return 'Compte non actif';
  const st = rewardState(r);
  if (st !== 'on') return REWARD_STATE[st];
  const left = spendable(u.id);
  if (left < r.cost) return `Il te manque ${r.cost - left} pts`;
  return null;
}
export function requestReward(rewardId) {
  const u = mustActiveMember();
  const r = reward(rewardId); if (!r) fail('Récompense introuvable.');
  const why = whyCantRequest(r, u); if (why) fail(`Demande impossible : ${why.toLowerCase()}.`);
  const q = { id: uid('rq'), userId: u.id, rewardId, cost: r.cost, status: 'pending', reason: '', at: nowISO(), history: [{ status: 'pending', at: nowISO(), by: u.id }] };
  D().requests.push(q);
  notifyPerm('rewards.manage', `${u.pseudo} demande : ${r.name}.`, '#/admin/recompenses');
  audit('Demande de récompense', r.name, `${u.pseudo} · ${r.cost} pts`);
  commit();
}
export function cancelRequest(id) {
  const u = me(); const q = D().requests.find((x) => x.id === id);
  if (!q || q.userId !== u?.id) fail('Demande introuvable.');
  if (!['pending', 'hold'].includes(q.status)) fail('Cette demande ne peut plus être annulée.');
  q.status = 'refused'; q.reason = 'Annulée par le membre';
  q.history.push({ status: 'refused', at: nowISO(), by: u.id, note: 'Annulée par le membre' });
  audit('Demande annulée', reward(q.rewardId)?.name, u.pseudo);
  commit();
}
export function processRequest(id, action, reason = '') {
  must('rewards.manage');
  const db = D(); const q = db.requests.find((x) => x.id === id); if (!q) fail('Demande introuvable.');
  const r = reward(q.rewardId); const u = user(q.userId);
  if (q.userId === me().id) fail('Tu ne peux pas traiter ta propre demande.');
  const step = (status, note = '') => { q.status = status; q.history.push({ status, at: nowISO(), by: me().id, note }); };
  if (action === 'accept') {
    if (!['pending', 'hold'].includes(q.status)) fail('Cette demande a déjà été traitée.');
    if (!q.auto) {
      if (r.stock <= 0) fail('Stock épuisé : impossible d’accepter.');
      const bal = stats()[q.userId].balance;
      if (bal < q.cost) fail(`Solde insuffisant (${bal} pts pour ${q.cost}).`);
      pushTx({ userId: q.userId, points: -q.cost, label: `Récompense : ${r.name}`, reason: 'Débit à l’acceptation de la demande', ref: q.id, kind: 'reward', requestId: q.id });
      r.stock -= 1;
    }
    step('accepted');
    notify(q.userId, `Ta demande « ${r.name} » est acceptée. Remise à venir.`, '#/recompenses');
  } else if (action === 'refuse') {
    if (!['pending', 'hold'].includes(q.status)) fail('Cette demande a déjà été traitée.');
    if (!reason.trim()) fail('Indique le motif du refus.');
    q.reason = reason.trim(); step('refused', reason.trim());
    notify(q.userId, `Ta demande « ${r.name} » est refusée : ${reason}`, '#/recompenses');
  } else if (action === 'hold') {
    if (q.status !== 'pending') fail('Seule une demande en attente peut être suspendue.');
    step('hold', reason.trim());
    notify(q.userId, `Ta demande « ${r.name} » est mise en attente.${reason ? ` ${reason}` : ''}`, '#/recompenses');
  } else if (action === 'deliver') {
    if (q.status !== 'accepted') fail('La demande doit être acceptée avant la remise.');
    step('delivered', reason.trim()); q.deliveredAt = nowISO(); q.deliveredBy = me().id;
    notify(q.userId, `Récompense remise : ${r.name}.`, '#/recompenses');
  } else fail('Action inconnue.');
  audit(`Récompense : ${R_STATUS[q.status]}`, r.name, `${u?.pseudo}${reason ? ` · ${reason}` : ''}`);
  commit();
}
export function saveReward(f) {
  must('rewards.manage');
  const db = D(); const isNew = !f.id;
  const r = isNew ? { id: uid('rw') } : reward(f.id);
  if (!r) fail('Récompense introuvable.');
  if (!f.name?.trim()) fail('Le nom est obligatoire.');
  if (f.img != null) checkImage(f.img);
  const cost = Number(f.cost), stock = Number(f.stock);
  if (!Number.isInteger(cost) || cost < 1) fail('Coût en points invalide.');
  if (!Number.isInteger(stock) || stock < 0) fail('Stock invalide.');
  if (!R_CATS[f.category]) fail('Catégorie invalide.');
  const prev = isNew ? null : { cost: r.cost, stock: r.stock };
  Object.assign(r, { name: f.name.trim(), description: f.description?.trim() || '', category: f.category, cost, stock, from: f.from || null, to: f.to || null, active: f.active !== false && f.active !== 'off', img: f.img ?? r.img ?? null });
  if (isNew) db.rewards.push(r);
  audit(isNew ? 'Récompense ajoutée' : 'Récompense modifiée', r.name, prev ? `Coût ${prev.cost} → ${cost}, stock ${prev.stock} → ${stock}` : `${cost} pts, stock ${stock}`);
  if (r.active && isNew) notifyAll(`Nouvelle récompense au catalogue : ${r.name}, ${cost} points.`, '#/recompenses');
  else if (r.active && prev && prev.stock === 0 && stock > 0) notifyAll(`De retour en stock : ${r.name}, ${cost} points.`, '#/recompenses');
  commit();
}
export function toggleReward(id) {
  must('rewards.manage');
  const r = reward(id); r.active = !r.active;
  audit(r.active ? 'Récompense activée' : 'Récompense désactivée', r.name);
  commit();
}
export const myRequests = (userId) => D().requests.filter((q) => q.userId === userId).sort((a, b) => b.at.localeCompare(a.at));

// Proposition automatique : meilleur joueur du mois précédent
// Statistiques gardées avec la distinction « MVP du mois » pour son animation
function mvpStats(userId, points) {
  const s = stats()[userId] || {};
  return { points: points ?? (s.prevMonth > 0 ? s.prevMonth : s.month || 0), rank: rankOf(userId, 'season'), grade: grade(s.permanent || 0).name };
}
export const MVP = 'MVP du mois';
// Joueurs du mois, du plus récent au plus ancien
export function mvps() { return D().distinctions.filter((x) => x.title === MVP && user(x.userId)).sort((a, b) => b.at.localeCompare(a.at)); }
export function monthlyProposal() {
  const top = ranking('prevMonth')[0];
  if (!top || top.value <= 0) return null;
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  const period = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  if (D().distinctions.some((x) => x.title === 'MVP du mois' && x.period === period)) return null;
  return { user: top.user, points: top.value, period };
}
export function acceptProposal() {
  if (!can('rewards.manage') && !can('members.manage')) fail('Action non autorisée pour ton rôle.');
  const p = monthlyProposal(); if (!p) fail('Aucune proposition en cours.');
  const dist = { id: uid('d'), userId: p.user.id, title: MVP, period: p.period, at: nowISO(), by: me().id, stats: mvpStats(p.user.id, p.points) };
  D().distinctions.push(dist);
  const bp = D().rewards.find((r) => r.category === 'bp');
  if (bp) D().requests.push({ id: uid('rq'), userId: p.user.id, rewardId: bp.id, cost: 0, auto: true, status: 'accepted', reason: '', at: nowISO(), history: [{ status: 'accepted', at: nowISO(), by: me().id, note: `MVP de ${p.period}` }] });
  notify(p.user.id, `Tu es le joueur du mois de ${p.period}. Ta passe de combat sera remise par un responsable.`, `#/mvp/${dist.id}`);
  notifyAll(`${p.user.pseudo} est le joueur du mois de ${p.period}. Découvre son animation.`, `#/mvp/${dist.id}`, (u) => u.id !== p.user.id);
  audit('Proposition MVP validée', p.user.pseudo, `${p.period} · ${p.points} pts · passe de combat à remettre`);
  commit();
}

export function awardDistinction({ userId, title, period }) {
  if (!can('members.manage') && !can('rewards.manage')) fail('Action non autorisée pour ton rôle.');
  if (!user(userId)) fail('Membre introuvable.');
  if (!title?.trim() || !period?.trim()) fail('Distinction et période obligatoires.');
  const dist = { id: uid('d'), userId, title: title.trim(), period: period.trim(), at: nowISO(), by: me().id };
  const mvp = dist.title === MVP;
  if (mvp) dist.stats = mvpStats(userId);
  D().distinctions.push(dist);
  notify(userId, mvp ? `Tu es le joueur du mois de ${dist.period}.` : `Nouvelle distinction : ${title} (${period}).`, mvp ? `#/mvp/${dist.id}` : '#/profil');
  notifyAll(mvp ? `${user(userId).pseudo} est le joueur du mois de ${dist.period}. Découvre son animation.` : `${user(userId).pseudo} reçoit la distinction ${title.trim()} (${period.trim()}).`, mvp ? `#/mvp/${dist.id}` : `#/joueur/${userId}`, (u) => u.id !== userId);
  audit('Distinction attribuée', user(userId).pseudo, `${title} · ${period}`);
  commit();
}
export const distinctionsOf = (userId) => D().distinctions.filter((d) => d.userId === userId).sort((a, b) => b.at.localeCompare(a.at));

// ---------- Annonces et notifications ----------
export function visibleAnnouncements(u = me()) {
  return D().announcements.filter((a) => !a.archived && (a.audience === 'all' || (a.audience === 'staff' && isStaff(u)) || (u && ['MJ', 'BR'].includes(a.audience) && (u.mode === 'MJ+BR' || u.mode === a.audience)) || (a.audience !== 'all' && isStaff(u))))
    .sort((a, b) => (b.pinned - a.pinned) || b.at.localeCompare(a.at));
}
export function publicAnnouncements() { return D().announcements.filter((a) => !a.archived && a.audience === 'all').sort((a, b) => b.at.localeCompare(a.at)); }
export function createAnnouncement({ title, body, audience, pinned }) {
  must('announcements.manage');
  if (typeof title !== 'string' || typeof body !== 'string' || !title.trim() || !body.trim()) fail('Titre et texte obligatoires.');
  if (audience && !['all', 'MJ', 'BR', 'staff'].includes(audience)) fail('Public invalide.');
  const a = { id: uid('n'), title: title.trim(), body: body.trim(), audience: audience || 'all', pinned: !!pinned, at: nowISO(), authorId: me().id };
  D().announcements.push(a);
  // Tout le clan, sauf si l'annonce vise un public précis (MJ, BR, encadrement)
  notifyAll(`${a.pinned ? 'Annonce importante' : 'Annonce'} : ${a.title}`, `#/annonces?id=${a.id}`, (u) => u.id !== me().id && visibleAnnouncements(u).some((x) => x.id === a.id));
  audit('Annonce publiée', a.title, `Public : ${a.audience}`);
  commit();
}
export function archiveAnnouncement(id) {
  must('announcements.manage');
  const a = D().announcements.find((x) => x.id === id); a.archived = true;
  audit('Annonce archivée', a.title);
  commit();
}
export const myNotifications = () => D().notifications.filter((n) => n.userId === me()?.id).sort((a, b) => b.at.localeCompare(a.at));
export const unreadCount = () => myNotifications().filter((n) => !n.read).length;
export function markAllRead() { myNotifications().forEach((n) => (n.read = true)); commit(); }
export function markRead(id) { const n = D().notifications.find((x) => x.id === id && x.userId === me()?.id); if (n) { n.read = true; commit(); } }

// ---------- Discipline ----------
export function addSanction({ userId, kind, reason, points }) {
  must('discipline.manage');
  const u = user(userId); if (!u) fail('Membre introuvable.');
  if (u.id === me().id) fail('Tu ne peux pas te sanctionner toi-même.');
  if (!['avertissement', 'sanction', 'suspension', 'exclusion'].includes(kind)) fail('Type de décision invalide.');
  if (typeof reason !== 'string' || reason.trim().length < 5) fail('Le motif est obligatoire.');
  const pts = Number(points) || 0;
  if (pts > 0) fail('Une sanction ne peut pas ajouter de points.');
  D().discipline.push({ id: uid('ds'), userId, kind, reason: reason.trim(), points: pts, at: nowISO(), adminId: me().id });
  if (pts < 0) pushTx({ userId, points: pts, label: `Sanction : ${kind}`, reason: reason.trim(), ref: uid('sanc'), kind: 'penalty' });
  if (kind === 'suspension' && u.status === 'active') { u.status = 'suspended'; audit('Statut modifié', u.pseudo, `Actif → Suspendu. Motif : ${reason}`); }
  if (kind === 'exclusion') { const prev = u.status; u.status = 'excluded'; audit('Statut modifié', u.pseudo, `${STATUS[prev]} → Exclu. Motif : ${reason}`); }
  notify(userId, `${kind[0].toUpperCase() + kind.slice(1)} enregistré${kind === 'suspension' || kind === 'exclusion' ? 'e' : ''} : ${reason}`, '#/reglement');
  audit('Sanction disciplinaire', u.pseudo, `${kind}${pts ? ` · ${pts} pts` : ''} · ${reason}`);
  commit();
}
export const disciplineOf = (userId) => D().discipline.filter((d) => d.userId === userId).sort((a, b) => b.at.localeCompare(a.at));

// ---------- Paramètres ----------
export function saveRules(rules) {
  must('rules.manage');
  const clean = rules.map((r) => {
    const pts = Number(r.points);
    if (!r.label?.trim()) fail('Chaque activité doit avoir un nom.');
    if (!Number.isInteger(pts) || pts === 0) fail(`Points invalides pour « ${r.label} ».`);
    return { id: r.id || uid('rule'), label: r.label.trim(), points: pts, participation: !!r.participation };
  });
  const prev = D().settings.pointRules;
  const diff = clean.filter((r) => { const p = prev.find((x) => x.id === r.id); return !p || p.points !== r.points || p.label !== r.label; }).map((r) => `${r.label} ${r.points > 0 ? '+' : ''}${r.points}`);
  D().settings.pointRules = clean;
  audit('Barème modifié', 'Barème des points', diff.join(' · ') || 'Aucun changement de valeur');
  if (diff.length) notifyAll(`Le barème des points a changé : ${diff.slice(0, 3).join(', ')}${diff.length > 3 ? '…' : ''}.`, '#/clan');
  commit();
}
export function saveGrades(grades) {
  must('rules.manage');
  const g = grades.map((x) => ({ name: x.name.trim(), min: Number(x.min) })).sort((a, b) => a.min - b.min);
  if (g.some((x) => !x.name || !Number.isInteger(x.min) || x.min < 0)) fail('Grades invalides.');
  if (g[0].min !== 0) fail('Le premier grade doit commencer à 0 point.');
  if (new Set(g.map((x) => x.min)).size !== g.length) fail('Deux grades ne peuvent pas avoir le même seuil.');
  D().settings.grades = g;
  audit('Grades modifiés', 'Système de grades', g.map((x) => `${x.name} ${x.min}`).join(' · '));
  notifyAll('Les grades du clan ont changé. Regarde où tu en es.', '#/clan');
  commit();
}
export function saveWeekly(list) {
  must('rules.manage');
  const rules = D().settings.pointRules;
  for (const w of list) {
    if (!w || typeof w.label !== 'string' || !w.label.trim() || w.label.length > 80) fail('Chaque créneau doit avoir un intitulé.');
    if (!(Number(w.day) >= 0 && Number(w.day) <= 6) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(w.time))) fail(`Jour ou heure invalide pour « ${w.label} ».`);
    if (w.ruleId && !rules.some((r) => r.id === w.ruleId)) fail('Activité du barème inconnue.');
    if (w.mode && !['MJ', 'BR'].includes(w.mode)) fail('Mode invalide.');
  }
  D().settings.weekly = list.map((w) => ({ id: w.id || uid('w'), day: Number(w.day), label: w.label.trim(), time: w.time, ruleId: w.ruleId || null, mode: w.mode || null }));
  syncWeekly();
  audit('Calendrier modifié', 'Programme hebdomadaire');
  notifyAll('Le programme de la semaine a changé.', '#/calendrier');
  commit();
  ensureUpcoming();
}
export function saveRolePerms(map) {
  if (!isSuper()) fail('Seul un super administrateur peut modifier les permissions.');
  const clean = { member: [] };
  for (const [r, perms] of Object.entries(map || {})) {
    if (!ROLES[r] || r === 'superadmin' || r === 'member') continue;
    if (!Array.isArray(perms)) fail('Permissions invalides.');
    clean[r] = [...new Set(perms.filter((p) => PERMS[p]))];
  }
  map = clean;
  D().settings.rolePerms = map;
  audit('Permissions modifiées', 'Rôles et permissions', Object.entries(map).map(([r, p]) => `${ROLES[r]} : ${p.length}`).join(' · '));
  commit();
}
export function saveRulebook(lines) {
  must('rules.manage');
  if (lines.some((l) => typeof l !== 'string')) fail('Règlement invalide.');
  D().settings.rulebook = lines.map((l) => l.trim()).filter(Boolean);
  audit('Règlement modifié', 'Règlement du clan', `${D().settings.rulebook.length} articles`);
  notifyAll('Le règlement du clan a été mis à jour.', '#/reglement');
  commit();
}
export function closeSeason({ name, resetBalance }) {
  if (!isSuper() && !can('settings.manage')) fail('Action non autorisée pour ton rôle.');
  if (!name?.trim()) fail('Nomme la nouvelle saison.');
  const db = D(); const cur = db.settings.season;
  const standings = ranking('season').map((r) => ({ userId: r.user.id, points: r.value }));
  db.seasons.unshift({ id: cur.id, name: cur.name, start: cur.start, end: nowISO(), standings });
  if (resetBalance) for (const u of db.users) { const b = stats()[u.id].balance; if (b > 0) pushTx({ userId: u.id, points: -b, label: 'Remise à zéro du solde', reason: `Fin de ${cur.name}`, ref: `reset:${cur.id}`, kind: 'reset' }); }
  db.settings.season = { id: uid('s'), name: name.trim(), start: nowISO() };
  audit('Saison clôturée', cur.name, `${standings.length} classés · nouvelle saison : ${name}${resetBalance ? ' · soldes remis à zéro' : ' · soldes conservés'}`);
  notifyAll(`${cur.name} est terminée. Bienvenue dans ${name}.`, '#/classement');
  commit();
}

export function overview() {
  const db = D(); const S = stats();
  const ss = new Date(db.settings.season.start).getTime(); const d30 = Date.now() - 30 * 864e5;
  return {
    total: db.users.filter((u) => !['refused', 'pending'].includes(u.status)).length,
    active: db.users.filter((u) => u.status === 'active').length,
    pending: db.users.filter((u) => u.status === 'pending'),
    upcoming: db.tournaments.filter((t) => ['open', 'closed', 'draft'].includes(t.status)).length,
    live: db.tournaments.filter((t) => t.status === 'live').length,
    participations: db.transactions.filter((t) => t.participation && t.points > 0 && new Date(t.at).getTime() > d30).length,
    distributed: db.transactions.filter((t) => t.points > 0 && t.kind === 'earn' && new Date(t.at).getTime() >= ss).reduce((a, t) => a + t.points, 0),
    rewardsOn: db.rewards.filter((r) => rewardState(r) === 'on').length,
    requests: db.requests.filter((q) => ['pending', 'hold'].includes(q.status)).length,
    toDeliver: db.requests.filter((q) => q.status === 'accepted').length,
    S,
  };
}
export const auditLog = () => [...D().audit].sort((a, b) => b.at.localeCompare(a.at));
