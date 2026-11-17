// Cartes de présentation : création (membre ou responsable), affiche et animation 3D.
import * as api from '../api.js';
import { I } from '../icons.js';
import { esc, fmtDT, avatar, toast, act, head, empty } from '../ui.js';

// L'animation (et Three.js) ne se charge qu'au moment de la lancer
export async function openWelcome(u, { preview = false, onClose } = {}) {
  if (!preview) api.markWelcomeSeen(u);
  const { playWelcome } = await import('../welcome3d.js');
  return playWelcome(u, { onClose });
}

const slotHtml = (k, url) => {
  const s = api.CARD_SLOTS[k];
  return `<div class="cslot ${url ? 'has' : ''}" data-slot="${k}">
    <label class="cslot-pick">
      <input type="file" accept="image/jpeg,image/png,image/webp" data-file="${k}">
      <span class="cslot-img">${url ? `<img src="${esc(url)}" alt="">` : I.image}</span>
      <span class="cslot-txt"><b>${esc(s.label)}</b><small>${esc(s.hint)}</small></span>
    </label>
    <button type="button" class="cslot-x" data-clear="${k}" ${url ? '' : 'hidden'}>Retirer</button>
  </div>`;
};

export function editor({ params }) {
  const meU = api.me();
  const u = params.id ? api.user(params.id) : meU;
  const own = u?.id === meU.id;
  if (!u || (!own && !api.can('members.manage'))) return { html: `<div class="wrap page">${empty('Membre introuvable.')}</div>` };
  const card = { ...(u.card || {}) };
  const published = !!card.publishedAt;
  const html = `<div class="wrap page narrow">
    ${head(own ? 'Ma carte de présentation' : `Présentation · ${u.pseudo}`, own
      ? 'Comme les affiches du clan : ta photo, ton personnage favori, ton profil CODM et ton arme favorite. Le clan te découvre dans une animation 3D plein écran.'
      : `Les quatre images de ${esc(u.pseudo)}, jouées en animation 3D pour tout le clan.`)}
    <form id="cf" class="stack">
      <div class="cslots">${api.CARD_SLOTS_KEYS.map((k) => slotHtml(k, card[k])).join('')}</div>
      <p class="small muted">Photo ou personnage obligatoire, le reste est facultatif. JPEG, PNG ou WebP : l’image est réduite automatiquement.</p>
      <label class="field"><span>Nom du personnage (facultatif)</span><input name="characterName" maxlength="40" value="${esc(card.characterName || '')}" placeholder="Ex. Ghost, Mara, Rosa"></label>
      <label class="field"><span>Nom de l’arme (facultatif)</span><input name="weaponName" maxlength="40" value="${esc(card.weaponName || '')}" placeholder="Ex. DL Q33, Fennec"></label>
      <label class="field"><span>Devise (facultatif)</span><input name="motto" maxlength="90" value="${esc(card.motto || '')}" placeholder="Une phrase qui te ressemble"></label>
      ${published && api.can('members.manage') ? `<label class="check"><input type="checkbox" name="announce"><span>Annoncer de nouveau à tout le clan</span></label>` : ''}
      <p class="small muted">${published
        ? `Publiée le ${fmtDT(card.publishedAt)}. Les changements s’affichent pour tout le clan, sans nouvelle notification.`
        : 'À la publication, tout le clan reçoit une notification et découvre l’animation.'}</p>
      <div class="row end">
        <button type="button" class="btn btn-line" id="prev">${I.play} Aperçu</button>
        <button class="btn" id="save">${published ? 'Enregistrer' : 'Publier'}</button>
      </div>
    </form>
  </div>`;
  return {
    html,
    mount(root) {
      const form = root.querySelector('#cf');
      let busy = 0;
      const setBusy = (d) => { busy += d; root.querySelector('#save').disabled = busy > 0; root.querySelector('#prev').disabled = busy > 0; };
      const fields = () => {
        const f = Object.fromEntries(new FormData(form));
        return { characterName: f.characterName || '', weaponName: f.weaponName || '', motto: f.motto || '' };
      };
      const redraw = (k) => { root.querySelector(`[data-slot="${k}"]`).outerHTML = slotHtml(k, card[k]); bind(); };
      function bind() {
        root.querySelectorAll('[data-file]').forEach((inp) => (inp.onchange = act(async () => {
          const file = inp.files[0]; if (!file) return;
          const k = inp.dataset.file;
          const box = root.querySelector(`[data-slot="${k}"]`);
          box.classList.add('loading'); setBusy(1);
          try { card[k] = await api.uploadImage(file); } finally { setBusy(-1); box.classList.remove('loading'); }
          redraw(k);
        })));
        root.querySelectorAll('[data-clear]').forEach((b) => (b.onclick = () => { card[b.dataset.clear] = null; redraw(b.dataset.clear); }));
      }
      bind();
      root.querySelector('#prev').onclick = act(async () => {
        if (!card.photo && !card.character && !u.avatar) throw new Error('Ajoute au moins ta photo ou ton personnage favori.');
        await openWelcome({ ...u, card: { ...card, ...fields() } }, { preview: true });
      });
      form.onsubmit = act(async (e) => {
        e.preventDefault();
        if (busy) return;
        const slots = Object.fromEntries(api.CARD_SLOTS_KEYS.map((k) => [k, card[k] || null]));
        const announce = !!form.querySelector('[name=announce]')?.checked;
        await api.saveCard(u.id, { ...slots, ...fields(), ...(announce ? { announce: true } : {}) });
        toast(published && !announce ? 'Carte de présentation enregistrée.' : 'Présentation publiée : tout le clan est prévenu.');
        location.hash = `#/bienvenue/${u.id}`;
      });
    },
  };
}

// Affiche fixe de la présentation (sans animation, ou en attendant de la lancer)
export function poster({ params }) {
  const u = api.user(params.id);
  const meU = api.me();
  const canEdit = u && (u.id === meU.id || api.can('members.manage'));
  if (!u?.card?.publishedAt) {
    return { html: `<div class="wrap page">${empty('Cette présentation n’est pas encore publiée.')}${canEdit ? `<p class="center"><a class="btn" href="${u.id === meU.id ? '#/presentation' : `#/presentation/${u.id}`}">Créer la carte</a></p>` : ''}</div>` };
  }
  const c = u.card;
  const img = (k, cls) => { const src = k === 'photo' ? c.photo || u.avatar : c[k]; return src ? `<figure class="pst-${cls}"><img src="${esc(src)}" alt="${esc(api.CARD_SLOTS[k].label)}"></figure>` : ''; };
  const name = String(u.pseudo).replace(/影/g, '').trim();
  const html = `<div class="wrap page">
    <div class="poster">
      <p class="pst-kick"><span class="kage">影</span> Bienvenue dans AaKATSUKI <span class="kage">影</span></p>
      <div class="pst-grid">${img('photo', 'photo')}${img('character', 'char')}${img('profile', 'prof')}</div>
      <h1 class="pst-name"><span class="kage">影</span> ${esc(name)} <span class="kage">影</span></h1>
      <p class="pst-info">${[u.level ? `Niveau ${esc(u.level)}` : '', esc(u.specialty || ''), esc(api.MODES[u.mode] || '')].filter(Boolean).join(' · ')}</p>
      ${c.motto ? `<p class="pst-motto">« ${esc(c.motto)} »</p>` : ''}
      ${img('weapon', 'weap')}
    </div>
    <div class="row center pst-actions">
      <button class="btn" id="play">${I.play} Lancer l’animation</button>
      <a class="btn btn-line" href="#/joueur/${u.id}">${avatar(u, 'sm')} Voir le profil</a>
      ${canEdit ? `<a class="btn btn-ghost" href="${u.id === meU.id ? '#/presentation' : `#/presentation/${u.id}`}">${I.edit} Modifier</a>` : ''}
    </div>
  </div>`;
  return {
    html,
    mount(root) {
      let close = null;
      root.querySelector('#play').onclick = act(async () => { close = await openWelcome(u); });
      // Ouverte depuis la notification : l'animation se lance seule, une fois par session
      const tag = `${u.id}:${c.publishedAt}`;
      if (sessionStorage.getItem('akt.wel.auto') !== tag) {
        sessionStorage.setItem('akt.wel.auto', tag);
        openWelcome(u).then((f) => (close = f)).catch((e) => console.warn(e));
      }
      return () => close?.();
    },
  };
}

// Bandeau « Nouveaux visages » du tableau de bord
export function recentStrip() {
  const list = api.recentCards(30);
  if (!list.length) return '';
  return `<section class="sec faces">
    <div class="sec-head"><h2>Nouveaux visages</h2></div>
    <div class="hscroll">${list.map((u) => `<a class="face" href="#/bienvenue/${u.id}">
      <span class="face-img">${u.card.photo || u.card.character ? `<img src="${esc(u.card.photo || u.card.character)}" alt="">` : avatar(u, 'lg')}<i>${I.play}</i></span>
      <b>${esc(u.pseudo)}</b></a>`).join('')}</div>
  </section>`;
}
