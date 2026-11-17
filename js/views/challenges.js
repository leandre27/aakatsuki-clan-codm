// Défis 1v1 entre membres : défier, accepter, déclarer et confirmer le vainqueur.
import * as api from '../api.js';
import { I } from '../icons.js';
import { esc, fmtDT, ago, avatar, toast, act, sheet, ask, head, empty, toLocalInput } from '../ui.js';

const who = (id) => api.user(id) || { id, pseudo: 'Ancien membre' };
const pill = (c) => `<span class="pill ch-${c.status}">${esc(api.CH_STATUS[c.status])}</span>`;

function duel(c, actions = '') {
  const a = who(c.fromId), b = who(c.toId);
  const side = (u) => `<a class="duel-p ${c.status === 'done' ? (c.winnerId === u.id ? 'win' : 'lose') : ''}" href="#/joueur/${u.id}">${avatar(u, 'md')}<b>${esc(u.pseudo)}</b>${c.status === 'done' && c.winnerId === u.id ? '<small>Vainqueur</small>' : ''}</a>`;
  const meta = [c.at ? `${I.clock} ${fmtDT(c.at)}` : '', c.status === 'done' ? `Joué ${ago(c.doneAt)}` : `Lancé ${ago(c.createdAt)}`].filter(Boolean).join(' · ');
  return `<li class="duel" id="d-${c.id}">
    <div class="duel-top">${pill(c)}<span class="duel-meta">${meta}</span></div>
    ${c.stake ? `<p class="duel-bet">${I.coin} ${c.status === 'done' ? `${esc(who(c.winnerId).pseudo)} a remporté <b>${c.stake * 2} pts</b>` : `<b>${c.stake} pts</b> misés chacun · <b>${c.stake * 2} pts</b> au vainqueur`}</p>` : ''}
    <div class="duel-vs">${side(a)}<span class="vs">VS</span>${side(b)}</div>
    ${c.message ? `<p class="duel-msg">« ${esc(c.message)} »</p>` : ''}
    ${actions ? `<div class="duel-act">${actions}</div>` : ''}
  </li>`;
}

export function challenges({ query, rerender }) {
  const me = api.me();
  const all = [...(api.data().challenges || [])].sort((x, y) => (y.doneAt || y.createdAt).localeCompare(x.doneAt || x.createdAt));
  const mine = all.filter((c) => [c.fromId, c.toId].includes(me.id));
  const rec = api.challengeRecord(me.id);
  const active = me.status === 'active';
  const staff = api.can('tournaments.manage');
  const vs = (c) => who(c.fromId === me.id ? c.toId : c.fromId);

  // Ce qui attend une action de ma part, puis ce qui attend l'adversaire
  const todo = [], waiting = [];
  for (const c of mine.filter((x) => api.CH_OPEN.includes(x.status))) {
    if (c.status === 'pending' && c.toId === me.id) todo.push(duel(c, `<button class="btn btn-sm" data-accept="${c.id}">${I.check} Accepter${c.stake ? ` · miser ${c.stake} pts` : ''}</button><button class="btn btn-sm btn-line" data-decline="${c.id}">Refuser</button>`));
    else if (c.status === 'pending') waiting.push(duel(c, `<span class="muted small">En attente de ${esc(vs(c).pseudo)}</span><button class="btn btn-sm btn-ghost" data-cancel="${c.id}">Annuler</button>`));
    else if (c.status === 'accepted') todo.push(duel(c, `<button class="btn btn-sm" data-report="${c.id}">${I.cup} Déclarer le vainqueur</button><button class="btn btn-sm btn-ghost" data-cancel="${c.id}">Annuler</button>`));
    else if (c.status === 'reported' && c.reportedBy !== me.id) todo.push(duel(c, `<span class="small">${esc(who(c.reportedBy).pseudo)} déclare avoir gagné.</span><button class="btn btn-sm" data-confirm="${c.id}">Confirmer</button><button class="btn btn-sm btn-line" data-dispute="${c.id}">Contester</button>`));
    else if (c.status === 'reported') waiting.push(duel(c, `<span class="muted small">En attente de la confirmation de ${esc(vs(c).pseudo)}</span>`));
    else waiting.push(duel(c, '<span class="muted small">Un responsable va trancher.</span>'));
  }
  const toSettle = staff ? all.filter((c) => c.status === 'disputed' || (c.status === 'reported' && ![c.fromId, c.toId].includes(me.id))) : [];
  const clanLive = all.filter((c) => c.status === 'accepted' && ![c.fromId, c.toId].includes(me.id));
  const results = all.filter((c) => c.status === 'done').slice(0, 20);
  const settleBtns = (c) => [c.fromId, c.toId].map((id) => `<button class="btn btn-sm btn-line" data-settle="${c.id}" data-w="${id}">${esc(who(id).pseudo)} a gagné</button>`).join('');

  const html = `<div class="wrap page">
    ${head('Défis 1v1', 'Défie un membre du clan, mise des points si tu veux. Le combat accepté est annoncé à tout le clan, le vainqueur aussi.', active ? `<button class="btn btn-sm" id="new">${I.target} Défier un joueur</button>` : '')}
    <div class="ch-rec"><div><b>${rec.wins}</b><span>Victoires</span></div><div><b>${rec.losses}</b><span>Défaites</span></div><div><b>${api.spendable(me.id)}</b><span>Points à miser</span></div></div>
    ${!active ? '<p class="alert">Ton compte doit être actif pour lancer ou accepter un défi.</p>' : ''}
    ${todo.length ? `<section class="sec"><div class="sec-head"><h2>À toi de jouer</h2></div><ul class="duels">${todo.join('')}</ul></section>` : ''}
    ${toSettle.length ? `<section class="sec"><div class="sec-head"><h2>${I.shield} À trancher</h2></div><ul class="duels">${toSettle.map((c) => duel(c, settleBtns(c))).join('')}</ul></section>` : ''}
    ${waiting.length ? `<section class="sec"><div class="sec-head"><h2>Mes défis en attente</h2></div><ul class="duels">${waiting.join('')}</ul></section>` : ''}
    ${!todo.length && !waiting.length && active ? `<div class="panel ch-empty">${I.target}<div><b>Aucun défi en cours</b><small>Choisis un adversaire, propose une date si tu veux : il reçoit une notification.</small></div><button class="btn btn-sm" id="new2">Défier</button></div>` : ''}
    <section class="sec"><div class="sec-head"><h2>Combats annoncés</h2></div>
      ${clanLive.length ? `<ul class="duels">${clanLive.map((c) => duel(c, staff ? settleBtns(c) : '')).join('')}</ul>` : empty('Aucun autre combat annoncé.')}</section>
    <section class="sec"><div class="sec-head"><h2>Derniers résultats</h2></div>
      ${results.length ? `<ul class="duels">${results.map((c) => duel(c)).join('')}</ul>` : empty('Pas encore de résultat.')}</section>
  </div>`;

  return {
    html,
    mount(root) {
      const done = (m) => { toast(m); rerender(); };
      const open = () => newChallenge(rerender);
      root.querySelector('#new')?.addEventListener('click', open);
      root.querySelector('#new2')?.addEventListener('click', open);
      if (query.vs && active) { history.replaceState(null, '', '#/defis'); newChallenge(rerender, query.vs); }
      const on = (sel, fn) => root.querySelectorAll(sel).forEach((b) => (b.onclick = act(() => fn(b))));
      on('[data-accept]', async (b) => {
        const c = api.data().challenges.find((x) => x.id === b.dataset.accept);
        if (c?.stake && !(await ask('Accepter le pari', `${c.stake} points sont prélevés de ton solde maintenant, comme pour ${who(c.fromId).pseudo}. Le vainqueur remporte ${c.stake * 2} points. Si le défi est annulé, chacun est remboursé.`, { label: `Miser ${c.stake} pts` }))) return;
        await api.answerChallenge(b.dataset.accept, 'accept'); done('Défi accepté : le combat est annoncé au clan.');
      });
      on('[data-decline]', async (b) => { if (!(await ask('Refuser le défi', 'Ton adversaire sera prévenu.', { label: 'Refuser' }))) return; await api.answerChallenge(b.dataset.decline, 'decline'); done('Défi refusé.'); });
      on('[data-cancel]', async (b) => { if (!(await ask('Annuler le défi', 'Ton adversaire sera prévenu.', { label: 'Annuler le défi', danger: true }))) return; await api.cancelChallenge(b.dataset.cancel); done('Défi annulé.'); });
      on('[data-report]', (b) => reportSheet(api.data().challenges.find((c) => c.id === b.dataset.report), rerender));
      on('[data-confirm]', async (b) => { await api.confirmResult(b.dataset.confirm, 'yes'); done('Résultat confirmé : le clan est prévenu.'); });
      on('[data-dispute]', async (b) => { if (!(await ask('Contester le résultat', 'Un responsable tranchera. Tu pourras lui envoyer une capture du combat.', { label: 'Contester', danger: true }))) return; await api.confirmResult(b.dataset.dispute, 'no'); done('Résultat contesté : un responsable va trancher.'); });
      on('[data-settle]', async (b) => { await api.settleChallenge(b.dataset.settle, b.dataset.w); done('Vainqueur validé : le clan est prévenu.'); });
    },
  };
}

function reportSheet(c, rerender) {
  const me = api.me();
  const opp = who(c.fromId === me.id ? c.toId : c.fromId);
  sheet('Qui a gagné ?', `<div class="stack">
    <p class="muted">Si tu déclares ta victoire, ${esc(opp.pseudo)} devra la confirmer. Si tu reconnais sa victoire, le résultat est validé tout de suite.</p>
    <div class="row2 ch-pick">
      <button class="btn btn-lg" data-w="${me.id}">${avatar(me, 'sm')} J’ai gagné</button>
      <button class="btn btn-lg btn-line" data-w="${opp.id}">${avatar(opp, 'sm')} ${esc(opp.pseudo)} a gagné</button>
    </div></div>`, (body, close) => {
    body.querySelectorAll('[data-w]').forEach((b) => (b.onclick = act(async () => {
      await api.reportWinner(c.id, b.dataset.w);
      close();
      toast(b.dataset.w === me.id ? `Victoire déclarée : ${opp.pseudo} doit la confirmer.` : 'Résultat validé : le clan est prévenu.');
      rerender();
    })));
  });
}

export function newChallenge(rerender, preset = '') {
  const me = api.me();
  const busy = new Set((api.data().challenges || []).filter((c) => api.CH_OPEN.includes(c.status) && [c.fromId, c.toId].includes(me.id)).map((c) => (c.fromId === me.id ? c.toId : c.fromId)));
  const players = api.data().users.filter((u) => u.status === 'active' && u.id !== me.id).sort((a, b) => a.pseudo.localeCompare(b.pseudo));
  sheet('Défier un joueur', `<form class="stack" id="chf">
    <label class="field"><span>Adversaire</span><input type="search" id="chq" placeholder="Chercher un pseudo" autocomplete="off"></label>
    <div class="picker ch-players">${players.map((u) => `<label class="pick" data-name="${esc(u.pseudo.toLowerCase())}"><input type="radio" name="toId" value="${u.id}" ${u.id === preset ? 'checked' : ''} ${busy.has(u.id) ? 'disabled' : ''} required>${avatar(u, 'sm')}<span>${esc(u.pseudo)}${busy.has(u.id) ? ' <small>défi en cours</small>' : ''}</span></label>`).join('')}</div>
    <div class="field"><span>Mise (facultatif) · tu as ${api.spendable(me.id)} pts à miser</span>
      <div class="seg ch-stakes">${[0, 10, 15, 25, 50, 100].map((v) => `<label><input type="radio" name="stake" value="${v}" ${v === 0 ? 'checked' : ''} ${v > api.spendable(me.id) ? 'disabled' : ''}><span>${v ? `${v} pts` : 'Sans'}</span></label>`).join('')}</div>
      <small>Chacun mise la même somme, prélevée quand l’adversaire accepte. Le vainqueur prend tout ; défi annulé, chacun est remboursé. Les paris changent ton solde, pas ton classement.</small></div>
    <label class="field"><span>Quand (facultatif)</span><input type="datetime-local" name="at" min="${toLocalInput(new Date().toISOString())}"></label>
    <label class="field"><span>Message (facultatif)</span><input name="message" maxlength="140" placeholder="Ex. Sniper only, meilleur des 3"></label>
    <button class="btn btn-block">${I.target} Envoyer le défi</button>
  </form>`, (body, close) => {
    body.querySelector('#chq').oninput = (e) => { const q = e.target.value.trim().toLowerCase(); body.querySelectorAll('.pick').forEach((p) => (p.hidden = q && !p.dataset.name.includes(q))); };
    body.querySelector(`[value="${CSS.escape(preset)}"]`)?.scrollIntoView({ block: 'center' });
    body.querySelector('#chf').onsubmit = act(async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (!f.toId) throw new Error('Choisis ton adversaire.');
      await api.challenge({ toId: f.toId, message: f.message || '', at: f.at ? new Date(f.at).toISOString() : '', stake: Number(f.stake) || 0 });
      close();
      toast(`Défi envoyé à ${who(f.toId).pseudo}.`);
      if (location.hash.startsWith('#/defis')) { if (location.hash !== '#/defis') location.hash = '#/defis'; else rerender(); } else location.hash = '#/defis';
    });
  });
}
