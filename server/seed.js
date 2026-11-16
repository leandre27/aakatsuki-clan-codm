// Données initiales : jeu de démonstration complet, ou démarrage vierge pour la production.
import { hashPassword, newSalt } from './auth.js';

// ---------- Données de démonstration ----------
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_RULES = [
  { id: 'training', label: 'Participation à un entraînement', points: 10, participation: true },
  { id: 'scrim', label: 'Participation à un scrim', points: 15, participation: true },
  { id: 'scrim_win', label: 'Victoire en scrim', points: 20 },
  { id: 't_part', label: 'Participation à un tournoi', points: 20, participation: true },
  { id: 't_1', label: 'Victoire en tournoi', points: 40 },
  { id: 't_2', label: 'Deuxième place en tournoi', points: 25 },
  { id: 't_3', label: 'Troisième place en tournoi', points: 15 },
  { id: 'help', label: "Aide et accompagnement d'un membre", points: 5 },
  { id: 'recruit', label: "Recrutement validé d'un nouveau joueur", points: 15 },
  { id: 'special', label: 'Participation à une activité spéciale', points: 10, participation: true },
  { id: 'absence', label: 'Absence injustifiée à une activité obligatoire', points: -10 },
];

export const DEFAULT_ROLE_PERMS = {
  admin: ['members.view', 'members.manage', 'members.roles', 'points.manage', 'rules.manage', 'tournaments.manage', 'rewards.manage', 'announcements.manage', 'discipline.manage', 'audit.view'],
  resp_mj: ['members.view', 'points.manage', 'tournaments.mj', 'announcements.manage'],
  resp_br: ['members.view', 'points.manage', 'tournaments.br', 'announcements.manage'],
  resp_rewards: ['members.view', 'rewards.manage'],
  resp_recruit: ['members.view', 'members.manage'],
  member: [],
};

export async function seedDemo() {
  const r = rng(2026);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const now = Date.now();
  const DAY = 864e5;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const at = (daysAgo, h = 21, m = 0) => { const d = new Date(today.getTime() - daysAgo * DAY); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const seasonStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  const settings = {
    clanName: 'AaKATSUKI', clanSigil: '影',
    season: { id: 's4', name: 'Saison 4', start: seasonStart.toISOString() },
    pointRules: DEFAULT_RULES.map((x) => ({ ...x })),
    grades: [
      { name: 'Recrue', min: 0 }, { name: 'Soldat', min: 100 }, { name: 'Combattant', min: 250 },
      { name: 'Élite', min: 500 }, { name: 'Expert', min: 800 }, { name: 'Légende', min: 1200 },
    ],
    weekly: [
      { id: 'w0', day: 0, label: 'Réunion, annonces et objectifs', time: '20:00', ruleId: null, mode: null },
      { id: 'w1', day: 1, label: 'Entraînement Multijoueur', time: '20:30', ruleId: 'training', mode: 'MJ' },
      { id: 'w2', day: 2, label: 'Entraînement Battle Royale', time: '20:30', ruleId: 'training', mode: 'BR' },
      { id: 'w3', day: 3, label: 'Scrims internes', time: '21:00', ruleId: 'scrim', mode: 'MJ' },
      { id: 'w4', day: 4, label: 'Tournoi 1v1 ou sniper', time: '21:00', ruleId: null, mode: 'MJ' },
      { id: 'w5', day: 5, label: 'Compétition principale', time: '18:00', ruleId: null, mode: null },
      { id: 'w6', day: 6, label: 'Classements, bilans et récompenses', time: '19:00', ruleId: null, mode: null },
    ],
    rolePerms: JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMS)),
    debitPolicy: 'accept',
    rulebook: [
      'Respecter les autres joueurs, en jeu comme en vocal.',
      'Respecter les responsables et les décisions officielles du clan.',
      'Participer aux activités auxquelles tu t’es inscrit.',
      'Prévenir un responsable en cas d’indisponibilité, au plus tard deux heures avant.',
      'Éviter tout comportement qui nuit à la cohésion du clan.',
      'Respecter le règlement propre à chaque tournoi.',
      'Ne jamais falsifier un résultat ni tenter de manipuler les points.',
    ],
  };

  const people = [
    ['Kurogane', ['superadmin', 'member'], 'MJ+BR', 'AR', 0.92, 'active', 'chef@akatsuki.test', 'Akatsuki2026!'],
    ['Vesper', ['admin', 'member'], 'MJ', 'SMG', 0.86, 'active'],
    ['Hayate', ['resp_mj', 'member'], 'MJ', 'AR', 0.82, 'active'],
    ['Nox', ['resp_br', 'member'], 'BR', 'Sniper', 0.78, 'active'],
    ['Kaizen', ['resp_rewards', 'member'], 'MJ+BR', 'Shotgun', 0.6, 'active'],
    ['Tenma', ['resp_recruit', 'member'], 'MJ', 'SMG', 0.64, 'active'],
    ['Yoru', ['member'], 'MJ+BR', 'Sniper', 0.8, 'active', 'membre@akatsuki.test', 'Membre2026!'],
    ['Ryuga', ['member'], 'BR', 'AR', 0.72, 'active'],
    ['Obsidia', ['member'], 'MJ', 'Sniper', 0.56, 'active'],
    ['Zephyr', ['member'], 'MJ', 'SMG', 0.5, 'active'],
    ['Kael', ['member'], 'BR', 'AR', 0.46, 'active'],
    ['Onyx', ['member'], 'MJ', 'AR', 0.62, 'active'],
    ['Brasier', ['member'], 'MJ+BR', 'Shotgun', 0.4, 'active'],
    ['Mirage', ['member'], 'BR', 'Sniper', 0.52, 'active'],
    ['Kenshin', ['member'], 'MJ', 'AR', 0.3, 'inactive'],
    ['Ombre', ['member'], 'MJ', 'SMG', 0.5, 'suspended'],
    ['Taiga', ['member'], 'BR', 'Sniper', 0, 'pending'],
    ['Sable', ['member'], 'MJ', 'SMG', 0, 'pending'],
  ];
  const colors = ['#d6202a', '#8a1016', '#3a3a42', '#e9e4da', '#5a1d20', '#26262c'];
  const avail = ['Soirs en semaine', 'Week-end', 'Tous les soirs après 20 h', 'Mercredi et samedi', 'Variable'];
  const users = [];
  for (const [i, p] of people.entries()) {
    const [pseudo, roles, mode, specialty, assid, status, email, pw] = p;
    const salt = newSalt();
    users.push({
      id: `u${i + 1}`,
      login: pseudo.toLowerCase(),
      email: email || `${pseudo.toLowerCase()}@akatsuki.test`,
      salt,
      passHash: await hashPassword(pw || crypto.randomUUID(), salt),
      pseudo, firstName: '', lastName: '',
      uid: '67' + Array.from({ length: 17 }, () => Math.floor(r() * 10)).join(''),
      level: 120 + Math.floor(r() * 280),
      mode, specialty,
      availability: pick(avail),
      color: colors[i % colors.length],
      avatar: null,
      status, roles,
      assid,
      createdAt: at(status === 'pending' ? 1 + i % 2 : 80 - i * 2, 18),
      joinedAt: status === 'pending' ? null : at(78 - i * 2, 19),
    });
  }
  const active = users.filter((u) => ['active', 'suspended', 'inactive'].includes(u.status));
  const staffIds = ['u1', 'u2', 'u3', 'u4'];

  const events = []; // transactions sans soldes, triées ensuite
  const activities = [];
  const rule = (id) => settings.pointRules.find((x) => x.id === id);
  const tx = (u, ruleId, when, extra = {}) => {
    const ru = rule(ruleId);
    events.push({
      id: `tx${events.length + 1}`, userId: u.id, points: extra.points ?? ru.points, ruleId,
      label: ru.label, reason: extra.reason || ru.label, mode: extra.mode || null,
      activityId: extra.activityId || null, tournamentId: extra.tournamentId || null,
      ref: extra.ref || extra.activityId || extra.tournamentId || `day:${when.slice(0, 10)}`,
      kind: ru.points < 0 ? 'penalty' : 'earn', participation: !!ru.participation,
      adminId: extra.adminId || pick(staffIds), at: when, correctionOf: null,
    });
  };

  // Activités passées (75 jours)
  for (let d = 75; d >= 1; d--) {
    const date = new Date(today.getTime() - d * DAY);
    const wd = (date.getDay() + 6) % 7;
    const slot = settings.weekly.find((w) => w.day === wd && w.ruleId);
    if (!slot) continue;
    const when = at(d, Number(slot.time.slice(0, 2)), Number(slot.time.slice(3)));
    const act = { id: `a${activities.length + 1}`, key: `${when.slice(0, 10)}|${slot.id}`, title: slot.label, ruleId: slot.ruleId, mode: slot.mode, date: when, registrations: [], auto: true };
    activities.push(act);
    for (const u of active) {
      if (u.status === 'inactive' && d < 35) continue;
      if (u.mode !== 'MJ+BR' && slot.mode && u.mode !== slot.mode && r() > 0.25) continue;
      if (r() < u.assid) {
        act.registrations.push(u.id);
        tx(u, slot.ruleId, when, { mode: slot.mode, activityId: act.id });
        if (slot.ruleId === 'scrim' && r() < 0.4) tx(u, 'scrim_win', at(d, 22, 30), { mode: slot.mode, activityId: act.id });
      }
    }
    if (r() < 0.25) tx(pick(active), 'help', at(d, 22, 45));
  }
  tx(users[5], 'recruit', at(20, 15)); tx(users[1], 'recruit', at(9, 16));
  tx(users[12], 'absence', at(17, 21), { reason: 'Absent au scrim de jeudi sans prévenir' });
  tx(users[15], 'absence', at(11, 21), { reason: 'Absence injustifiée à la compétition principale' });

  // Tournois
  const mk = (o) => ({
    description: '', format: 'Élimination directe', rules: 'Pas de grenades tactiques en finale. Respect des horaires : 10 minutes de retard vaut forfait.',
    rewards: 'Points au classement', registrations: [], matches: [], results: null, allowJoin: false, managerId: 'u3',
    points: { participation: 20, first: 40, second: 25, third: 15 }, createdBy: 'u1', ...o,
  });
  const tournaments = [];
  const finished = [
    { name: 'Coupe du Nuage Rouge', type: 'mp', mode: 'MJ', days: 40, max: 16 },
    { name: 'Duel des Snipers', type: 'sniper', mode: 'MJ', days: 26, max: 12, managerId: 'u4' },
    { name: 'Royale de la Pleine Lune', type: 'br', mode: 'BR', days: 12, max: 16, managerId: 'u4' },
    { name: 'Tournoi 1v1 de novembre', type: '1v1', mode: 'MJ', days: 5, max: 16 },
  ];
  for (const f of finished) {
    const T = mk({ id: `t${tournaments.length + 1}`, name: f.name, type: f.type, mode: f.mode, date: at(f.days, 18), deadline: at(f.days + 2, 23, 59), max: f.max, status: 'done', managerId: f.managerId || 'u3' });
    const pool = active.filter((u) => u.status !== 'inactive' && (f.type !== 'sniper' || u.specialty === 'Sniper' || r() < 0.3) && (u.mode === 'MJ+BR' || u.mode === f.mode || r() < 0.3));
    const parts = pool.filter(() => r() < 0.8).slice(0, f.max);
    T.registrations = parts.map((u, i) => ({ id: `${T.id}r${i}`, userId: u.id, teamName: '', mateId: null, status: 'ok', at: at(f.days + 3, 12) }));
    const order = [...T.registrations].sort((a, b) => users.find((u) => u.id === b.userId).assid + r() * 0.5 - (users.find((u) => u.id === a.userId).assid + r() * 0.5));
    const podium = order.slice(0, 3).map((x) => x.id);
    T.matches = [
      { id: `${T.id}m1`, a: order[0].id, b: order[2].id, sa: 6, sb: 3, round: 'Demi-finale' },
      { id: `${T.id}m2`, a: order[1].id, b: order[3]?.id || order[2].id, sa: 6, sb: 4, round: 'Demi-finale' },
      { id: `${T.id}m3`, a: order[0].id, b: order[1].id, sa: 6, sb: 5, round: 'Finale' },
    ];
    T.results = { podium, ranking: order.map((x) => x.id), validatedAt: at(f.days, 21), validatedBy: T.managerId };
    for (const reg of T.registrations) tx(users.find((u) => u.id === reg.userId), 't_part', at(f.days, 21), { mode: f.mode, tournamentId: T.id, adminId: T.managerId });
    ['t_1', 't_2', 't_3'].forEach((rid, i) => tx(users.find((u) => u.id === T.registrations.find((x) => x.id === podium[i]).userId), rid, at(f.days, 21, 5), { mode: f.mode, tournamentId: T.id, adminId: T.managerId }));
    tournaments.push(T);
  }
  const future = (days, h) => { const d = new Date(today.getTime() + days * DAY); d.setHours(h, 0, 0, 0); return d.toISOString(); };
  tournaments.push(mk({ id: 't5', name: 'Duel des Snipers II', type: 'sniper', mode: 'MJ', description: 'Un contre un, uniquement fusils de précision. Carte Crash et Standoff en alternance.', date: future(4, 21), deadline: future(3, 23), max: 12, status: 'open', managerId: 'u4', rewards: '400 CP au vainqueur, carte de visite AaKATSUKI pour le podium', points: { participation: 20, first: 50, second: 30, third: 15 },
    registrations: ['u4', 'u7', 'u9', 'u14'].map((id, i) => ({ id: `t5r${i}`, userId: id, teamName: '', mateId: null, status: i < 3 ? 'ok' : 'pending', at: at(1, 12 + i) })) }));
  tournaments.push(mk({ id: 't6', name: 'Coupe 2v2 AaKATSUKI', type: '2v2', mode: 'MJ', description: 'Équipes de deux. Format recherche et destruction, meilleur des trois manches.', date: future(10, 18), deadline: future(8, 23), max: 8, status: 'open', allowJoin: true, managerId: 'u3', format: 'Poules puis élimination directe', rewards: 'Passe de combat pour chaque membre de l’équipe gagnante',
    registrations: [{ id: 't6r0', userId: 'u2', teamName: 'Lames Noires', mateId: 'u3', status: 'ok', at: at(1, 10) }, { id: 't6r1', userId: 'u12', teamName: 'Tempête', mateId: null, status: 'ok', at: at(0, 9) }] }));
  tournaments.push(mk({ id: 't7', name: 'Royale du samedi', type: 'br', mode: 'BR', description: 'Battle Royale en escouade de quatre, classement au cumul de trois parties.', date: future(0, 18), deadline: future(-1, 23), max: 16, status: 'live', managerId: 'u4',
    registrations: ['u1', 'u4', 'u7', 'u8', 'u11', 'u14', 'u5', 'u13'].map((id, i) => ({ id: `t7r${i}`, userId: id, teamName: '', mateId: null, status: 'ok', at: at(3, 12) })) }));
  tournaments.push(mk({ id: 't8', name: 'Défi spécial fin de saison', type: 'special', mode: 'MJ', description: 'Format surprise annoncé la veille.', date: future(18, 20), deadline: future(16, 23), max: 20, status: 'draft' }));


  const rewards = [
    { id: 'rw1', name: 'Petite récompense spéciale', description: 'Mention dans le bilan du dimanche et rôle spécial sur Discord pendant un mois.', category: 'special', cost: 100, stock: 10, from: null, to: null, active: true, img: null },
    { id: 'rw2', name: 'Carte de visite AaKATSUKI', description: 'Une carte de visite aux couleurs du clan, offerte par les responsables.', category: 'gift', cost: 150, stock: 8, from: null, to: null, active: true, img: null },
    { id: 'rw3', name: 'Cadeau CODM', description: 'Un objet de la boutique en jeu choisi avec le responsable des récompenses.', category: 'gift', cost: 250, stock: 5, from: null, to: null, active: true, img: null },
    { id: 'rw4', name: '400 CP', description: 'Récompense intermédiaire : 400 Call of Duty Points envoyés sur ton compte.', category: 'cp', cost: 400, stock: 3, from: null, to: null, active: true, img: null },
    { id: 'rw5', name: 'Skin d’arme épique', description: 'Un skin épique au choix parmi la sélection du mois.', category: 'rare', cost: 600, stock: 0, from: null, to: null, active: true, img: null },
    { id: 'rw6', name: 'Passe de combat', description: 'Le Battle Pass premium de la saison en cours.', category: 'bp', cost: 800, stock: 2, from: null, to: null, active: true, img: null },
    { id: 'rw7', name: 'Récompense exceptionnelle', description: 'Skin légendaire ou pack au choix, remis en direct lors du bilan de saison.', category: 'rare', cost: 1200, stock: 1, from: null, to: null, active: true, img: null },
  ];
  const requests = [
    { id: 'rq1', userId: 'u7', rewardId: 'rw2', cost: 150, status: 'pending', reason: '', at: at(0, 11), history: [{ status: 'pending', at: at(0, 11), by: 'u7' }] },
    { id: 'rq2', userId: 'u2', rewardId: 'rw4', cost: 400, status: 'accepted', reason: '', at: at(4, 10), history: [{ status: 'pending', at: at(4, 10), by: 'u2' }, { status: 'accepted', at: at(3, 9), by: 'u5' }] },
    { id: 'rq3', userId: 'u1', rewardId: 'rw3', cost: 250, status: 'delivered', reason: '', at: at(30, 10), history: [{ status: 'pending', at: at(30, 10), by: 'u1' }, { status: 'accepted', at: at(29, 9), by: 'u5' }, { status: 'delivered', at: at(28, 20), by: 'u5' }] },
  ];
  // débits des demandes acceptées
  for (const q of requests.filter((x) => x.status !== 'pending')) {
    const accAt = q.history.find((h) => h.status === 'accepted').at;
    events.push({ id: `tx${events.length + 1}`, userId: q.userId, points: -q.cost, ruleId: null, label: `Récompense : ${rewards.find((w) => w.id === q.rewardId).name}`, reason: 'Débit à l’acceptation de la demande', mode: null, activityId: null, tournamentId: null, ref: q.id, kind: 'reward', participation: false, adminId: 'u5', at: accAt, correctionOf: null, requestId: q.id });
  }
  // Soldes avant / après, dans l'ordre chronologique
  events.sort((a, b) => a.at.localeCompare(b.at));
  const bal = {};
  for (const e of events) { const b = bal[e.userId] || 0; e.balanceBefore = b; e.balanceAfter = b + e.points; bal[e.userId] = b + e.points; }

  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const twoAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const distinctions = [
    { id: 'd1', userId: 'u3', title: 'MVP du mois', period: twoAgo, at: at(45, 19), by: 'u1' },
    { id: 'd2', userId: 'u4', title: 'Meilleur sniper', period: 'Saison 3', at: at(46, 19), by: 'u1' },
    { id: 'd3', userId: 'u7', title: 'Meilleure progression', period: 'Saison 3', at: at(46, 19), by: 'u1' },
    { id: 'd4', userId: 'u2', title: 'Meilleur coéquipier', period: twoAgo, at: at(45, 19), by: 'u1' },
  ];
  const announcements = [
    { id: 'n1', title: 'Inscriptions ouvertes : Duel des Snipers II', body: 'Douze places, clôture des inscriptions dans trois jours. Le vainqueur repart avec 400 CP.', audience: 'all', pinned: true, at: at(1, 12), authorId: 'u4' },
    { id: 'n2', title: 'Nouveau barème de points', body: 'La victoire en scrim passe à 20 points. Les absences injustifiées aux activités obligatoires retirent 10 points.', audience: 'all', pinned: false, at: at(6, 18), authorId: 'u1' },
    { id: 'n3', title: 'Entraînement BR décalé', body: 'Mercredi, l’entraînement Battle Royale commence à 21 h au lieu de 20 h 30.', audience: 'BR', pinned: false, at: at(8, 10), authorId: 'u4' },
  ];
  const discipline = [
    { id: 'ds1', userId: 'u16', kind: 'suspension', reason: 'Propos irrespectueux répétés en salon vocal après avertissement.', points: 0, at: at(10, 22), adminId: 'u1' },
    { id: 'ds2', userId: 'u13', kind: 'avertissement', reason: 'Absent au scrim de jeudi sans prévenir.', points: -10, at: at(17, 21), adminId: 'u3' },
  ];
  const notifications = [
    { id: 'no1', userId: 'u7', text: 'Ton inscription au Duel des Snipers II est validée.', at: at(0, 14), read: false, link: '#/tournoi/t5' },
    { id: 'no2', userId: 'u7', text: '+10 points : Participation à un entraînement', at: at(2, 22), read: false, link: '#/profil?tab=historique' },
    { id: 'no3', userId: 'u7', text: 'La Royale du samedi commence aujourd’hui à 18 h.', at: at(0, 9), read: true, link: '#/tournoi/t7' },
    { id: 'no4', userId: 'u1', text: 'Deux nouvelles demandes d’inscription à examiner.', at: at(1, 9), read: false, link: '#/admin/membres?status=pending' },
  ];
  const seasons = [
    { id: 's3', name: 'Saison 3', start: new Date(today.getFullYear(), today.getMonth() - 4, 1).toISOString(), end: seasonStart.toISOString(),
      standings: ['u3', 'u1', 'u4', 'u2', 'u7', 'u8', 'u6', 'u12', 'u5', 'u9'].map((id, i) => ({ userId: id, points: 640 - i * 48 - Math.floor(r() * 20) })) },
  ];
  const audit = [
    { id: 'au1', at: at(80, 12), actorId: 'u1', action: 'Initialisation', target: 'Plateforme', details: 'Création de l’espace du clan 影 AaKATSUKI 影.' },
    ...tournaments.filter((t) => t.status === 'done').map((t, i) => ({ id: `au${i + 2}`, at: t.results.validatedAt, actorId: t.managerId, action: 'Résultats validés', target: t.name, details: `${t.registrations.length} participants, points attribués automatiquement.` })),
    { id: 'au9', at: at(10, 22), actorId: 'u1', action: 'Statut modifié', target: 'Ombre', details: 'Actif → Suspendu. Motif : propos irrespectueux répétés.' },
  ];

  return { version: 2, settings, users, transactions: events, activities, tournaments, rewards, requests, distinctions, announcements, notifications, discipline, seasons, audit };
}

// Clan réel : un compte par membre de la liste du jeu, mot de passe provisoire
// à changer à la première connexion. Retourne aussi la feuille d'identifiants.
export async function seedClan(roster, makePassword) {
  const demo = await seedDemo();
  const now = new Date().toISOString();
  const colors = ['#d6202a', '#8a1016', '#3a3a42', '#e9e4da', '#5a1d20', '#26262c'];
  const users = [];
  const credentials = [];
  for (const [i, m] of roster.entries()) {
    const password = makePassword();
    const salt = newSalt();
    users.push({
      id: `u${i + 1}`, login: m.login, email: '', salt, passHash: await hashPassword(password, salt), mustChangePassword: true,
      pseudo: m.pseudo, firstName: '', lastName: '', uid: '', level: m.level || 1, mode: 'MJ+BR', specialty: '', availability: '',
      color: colors[i % colors.length], avatar: null, status: 'active', roles: m.roles || ['member'], createdAt: now, joinedAt: now,
    });
    credentials.push({ pseudo: m.pseudo, login: m.login, password, roles: m.roles || ['member'] });
  }
  const state = {
    version: 2,
    settings: { ...demo.settings, season: { id: 's1', name: 'Saison 1', start: now } },
    users, transactions: [], activities: [], tournaments: [], rewards: demo.rewards.map((r) => ({ ...r, stock: r.stock || 1 })),
    requests: [], distinctions: [], announcements: [], notifications: [], discipline: [], seasons: [],
    audit: [{ id: 'au1', at: now, actorId: 'u1', action: 'Initialisation', target: 'Plateforme', details: `Création de l’espace du clan 影 AaKATSUKI 影 avec ${users.length} membres.` }],
  };
  return { state, credentials };
}
