'use strict';
/* ============================================================
   machine.js — client de la machine à sous « LA NUIT DU LOUP »
   Le serveur décide de TOUT (grille, roue, bonus, prix) ; ici on ne fait que raconter le résultat avec des animations et des sons (voir sons-slot.js).
   Mécanique identique à Huff N' Even More Puff : lanternes (Hard Hat), scies (Buzz Saw), scie dorée, roue, roue améliorée,
   Scie / Mega Chapeau / Manoir / Tours gratuits (+ versions SUPER en 5×6), maisons Paille → Bois → Brique, jackpots.
   ============================================================ */
const SL_SYM = ['WO', 'VA', 'OW', 'CF', 'CD', 'A', 'K', 'Q', 'J', 'TE', 'NE', 'WD', 'HT', 'SW', 'GS'];
const SL_EMO = { WO: '🐺', VA: '🧛', OW: '🦉', CF: '⚰️', CD: '🕯️', WD: '🌕', HT: '🏮' };
const SL_WD = 11, SL_HT = 12, SL_SW = 13, SL_GS = 14;
const SL_HOUSE = ['', '🪦', '🏚️', '🏰'], SL_HNAME = ['', 'Tombe', 'Crypte', 'Manoir hanté'];
const SL_JPN = { mini: 'MINI', mini2: 'MINI ×2', minor: 'MINOR', major: 'MAJOR', grand: 'GRAND', super: 'SUPER' };
const SL_MODE = { fs: ['TOURS GRATUITS', '6 tours : chaque lanterne pose ou améliore un cadre'], bs: ['LA SCIE', 'les scies traversent la grille et posent une maison sur chaque case traversée'], mh: ['MEGA CHAPEAU', 'un tour de méga-lanternes, puis 6 tours'], ms: ['LE MANOIR', 'des cadres en Brique dès le départ'] };
const SL = { inited: false, busy: false, playing: false, got: false, turbo: false, skip: false, pending: 0, unit: 0, g: 0, active: false, cells: [], rows: 3, run: 0, jp: { mini: 20, minor: 100, major: 1000, grand: 5000, super: 7500 }, buy: [null, { n: 'La Roue', price: 45 }, { n: 'Tours Gratuits', price: 32.5 }, { n: 'Roue améliorée', price: 266 }], hist: [], endData: null, wrot: 0, auto: 0, autoOn: false };
const slSleep = ms => new Promise(r => setTimeout(r, SL.skip ? 0 : SL.turbo ? ms * .4 : ms));
// scie circulaire dessinée en SVG (grise ou dorée)
const slSaw = gold => { let p = ''; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, r = i % 2 ? 36 : 47; p += (i ? 'L' : 'M') + (50 + Math.cos(a) * r).toFixed(1) + ' ' + (50 + Math.sin(a) * r).toFixed(1); } const g = gold ? ['#fff3b0', '#f5b301', '#8a5a00'] : ['#e5e7eb', '#9ca3af', '#4b5563'];
  return `<svg class="sawv" viewBox="0 0 100 100"><defs><radialGradient id="sg${gold ? 'g' : 'n'}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${g[0]}"/><stop offset=".55" stop-color="${g[1]}"/><stop offset="1" stop-color="${g[2]}"/></radialGradient></defs><path d="${p}Z" fill="url(#sg${gold ? 'g' : 'n'})" stroke="#111" stroke-width="2"/><circle cx="50" cy="50" r="28" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2"/><circle cx="50" cy="50" r="9" fill="#1a0a22" stroke="#000" stroke-width="2"/><path d="M50 50L50 24M50 50L72 62M50 50L28 62" stroke="rgba(0,0,0,.28)" stroke-width="3"/></svg>`; };
const slSym = i => { const k = SL_SYM[i];
  if (k === 'SW' || k === 'GS') return `<span class="sy saw${k === 'GS' ? ' gold' : ''}">${slSaw(k === 'GS')}</span>`;
  if (k.length === 1 || k === 'TE' || k === 'NE') return `<span class="sy lw c${['A', 'K', 'Q', 'J', 'TE', 'NE'].indexOf(k) + 1}">${k === 'TE' ? '10' : k === 'NE' ? '9' : k}</span>`;
  return `<span class="sy">${SL_EMO[k]}</span>`; };
function slSetCell(i, sym) { const el = SL.cells[i]; el.className = 'sc' + (sym === SL_WD ? ' wild' : sym === SL_HT ? ' lant' : sym === SL_SW ? ' sawc' : sym === SL_GS ? ' gsaw' : ''); el.innerHTML = slSym(sym); }
const slRand = () => { const r = Math.random(); return r < .06 ? SL_HT : r < .1 ? SL_SW : r < .115 ? SL_GS : Math.floor(Math.random() * 11); };
function slBuildGrid(rows) {
  SL.rows = rows; const g = $('slGrid'); g.style.setProperty('--rows', rows);
  g.innerHTML = Array.from({ length: 5 * rows }, () => '<div class="sc"></div>').join(''); SL.cells = [...g.children];
}
function slRandomGrid() { slBuildGrid(3); SL.cells.forEach((_, i) => slSetCell(i, slRand() % 11)); }

function slInit() {
  if (!SL.inited) {
    SL.inited = true; slRandomGrid();
    quickBinder('slQuick', 'slBet', slJpPaint); $('slBet').addEventListener('input', slJpPaint);
  }
  slJpPaint(); socket.emit('sl-hash', { roomCode: S.code }); SLX.start();
}
function slLeave() { slAutoStop(); SLX.stop(); SLX.heart(false); }
function slJpPaint() {
  const u = parseInt($('slBet').value) || 0, J = SL.jp;
  $('slJp').innerHTML = [['mini', 'j1'], ['minor', 'j2'], ['major', 'j3'], ['grand', 'j4'], ['super', 'j5']].map(([k, c]) => `<div class="${c}" id="slJp_${k}">${SL_JPN[k]}<b>${fmtN(J[k] * u)} 🪙</b>×${J[k]}</div>`).join('');
}
function slTurboToggle() { SL.turbo = !SL.turbo; $('slTurbo').textContent = '⚡ Turbo : ' + (SL.turbo ? 'oui' : 'non'); }
function slSkip() { SL.skip = true; }
function slBanner(html, ms) { const b = $('slBanner'); b.innerHTML = html; b.classList.add('on'); return slSleep(ms || 1200).then(() => b.classList.remove('on')); }
function slUnlock() { SL.busy = false; SL.playing = false; $('slSpinBtn').disabled = false; slStopSpinAnim(); }
const slLevel = m => m >= 100 ? 4 : m >= 25 ? 3 : m >= 5 ? 2 : 1;
function slRun(add) { SL.run += add; $('slWin').className = 'sl-win big'; $('slWin').textContent = '✨ Total du tour : ' + fmtN(Math.round(SL.run * SL.unit)) + ' 🪙'; }

/* ---------- Lancer ---------- */
function slSpin(buy) {
  if (SL.busy) return; const amount = parseInt($('slBet').value) || 0;
  if (amount <= 0) return alert('Entre une mise valide !');
  startAudio(); SLX.ready(); SLX.start(); SL.busy = true; SL.got = false; SL.skip = false; SL.unit = amount; SL.run = 0; SL.t0 = Date.now(); $('slSpinBtn').disabled = true;
  $('slGamble').classList.add('hidden'); SL.active = false; SL.pending = 0; SL.g = 0;
  $('slHud').classList.add('hidden'); $('slWin').className = 'sl-win'; $('slWin').textContent = buy ? '🎡 Bonus acheté…' : 'Les rouleaux tournent… 🌑';
  document.querySelectorAll('#slJp > div').forEach(x => x.classList.remove('on'));
  if (SL.rows !== 3) slRandomGrid();
  if (!buy) { SLX.spinStart(); slStartSpinAnim(); }
  socket.emit('sl-spin', { roomCode: S.code, amount, buy: buy || 0 });
  clearTimeout(SL.wd); SL.wd = setTimeout(() => { if (!SL.got) { slUnlock(); $('slWin').textContent = 'Pas de réponse du serveur, réessaie.'; } }, 9000);
}
function slStartSpinAnim() {
  SL.reel = [true, true, true, true, true]; SL.cells.forEach(el => { el.className = 'sc spin'; });
  clearInterval(SL.spinTimer);
  SL.spinTimer = setInterval(() => { SL.cells.forEach((el, i) => { if (SL.reel[Math.floor(i / 3)]) el.innerHTML = slSym(slRand()); }); if (!SL.skip) SLX.reelRoll(); }, 85);
}
function slStopSpinAnim() { clearInterval(SL.spinTimer); SL.spinTimer = null; SL.reel = [false, false, false, false, false]; }

/* ---------- Résultat ---------- */
socket.on('sl-result', d => { SL.got = true; clearTimeout(SL.wd); slPlay(d); });
socket.on('error-message', () => { if (SL.busy && !SL.got) { slUnlock(); $('slWin').textContent = ''; slAutoStop(); } });
async function slPlay(d) {
  SL.playing = true; SL.res = d; SL.unit = d.unit; slJpPaint();
  $('slProof').textContent = 'Hash de ce tour (engagé avant de jouer) : ' + d.hash + ' — la graine sera révélée à la fin du tour.';
  $('slSkip').classList.remove('hidden');
  try {
    if (d.buy) { SLX.bigBanner(); await slBanner(`🎡 BONUS ACHETÉ<small>${esc(SL.buy[d.buy].n)}</small>`, 1500); }
    else {
      await slStopReels(d); slHighlight(d);
      if (d.base > 0) { slRun(d.base); SLX.win(slLevel(d.base)); await slSleep(d.chain.length ? 1300 : 300); }
    }
    for (const seg of d.chain) {
      if (seg.t === 'wheel') {
        if (!d.buy) { SLX.bigBanner(); await slBanner(d.gold ? '🪚 SCIE DORÉE !<small>LA ROUE AMÉLIORÉE</small>' : `🪚 ${d.saws} SCIES !<small>LA ROUE</small>`, 1700); }
        await slWheel(seg);
      } else {
        if (!d.buy) { SLX.bigBanner(); await slBanner(`🏮 ${d.hats} LANTERNES !<small>TOURS GRATUITS</small>`, 1700); }
        await slBonusGame(seg, d.grid ? d.grid.map((g, i) => g === SL_HT ? i : -1).filter(i => i >= 0) : []);
      }
    }
  } catch (e) { console.error(e); }
  slEndRound(d);
}
async function slStopReels(d) {
  const wait0 = Math.max(0, 600 - (Date.now() - SL.t0)); if (wait0 && !SL.skip) await new Promise(r => setTimeout(r, SL.turbo ? wait0 * .3 : wait0));
  let hats = 0, saws = 0;
  for (let r = 0; r < 5; r++) {
    // suspense : il en manque peu pour une fonction → les derniers rouleaux ralentissent
    const slow = r >= 3 && (hats >= 4 || saws >= 2) && !SL.skip;
    if (r > 0) await slSleep(slow ? 950 : 260);
    if (slow) { SLX.tension(); SL.cells.forEach((el, i) => { const g = d.grid[i]; if (Math.floor(i / 3) < r && (g === SL_HT || g === SL_SW || g === SL_GS)) el.classList.add('glow'); }); }
    SL.reel[r] = false; for (let k = 0; k < 3; k++) { const i = r * 3 + k, g = d.grid[i]; slSetCell(i, g); if (g === SL_HT) { hats++; SLX.hat(hats - 1); SL.cells[i].classList.add('glow'); } else if (g === SL_SW) { saws++; SLX.saw(); SL.cells[i].classList.add('glow'); } else if (g === SL_GS) { saws++; SLX.gold(); SL.cells[i].classList.add('glow'); } }
    SLX.reelStop(r);
  }
  slStopSpinAnim(); await slSleep(250);
}
function slHighlight(d) {
  SL.cells.forEach(el => el.classList.remove('hit', 'glow'));
  d.wins.forEach(w => { for (let r = 0; r < w.len; r++) for (let k = 0; k < 3; k++) { const i = r * 3 + k; if (d.grid[i] === w.s || d.grid[i] === SL_WD) SL.cells[i].classList.add('hit'); } });
  if (d.hats >= 6) d.grid.forEach((g, i) => { if (g === SL_HT) SL.cells[i].classList.add('glow'); });
  if (d.saws >= 3) d.grid.forEach((g, i) => { if (g === SL_SW || g === SL_GS) SL.cells[i].classList.add('glow'); });
}

/* ---------- La Roue ---------- */
const SL_WH = {
  1: ['bs', 'mini', 'mh', 'fs', 'up', 'bs', 'minor', 'mh', 'fs', 'ms', 'mini', 'bs', 'mh', 'major', 'fs', 'up', 'minor', 'grand'],
  2: ['sbs', 'major', 'smh', 'sfs', 'sms', 'sbs', 'grand', 'smh', 'sfs', 'major', 'sms', 'sbs', 'smh', 'super', 'sfs', 'grand']
};
const SL_WI = {
  bs: ['SCIE', '#6d28d9'], mh: ['MEGA', '#be123c'], ms: ['MANOIR', '#0f766e'], fs: ['LIBRES', '#b45309'], up: ['⬆ UP', '#0e7490'],
  sbs: ['S·SCIE', '#4c1d95'], smh: ['S·MEGA', '#881337'], sms: ['S·MANOIR', '#134e4a'], sfs: ['S·LIBRES', '#78350f'],
  mini: ['MINI', '#15803d'], minor: ['MINOR', '#0369a1'], major: ['MAJOR', '#a21caf'], grand: ['GRAND', '#ca8a04'], super: ['SUPER', '#111827']
};
function slWheelSvg(lv) {
  const W = SL_WH[lv], n = W.length, st = 360 / n; let s = '<circle r="99" fill="#2a0f1a" stroke="#fde68a" stroke-width="2"/>';
  W.forEach((c, i) => {
    const a0 = (i * st - 90) * Math.PI / 180, a1 = ((i + 1) * st - 90) * Math.PI / 180, R = 94, [x0, y0, x1, y1] = [Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R], inf = SL_WI[c];
    const jp = SL_JPN[c] != null;
    s += `<path d="M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z" fill="${inf[1]}" stroke="#fde68a" stroke-width=".8"/>`;
    s += `<g transform="rotate(${(i + .5) * st})"><text y="-64" text-anchor="middle" font-size="${inf[0].length > 6 ? 7 : jp ? 8.5 : 8}" font-weight="900" fill="${c === 'grand' || c === 'super' ? '#fff3b0' : '#fff'}" transform="rotate(90 0 -64)" style="paint-order:stroke" stroke="rgba(0,0,0,.55)" stroke-width="1.4">${inf[0]}</text></g>`;
  });
  s += '<circle r="14" fill="#1a0a22" stroke="#fde68a" stroke-width="2"/><text y="4" text-anchor="middle" font-size="12">🐺</text>';
  return `<svg id="swhSvg" viewBox="-100 -100 200 200">${s}</svg>`;
}
function slWheelName(code) { const inf = SL_WI[code]; return { bs: 'LA SCIE', mh: 'MEGA CHAPEAU', ms: 'LE MANOIR', fs: 'TOURS GRATUITS', up: 'AMÉLIORATION !', sbs: 'SUPER SCIE', smh: 'SUPER MEGA CHAPEAU', sms: 'SUPER MANOIR', sfs: 'SUPER TOURS GRATUITS' }[code] || (SL_JPN[code] ? 'JACKPOT ' + SL_JPN[code] : inf[0]); }
async function slSpinWheelTo(lv, code) {
  const W = SL_WH[lv], n = W.length, st = 360 / n, idxs = W.map((c, i) => c === code ? i : -1).filter(i => i >= 0), idx = idxs[Math.floor(Math.random() * idxs.length)];
  const off = (Math.random() - .5) * st * .7, center = (idx + .5) * st, svg = $('swhSvg');
  const R = Math.ceil((SL.wrot + 1800 + center + off) / 360) * 360 - center - off, dur = SL.skip ? .1 : SL.turbo ? 2.4 : 5.2;
  SLX.wheelStart();
  svg.style.transition = `transform ${dur}s cubic-bezier(.08,.72,.1,1)`; svg.style.transform = `rotate(${R}deg)`; SL.wrot = R;
  let last = -1; const t0 = performance.now();
  await new Promise(res => {
    const tick = () => {
      const m = getComputedStyle(svg).transform; let ang = 0; if (m && m !== 'none') { const v = m.match(/matrix\(([^)]+)\)/); if (v) { const [a, b] = v[1].split(',').map(Number); ang = Math.atan2(b, a) * 180 / Math.PI; } }
      const i = Math.floor((((-ang) % 360) + 360) % 360 / st); if (last !== -1 && i !== last) SLX.wheelTick(.9 + Math.min(.5, (performance.now() - t0) / (dur * 1000) * .5));
      last = i; if (performance.now() - t0 < dur * 1000 + 80) requestAnimationFrame(tick); else res();
    }; tick();
  });
}
async function slWheel(seg) {
  const box = $('slWheel'); $('slCab').style.minHeight = '400px'; box.classList.remove('hidden'); $('swhRes').innerHTML = '';
  let cur = seg;
  while (cur) {
    $('swhTitle').textContent = cur.lv === 2 ? '✨ ROUE AMÉLIORÉE ✨' : '🎡 LA ROUE DU LOUP'; box.classList.toggle('lv2', cur.lv === 2);
    $('swhWrap').innerHTML = slWheelSvg(cur.lv); $('swhSvg').style.transform = `rotate(${SL.wrot % 360}deg)`; SL.wrot = SL.wrot % 360;
    await slSleep(500); await slSpinWheelTo(cur.lv, cur.wedge);
    const nm = slWheelName(cur.wedge), jp = SL_JPN[cur.wedge] != null;
    if (cur.wedge === 'up') { SLX.wheelLand('up'); $('swhRes').innerHTML = `<b>${nm}</b><small>deuxième roue : Super bonus, Grand et SUPER JACKPOT</small>`; await slSleep(1600); cur = cur.next; continue; }
    if (jp) {
      SLX.jackpot(cur.wedge); const coins = Math.round(cur.pay * SL.unit); $('swhRes').innerHTML = `<b class="jp">${SL_JPN[cur.wedge]}</b><small>${fmtN(coins)} 🪙 (×${cur.pay})</small>`;
      const j = $('slJp_' + cur.wedge); if (j) j.classList.add('on'); slRun(cur.pay); await slSleep(2600); cur = null; break;
    }
    SLX.wheelLand(cur.wedge); $('swhRes').innerHTML = `<b>${nm}</b><small>${SL_MODE[cur.next.mode][1]}</small>`; await slSleep(1700);
    box.classList.add('hidden'); $('slCab').style.minHeight = ''; await slBonusGame(cur.next, []); cur = null;
  }
  box.classList.add('hidden'); $('slCab').style.minHeight = '';
}

/* ---------- Un jeu bonus ---------- */
// pendant les bonus aussi, les rouleaux tournent : les cases vides font défiler lettres et symboles, et s'arrêtent rouleau par rouleau (seules les lanternes comptent)
async function slBonusRoll(lv, R, hatSet) {
  const ovs = []; SL.cells.forEach((el, c) => { if (lv[c] === 0 || hatSet.has(c)) { const o = document.createElement('div'); o.className = 'roll'; o.innerHTML = slSym(slRand() % 11); el.appendChild(o); ovs.push([c, o]); } });
  const tm = setInterval(() => { ovs.forEach(([c, o]) => { if (!o.classList.contains('stop')) o.innerHTML = slSym(slRand() % 11); }); if (!SL.skip) SLX.reelRoll(); }, 70);
  const cols = SL.cells.length / R;
  for (let r = 0; r < cols; r++) {
    await slSleep(cols > 5 ? 120 : 170);
    ovs.forEach(([c, o]) => { if (Math.floor(c / R) === r) { o.innerHTML = slSym(hatSet.has(c) ? SL_HT : slRand() % 11); o.classList.add('stop'); } });
    SLX.reelStop(r);
  }
  clearInterval(tm); await slSleep(260); ovs.forEach(([, o]) => o.remove());
}
function slPaintCell(i, lv, pop) {
  const el = SL.cells[i]; el.querySelectorAll('.prize').forEach(x => x.remove());
  const keep = el.querySelector('.saw-o'); el.className = 'sc ' + (lv ? 'l' + lv : 'plot'); el.innerHTML = lv ? `<span class="sy${pop ? ' hs' : ''}">${SL_HOUSE[lv]}</span>` : '<span class="sy" style="opacity:.12;font-size:.5em">·</span>'; if (keep) el.appendChild(keep);
}
function slSawsShow(cells) { SL.cells.forEach(el => { const o = el.querySelector('.saw-o'); if (o) o.remove(); }); cells.forEach(c => { const o = document.createElement('div'); o.className = 'saw-o'; o.innerHTML = slSaw(false); SL.cells[c].appendChild(o); }); }
function slMegaShow(blocks) {
  blocks.forEach(b => { const a = SL.cells[b.cells[0]], z = SL.cells[b.cells[b.cells.length - 1]], o = document.createElement('div'); o.className = 'megahat'; o.innerHTML = '<span>🏮</span>';
    o.style.cssText = `left:${a.offsetLeft}px;top:${a.offsetTop}px;width:${z.offsetLeft + z.offsetWidth - a.offsetLeft}px;height:${z.offsetTop + z.offsetHeight - a.offsetTop}px;font-size:${(z.offsetTop + z.offsetHeight - a.offsetTop) * .75}px`; $('slGrid').appendChild(o); });
}
async function slSawSweep(seg, lv) { // les scies tracent leur route, colonne par colonne, et posent les maisons AVANT les tours
  $('slHudMid').textContent = 'les scies tracent leur route…';
  const R = seg.R, starts = seg.saws;
  for (let j = 0; j < seg.sweep.length; j++) {
    const st = seg.sweep[j]; if (!st.saws.length) continue;
    slSawsShow(st.saws.concat(starts.filter(c => Math.floor(c / R) > j))); SLX.sawCut();
    st.saws.forEach(c => { const el = SL.cells[c]; el.classList.add('cut'); setTimeout(() => el.classList.remove('cut'), 750); });
    await slSleep(260);
    st.ups.forEach(up => { lv[up.c] = up.to; slPaintCell(up.c, up.to, true); const el = SL.cells[up.c]; el.classList.add('up'); setTimeout(() => el.classList.remove('up'), 650); });
    if (st.ups.length) SLX.frameUp(Math.max(...st.ups.map(x => x.to)));
    await slSleep(st.ups.length ? 460 : 280);
  }
  slSawsShow([]); $('slHudMid').textContent = 'les maisons sont posées !'; await slSleep(650);
}
async function slBonusGame(seg, hatCells) {
  const u = SL.unit, R = seg.R, name = (seg.sup ? 'SUPER ' : '') + SL_MODE[seg.mode][0], lv = seg.init.slice();
  SL.cells.forEach(el => el.classList.remove('hit', 'glow'));
  if (seg.sup) { SLX.superUp(); await slBanner('⚡ SUPER ⚡<small>la grille passe à 5×6 : 30 cases !</small>', 1300); }
  slBuildGrid(R); SL.cells.forEach((_, i) => slPaintCell(i, 0));
  SLX.bigBanner(); await slBanner(`${seg.mode === 'ms' ? '🏰' : seg.mode === 'bs' ? '🪚' : '🏮'} ${name}<small>${SL_MODE[seg.mode][1]}</small>`, 1700);
  $('slHud').classList.remove('hidden'); let won = 0; const setW = () => $('slBonusWin').textContent = fmtN(Math.round(won * u)); setW(); $('slLeft').textContent = '6'; $('slHudMid').textContent = name;
  SLX.heart(true);
  if (seg.mode === 'mh') { // le tour de départ : uniquement des méga-lanternes
    $('slHudMid').textContent = 'tour de départ'; SLX.megaHat(); slMegaShow(seg.mega); await slSleep(1500);
    document.querySelectorAll('.megahat').forEach(x => x.classList.add('fade'));
    seg.mega.forEach(b => b.cells.forEach(c => { lv[c] = 1; slPaintCell(c, 1, true); SL.cells[c].classList.add('up'); })); SLX.frameUp(1); await slSleep(900); document.querySelectorAll('.megahat').forEach(x => x.remove());
  } else {
    lv.forEach((x, i) => { if (x) slPaintCell(i, x, true); });
    if (seg.mode === 'fs' && hatCells && hatCells.length) { SLX.frameUp(1); }
    if (seg.mode === 'bs' || seg.mode === 'ms') { slSawsShow(seg.saws); SLX.saw(); }
    await slSleep(900);
    if (seg.sweep && seg.sweep.length) await slSawSweep(seg, lv);
  }
  for (const sp of seg.spins) {
    await slBonusRoll(lv, R, new Set(sp.hats.concat(sp.touch)));
    const gl = sp.golds || []; sp.hats.forEach((c, k) => { const dr = document.createElement('div'); dr.className = 'drop' + (gl.includes(c) ? ' gold' : ''); dr.innerHTML = '<span class="sy">🏮</span>'; SL.cells[c].appendChild(dr); if (k < 6) setTimeout(() => SLX.lanternDrop(), k * 90); if (gl.includes(c)) setTimeout(() => SLX.goldHat(), 250 + k * 60); });
    sp.touch.forEach(c => SL.cells[c].classList.add('touched'));
    if (!sp.hats.length && !sp.touch.length) $('slHudMid').textContent = 'aucune lanterne…'; else $('slHudMid').textContent = (sp.hats.length) + ' lanterne' + (sp.hats.length > 1 ? 's' : '') + (gl.length ? ' dont ' + gl.length + ' dorée' + (gl.length > 1 ? 's ✨' : ' ✨') : '');
    await slSleep(sp.hats.length || sp.touch.length ? 650 : 350);
    SL.cells.forEach(el => { el.querySelectorAll('.drop').forEach(x => x.remove()); el.classList.remove('touched'); });
    for (const up of sp.ups) {
      if (up.credit) { won += up.credit; setW(); slRun(up.credit); const p = document.createElement('div'); p.className = 'prize'; p.innerHTML = `+${up.credit}×<small>maison complète !</small>`; SL.cells[up.c].appendChild(p); SLX.prize(up.credit); setTimeout(() => p.remove(), 900); continue; }
      if (up.re != null) { SL.cells[up.re].classList.add('red'); await slSleep(220); SL.cells[up.re].classList.remove('red'); }
      lv[up.c] = up.to; slPaintCell(up.c, up.to, true); const el = SL.cells[up.c]; el.classList.add('up'); setTimeout(() => el.classList.remove('up'), 650); SLX.frameUp(up.to);
      if (up.g) { const p = document.createElement('div'); p.className = 'prize wh'; p.innerHTML = '✨<small>DORÉE</small>'; el.appendChild(p); setTimeout(() => p.remove(), 800); }
      if (sp.ups.length < 7) await slSleep(150);
    }
    $('slLeft').textContent = sp.left; if (sp.extra) { SLX.extra(); $('slHudMid').textContent = '🎁 +1 tour !'; }
    await slSleep(sp.ups.length ? 450 : 200);
  }
  SL.cells.forEach(el => { const o = el.querySelector('.saw-o'); if (o) o.remove(); });
  $('slHudMid').textContent = 'le loup arrive…'; SLX.heart(false);
  // le loup souffle sur les maisons
  await slBanner('🐺 LE LOUP SOUFFLE !<small>chaque maison dévoile son prix</small>', 1200);
  SLX.howl(); await slSleep(1200); SLX.huff(); await slSleep(1000);
  let lastLv = 0, wheels = [];
  for (const h of seg.reveal) {
    if (h.lv !== lastLv) { lastLv = h.lv; $('slHudMid').textContent = SL_HNAME[h.lv] + 's'; SLX.collapse(1.2); await slSleep(500); }
    const cell = SL.cells[h.c]; cell.classList.add('blow'); SLX.collapse(.5);
    await slSleep(h.lv === 3 ? 380 : 170);
    const p = document.createElement('div'); p.className = 'prize' + (h.jp ? ' jp' : h.wheel ? ' wh' : '');
    if (h.wheel) p.innerHTML = '🎡<small>TOUR DE ROUE</small>'; else if (h.jp) p.innerHTML = `${SL_JPN[h.jp]}<small>${fmtN(Math.round(h.mult * u))} 🪙</small>`; else p.innerHTML = `${fmtN(Math.round(h.mult * u))}<small>×${h.mult}</small>`;
    cell.appendChild(p);
    if (!h.wheel) { won += h.mult; setW(); slRun(h.mult); }
    if (h.jp) { const k = h.jp === 'mini2' ? 'mini' : h.jp; SLX.jackpot(k); const j = $('slJp_' + k); if (j) j.classList.add('on'); await slSleep(1300); }
    else if (h.wheel) { SLX.bigBanner(); await slSleep(700); wheels.push(h); }
    else { SLX.prize(h.mult); await slSleep(h.lv === 3 ? 520 : h.lv === 2 ? 300 : 180); }
  }
  for (const h of wheels) { await slBanner('🎡 UNE BRIQUE OFFRE UN TOUR DE ROUE !', 1400); const before = SL.run; await slWheel(h.w); setW(); won = won; }
  // total du bonus (les roues éventuelles sont déjà ajoutées à SL.run)
  $('slBonusWin').textContent = fmtN(Math.round(seg.total * u)); $('slHudMid').textContent = '';
  SLX.win(slLevel(seg.total)); await slBanner(`TOTAL DU BONUS<small>${fmtN(Math.round(seg.total * u))} 🪙</small>`, 1900);
  slBuildGrid(3);
}

/* ---------- Fin du tour, double ou rien, encaissement ---------- */
function slEndRound(d) {
  SL.playing = false; $('slSkip').classList.add('hidden'); $('slWheel').classList.add('hidden'); $('slCab').style.minHeight = ''; SLX.heart(false);
  if (SL.rows !== 3 || !SL.cells.length) slBuildGrid(3);
  if (d.grid) { d.grid.forEach((g, i) => slSetCell(i, g)); slHighlight(d); } else if (d.buy) SL.cells.forEach((_, i) => slSetCell(i, slRand() % 11));
  SL.pending = d.payout; SL.active = d.payout > 0; SL.g = 0;
  if (d.payout > 0) {
    $('slWin').className = 'sl-win big'; $('slWin').textContent = `🎉 GAIN : ${fmtN(d.payout)} 🪙 (×${(d.payout / d.cost).toFixed(2)})`; if (d.mult >= 3) SLX.win(slLevel(d.mult));
    slGambleShow();
  } else { $('slWin').className = 'sl-win lose'; $('slWin').textContent = 'Pas de gain… 🌑'; }
  SL.busy = false; $('slSpinBtn').disabled = false; slAutoNext();
  if (SL.endData) { const e = SL.endData; SL.endData = null; slEnd(e); }
}
function slGambleShow(keepCard) {
  const can = SL.pending > 0 && SL.g < 5;
  $('slGamble').classList.remove('hidden'); $('slGpend').textContent = fmtN(SL.pending) + ' 🪙'; $('slGnext').textContent = can ? fmtN(SL.pending * 2) + ' 🪙' : '—';
  $('slGladder').innerHTML = ['×2', '×4', '×8', '×16', '×32'].map((x, i) => `<i class="${i < SL.g ? 'done' : i === SL.g && can ? 'cur' : ''}">${x}</i>`).join('');
  if (!keepCard) { const c = $('slGcard'); c.className = 'slg-card'; c.textContent = '?'; }
  document.querySelectorAll('#slGamble .slg-red,#slGamble .slg-black').forEach(b => { b.disabled = !can; b.style.opacity = can ? 1 : .4; });
  $('slGnote').textContent = SL.g >= 5 ? 'Maximum atteint : encaisse ton gain !' : 'Double ou rien (jusqu’à ×32, sans limite de gain) : trouve la couleur de la carte. Le gain en attente est encaissé automatiquement au prochain tour.';
}
function slGamble(color) { if (!SL.active) return; document.querySelectorAll('#slGamble button').forEach(b => { b.disabled = true; }); SLX.gambleCard(); socket.emit('sl-gamble', { roomCode: S.code, color }); }
function slCollect() { if (!SL.active) return; document.querySelectorAll('#slGamble button').forEach(b => { b.disabled = true; }); socket.emit('sl-collect', { roomCode: S.code }); }
socket.on('sl-gamble-res', d => {
  const c = $('slGcard'), suit = ['♥', '♦', '♠', '♣'][d.suit], rank = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][d.rank];
  c.className = 'slg-card show flip ' + (d.suit < 2 ? 'rd' : 'bk'); c.textContent = rank + suit;
  if (d.ok) { SL.pending = d.pending; SL.g = d.g; SLX.gambleWin(); $('slWin').textContent = `✅ Bien vu ! Gain en attente : ${fmtN(d.pending)} 🪙`; setTimeout(() => slGambleShow(true), 700); }
  else { SLX.gambleLose(); $('slWin').className = 'sl-win lose'; $('slWin').textContent = '💀 Mauvaise couleur… le gain est perdu.'; }
});
function slEnd(d) {
  SL.active = false; $('slGamble').classList.add('hidden');
  if (d.how === 'collect') { $('slWin').className = 'sl-win big'; $('slWin').textContent = `💰 Encaissé : +${fmtN(d.win)} 🪙`; SLX.coinRun(8, .06); }
  SL.hist.unshift({ ok: d.win > 0, txt: d.win > 0 ? '+' + fmtN(d.win) : '0' }); SL.hist.length = Math.min(SL.hist.length, 30);
  setH($('slHist'), SL.hist.map(h => `<div class="history-pill ${h.ok ? 'cr-win' : 'cr-lose'}">${h.txt}</div>`).join(''));
  const p = d.proof; $('slProof').textContent = `Graine révélée : ${p.seed} (SHA-256 = ${p.hash}) — chaque valeur du tour = HMAC-SHA256(graine, "slot:${p.n}:i") ÷ 2^52, i = 0, 1, 2… dans l’ordre du moteur. Prochain hash : ${d.nextHash}`;
}
socket.on('sl-end', d => { if (SL.playing) SL.endData = d; else slEnd(d); });
socket.on('sl-hash', d => {
  if (d.buy) SL.buy = [null, ...d.buy]; if (d.jp) SL.jp = d.jp; slJpPaint();
  if (!SL.playing) $('slProof').textContent = 'Hash du prochain tour (graine engagée) : ' + d.hash;
  if (d.active && !SL.playing) { SL.active = true; SL.pending = d.pending; SL.unit = d.unit; SL.g = d.g; $('slWin').className = 'sl-win big'; $('slWin').textContent = `Gain en attente : ${fmtN(d.pending)} 🪙`; slGambleShow(); }
});

/* ---------- Tours automatiques (nombre choisi ou infini) ---------- */
function slAutoLabel() { const b = $('slAutoBtn'); b.classList.toggle('on', SL.autoOn); b.textContent = SL.autoOn ? '⏹ Stop auto' + (SL.auto === Infinity ? ' (∞)' : ' (' + SL.auto + ')') : '🔁 Auto'; }
function slAutoToggle() { if (SL.autoOn) return slAutoStop(); $('slAutoPanel').classList.toggle('hidden'); }
function slAutoStart(n) { $('slAutoPanel').classList.add('hidden'); SL.autoOn = true; SL.auto = n; slAutoLabel(); if (!SL.busy) slAutoNext(true); }
function slAutoStop() { SL.autoOn = false; SL.auto = 0; clearTimeout(SL.autoT); const b = $('slAutoBtn'); if (b) slAutoLabel(); }
function slAutoNext(now) {
  if (!SL.autoOn) return;
  clearTimeout(SL.autoT);
  SL.autoT = setTimeout(() => {
    if (!SL.autoOn || SL.busy) return;
    const amount = parseInt($('slBet').value) || 0;
    if (amount <= 0) return slAutoStop();
    if (S.balance + (SL.active ? SL.pending : 0) < amount) { slAutoStop(); $('slWin').className = 'sl-win lose'; $('slWin').textContent = 'Auto arrêté : solde insuffisant.'; return; }
    if (SL.auto <= 0) return slAutoStop();
    if (SL.auto !== Infinity) SL.auto--;
    slAutoLabel(); if (SL.auto === 0 && SL.autoOn) SL.lastAuto = true;
    slSpin();
  }, now ? 50 : (SL.turbo ? 450 : 1100));
}
/* ---------- Achat de bonus ---------- */
function slBuyOpen() {
  if (SL.busy) return; slAutoStop(); const u = parseInt($('slBet').value) || 0; if (u <= 0) return alert('Entre une mise valide !');
  const desc = ['', 'Un tour de la roue : bonus (Scie, Mega Chapeau, Manoir, Tours gratuits) ou jackpot', 'Les Tours gratuits tout de suite : 6 lanternes posent 6 cadres Paille', 'Direct sur la roue améliorée : bonus SUPER (5×6), Major, Grand ou SUPER JACKPOT 7500×'], ic = ['', '🎡', '🏮', '✨'];
  $('slBuyModal').innerHTML = `<h4>🎡 Acheter un bonus</h4><p>Prix en multiples de ta mise (${fmtN(u)} 🪙), calculés pour garder la même rentabilité (99 %) que le jeu normal.</p>` +
    [1, 2, 3].map(k => { const B = SL.buy[k], cost = Math.round(B.price * u), ok = S.balance >= cost; return `<button class="slb-o" ${ok ? '' : 'disabled'} onclick="slBuy(${k})"><span class="ic">${ic[k]}</span><span><b>${esc(B.n)}</b><small>${desc[k]}</small></span><span class="pr">${fmtN(cost)} 🪙<small>×${B.price}</small></span></button>`; }).join('') +
    '<button class="sl-x" onclick="slBuyClose()">Annuler</button>';
  $('slBuyBack').classList.remove('hidden');
}
function slBuyClose() { $('slBuyBack').classList.add('hidden'); }
function slBuy(k) { slBuyClose(); slSpin(k); }
Object.assign(window, { slAutoToggle, slAutoStart, slInit, slLeave, slSpin, slSkip, slTurboToggle, slGamble, slCollect, slBuyOpen, slBuyClose, slBuy });
