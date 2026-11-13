/* ============================================================
   cadres.js — cadres de rang détaillés (SVG) : anneaux métalliques, flammes, ailes de plumes,
   couronne, aura cosmique, étoiles en orbite… + effets autour du pseudo (voir nm() dans core.js).
   Remplace l'ancienne fonction avHTML().
   ============================================================ */
const RM = (() => { try { return matchMedia('(prefers-reduced-motion:reduce)').matches || document.documentElement.classList.contains('rm'); } catch (e) { return false; } })();
const f1 = n => Math.round(n * 10) / 10;
function _rnd(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pol = (a, r) => [f1(Math.cos(a * Math.PI / 180) * r), f1(Math.sin(a * Math.PI / 180) * r)];
// ring = 5 teintes du métal (sombre, clair, moyen, sombre, clair) · hi = liseré · dk = gravure · gl = halo · b = [clair, moyen] pastille de niveau
const FR_PAL = [
  { ring: ['#5a2e0e', '#f2b98a', '#a9672b', '#6d3a14', '#f0b98a'], hi: '#ffd2a8', dk: '#3b1c07', gl: 'rgba(205,127,50,.45)', b: ['#f2b98a', '#b8702f'] },
  { ring: ['#58626d', '#ffffff', '#a3adb9', '#68727e', '#eef2f7'], hi: '#ffffff', dk: '#39414a', gl: 'rgba(200,215,235,.5)', b: ['#ffffff', '#a3adb9'] },
  { ring: ['#7a5200', '#fff0a0', '#d4a017', '#8a5d00', '#ffe06b'], hi: '#fff6c2', dk: '#5a3b00', gl: 'rgba(255,205,60,.6)', b: ['#fff0a0', '#d4a017'] },
  { ring: ['#17625e', '#ecfffe', '#5fd6cf', '#237f7a', '#c9fbf7'], hi: '#e8fffd', dk: '#0d3d3a', gl: 'rgba(80,230,220,.65)', b: ['#e8fffd', '#4fcfc7'] },
  { ring: ['#2b63c4', '#e6f6ff', '#79b8ff', '#6c5ce7', '#c9ecff'], hi: '#ffffff', dk: '#16327a', gl: 'rgba(110,190,255,.75)', b: ['#e6f6ff', '#6aa9ff'] },
  { ring: ['#150805', '#4a1808', '#24100a', '#6a240a', '#170a06'], hi: '#ff8a3c', dk: '#0a0402', gl: 'rgba(255,100,20,.8)', b: ['#ffb36b', '#e8530f'] },
  { ring: ['#240b48', '#d8c4ff', '#7a3be0', '#33106a', '#eadcff'], hi: '#f1e6ff', dk: '#14052b', gl: 'rgba(160,90,255,.8)', b: ['#e6d6ff', '#8a4de8'] },
  { ring: ['#6e4200', '#fff3b0', '#f5b301', '#9a5a00', '#ffe58a'], hi: '#fffbe0', dk: '#4a2a00', gl: 'rgba(255,200,40,.95)', b: ['#fff3b0', '#f0a800'] },
  { ring: ['#07021f', '#7a4bde', '#160850', '#a47cff', '#0a0330'], hi: '#c9a6ff', dk: '#030012', gl: 'rgba(140,80,255,.95)', b: ['#d6bcff', '#6a33d6'] }
];
const WP = {
  6: { fid: 'fw6', stops: ['#2a0a52', '#7a3be0', '#c9a8ff', '#f4ebff'], st: '#1b0638', rach: '#ffffff', bar: '#e8d8ff' },
  7: { fid: 'fw7', stops: ['#8a4b00', '#d98f00', '#ffd34d', '#fff7cf'], st: '#6b3a00', rach: '#fffbe0', bar: '#fff3b0' },
  8: { fid: 'fw8', stops: ['#05011a', '#25095e', '#6d33d6', '#d2b0ff'], st: '#cdaaff', rach: '#efe0ff', bar: '#b88cff', stars: 1 }
};
const STAR4 = 'M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z';

/* ----- plumes et ailes ----- */
function feather(L, w, p) {
  const wl = w * .55;
  const d = `M0 0C${f1(w)} ${f1(-L * .18)} ${f1(w * .92)} ${f1(-L * .78)} 0 ${f1(-L)}C${f1(-wl * .92)} ${f1(-L * .78)} ${f1(-wl)} ${f1(-L * .18)} 0 0Z`;
  let s = `<path d="${d}" fill="url(#${p.fid})" stroke="${p.st}" stroke-width=".7" stroke-linejoin="round"/>`;
  s += `<path d="M0 0C${f1(w * .45)} ${f1(-L * .2)} ${f1(w * .4)} ${f1(-L * .75)} 0 ${f1(-L * .97)}C${f1(-w * .1)} ${f1(-L * .6)} ${f1(-w * .05)} ${f1(-L * .2)} 0 0Z" fill="#fff" opacity=".13"/>`;
  for (let k = 1; k <= 4; k++) { const y = -L * (.14 + k * .17), bw = w * (1 - k * .13); s += `<path d="M0 ${f1(y)}L${f1(bw * .9)} ${f1(y - L * .11)}M0 ${f1(y)}L${f1(-bw * .5)} ${f1(y - L * .11)}" stroke="${p.bar}" stroke-width=".42" opacity=".5" fill="none"/>`; }
  s += `<path d="M0 -2L0 ${f1(-L * .96)}" stroke="${p.rach}" stroke-width=".9" stroke-linecap="round" opacity=".8"/>`;
  return s;
}
function wingMarkup(p, seed) {
  const R = _rnd(seed), rows = [
    { n: 9, a0: 22, a1: 112, L0: 98, L1: 56, w0: 15, w1: 11 },
    { n: 8, a0: 36, a1: 126, L0: 80, L1: 42, w0: 13, w1: 9 },
    { n: 13, a0: 20, a1: 132, L0: 44, L1: 22, w0: 9.5, w1: 6 }
  ];
  let s = '';
  rows.forEach((r, ri) => {
    for (let i = r.n - 1; i >= 0; i--) {
      const t = i / (r.n - 1), a = r.a0 + (r.a1 - r.a0) * t + (R() - .5) * 3, L = (r.L0 + (r.L1 - r.L0) * Math.pow(t, .9)) * (1 + (R() - .5) * .06), w = r.w0 + (r.w1 - r.w0) * t;
      let st = ''; if (p.stars && ri < 2) { st = `<circle class="tw" cx="${f1(w * .25)}" cy="${f1(-L * .52)}" r="1" fill="#fff" style="animation-delay:${f1(R() * 3)}s"/><circle class="tw" cx="${f1(-w * .1)}" cy="${f1(-L * .78)}" r=".8" fill="#e9d5ff" style="animation-delay:${f1(R() * 3)}s"/>`; }
      s += `<g transform="translate(28 2) rotate(${f1(a)})">${feather(L, w, p)}${st}</g>`;
    }
  });
  return s;
}
const wingUse = (k, rev) => {
  const an = RM ? '' : `<animateTransform attributeName="transform" type="rotate" values="3 28 2;-5 28 2;3 28 2" dur="${k === 8 ? 5.5 : 4.2}s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" keyTimes="0;.5;1"/>`;
  const g = `<g>${an}<use href="#wg${k}"/></g>`;
  return rev ? `<g transform="scale(-1 1)">${g}</g>` : g;
};

/* ----- défs partagées (une seule fois dans la page) ----- */
function _defs() {
  if (document.getElementById('cdr-defs')) return;
  let g = '';
  FR_PAL.forEach((p, k) => { g += `<linearGradient id="rg${k}" x1="0" y1="0" x2="1" y2="1">${p.ring.map((c, i) => `<stop offset="${i / 4}" stop-color="${c}"/>`).join('')}</linearGradient>`; });
  Object.values(WP).forEach(p => { g += `<linearGradient id="${p.fid}" x1="0" y1="1" x2="0" y2="0">${p.stops.map((c, i) => `<stop offset="${f1(i / (p.stops.length - 1))}" stop-color="${c}"/>`).join('')}</linearGradient>`; });
  const rad = (id, c1, c2, c3) => `<radialGradient id="${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset=".45" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></radialGradient>`;
  g += rad('gmR', '#ffd0d0', '#e0112b', '#5a0010') + rad('gmA', '#f3e4ff', '#a24dff', '#35106e') + rad('gmT', '#eafffe', '#2fd0c6', '#0b4a47') + rad('gmD', '#ffffff', '#9fd8ff', '#3d7be0') + rad('gmP', '#fff', '#c79bff', '#4a1fa8') + rad('plan', '#ffd1f5', '#9b4dff', '#220a55');
  g += `<linearGradient id="rayg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".75"/><stop offset="1" stop-color="#ffc83a" stop-opacity="0"/></linearGradient>`;
  g += `<radialGradient id="aur7"><stop offset=".35" stop-color="#ffd24a" stop-opacity=".55"/><stop offset=".7" stop-color="#ff9d1a" stop-opacity=".18"/><stop offset="1" stop-color="#ff9d1a" stop-opacity="0"/></radialGradient>`;
  g += `<radialGradient id="nb1"><stop offset="0" stop-color="#8b3dff" stop-opacity=".7"/><stop offset=".6" stop-color="#3a1190" stop-opacity=".3"/><stop offset="1" stop-color="#1a0550" stop-opacity="0"/></radialGradient>`;
  g += `<radialGradient id="nb2"><stop offset="0" stop-color="#c026d3" stop-opacity=".5"/><stop offset="1" stop-color="#c026d3" stop-opacity="0"/></radialGradient>`;
  g += `<radialGradient id="nb3"><stop offset="0" stop-color="#2b5bff" stop-opacity=".45"/><stop offset="1" stop-color="#2b5bff" stop-opacity="0"/></radialGradient>`;
  g += `<linearGradient id="cmtg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d6bcff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".95"/></linearGradient>`;
  g += `<linearGradient id="fl1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d11a00"/><stop offset="1" stop-color="#ff8a00"/></linearGradient>`;
  g += `<linearGradient id="fl2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff6a00"/><stop offset="1" stop-color="#ffd24a"/></linearGradient>`;
  g += `<linearGradient id="fl3" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffc21a"/><stop offset="1" stop-color="#fff6c2"/></linearGradient>`;
  g += `<symbol id="crescent" viewBox="-10 -10 20 20"><defs><mask id="crm"><rect x="-10" y="-10" width="20" height="20" fill="#fff"/><circle cx="4.4" cy="-2" r="7.4" fill="#000"/></mask><linearGradient id="crg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#a875ff"/></linearGradient></defs><circle r="9" fill="url(#crg)" mask="url(#crm)"/></symbol>`;
  [6, 7, 8].forEach(k => { g += `<g id="wg${k}">${wingMarkup(WP[k], 40 + k)}</g>`; });
  const d = document.createElement('div'); d.id = 'cdr-defs'; d.setAttribute('aria-hidden', 'true'); d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  d.innerHTML = `<svg width="0" height="0"><defs>${g}</defs></svg>`; document.body.appendChild(d);
}

/* ----- éléments décoratifs ----- */
const gemAt = (p, a, r, rad, fill) => { const [x, y] = pol(a, r); return `<g transform="translate(${x} ${y})"><circle r="${f1(rad + 1.3)}" fill="${p.dk}" stroke="${p.hi}" stroke-width=".6"/><circle r="${rad}" fill="url(#${fill})"/><circle cx="${f1(-rad * .3)}" cy="${f1(-rad * .35)}" r="${f1(rad * .28)}" fill="#fff" opacity=".85"/></g>`; };
const starAt = (a, r, sc, fill, delay) => { const [x, y] = pol(a, r); return `<path class="tw" d="${STAR4}" transform="translate(${x} ${y}) scale(${sc})" fill="${fill}" style="animation-delay:${delay}s"/>`; };
function ringBand(k) {
  const p = FR_PAL[k];
  return `<circle r="52.6" fill="none" stroke="url(#rg${k})" stroke-width="11.2"/><circle r="58.1" fill="none" stroke="${p.hi}" stroke-opacity=".7" stroke-width=".8"/><circle r="47" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="1.2"/><circle r="49.7" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1"/><circle r="55.4" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="2.2" stroke-dasharray="70 400" stroke-linecap="round" transform="rotate(-155)"/>`;
}
function ringFront(k, big) {
  const p = FR_PAL[k]; let s = ringBand(k);
  if (k <= 3) { for (let i = 0; i < 28; i++) { const [x, y] = pol(i * 360 / 28, 52.6); s += `<circle cx="${x}" cy="${y}" r=".95" fill="${p.dk}" opacity=".5"/>`; } }
  if (k === 2) [0, 90, 180, 270].forEach(a => s += gemAt(p, a, 52.6, 3, 'gmR'));
  if (k === 3) { [0, 90, 180, 270].forEach(a => s += gemAt(p, a, 52.6, 3.2, 'gmT')); s += `<circle class="spin" style="animation-duration:3.6s" r="52.6" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="3.4" stroke-dasharray="12 320" stroke-linecap="round"/>`; }
  if (k === 4) {
    const col = ['#f2fbff', '#79b8ff', '#4a8bea', '#c4e7ff'];
    for (let i = 0; i < 16; i++) { const a0 = i * 22.5, a1 = a0 + 22.5, [x0, y0] = pol(a0, 47.4), [x1, y1] = pol(a1, 47.4), [x2, y2] = pol(a1, 57.8), [x3, y3] = pol(a0, 57.8); s += `<path d="M${x0} ${y0}A47.4 47.4 0 0 1 ${x1} ${y1}L${x2} ${y2}A57.8 57.8 0 0 0 ${x3} ${y3}Z" fill="${col[i % 4]}" stroke="#fff" stroke-opacity=".55" stroke-width=".35" opacity=".92"/>`; }
    [0, 90, 180, 270].forEach(a => s += gemAt(p, a + 45, 52.6, 3.4, 'gmD'));
    if (big || true) s += starAt(-45, 60, 1.35, '#fff', 0) + starAt(135, 60, 1.1, '#fff', 1.1) + starAt(20, 59, .9, '#dff3ff', .6);
  }
  if (k === 5) {
    s += `<circle r="52.6" fill="none" stroke="#ff7a1a" stroke-width="1.5" stroke-dasharray="9 4 2 7 14 5" class="lava"/><circle r="57.6" fill="none" stroke="#ff9a3c" stroke-opacity=".75" stroke-width=".9"/>`;
    for (let i = 0; i < 10; i++) { const [x, y] = pol(i * 36 + 12, 52.6); s += `<circle cx="${x}" cy="${y}" r="1.1" fill="#ffd27a" class="tw" style="animation-delay:${f1(i * .23)}s"/>`; }
  }
  if (k === 6) {
    for (let i = 0; i < 12; i++) { const [x, y] = pol(i * 30 + 15, 52.6); s += `<path d="M${x} ${f1(y - 1.6)}L${f1(+x + 1.2)} ${y}L${x} ${f1(+y + 1.6)}L${f1(x - 1.2)} ${y}Z" fill="#f1e6ff" opacity=".8"/>`; }
    [0, 90, 180, 270].forEach(a => s += gemAt(p, a, 52.6, 3.6, 'gmA'));
  }
  if (k === 7) {
    for (let i = 0; i < 24; i++) { const [x, y] = pol(i * 15, 52.6); s += `<circle cx="${x}" cy="${y}" r="${i % 2 ? .8 : 1.2}" fill="#fffbe0" opacity=".8"/>`; }
    [0, 90, 180].forEach(a => s += gemAt(p, a, 52.6, 4, 'gmR'));
    s += `<circle class="spin" style="animation-duration:5s" r="52.6" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-dasharray="16 315" stroke-linecap="round"/>`;
    if (big) s += `<g><path d="M-15 -56L-19 -78L-9 -69L0 -85L9 -69L19 -78L15 -56Z" fill="url(#rg7)" stroke="#6b3a00" stroke-width=".9" stroke-linejoin="round"/><path d="M-15 -56L15 -56L14 -61L-14 -61Z" fill="#ffe58a" stroke="#6b3a00" stroke-width=".7"/><path d="M-14 -61L-17 -75L-9 -68L0 -82" fill="none" stroke="#fffbe0" stroke-opacity=".7" stroke-width=".8"/><circle cx="0" cy="-87" r="2.2" fill="#fff"/><circle cx="-19.5" cy="-80" r="1.9" fill="#fff"/><circle cx="19.5" cy="-80" r="1.9" fill="#fff"/><circle cx="0" cy="-66" r="3" fill="url(#gmR)" stroke="#fff3b0" stroke-width=".7"/><circle cx="-8" cy="-60" r="1.4" fill="url(#gmT)"/><circle cx="8" cy="-60" r="1.4" fill="url(#gmT)"/></g>`;
  }
  if (k === 8) {
    const R = _rnd(808);
    s += `<circle r="52.6" fill="none" stroke="#b583ff" stroke-opacity=".55" stroke-width=".8" stroke-dasharray="1.5 3"/><circle r="58.2" fill="none" stroke="#caa6ff" stroke-width=".9"/>`;
    for (let i = 0; i < 26; i++) { const [x, y] = pol(R() * 360, 49.8 + R() * 5.6); s += `<circle class="tw" cx="${x}" cy="${y}" r="${f1(.35 + R() * .6)}" fill="#fff" style="animation-delay:${f1(R() * 3)}s"/>`; }
    [0, 90, 180, 270].forEach(a => { const [x, y] = pol(a + 45, 52.6); s += `<g transform="translate(${x} ${y})"><circle r="5.2" fill="#07021f" stroke="#c9a6ff" stroke-width=".7"/><path d="${STAR4}" fill="url(#gmP)" transform="scale(.95)"/><path class="tw" d="${STAR4}" fill="#fff" transform="scale(.5)"/></g>`; });
    if (big) s += `<use href="#crescent" x="-11" y="-80" width="22" height="22"/><path class="tw" d="${STAR4}" transform="translate(13 -74) scale(.8)" fill="#fff"/><path class="tw" style="animation-delay:.9s" d="${STAR4}" transform="translate(-16 -70) scale(.6)" fill="#e9d5ff"/>`;
  }
  return s;
}
function flames(k) { // k = 5 (feu rouge) — langues de flammes autour de l'anneau
  let s = ''; const R = _rnd(55), N = 22;
  for (let i = 0; i < N; i++) {
    const a = i * 360 / N + 3, up = Math.max(0, -Math.sin(a * Math.PI / 180)), h = 20 + 22 * up + R() * 8, b = 5.2 + R() * 1.6;
    const mk = (hh, bb, f, dl) => `<path class="fl" style="animation-delay:${dl}s;animation-duration:${f1(.7 + R() * .6)}s" fill="url(#${f})" d="M${f1(-bb)} 0C${f1(-bb)} ${f1(-hh * .35)} ${f1(-bb * .4)} ${f1(-hh * .55)} ${f1(bb * .25)} ${f1(-hh)}C${f1(bb * .1)} ${f1(-hh * .6)} ${f1(bb)} ${f1(-hh * .4)} ${f1(bb)} 0Z"/>`;
    const d0 = f1(R() * .8);
    s += `<g transform="rotate(${f1(a + 90)}) translate(0 -53)">${mk(h, b, 'fl1', d0)}${mk(h * .72, b * .7, 'fl2', f1(d0 + .15))}${mk(h * .42, b * .4, 'fl3', f1(d0 + .3))}</g>`;
  }
  return s;
}
const rays = () => { let s = '<g class="spin" style="animation-duration:60s">'; for (let i = 0; i < 16; i++) s += `<path d="M-4.2 -52L0 -${i % 2 ? 98 : 108}L4.2 -52Z" fill="url(#rayg)" transform="rotate(${i * 22.5})"/>`; return s + '</g>'; };
function embers(col, n, seed) { let s = ''; const R = _rnd(seed); for (let i = 0; i < n; i++) { const [x, y] = pol(-150 + R() * 120, 60 + R() * 8); s += `<circle class="em" cx="${x}" cy="${y}" r="${f1(.8 + R() * 1.2)}" fill="${col}" style="animation-delay:${f1(R() * 3)}s;animation-duration:${f1(2 + R() * 1.6)}s;--dx:${f1((R() - .5) * 18)}px"/>`; } return s; }
function cosmos() {
  const R = _rnd(99);
  let b = `<g class="spin" style="animation-duration:90s"><circle cx="-34" cy="-18" r="84" fill="url(#nb1)"/><circle cx="40" cy="22" r="72" fill="url(#nb2)"/><circle cx="6" cy="-40" r="66" fill="url(#nb3)"/></g><circle r="92" fill="url(#nb1)" class="pulse"/>`;
  for (let i = 0; i < 46; i++) { const a = R() * 360, r = 62 + R() * 62, [x, y] = pol(a, r); if (Math.abs(x) > 130 || Math.abs(y) > 106) continue; b += `<circle class="tw" cx="${x}" cy="${y}" r="${f1(.4 + R() * .9)}" fill="${R() > .7 ? '#e4c8ff' : '#fff'}" style="animation-delay:${f1(R() * 4)}s;animation-duration:${f1(1.6 + R() * 2.4)}s"/>`; }
  let f = `<circle r="70" fill="none" stroke="#b583ff" stroke-opacity=".22" stroke-width=".6" stroke-dasharray="2 4"/><circle r="92" fill="none" stroke="#b583ff" stroke-opacity=".14" stroke-width=".6" stroke-dasharray="1 5"/>`;
  f += `<g class="spin" style="animation-duration:14s"><path d="${STAR4}" transform="translate(70 0) scale(1.5)" fill="#fff"/><circle cx="70" cy="0" r="6" fill="#b583ff" opacity=".28"/></g>`;
  f += `<g class="spin rev" style="animation-duration:26s"><g transform="translate(92 0)"><circle r="5.2" fill="url(#plan)"/><ellipse rx="9" ry="2.2" fill="none" stroke="#e4c8ff" stroke-width=".8" transform="rotate(-24)" opacity=".85"/></g></g>`;
  f += `<g class="spin" style="animation-duration:9s;animation-delay:-3s"><path d="${STAR4}" transform="translate(-62 0) scale(.9)" fill="#e9d5ff"/></g>`;
  f += `<g class="spin rev" style="animation-duration:19s;animation-delay:-8s"><circle cx="82" cy="0" r="1.6" fill="#fff"/><circle cx="-82" cy="0" r="1.2" fill="#caa6ff"/></g>`;
  b += `<g class="cmt"><line x1="0" y1="0" x2="-30" y2="-21" stroke="url(#cmtg)" stroke-width="2.2" stroke-linecap="round"/><circle r="2.2" fill="#fff"/></g>`;
  return { b, f };
}

const _avc = {};
function _layers(fr, big) {
  const key = fr + (big ? 'b' : 's'); if (_avc[key]) return _avc[key];
  let back = '', front = ringFront(fr, big);
  if (big) {
    if (fr === 5) { back = flames(5); front += embers('#ffc15a', 9, 5); }
    if (fr === 6) back = wingUse(6, 1) + wingUse(6, 0);
    if (fr === 7) { back = `<circle r="104" fill="url(#aur7)" class="pulse"/>` + rays() + wingUse(7, 1) + wingUse(7, 0); front += embers('#ffe28a', 12, 7); }
    if (fr === 8) { const c = cosmos(); back = c.b + wingUse(8, 1) + wingUse(8, 0); front += c.f; }
  }
  return _avc[key] = { back, front };
}

function avHTML(name, cos, size, withTitle) {
  cos = cos || { lv: 1, fr: 0, ti: 0, av: 0 };
  const fr = Math.max(0, Math.min(TIERS.length - 1, cos.fr | 0)), T = TIERS[fr], P = FR_PAL[fr], s = size || 44, big = s >= 60;
  if (name) COS_MAP[String(name).toLowerCase()] = fr;
  _defs();
  const L = _layers(fr, big);
  const letter = esc(String(name || '?').trim().charAt(0).toUpperCase());
  const hue = [...String(name || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const img = cos.av ? `<img src="/avatar/${encodeURIComponent(String(name).toLowerCase())}?v=${cos.av}" alt="" onerror="this.remove()">` : '';
  const vb = big ? '-135 -110 270 220' : '-64 -64 128 128';
  const back = big && L.back ? `<svg class="bk" viewBox="${vb}">${L.back}</svg>` : '';
  const out = `<span class="av fr fr-${fr}${big ? ' big' : ''}" style="--s:${s}px;--fc:${T.c};--gl:${P.gl}" title="${esc(T.n)} · Niv. ${cos.lv | 0}">${back}<i class="avi" style="--h:${hue}">${letter}${img}</i><svg class="ft" viewBox="${vb}">${L.front}</svg><em class="avl" style="background:linear-gradient(145deg,${P.b[0]},${P.b[1]})">${cos.lv | 0}</em></span>`;
  if (!withTitle) return out;
  const ti = TIERS[Math.max(0, Math.min(TIERS.length - 1, cos.ti | 0))];
  return `<span class="avw">${out}<span class="avt" style="--fc:${ti.c}">${esc(ti.t)}</span></span>`;
}
