'use strict';
/* ============================================================
   cadres-extra.js — 4 rangs secrets de plus (niveau 999) : ABYSSAL · TEMPÊTE · KITSUNE · CYBER
   S'appuie sur les outils de cadres.js (FR_PAL, _rnd, pol, f1, STAR4, RM, embers…). À charger APRÈS cadres.js.
   Tout est en SMIL (animateTransform / animateMotion / animate) : centré, sans dépendre du CSS du navigateur.
   ============================================================ */
FR_PAL.push(
  { ring: ['#1a0409', '#e8c27a', '#7a0f24', '#fff0c8', '#12030a'], hi: '#fff0c8', dk: '#0a0205', gl: 'rgba(224,49,79,.9)', b: ['#fff0c8', '#b3122f'] }
);

/* ---------- petits outils SMIL ---------- */
const xan = (type, values, dur, dl, extra) => RM ? '' : `<animateTransform attributeName="transform" type="${type}" values="${values}" dur="${dur}s" begin="${dl || 0}s" repeatCount="indefinite"${extra || ''}/>`;
const xanim = (attr, values, dur, dl, extra) => RM ? '' : `<animate attributeName="${attr}" values="${values}" dur="${dur}s" begin="${dl || 0}s" repeatCount="indefinite"${extra || ''}/>`;
const SPL = ' calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"';
// objet qui tourne autour de l'avatar sur une ellipse inclinée : 1ʳᵉ moitié du trajet devant, 2ᵉ derrière
function xorb(front, o) {
  const { tilt = 0, a, b, per, dl = 0, html, sc = 1, auto = false } = o, full = `M${a} 0A${a} ${b} 0 1 1 ${-a} 0A${a} ${b} 0 1 1 ${a} 0`;
  const mo = RM ? '' : `<animateMotion path="${full}" dur="${per}s" begin="${dl}s" repeatCount="indefinite"${auto ? ' rotate="auto"' : ''}/>`;
  const op = RM ? '' : `<animate attributeName="opacity" values="${front ? '1;0' : '0;1'}" keyTimes="0;.5" calcMode="discrete" dur="${per}s" begin="${dl}s" repeatCount="indefinite"/>`;
  if (RM && !front) return '';
  return `<g transform="rotate(${tilt})"${front ? '' : ' opacity=".6"'}><g>${mo}<g>${op}<g transform="scale(${front ? sc : f1(sc * .82)})">${html}</g></g></g></g>`;
}
const jag = (R, a0, r0, r1, n, jit) => { let p = []; for (let i = 0; i <= n; i++) { const t = i / n, r = r0 + (r1 - r0) * t, [x, y] = pol(a0 + (i % 2 ? 1 : -1) * R() * jit * (i ? 1 : 0) / 3, r); p.push([f1(+x + (i && i < n ? (R() - .5) * jit * 1.4 : 0)), f1(+y + (i && i < n ? (R() - .5) * jit * 1.4 : 0))]); } return p; };
const pts2d = p => 'M' + p.map(q => q.join(' ')).join('L');

const XTRA = {}, XTRA_RING = {};
let XTRA_DEFS = `
<radialGradient id="abg" cx=".5" cy=".5" r=".5"><stop offset=".12" stop-color="#14e0c8" stop-opacity=".5"/><stop offset=".55" stop-color="#0a5fb0" stop-opacity=".22"/><stop offset="1" stop-color="#021a3a" stop-opacity="0"/></radialGradient>
<linearGradient id="krk" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#021c24"/><stop offset=".5" stop-color="#07606a"/><stop offset="1" stop-color="#1ff2d6"/></linearGradient>
<linearGradient id="abr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#37d8c4" stop-opacity=".5"/><stop offset="1" stop-color="#37d8c4" stop-opacity="0"/></linearGradient>
<linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ffff0" stop-opacity=".55"/><stop offset="1" stop-color="#9ffff0" stop-opacity="0"/></linearGradient>
<radialGradient id="jb1" cx=".5" cy=".7" r=".8"><stop offset="0" stop-color="#e8fffb" stop-opacity=".95"/><stop offset=".6" stop-color="#3ff0d8" stop-opacity=".7"/><stop offset="1" stop-color="#0a7a9a" stop-opacity=".5"/></radialGradient>
<radialGradient id="jb2" cx=".5" cy=".7" r=".8"><stop offset="0" stop-color="#ffe8fb" stop-opacity=".95"/><stop offset=".6" stop-color="#ff6fe0" stop-opacity=".7"/><stop offset="1" stop-color="#7a1a9a" stop-opacity=".5"/></radialGradient>
<radialGradient id="stg" cx=".5" cy=".5" r=".5"><stop offset=".12" stop-color="#7a8cff" stop-opacity=".5"/><stop offset=".55" stop-color="#26308a" stop-opacity=".26"/><stop offset="1" stop-color="#080c2a" stop-opacity="0"/></radialGradient>
<radialGradient id="cld" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#5a3aa0"/><stop offset=".7" stop-color="#241250"/><stop offset="1" stop-color="#120830"/></radialGradient>
<radialGradient id="ksg" cx=".5" cy=".5" r=".5"><stop offset=".12" stop-color="#e0314f" stop-opacity=".5"/><stop offset=".55" stop-color="#7a0f24" stop-opacity=".25"/><stop offset="1" stop-color="#2a0510" stop-opacity="0"/></radialGradient>
<radialGradient id="sun13" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e0314f" stop-opacity=".1"/><stop offset=".7" stop-color="#9a1230" stop-opacity=".45"/><stop offset="1" stop-color="#5a0716" stop-opacity=".7"/></radialGradient>
<linearGradient id="tor13" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9203f"/><stop offset="1" stop-color="#5a0716"/></linearGradient>
<radialGradient id="moon13" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fffdf0"/><stop offset=".6" stop-color="#ffe9b0"/><stop offset="1" stop-color="#e8b86a"/></radialGradient>
<linearGradient id="ktl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff8e8"/><stop offset=".5" stop-color="#f6e2b0"/><stop offset=".85" stop-color="#e8a050"/><stop offset="1" stop-color="#e0314f"/></linearGradient>
<radialGradient id="fire13" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#a8e2ff"/><stop offset="1" stop-color="#5a7bff" stop-opacity="0"/></radialGradient>
<radialGradient id="cyg" cx=".5" cy=".5" r=".5"><stop offset=".1" stop-color="#27f5ff" stop-opacity=".4"/><stop offset=".6" stop-color="#7a2bff" stop-opacity=".16"/><stop offset="1" stop-color="#050a1a" stop-opacity="0"/></radialGradient>
<radialGradient id="mfade" cx=".5" cy=".5" r=".5"><stop offset=".25" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
<mask id="m14"><circle r="156" fill="url(#mfade)"/></mask>
<linearGradient id="swp14" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#27f5ff" stop-opacity="0"/><stop offset="1" stop-color="#27f5ff" stop-opacity=".6"/></linearGradient>
<linearGradient id="trl14" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2bd6" stop-opacity="0"/><stop offset="1" stop-color="#ff2bd6" stop-opacity=".9"/></linearGradient>
<pattern id="scn14" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height=".9" fill="#aefcff" opacity=".16"/></pattern>
<clipPath id="cl14"><circle r="49"/></clipPath>${[72, 101].map(r => `<path id="tp14_${r}" d="M${-r} 0A${r} ${r} 0 1 1 ${r} 0A${r} ${r} 0 1 1 ${-r} 0"/>`).join('')}`;

/* ---------- outils v2 : tentacule effilée (pile de traits à longueurs décroissantes) ---------- */
const TAPER = [[3, 100], [5.4, 80], [7.8, 60], [10.2, 42], [12.6, 26]];
const taper = (d, col, extra) => TAPER.map(([w, p]) => `<path d="${d}" pathLength="100" fill="none" stroke="${col}" stroke-width="${f1(w + (extra || 0))}" stroke-linecap="round" stroke-dasharray="${p} 200"/>`).join('');
const bolt = (R, a0, r0, r1, n, jit, forks) => { // éclair ramifié : [tracé principal + fourches] ; même structure à chaque appel
  const P = []; for (let i = 0; i <= n; i++) { const t = i / n, [x, y] = pol(a0, r0 + (r1 - r0) * t), o = (i && i < n) ? (R() - .5) * jit : 0, [nx, ny] = pol(a0 + 90, 1); P.push([f1(+x + nx * o), f1(+y + ny * o)]); }
  let d = pts2d(P); forks.forEach((k, j) => { const [x, y] = P[k], s = j % 2 ? 1 : -1, [x1, y1] = pol(a0 + s * (28 + R() * 14), 12 + R() * 8), [x2, y2] = pol(a0 + s * (12 + R() * 16), 30 + R() * 12); d += `M${x} ${y}L${f1(+x + +x1)} ${f1(+y + +y1)}L${f1(+x + +x2)} ${f1(+y + +y2)}`; });
  return d;
};

/* ---------- v3 : boule de VIDE (noire, liseré lumineux, halo), katana ---------- */
XTRA_DEFS += `
<radialGradient id="vbl" cx=".36" cy=".3" r=".9"><stop offset="0" stop-color="#1c1428"/><stop offset=".32" stop-color="#05030a"/><stop offset="1" stop-color="#000"/></radialGradient>
<linearGradient id="tooth" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#06222a"/><stop offset=".55" stop-color="#bfe0da"/><stop offset="1" stop-color="#fff"/></linearGradient>
<linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a8aa0"/><stop offset=".5" stop-color="#1a212e"/><stop offset="1" stop-color="#4e5a70"/></linearGradient>
<linearGradient id="blade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#c8ceda"/><stop offset="1" stop-color="#626a7c"/></linearGradient>
${[['11', '#37d8c4'], ['12', '#8fb4ff'], ['13', '#e0314f'], ['14', '#ff2a3d']].map(([k, c]) => `<radialGradient id="vgl${k}"><stop offset=".3" stop-color="${c}" stop-opacity=".5"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('')}
<path id="tp12" d="M-106 0A106 106 0 1 1 106 0A106 106 0 1 1 -106 0"/><path id="tp14b" d="M-76 0A76 76 0 1 1 76 0A76 76 0 1 1 -76 0"/><path id="tp14c" d="M-116 0A116 116 0 1 1 116 0A116 116 0 1 1 -116 0"/>`;
const voidOrb = (r, k, col, sp) => `<g><circle r="${f1(r * 2.7)}" fill="url(#vgl${k})"/><circle r="${r}" fill="url(#vbl)" stroke="${col}" stroke-opacity=".9" stroke-width="${f1(Math.max(.7, r * .07))}"/><g>${xan('rotate', '0;360', sp || 9)}<circle r="${f1(r * .62)}" fill="none" stroke="${col}" stroke-opacity=".5" stroke-width=".8" stroke-dasharray="${f1(r * .5)} ${f1(r * .9)}"/></g><path d="M${f1(-r * .72)} ${f1(-r * .2)}A${f1(r * .75)} ${f1(r * .75)} 0 0 1 ${f1(-r * .1)} ${f1(-r * .74)}" fill="none" stroke="${col}" stroke-opacity=".8" stroke-width="1" stroke-linecap="round"/></g>`;
const orbAt = (x, y, r, k, col, i) => `<g transform="translate(${x} ${y})"><g>${xan('translate', `0 0;0 -7;0 0`, f1(4 + i * .6), f1(-i * 1.1), SPL)}${voidOrb(r, k, col, 8 + i)}</g></g>`;
const katana = len => { const h = len * .24, x0 = -len / 2, xg = x0 + h, e = len / 2; let wr = ''; for (let i = 0; i < 7; i++) { const x = f1(x0 + 3 + i * (h - 6) / 6); wr += `<path d="M${x} -2.5L${f1(+x + 2.2)} 0L${x} 2.5L${f1(x - 2.2)} 0Z" fill="none" stroke="#e0314f" stroke-width=".7"/>`; }
  return `<g><rect x="${x0}" y="-2.7" width="${f1(h)}" height="5.4" rx="1.6" fill="#12030a" stroke="#e8c27a" stroke-opacity=".6" stroke-width=".5"/>${wr}<circle cx="${x0}" cy="0" r="3.3" fill="#e8c27a" stroke="#12030a" stroke-width=".5"/><ellipse cx="${f1(xg)}" cy="0" rx="2.4" ry="6.4" fill="#e8c27a" stroke="#12030a" stroke-width=".6"/><path d="M${f1(xg + 2)} -2.1C${f1(xg + len * .25)} -3.2 ${f1(xg + len * .55)} -3.8 ${f1(e - 6)} -7.5L${f1(e)} -9L${f1(e - 8)} -.8C${f1(xg + len * .5)} 1.6 ${f1(xg + len * .25)} 2.2 ${f1(xg + 2)} 2.1Z" fill="url(#blade)" stroke="#fff" stroke-opacity=".6" stroke-width=".4"/><path d="M${f1(xg + 6)} 1C${f1(xg + len * .3)} -.6 ${f1(xg + len * .5)} -1.4 ${f1(e - 12)} -3.8" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width=".6" stroke-dasharray="4 2 2 2"/></g>`; };

/* ================================================================
   11 — KITSUNE (v4) : onmyōji — sceau d'invocation, torii, neuf queues en flammes d'ivoire, feux follets
   ================================================================ */
const glyph = (R) => { let d = ''; const n = 3 + Math.floor(R() * 3); for (let i = 0; i < n; i++) { const x0 = f1((R() - .5) * 7), y0 = f1((R() - .5) * 9), horiz = R() < .5; d += `M${x0} ${y0}l${horiz ? f1(2 + R() * 5) : f1((R() - .5) * 3)} ${horiz ? f1((R() - .5) * 2) : f1(2 + R() * 5)}`; } return d; };
XTRA[11] = function () {
  const R = _rnd(1313); let b = `<circle r="172" fill="url(#ksg)" class="pulse" opacity=".95"/>`;
  // soleil rouge derrière tout
  b += `<circle cy="-4" r="96" fill="url(#sun13)" opacity=".9">${xanim('r', '92;100;92', 5)}${xanim('opacity', '.75;1;.75', 5)}</circle><circle cy="-4" r="96" fill="none" stroke="#e8c27a" stroke-opacity=".5" stroke-width=".7"/>`;
  // neuf queues : plumes de flamme recourbées, ivoire → or → braise
  let tails = '';
  [0, 8, 1, 7, 2, 6, 3, 5, 4].forEach(i => {
    const ang = -100 + i * 25, L = .72 + .34 * Math.cos((i - 4) / 4 * Math.PI / 2), sg = i < 4 ? 1 : i > 4 ? -1 : 1;
    tails += `<g transform="rotate(${ang})"><g>${xan('rotate', '-3.5 0 0;4.5 0 0;-3.5 0 0', f1(4.6 + i * .33), f1(-i * .6), SPL)}<g transform="scale(${sg * L} ${L})"><path d="M-8 -52C-28 -80 -38 -112 -16 -142C-8 -154 -14 -168 -34 -178C2 -174 24 -150 20 -120C17 -94 11 -72 8 -52Z" fill="url(#ktl)" fill-opacity=".94" stroke="#e0314f" stroke-opacity=".8" stroke-width=".7"/><path d="M-3 -58C-18 -88 -22 -118 -8 -146M3 -60C0 -90 4 -116 2 -150" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width=".8"/><path d="M-6 -66C-22 -94 -26 -122 -16 -148M7 -66C10 -92 14 -112 14 -136" fill="none" stroke="#fff3d6" stroke-opacity=".45" stroke-width=".6"/><path d="M-18 -140C-24 -150 -26 -160 -30 -170" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".6"/></g></g></g>`;
  });
  b += tails;
  // sceau d'invocation : anneaux, hexagramme, glyphes
  let gl = ''; for (let i = 0; i < 28; i++) { const [x, y] = pol(i * 360 / 28, 112); gl += `<path transform="translate(${x} ${y}) rotate(${f1(i * 360 / 28 + 90)})" d="${glyph(R)}" fill="none" stroke="#e8c27a" stroke-width=".9" stroke-linecap="round" opacity=".85"/>`; }
  let hex = ''; for (let k = 0; k < 2; k++) { const P = [0, 1, 2].map(i => pol(k * 60 + i * 120 - 90, 96)); hex += `<path d="M${P.map(p => p.join(' ')).join('L')}Z" fill="none" stroke="#e8c27a" stroke-opacity=".55" stroke-width=".7"/>`; }
  b += `<g><circle r="104" fill="none" stroke="#e8c27a" stroke-opacity=".8" stroke-width=".9"/><circle r="120" fill="none" stroke="#e8c27a" stroke-opacity=".8" stroke-width="1.2"/><circle r="123.5" fill="none" stroke="#e8c27a" stroke-opacity=".5" stroke-width=".5" stroke-dasharray="1 3"/>${xan('rotate', '0 0 0;360 0 0', 140)}${gl}</g><g>${xan('rotate', '360 0 0;0 0 0', 200)}${hex}<circle r="76" fill="none" stroke="#e0314f" stroke-opacity=".55" stroke-width="1" stroke-dasharray="14 5"/></g>`;
  // v4 : le sceau respire, arcs de lumière, magatama, second anneau de glyphes à contre-sens
  let tom = ''; for (let i = 0; i < 3; i++) { const [x, y] = pol(i * 120 - 90, 88); tom += `<g transform="translate(${x} ${y}) rotate(${i * 120})"><path d="M0 -6A6 6 0 1 1 -2 5.600A3.200 3.200 0 0 1 0 0A3 3 0 0 0 0 -6Z" fill="#e0314f" stroke="#e8c27a" stroke-width=".6"/><circle cy="-3" r="1.200" fill="#120208"/></g>`; }
  b += `<g>${xan('rotate', '360 0 0;0 0 0', 38)}${tom}</g>`;
  let g2 = ''; for (let i = 0; i < 40; i++) { const [x, y] = pol(i * 9, 132); g2 += `<path transform="translate(${x} ${y}) rotate(${f1(i * 9 + 90)}) scale(.8)" d="${glyph(R)}" fill="none" stroke="#e8c27a" stroke-width=".9" stroke-linecap="round" opacity=".6"/>`; }
  b += `<g><circle r="128" fill="none" stroke="#e8c27a" stroke-opacity=".45" stroke-width=".5" stroke-dasharray="6 3 1 3"/>${xan('rotate', '360 0 0;0 0 0', 70)}${g2}</g>`;
  b += `<g>${xan('rotate', '0 0 0;360 0 0', 7)}<circle r="112" fill="none" stroke="#fff0c8" stroke-width="2" stroke-opacity=".85" stroke-dasharray="46 658" stroke-linecap="round"/></g><g>${xan('rotate', '360 0 0;0 0 0', 11)}<circle r="120" fill="none" stroke="#e0314f" stroke-width="2.4" stroke-opacity=".9" stroke-dasharray="30 724" stroke-linecap="round"/></g><circle r="104" fill="none" stroke="#fff0c8" stroke-width="1" opacity=".0">${xanim('opacity', '0;.7;0', 4.5)}${xanim('r', '104;118;104', 4.5)}</circle>`;
  // deux katanas croisés derrière l'avatar + couronne de huit lames qui flottent
  b += `<g transform="translate(0 8)"><g transform="rotate(-52)">${katana(236)}</g><g transform="rotate(-128)">${katana(236)}</g></g>`;
  let ks = ''; for (let i = 0; i < 8; i++) { const a = i * 45 + 22.5, [x, y] = pol(a, 148); ks += `<g transform="translate(${x} ${y}) rotate(${a})"><g>${xan('rotate', '-4;4;-4', f1(5 + i * .4), f1(-i * .7), SPL)}${katana(62)}</g></g>`; }
  b += `<g>${xan('rotate', '0 0 0;360 0 0', 260)}${ks}</g>`;
  [[-122, 62, 14, 0], [128, 66, 11, 2], [-142, -56, 9, 4], [146, -70, 13, 1], [0, 152, 8, 3]].forEach(([x, y, r, i]) => { b += orbAt(x, y, r, '13', '#e0314f', i); });
  b += xorb(false, { tilt: 14, a: 130, b: 30, per: 23, dl: -5, html: voidOrb(9, '13', '#e0314f', 7) });
  // torii
  b += `<g><path d="M-112 -70Q0 -92 112 -70L106 -58Q0 -78 -106 -58Z" fill="url(#tor13)" stroke="#e8c27a" stroke-opacity=".7" stroke-width=".7"/><path d="M-100 -52L100 -52L100 -44L-100 -44Z" fill="url(#tor13)" stroke="#e8c27a" stroke-opacity=".6" stroke-width=".6"/><rect x="-90" y="-52" width="10" height="150" fill="url(#tor13)" stroke="#e8c27a" stroke-opacity=".5" stroke-width=".6"/><rect x="80" y="-52" width="10" height="150" fill="url(#tor13)" stroke="#e8c27a" stroke-opacity=".5" stroke-width=".6"/><rect x="-6" y="-66" width="12" height="16" fill="#12030a" stroke="#e8c27a" stroke-opacity=".7" stroke-width=".6"/></g>`;
  // feux follets (kitsunebi) : flamme étirée bleu-blanc
  const fox = s => `<g transform="scale(${s})"><ellipse rx="9" ry="12" fill="url(#fire13)" opacity=".65"/><path d="M0 -12C4 -6 6 0 3 5C2 8 -2 8 -3 5C-6 0 -4 -6 0 -12Z" fill="#cfeaff">${xanim('opacity', '.7;1;.7', .9)}</path><path d="M0 -5C2 -1 2.400 2 0 4C-2.400 2 -2 -1 0 -5Z" fill="#fff"/></g>`;
  [[-132, -34], [-96, -112], [96, -108], [134, -30], [0, -128]].forEach(([x, y], i) => { b += `<g transform="translate(${x} ${y})"><g>${xan('translate', `0 0;${i % 2 ? 4 : -4} -9;0 0`, f1(3 + i * .45), f1(-i * .7), SPL)}${fox(f1(.9 + (i % 3) * .2))}</g></g>`; });
  // pétales de sakura, rares et fins
  for (let i = 0; i < 12; i++) { const x = f1((R() - .5) * 320), d = f1(10 + R() * 8), dx = f1((R() - .5) * 60); b += `<g opacity="0"><animateMotion path="M${x} -160C${f1(+x + 40)} -70 ${f1(+x - 40)} 40 ${f1(+x + dx)} 160" dur="${d}s" begin="${f1(-R() * d)}s" repeatCount="indefinite"/>${xanim('opacity', '0;.9;.9;0', d, 0, ' keyTimes="0;.1;.85;1"')}<g>${xan('rotate', `0;${i % 2 ? 360 : -360}`, f1(4 + R() * 3))}<g transform="scale(${f1(.55 + R() * .5)})"><path d="M0 0C3 -4 7 -1 5 4C3 7 1 5.500 0 3.500C-1 5.500 -3 7 -5 4C-7 -1 -3 -4 0 0Z" fill="#e0607e" stroke="#7a0f24" stroke-width=".4"/></g></g></g>`; }
  let f = `<circle class="spin" style="animation-duration:6s" r="49.6" fill="none" stroke="#fff0c8" stroke-opacity=".9" stroke-width="1.6" stroke-dasharray="34 278" stroke-linecap="round"/><circle class="spin rev" style="animation-duration:9s" r="55.6" fill="none" stroke="#e0314f" stroke-opacity=".9" stroke-width="1.2" stroke-dasharray="16 333" stroke-linecap="round"/>`;
  f += xorb(true, { tilt: 14, a: 130, b: 30, per: 23, dl: -5, html: voidOrb(9, '13', '#e0314f', 7) }) + xorb(true, { tilt: -16, a: 118, b: 26, per: 17, dl: 0, sc: .9, html: fox(1) }) + embers('#ffd36b', 10, 13) + embers('#e0314f', 6, 23);
  b += xorb(false, { tilt: -16, a: 118, b: 26, per: 17, dl: 0, sc: .9, html: fox(1) });
  return { b, f };
};
XTRA_RING[11] = big => { let s = `<circle r="58.4" fill="none" stroke="#e8c27a" stroke-opacity=".95" stroke-width="1"/><circle r="47" fill="none" stroke="#e0314f" stroke-opacity=".7" stroke-width=".7"/>`; for (let i = 0; i < 8; i++) { const [x, y] = pol(i * 45 + 22.5, 52.6); s += `<path d="M${x} ${f1(y - 3)}L${f1(+x + 2)} ${y}L${x} ${f1(+y + 3)}L${f1(x - 2)} ${y}Z" fill="${i % 2 ? '#e8c27a' : '#e0314f'}" stroke="#12030a" stroke-width=".4"/>`; } return s; };

