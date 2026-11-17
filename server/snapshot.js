// Ce que chaque visiteur a le droit de recevoir. Le navigateur ne reçoit jamais
// les hachés de mot de passe, ni les données d'autres membres hors de ses droits.
import * as core from '../js/core.js';

const MEMBER = ['active', 'suspended', 'inactive'];

export function snapshot(state, actor) {
  const memberish = !!actor && MEMBER.includes(actor.status);
  const seeMembers = core.can('members.view', actor);
  const seePoints = seeMembers || core.can('points.manage', actor);

  const pickUser = (u) => {
    const self = actor?.id === u.id;
    const o = { id: u.id, pseudo: u.pseudo, color: u.color, avatar: u.avatar, mode: u.mode, specialty: u.specialty, level: u.level, status: u.status, roles: u.roles, joinedAt: u.joinedAt };
    if (memberish || self) { o.availability = u.availability; if (u.card) o.card = u.card; }
    if (self) o.mustChangePassword = !!u.mustChangePassword;
    if (self || seeMembers) Object.assign(o, { login: u.login, email: u.email, uid: u.uid, firstName: u.firstName, lastName: u.lastName, createdAt: u.createdAt });
    return o;
  };
  const users = state.users.filter((u) => seeMembers || MEMBER.includes(u.status) || u.id === actor?.id).map(pickUser);

  const transactions = memberish
    ? state.transactions.map((t) => (seePoints || t.userId === actor.id || t.points > 0 ? t : { ...t, reason: t.label }))
    : state.transactions.map((t) => ({ id: t.id, userId: t.userId, points: t.points, at: t.at, kind: t.kind, mode: t.mode, participation: t.participation, ruleId: t.ruleId, correctionOf: t.correctionOf, label: t.label, balanceBefore: 0, balanceAfter: 0 }));

  const anonRegs = (n) => Array.from({ length: n }, () => '');
  const activities = memberish ? state.activities : state.activities.map((a) => ({ ...a, registrations: anonRegs(a.registrations.length) }));

  const tournaments = state.tournaments
    .filter((t) => t.status !== 'draft' || core.canManageT(t, actor))
    .map((t) => (memberish ? t : { ...t, registrations: t.registrations.map((r) => ({ id: r.id, status: r.status, userId: '', mateId: null })), matches: [], results: t.results ? { ...t.results, podium: [], ranking: [] } : null }));

  const announcements = actor ? core.visibleAnnouncements(actor) : core.publicAnnouncements();

  return {
    version: state.version,
    settings: state.settings,
    users,
    transactions,
    activities,
    tournaments,
    rewards: state.rewards,
    requests: memberish ? state.requests.filter((q) => q.userId === actor.id || core.can('rewards.manage', actor)) : [],
    distinctions: state.distinctions,
    announcements,
    notifications: actor ? state.notifications.filter((n) => n.userId === actor.id) : [],
    discipline: actor ? state.discipline.filter((d) => d.userId === actor.id || core.can('discipline.manage', actor)) : [],
    seasons: state.seasons,
    audit: core.can('audit.view', actor) ? state.audit : [],
  };
}
