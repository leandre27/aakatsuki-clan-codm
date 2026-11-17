import * as api from '../api.js';
import { I, cloud, logo, clanName } from '../icons.js';
import { installCard, bindInstall, syncPush } from '../pwa.js';
import { esc, nf, fmtDT, fmtTime, ago, avatar, toast, act, sheet, formObj, head, empty, podium, rankList, tCard, rewardTile, weekly, tilt, gradeTag, rStatusPill } from '../ui.js';

function mount3D(root, sel, opts) {
  let dispose = null, dead = false;
  const c = root.querySelector(sel);
  if (!c) return () => {};
  import('../scene3d.js').then((m) => { if (!dead) dispose = m.mountHero(c, opts); c.closest('.has3d')?.classList.add('ready'); })
    .catch((e) => { console.warn('3D indisponible', e); c.closest('.has3d')?.classList.add('no3d'); });
  return () => { dead = true; dispose?.(); };
}

// ---------- Accueil ----------
export function home() {
  const db = api.data();
  const u = api.me();
  const top = api.ranking('season');
  const next = api.tournamentsList().filter((t) => ['open', 'live', 'closed'].includes(t.status)).slice(0, 3);
  const activeCount = db.users.filter((x) => x.status === 'active').length;
  const nextT = next[0];
  const steps = [
    ['Crée ton compte', 'Pseudo CODM, UID, niveau, mode et spécialité. Deux minutes.'],
    ['Validation', 'Un responsable du recrutement examine ta demande et t’accueille.'],
    ['Joue avec le clan', 'Entraînements, scrims et tournois chaque semaine. Chaque présence rapporte des points.'],
    ['Échange tes points', 'Passe de combat, CP, cadeaux en jeu et distinctions au bilan du dimanche.'],
  ];
  const html = `
  <section class="hero has3d">
    <canvas id="hero3d" aria-label="Blason 影 AaKATSUKI en 3D"></canvas>
    <div class="hero-fallback">${logo('hero-logo', true)}</div>
    <div class="hero-copy wrap">
      <h1 class="hero-title">${clanName()}</h1>
      <p class="hero-sub">Clan Call of Duty Mobile. Chaque entraînement, scrim et victoire devient des points, un grade et des récompenses.</p>
      <div class="row">
        ${u ? `<a class="btn btn-lg" href="#/base">Ouvrir ma base</a>` : `<a class="btn btn-lg" href="#/rejoindre">Rejoindre le clan</a>`}
        <a class="btn btn-lg btn-line" href="#/classement">Classement</a>
      </div>
      <dl class="hero-stats">
        <div><dt>Membres actifs</dt><dd>${activeCount}</dd></div>
        <div><dt>Saison</dt><dd>${esc(db.settings.season.name.replace('Saison ', 'S'))}</dd></div>
        <div><dt>Prochain tournoi</dt><dd>${nextT ? esc(new Date(nextT.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })) : 'À venir'}</dd></div>
      </dl>
    </div>
    <p class="drag-hint">Fais glisser pour tourner le blason</p>
  </section>

  <div class="wrap">${installCard()}</div>
  <section class="wrap sec">
    <div class="sec-head"><h2>Top de la saison</h2><a class="link" href="#/classement">Tout le classement ${I.right}</a></div>
    ${top.length ? podium(top, 'pts', !!u) + rankList(top, { from: 3, limit: 6, linked: !!u, meId: u?.id }) : empty('Le classement se remplit au premier entraînement.')}
  </section>

  <section class="band">
    <div class="wrap sec">
      <div class="sec-head"><h2>Comment ça marche</h2></div>
      <ol class="steps">${steps.map(([t, d], i) => `<li><span class="num">0${i + 1}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}</ol>
    </div>
  </section>

  <section class="wrap sec split">
    <div>
      <div class="sec-head"><h2>Semaine type</h2><a class="link" href="#/calendrier">Calendrier ${I.right}</a></div>
      ${weekly(db.settings.weekly)}
    </div>
    <div>
      <div class="sec-head"><h2>Compétitions</h2><a class="link" href="#/${u ? 'tournois' : 'calendrier'}">Toutes ${I.right}</a></div>
      <div class="stack-sm">${next.length ? next.map(tCard).join('') : empty('Aucun tournoi programmé.')}</div>
    </div>
  </section>

  <section class="wrap sec">
    <div class="sec-head"><h2>Ce que tu peux gagner</h2><a class="link" href="#/recompenses">Catalogue ${I.right}</a></div>
    <div class="hscroll">${api.rewardsList().filter((r) => r.active).map((r) => rewardTile(r, { action: false })).join('')}</div>
  </section>

  ${u ? '' : `<section class="cta">
    <div class="wrap cta-in">
      ${cloud('cta-cloud', 5)}
      <div><h2>Prêt à porter le nuage rouge ?</h2><p>Inscription gratuite. Validation par un responsable sous 48 heures.</p></div>
      <a class="btn btn-lg btn-ink" href="#/rejoindre">Envoyer ma candidature</a>
    </div>
  </section>`}
  ${footer()}`;
  return {
    html,
    mount(root) {
      const a = mount3D(root, '#hero3d');
      const b = tilt(root);
      bindInstall(root, () => toast('Tu pourras installer l’appli plus tard avec le bouton Installer en haut de l’écran.'));
      return () => { a(); b(); };
    },
  };
}

export function footer() {
  return `<footer class="foot wrap">
    <div class="foot-brand">${logo('foot-logo')}<b class="nocase">影 AaKATSUKI 影</b><span>Clan Call of Duty Mobile</span></div>
    <nav><a href="#/clan">Le clan</a><a href="#/reglement">Règlement</a><a href="#/calendrier">Calendrier</a><a href="#/recompenses">Récompenses</a></nav>
    <p class="muted small">Plateforme interne du clan. Call of Duty Mobile est une marque d’Activision, sans lien avec ce site.</p>
  </footer>`;
}

// ---------- Présentation du clan ----------
export function clan() {
  const db = api.data();
  const staff = db.users.filter((u) => u.status === 'active' && u.roles.some((r) => r !== 'member'));
  const html = `<div class="wrap page">
    <div class="clan-crest">${logo('crest', true)}<div><p class="kage-big" aria-hidden="true">影</p><p class="muted">Le kanji 影 (kage, « l’ombre ») est le sigle du clan. Il encadre notre nom : 影 AaKATSUKI 影.</p></div></div>
    ${head('Le clan', 'AaKATSUKI joue en Multijoueur et en Battle Royale. On vise la régularité avant le talent : ceux qui viennent progressent.')}
    <section class="sec">
      <div class="manifest">
        <p><b>Organisation.</b> Un calendrier fixe, des responsables par mode de jeu et un barème de points connu de tous.</p>
        <p><b>Transparence.</b> Chaque point attribué a un auteur, une date et un motif. Personne ne modifie l’historique en silence.</p>
        <p><b>Récompenses.</b> Les points s’échangent contre la passe de combat, des CP et des cadeaux. Les meilleurs reçoivent des distinctions.</p>
      </div>
    </section>
    <section class="sec">
      <div class="sec-head"><h2>Encadrement</h2></div>
      <ul class="staff">${staff.map((u) => `<li>${avatar(u, 'md')}<div><b>${esc(u.pseudo)}</b><span>${u.roles.filter((r) => r !== 'member').map((r) => esc(api.ROLES[r])).join(', ')}</span></div></li>`).join('')}</ul>
    </section>
    <section class="sec">
      <div class="sec-head"><h2>Barème des points</h2></div>
      <ul class="rules-list">${db.settings.pointRules.map((r) => `<li><span>${esc(r.label)}</span><b class="${r.points < 0 ? 'neg' : ''}">${r.points > 0 ? '+' : ''}${r.points}</b></li>`).join('')}</ul>
    </section>
    <section class="sec">
      <div class="sec-head"><h2>Grades</h2></div>
      <ol class="grades">${api.grade(0).all.map((g, i, a) => `<li><span class="grade" data-g="${i}"><i style="--n:${i + 1}"></i>${esc(g.name)}</span><span class="muted">${nf(g.min)}${a[i + 1] ? ` à ${nf(a[i + 1].min - 1)}` : ' et plus'} pts</span></li>`).join('')}</ol>
    </section>
  </div>${footer()}`;
  return { html };
}

// ---------- Classement ----------
export function leaderboard({ query, rerender }) {
  const u = api.me();
  const member = u && u.status !== 'pending';
  const tabs = member ? api.RANKINGS : api.RANKINGS.filter(([k]) => ['season', 'general', 'week', 'month'].includes(k));
  const kind = tabs.some(([k]) => k === query.k) ? query.k : 'season';
  const [, label, unit] = tabs.find(([k]) => k === kind);
  const rows = api.ranking(kind);
  const mine = u ? rows.find((r) => r.user.id === u.id) : null;
  const seasons = api.data().seasons;
  const html = `<div class="wrap page">
    ${head('Classement', `${esc(api.data().settings.season.name)} · actualisé à chaque attribution validée`)}
    <div class="chips" role="tablist">${tabs.map(([k, l]) => `<a role="tab" class="chip ${k === kind ? 'on' : ''}" href="#/classement?k=${k}" aria-selected="${k === kind}">${esc(l)}</a>`).join('')}</div>
    ${mine ? `<div class="me-rank"><span>Ta position · ${esc(label)}</span><b>${mine.rank ?? '–'}<small>/${rows.length}</small></b><span>${nf(mine.value)} ${unit}</span></div>` : ''}
    ${rows.length ? podium(rows, unit, !!member) + rankList(rows, { from: 3, unit, meId: u?.id, linked: !!member }) : empty('Personne dans ce classement pour l’instant.')}
    ${!member ? `<p class="muted center">Les classements MJ, BR, snipers et régularité sont réservés aux membres. <a class="link" href="#/connexion">Se connecter</a></p>` : ''}
    ${member && seasons.length ? `<section class="sec"><div class="sec-head"><h2>Saisons passées</h2></div>
      ${seasons.map((s) => `<details class="acc"><summary><b>${esc(s.name)}</b><span class="muted">${new Date(s.start).toLocaleDateString('fr-FR')} au ${new Date(s.end).toLocaleDateString('fr-FR')}</span>${I.right}</summary>
        <ol class="ranks">${s.standings.slice(0, 10).map((x, i) => { const p = api.user(x.userId); return `<li><div><span class="rk">${i + 1}</span>${avatar(p, 'sm')}<span class="rn"><b>${esc(p?.pseudo)}</b></span><span class="rv">${nf(x.points)}<small>pts</small></span></div></li>`; }).join('')}</ol></details>`).join('')}
    </section>` : ''}
  </div>`;
  return { html, mount: (root) => tilt(root) };
}

// ---------- Calendrier ----------
export function calendar({ rerender }) {
  const db = api.data();
  const u = api.me();
  const sessions = api.upcomingActivities(8);
  const ts = api.tournamentsList().filter((t) => t.status !== 'draft' || api.canManageT(t));
  const html = `<div class="wrap page">
    ${head('Calendrier', 'Programme hebdomadaire et compétitions du clan')}
    <section class="sec split">
      <div><div class="sec-head"><h2>Semaine type</h2></div>${weekly(db.settings.weekly)}</div>
      <div><div class="sec-head"><h2>Prochaines séances</h2></div>
        <ul class="sessions">${sessions.map((a) => {
          const rule = db.settings.pointRules.find((r) => r.id === a.ruleId);
          const inn = u && a.registrations.includes(u.id);
          return `<li><div class="s-when"><b>${new Date(a.date).toLocaleDateString('fr-FR', { weekday: 'short' })}</b><span>${fmtTime(a.date)}</span></div>
            <div class="s-main"><b>${esc(a.title)}</b><small>${a.registrations.length} présent${a.registrations.length > 1 ? 's' : ''} annoncé${a.registrations.length > 1 ? 's' : ''}${rule ? ` · +${rule.points} pts` : ''}</small></div>
            ${u?.status === 'active' ? `<button class="btn btn-sm ${inn ? 'btn-line' : ''}" data-act="${a.id}">${inn ? 'Inscrit' : 'Je viens'}</button>` : ''}</li>`;
        }).join('') || `<li class="muted">Aucune séance programmée.</li>`}</ul>
      </div>
    </section>
    <section class="sec"><div class="sec-head"><h2>Compétitions</h2></div>
      <div class="grid-cards">${ts.map(tCard).join('') || empty('Aucune compétition.')}</div>
    </section>
  </div>`;
  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-act]').forEach((b) => (b.onclick = act(async () => { const on = await api.toggleActivity(b.dataset.act); toast(on ? 'Présence annoncée.' : 'Présence retirée.'); rerender(); })));
    },
  };
}

// ---------- Récompenses ----------
export function rewards({ rerender }) {
  const u = api.me();
  const S = u ? api.stats()[u.id] : null;
  const reqs = u ? api.myRequests(u.id) : [];
  const html = `<div class="wrap page">
    ${head('Récompenses', u ? 'Les points sont débités quand un responsable accepte ta demande.' : 'Gagne des points avec le clan, puis échange-les contre ces récompenses.')}
    ${u && u.status === 'active' ? `<div class="wallet">
      <div><span>Solde disponible</span><b>${nf(api.spendable(u.id))}<small>pts</small></b></div>
      <div><span>Réservé</span><b>${nf(api.reserved(u.id))}</b></div>
      <div><span>Total gagné</span><b>${nf(S.permanent)}</b></div>
    </div>` : ''}
    <div class="grid-rewards">${api.rewardsList().map((r) => rewardTile(r)).join('')}</div>
    <section class="sec"><div class="sec-head"><h2>Distinctions</h2></div>
      <p class="muted">Remises chaque mois ou en fin de saison par les responsables : ${api.DISTINCTIONS.map(esc).join(', ')}.</p>
    </section>
    ${u ? `<section class="sec"><div class="sec-head"><h2>Mes demandes</h2></div>
      ${reqs.length ? `<ul class="list">${reqs.map((q) => { const r = api.reward(q.rewardId); return `<li><div><b>${esc(r?.name)}</b><small>${fmtDT(q.at)} · ${q.auto ? 'attribution' : `${nf(q.cost)} pts`}${q.reason ? ` · ${esc(q.reason)}` : ''}</small></div>${rStatusPill(q.status)}${['pending', 'hold'].includes(q.status) ? `<button class="btn btn-sm btn-line" data-cancel="${q.id}">Annuler</button>` : ''}</li>`; }).join('')}</ul>` : empty('Aucune demande pour l’instant.')}
    </section>` : ''}
  </div>`;
  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-req]').forEach((b) => (b.onclick = () => {
        const r = api.reward(b.dataset.req);
        sheet('Demander une récompense', `<div class="stack">${rewardTile(r, { action: false })}
          <p class="muted">Ton solde passera de ${nf(api.spendable(u.id))} à ${nf(api.spendable(u.id) - r.cost)} pts une fois la demande acceptée. Tant qu’elle est en attente, ces points sont réservés.</p>
          <div class="row end"><button class="btn btn-line" data-close>Annuler</button><button class="btn" id="go">Confirmer la demande</button></div></div>`,
        (body, close) => { body.querySelector('#go').onclick = act(async () => { await api.requestReward(r.id); close(); toast('Demande envoyée aux responsables.'); rerender(); }); });
      }));
      root.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = act(async () => { await api.cancelRequest(b.dataset.cancel); toast('Demande annulée.'); rerender(); })));
    },
  };
}

// ---------- Inscription ----------
export function register() {
  if (api.me()) { location.hash = '#/base'; return { html: '' }; }
  const html = `<div class="auth has3d">
    <div class="auth-art"><canvas id="mini3d" aria-hidden="true"></canvas><div class="hero-fallback">${logo('mini-logo', true)}</div></div>
    <div class="auth-box">
      <h1>Rejoindre <span class="nocase">AaKATSUKI</span></h1>
      <ol class="stepper" aria-label="Étapes"><li class="on">Compte</li><li>Profil CODM</li><li>Validation</li></ol>
      <form id="reg" novalidate>
        <fieldset data-step="0" class="stack">
          <label class="field"><span>Pseudo CODM</span><input name="pseudo" required minlength="3" maxlength="20" autocomplete="nickname"></label>
          <label class="field"><span>Identifiant de connexion</span><input name="login" required pattern="[a-z0-9][a-z0-9._\-]{2,23}" maxlength="24" autocomplete="username" autocapitalize="none" spellcheck="false"><small>Minuscules et chiffres, sans le 影 ni les symboles. C’est ce que tu taperas pour te connecter.</small></label>
          <label class="field"><span>Mot de passe</span><input name="password" type="password" required minlength="8" autocomplete="new-password"><small>8 caractères minimum, avec des lettres et au moins un chiffre.</small></label>
          <label class="field"><span>Adresse e-mail (facultatif)</span><input name="email" type="email" autocomplete="email" inputmode="email"></label>
          <div class="row2">
            <label class="field"><span>Prénom (facultatif)</span><input name="firstName" autocomplete="given-name"></label>
            <label class="field"><span>Nom (facultatif)</span><input name="lastName" autocomplete="family-name"></label>
          </div>
        </fieldset>
        <fieldset data-step="1" class="stack" hidden>
          <label class="field"><span>UID du joueur</span><input name="uid" required inputmode="numeric" pattern="[0-9 ]{6,24}"><small>Dans CODM : profil, puis l’identifiant sous ton pseudo.</small></label>
          <label class="field"><span>Niveau du compte</span><input name="level" type="number" min="1" max="500" required inputmode="numeric"></label>
          <div class="field"><span>Mode principal</span><div class="seg">${Object.entries(api.MODES).map(([k, l], i) => `<label><input type="radio" name="mode" value="${k}" ${i === 2 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
          <div class="field"><span>Spécialité</span><div class="seg wrap5">${api.SPECIALTIES.map((s, i) => `<label><input type="radio" name="specialty" value="${s}" ${i === 1 ? 'checked' : ''}><span>${s}</span></label>`).join('')}</div></div>
          <label class="field"><span>Disponibilités habituelles</span><input name="availability" placeholder="Ex. soirs en semaine après 20 h"></label>
          <div class="field"><span>Avatar (facultatif)</span><label class="upload"><input type="file" name="avatarFile" accept="image/*"><span class="upload-prev"></span><span>Choisir une image</span></label></div>
        </fieldset>
        <fieldset data-step="2" class="stack" hidden>
          <div class="recap" id="recap"></div>
          <label class="check"><input type="checkbox" name="agree" required><span>J’ai lu le <a class="link" href="#/reglement" target="_blank">règlement du clan</a> et je m’engage à le respecter.</span></label>
          <p class="muted small">Ton compte sera « En attente de validation » jusqu’à l’accord d’un responsable.</p>
        </fieldset>
        <div class="row between auth-actions">
          <button type="button" class="btn btn-line" id="prev" hidden>Retour</button>
          <button class="btn" id="next">Continuer</button>
        </div>
      </form>
      <p class="muted center">Déjà membre ? <a class="link" href="#/connexion">Se connecter</a></p>
    </div>
  </div>`;
  return {
    html,
    mount(root) {
      const off3d = mount3D(root, '#mini3d', { mini: true });
      const form = root.querySelector('#reg');
      const sets = [...form.querySelectorAll('fieldset')];
      const marks = [...root.querySelectorAll('.stepper li')];
      let step = 0, avatarData = null;
      // Propose un identifiant tiré du pseudo tant que le joueur ne l'a pas modifié
      const loginEl = form.querySelector('[name=login]');
      loginEl.oninput = () => { loginEl.dataset.touched = '1'; loginEl.value = loginEl.value.toLowerCase(); };
      form.querySelector('[name=pseudo]').addEventListener('input', (e) => { if (!loginEl.dataset.touched) loginEl.value = slugLogin(e.target.value); });
      const show = () => {
        sets.forEach((f, i) => (f.hidden = i !== step)); marks.forEach((m, i) => m.classList.toggle('on', i <= step));
        root.querySelector('#prev').hidden = step === 0;
        root.querySelector('#next').textContent = step === 2 ? 'Envoyer ma demande' : 'Continuer';
        if (step === 2) {
          const f = formObj(form);
          root.querySelector('#recap').innerHTML = `${avatarData ? `<img class="av av-lg" src="${avatarData}" alt="">` : avatar({ pseudo: f.pseudo, color: '#d6202a' }, 'lg')}<dl>
            <div><dt>Pseudo</dt><dd>${esc(f.pseudo)}</dd></div><div><dt>UID</dt><dd>${esc(f.uid)}</dd></div>
            <div><dt>Niveau</dt><dd>${esc(f.level)}</dd></div><div><dt>Mode</dt><dd>${esc(api.MODES[f.mode])}</dd></div>
            <div><dt>Spécialité</dt><dd>${esc(f.specialty)}</dd></div><div><dt>Identifiant</dt><dd class="mono">${esc(f.login)}</dd></div></dl>`;
        }
        form.querySelector(`[data-step="${step}"] input`)?.focus({ preventScroll: true });
      };
      const valid = () => {
        for (const el of sets[step].querySelectorAll('input[required]')) {
          if (!el.checkValidity()) { el.reportValidity(); return false; }
        }
        return true;
      };
      form.querySelector('[name=avatarFile]').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        avatarData = await resizeImage(f, 160);
        root.querySelector('.upload-prev').innerHTML = `<img src="${avatarData}" alt="">`;
      };
      root.querySelector('#prev').onclick = () => { step--; show(); };
      form.onsubmit = act(async (e) => {
        e.preventDefault();
        if (!valid()) return;
        if (step < 2) { step++; show(); return; }
        const f = formObj(form);
        await api.register({ ...f, avatar: avatarData });
        toast('Demande envoyée. Un responsable va l’examiner.');
        location.hash = '#/base';
      });
      return off3d;
    },
  };
}

export function resizeImage(file, size) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

// Identifiant simple à taper à partir d'un pseudo CODM : 影AK-Hirūzeñ → hiruzen
export function slugLogin(pseudo) {
  return String(pseudo).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/影/g, '').replace(/^\W*ak(?=[^a-z0-9]|[a-z0-9]*$)/, '').replace(/[^a-z0-9]/g, '').slice(0, 24);
}

// ---------- Connexion ----------
export function login({ query }) {
  if (api.me()) { location.hash = '#/base'; return { html: '' }; }
  const html = `<div class="auth has3d">
    <div class="auth-art"><canvas id="mini3d" aria-hidden="true"></canvas><div class="hero-fallback">${logo('mini-logo', true)}</div></div>
    <div class="auth-box">
      <h1>Connexion</h1>
      <form id="lg" class="stack">
        <label class="field"><span>Identifiant</span><input name="login" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"><small>Celui reçu de ton responsable, par exemple « minato ». Ton e-mail marche aussi.</small></label>
        <label class="field"><span>Mot de passe</span><input name="password" type="password" required autocomplete="current-password"></label>
        <button class="btn btn-lg btn-block">Se connecter</button>
      </form>
      <p class="muted center">Pas encore membre ? <a class="link" href="#/rejoindre">Rejoindre le clan</a></p>
    </div>
  </div>`;
  return {
    html,
    mount(root) {
      const off = mount3D(root, '#mini3d', { mini: true });
      const go = async (id, pw) => {
        const u = await api.login(id, pw);
        if (u.mustChangePassword) { location.hash = '#/mot-de-passe'; return; }
        syncPush(); toast(`Bon retour, ${u.pseudo}.`); location.hash = query.next ? decodeURIComponent(query.next) : '#/base';
      };
      root.querySelector('#lg').onsubmit = act(async (e) => { e.preventDefault(); const f = formObj(e.target); await go(f.login, f.password); });
      return off;
    },
  };
}
