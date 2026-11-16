// Jeu d'icônes dessiné pour AaKATSUKI : traits carrés, angles nets.
const s = (d) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${d}</svg>`;

export const I = {
  home: s('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  rank: s('<path d="M3 20h18"/><path d="M5 20v-7h4v7M10 20V6h4v14M15 20v-10h4v10"/>'),
  cup: s('<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 20h8"/>'),
  gift: s('<path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13"/><path d="M12 7 8 3M12 7l4-4"/>'),
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
  bell: s('<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2Z"/><path d="M10 21h4"/>'),
  shield: s('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>'),
  cal: s('<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  check: s('<path d="m5 12 5 5 9-10"/>'),
  x: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  right: s('<path d="m9 5 7 7-7 7"/>'),
  left: s('<path d="m15 5-7 7 7 7"/>'),
  out: s('<path d="M14 4h6v16h-6M10 8l-4 4 4 4M6 12h10"/>'),
  search: s('<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>'),
  book: s('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
  target: s('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  users: s('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.5 3.4-5.5 7-5.5s6.2 2 7 5.5"/><path d="M15 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .8 3.4 2.6 4 5.2"/>'),
  coin: s('<circle cx="12" cy="12" r="8"/><path d="M9 9h4.5a1.8 1.8 0 0 1 0 3.6H10.5a1.8 1.8 0 0 0 0 3.6H15M12 7v2M12 16v2"/>'),
  flag: s('<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>'),
  log: s('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>'),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  mega: s('<path d="M3 10v4h4l7 5V5L7 10H3Z"/><path d="M17 9a4 4 0 0 1 0 6"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/>'),
  undo: s('<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-3"/>'),
  menu: s('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  download: s('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
  share: s('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/>'),
  clock: s('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
};

// Nuage du clan. Même tracé pour le logo SVG et la scène 3D.
export const CLOUD_SEGMENTS = [
  [6, 66, 6, 36, 28, 36], [30, 12, 62, 10, 70, 28], [78, 4, 118, 4, 120, 28], [130, 12, 160, 18, 154, 40],
  [176, 42, 174, 68, 154, 66], [142, 84, 114, 84, 106, 70], [94, 86, 66, 86, 58, 70], [50, 80, 34, 78, 26, 66],
];
export const CLOUD_START = [26, 66];
export const CLOUD_PATH =
  `M${CLOUD_START.join(' ')}` + CLOUD_SEGMENTS.map((g) => `C${g[0]} ${g[1]} ${g[2]} ${g[3]} ${g[4]} ${g[5]}`).join('') + 'Z';

export const cloud = (cls = '', stroke = 6) =>
  `<svg class="${cls}" viewBox="-4 -2 188 96" aria-hidden="true"><path d="${CLOUD_PATH}" fill="#d6202a" stroke="#f2efe9" stroke-width="${stroke}" stroke-linejoin="round"/></svg>`;

// Identité du clan : 影 est le sigle, AaKATSUKI s'écrit toujours avec cette casse.
export const CLAN = 'AaKATSUKI';
export const SIGIL = '影';
export const clanName = (cls = '') => `<span class="clan-name ${cls}"><span class="kage" aria-hidden="true">影</span><span class="cn">AaKATSUKI</span><span class="kage" aria-hidden="true">影</span></span>`;
export const logo = (cls = '', big = false) => `<img class="logo ${cls}" src="assets/${big ? 'logo-solid.webp' : 'logo-256.webp'}" alt="Blason 影 AaKATSUKI" decoding="async">`;
