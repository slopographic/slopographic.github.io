// Hats for the SVG Sloppo, in the body's own units (head top is near y = -27, centre x = 0).
// One unlocks per level (see store.js HAT_ORDER).
const INK = '#0b1300';
export const HAT_SVG = {
  sprout: `<path d="M0 -26 C0 -31 1 -34 0 -37" stroke="#3f8a00" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M0 -35 C-8 -40 -11 -33 -9 -31 C-6 -30 -2 -32 0 -35Z" fill="#5fe0b0"/><path d="M0 -36 C7 -42 11 -36 9 -33 C6 -32 2 -33 0 -36Z" fill="#7cf0c0"/>`,
  party: `<path d="M-9 -24 L1 -48 L10 -24Z" fill="#ff4f86"/><path d="M-6 -31 L7 -33 M-3 -38 L5 -39" stroke="#ffd23f" stroke-width="2.4"/><circle cx="1" cy="-49" r="3" fill="#ffd23f"/>`,
  beanie: `<path d="M-17 -20 C-17 -36 17 -36 17 -20Z" fill="#ff4f6e"/><rect x="-18" y="-22" width="36" height="6" rx="3" fill="#c21d2e"/><circle cx="0" cy="-36" r="4" fill="#fff"/>`,
  bow: `<g transform="translate(10 -24) rotate(15)"><path d="M0 0 L-9 -6 L-9 6Z M0 0 L9 -6 L9 6Z" fill="#ff4f86"/><circle r="2.6" fill="#c2457a"/></g>`,
  headphones: `<path d="M-23 -2 C-23 -36 23 -36 23 -2" fill="none" stroke="#20232b" stroke-width="3.2"/><rect x="-28" y="-6" width="8" height="13" rx="3" fill="#ff4f86"/><rect x="20" y="-6" width="8" height="13" rx="3" fill="#ff4f86"/>`,
  cowboy: `<ellipse cx="0" cy="-22" rx="26" ry="4.5" fill="#8a5a2b"/><path d="M-12 -22 C-13 -36 -5 -33 0 -36 C5 -33 13 -36 12 -22Z" fill="#a8703a"/><rect x="-12" y="-26" width="24" height="3" fill="#5a3410"/>`,
  chef: `<rect x="-11" y="-30" width="22" height="9" fill="#fff" stroke="#c9cdd4" stroke-width=".8"/><circle cx="-8" cy="-35" r="7" fill="#fff"/><circle cx="8" cy="-35" r="7" fill="#fff"/><circle cx="0" cy="-39" r="8" fill="#fff"/>`,
  pirate: `<path d="M-22 -20 C-16 -26 -10 -38 0 -38 C10 -38 16 -26 22 -20 C10 -24 -10 -24 -22 -20Z" fill="#1b1b22"/><circle cx="0" cy="-29" r="3" fill="#fff"/><path d="M-3 -24 L3 -27 M3 -24 L-3 -27" stroke="#fff" stroke-width="1.2"/>`,
  tophat: `<ellipse cx="0" cy="-23" rx="19" ry="3.6" fill="#1b1b22"/><rect x="-11" y="-46" width="22" height="23" rx="2" fill="#20232b"/><rect x="-11" y="-28" width="22" height="4" fill="#ff4f6e"/>`,
  viking: `<path d="M-18 -18 C-18 -36 18 -36 18 -18Z" fill="#9aa4b2"/><rect x="-19" y="-20" width="38" height="4" fill="#6b7480"/><path d="M-17 -24 C-26 -28 -28 -38 -24 -44 C-23 -36 -19 -31 -13 -29Z M17 -24 C26 -28 28 -38 24 -44 C23 -36 19 -31 13 -29Z" fill="#f1ede4"/>`,
  wizard: `<ellipse cx="0" cy="-22" rx="24" ry="4" fill="#3b2a8a"/><path d="M-14 -23 C-8 -36 2 -48 16 -58 C8 -46 6 -36 14 -23Z" fill="#5a43c4"/><circle cx="-2" cy="-32" r="1.8" fill="#ffd23f"/><circle cx="6" cy="-42" r="1.4" fill="#ffd23f"/>`,
  ninja: `<rect x="-26" y="-11" width="52" height="6" rx="2" fill="#20232b"/><path d="M24 -8 C30 -6 33 0 35 4 M24 -8 C31 -11 35 -8 38 -6" stroke="#20232b" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="0" cy="-8" r="2" fill="#c9d1d9"/>`,
  knight: `<path d="M-21 -12 C-22 -38 22 -38 21 -12Z" fill="#c4ccd6"/><rect x="-21" y="-14" width="42" height="3" fill="#7a8494"/><path d="M0 -33 C8 -46 18 -44 22 -36 C14 -39 8 -36 0 -33Z" fill="#ff4f6e"/>`,
  gradcap: `<path d="M-22 -29 L0 -37 L22 -29 L0 -21Z" fill="#1b1b22"/><rect x="-10" y="-27" width="20" height="6" fill="#1b1b22"/><path d="M0 -29 L15 -26 L15 -16" stroke="#ffd23f" stroke-width="1.4" fill="none"/>`,
  propeller: `<path d="M-14 -21 C-14 -33 14 -33 14 -21Z" fill="#5cc8ff"/><path d="M0 -31 L0 -37" stroke="#333" stroke-width="1.6"/><ellipse cx="-7" cy="-38" rx="7" ry="1.8" fill="#ff4f6e"/><ellipse cx="7" cy="-38" rx="7" ry="1.8" fill="#ffd23f"/>`,
  catears: `<path d="M-19 -16 L-17 -34 L-6 -24Z M19 -16 L17 -34 L6 -24Z" fill="#a6ee14" stroke="${INK}" stroke-width=".8"/><path d="M-16 -20 L-15.5 -29 L-10 -24Z M16 -20 L15.5 -29 L10 -24Z" fill="#ff8fb8"/>`,
  halo: `<ellipse cx="0" cy="-36" rx="15" ry="3.6" fill="none" stroke="#ffe680" stroke-width="2.6"/>`,
  crown: `<path d="M-14 -22 L-15 -36 L-7 -29 L0 -40 L7 -29 L15 -36 L14 -22Z" fill="#ffd23f" stroke="#b88700" stroke-width=".8"/><circle cx="-7" cy="-25" r="1.6" fill="#ff4f86"/><circle cx="0" cy="-25" r="1.6" fill="#5cc8ff"/><circle cx="7" cy="-25" r="1.6" fill="#5fe0b0"/>`,
};

/** The AI power-up's little brain, worn above any hat (with a blinking antenna LED). */
export const BRAIN_SVG = `<g transform="translate(0 -30)"><path d="M-12 0 C-16 -2 -16 -9 -11 -10 C-11 -15 -4 -17 0 -13 C4 -17 11 -15 11 -10 C16 -9 16 -2 12 0Z" fill="#ff9cc4" stroke="#b8336a" stroke-width=".9"/><path d="M0 -13 C-1 -9 1 -5 0 -1 M-7 -10 C-5 -7 -8 -5 -6 -3 M7 -10 C5 -7 8 -5 6 -3" stroke="#b8336a" stroke-width=".8" fill="none" stroke-linecap="round"/><path d="M2 -14 Q5 -20 3 -24" stroke="#333" stroke-width=".9" fill="none"/><circle class="m-led" cx="3" cy="-25" r="1.8" fill="#d4ff3a"/></g>`;
