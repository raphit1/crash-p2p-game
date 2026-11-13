'use strict';
/* ============================================================
   machine.js — client de la machine à sous « LA NUIT DU LOUP »
   Le serveur décide de TOUT (grille, bonus, prix) ; ici on ne fait que raconter le résultat avec des animations.
   ============================================================ */
const SL_SYM = ['A', 'K', 'Q', 'J', 'BA', 'SP', 'OW', 'VA', 'WO', 'WD', 'LA'];
const SL_EMO = { BA: '🦇', SP: '🕷️', OW: '🦉', VA: '🧛', WO: '🐺', WD: '🌕', LA: '🏮' };
const SL_HOUSE = ['', '🪦', '🏚️', '🏰'];
const SL_JPN = { mini: 'MINI', minor: 'MINOR', major: 'MAJOR', grand: 'GRAND' };
const SL = { inited: false, busy: false, playing: false, got: false, turbo: false, skip: false, pending: 0, unit: 0, g: 0, active: false, cells: [], jp: { mini: 15, minor: 60, major: 300, grand: 3000 }, buy: [null, { n: 'Tombes', price: 27 }, { n: 'Cryptes', price: 54 }, { n: 'Manoirs hantés', price: 93 }], hist: [], endData: null, spinTimer: null, reel: [false, false, false, false, false] };
const slSleep = ms => new Promise(r => setTimeout(r, SL.skip ? 0 : SL.turbo ? ms * .4 : ms));
const slSym = i => { const k = SL_SYM[i]; return k.length === 1 ? `<span class="sy lw c${'AKQJ'.indexOf(k) + 1}">${k}</span>` : `<span class="sy">${SL_EMO[k]}</span>`; };
function slSetCell(i, sym) { const el = SL.cells[i]; el.className = 'sc' + (sym === 9 ? ' wild' : sym === 10 ? ' lant' : ''); el.innerHTML = slSym(sym); }
const slRand = () => { const r = Math.random(); return r < .05 ? 10 : r < .1 ? 9 : Math.floor(Math.random() * 9); };

function slInit() {
  if (!SL.inited) {
    SL.inited = true;
    $('slGrid').innerHTML = Array.from({ length: 15 }, () => '<div class="sc"></div>').join('');
    SL.cells = [...$('slGrid').children]; SL.cells.forEach((_, i) => slSetCell(i, slRand() % 9));
    quickBinder('slQuick', 'slBet', slJpPaint); $('slBet').addEventListener('input', slJpPaint);
  }
  slJpPaint(); socket.emit('sl-hash', { roomCode: S.code });
}
function slJpPaint() {
  const u = parseInt($('slBet').value) || 0, J = SL.jp;
  $('slJp').innerHTML = [['mini', 'j1'], ['minor', 'j2'], ['major', 'j3'], ['grand', 'j4']].map(([k, c]) => `<div class="${c}" id="slJp_${k}">${SL_JPN[k]}<b>${fmtN(J[k] * u)} 🪙</b>×${J[k]}</div>`).join('');
}
function slTurboToggle() { SL.turbo = !SL.turbo; $('slTurbo').textContent = '⚡ Turbo : ' + (SL.turbo ? 'oui' : 'non'); }
function slSkip() { SL.skip = true; }
function slBanner(html, ms) { const b = $('slBanner'); b.innerHTML = html; b.classList.add('on'); return slSleep(ms || 1200).then(() => b.classList.remove('on')); }
function slUnlock() { SL.busy = false; SL.playing = false; $('slSpinBtn').disabled = false; slStopSpinAnim(); }

/* ---------- Lancer ---------- */
function slSpin(buy) {
  if (SL.busy) return; const amount = parseInt($('slBet').value) || 0;
  if (amount <= 0) return alert('Entre une mise valide !');
  startAudio(); SL.busy = true; SL.got = false; SL.skip = false; SL.unit = amount; SL.t0 = Date.now(); $('slSpinBtn').disabled = true;
  $('slGamble').classList.add('hidden'); SL.active = false; SL.pending = 0; SL.g = 0;
  $('slHud').classList.add('hidden'); $('slWin').className = 'sl-win'; $('slWin').textContent = buy ? '🏮 Bonus acheté…' : 'Les rouleaux tournent… 🌑';
  document.querySelectorAll('#slJp > div').forEach(x => x.classList.remove('on'));
  if (!buy) { sound('dice'); slStartSpinAnim(); }
  socket.emit('sl-spin', { roomCode: S.code, amount, buy: buy || 0 });
  clearTimeout(SL.wd); SL.wd = setTimeout(() => { if (!SL.got) { slUnlock(); $('slWin').textContent = 'Pas de réponse du serveur, réessaie.'; } }, 9000);
}
function slStartSpinAnim() {
  SL.reel = [true, true, true, true, true]; SL.cells.forEach(el => { el.className = 'sc spin'; });
  clearInterval(SL.spinTimer);
  SL.spinTimer = setInterval(() => SL.cells.forEach((el, i) => { if (SL.reel[Math.floor(i / 3)]) el.innerHTML = slSym(slRand()); }), 85);
}
function slStopSpinAnim() { clearInterval(SL.spinTimer); SL.spinTimer = null; SL.reel = [false, false, false, false, false]; }

/* ---------- Résultat ---------- */
socket.on('sl-result', d => { SL.got = true; clearTimeout(SL.wd); slPlay(d); });
socket.on('error-message', () => { if (SL.busy && !SL.got) { slUnlock(); $('slWin').textContent = ''; } });
async function slPlay(d) {
  SL.playing = true; SL.res = d; SL.unit = d.unit; slJpPaint();
  $('slProof').textContent = 'Hash de ce tour (engagé avant de jouer) : ' + d.hash + ' — la graine sera révélée à la fin du tour.';
  $('slSkip').classList.remove('hidden');
  if (d.buy) { await slBanner(`🏮 BONUS ACHETÉ<small>${esc(SL.buy[d.buy].n)}</small>`, 1400); await slBonus(d); }
  else {
    await slStopReels(d);
    if (d.topup != null) {
      await slBanner('Il m’en manque une…<small>le loup souffle…</small>', 1200); slSetCell(d.topup, 10); SL.cells[d.topup].classList.add('glow'); sound('coin'); await slSleep(900);
    }
    slHighlight(d);
    if (d.base > 0) { $('slWin').className = 'sl-win big'; $('slWin').textContent = '✨ ' + fmtN(Math.round(d.base * d.unit)) + ' 🪙'; sound('win'); await slSleep(d.bonus ? 1300 : 300); }
    if (d.bonus) await slBonus(d);
  }
  slEndRound(d);
}
async function slStopReels(d) {
  const wait0 = Math.max(0, 600 - (Date.now() - SL.t0)); if (wait0 && !SL.skip) await new Promise(r => setTimeout(r, SL.turbo ? wait0 * .3 : wait0));
  const lantEarly = [0, 1, 2].reduce((a, r) => a + [0, 1, 2].filter(k => d.grid[r * 3 + k] === 10).length, 0);
  for (let r = 0; r < 5; r++) {
    // suspense : déjà 3 lanternes ou plus sur les 3 premiers rouleaux → les deux derniers ralentissent
    const slow = r >= 3 && lantEarly >= 3 && !SL.skip;
    if (r > 0) await slSleep(slow ? 900 : 260);
    if (slow) SL.cells.forEach((el, i) => { if (d.grid[i] === 10 && Math.floor(i / 3) < 3) el.classList.add('glow'); });
    SL.reel[r] = false; for (let k = 0; k < 3; k++) { const i = r * 3 + k; slSetCell(i, d.grid[i]); }
    sound('tick');
    if ([0, 1, 2].some(k => d.grid[r * 3 + k] === 10)) sound('coin');
  }
  slStopSpinAnim(); await slSleep(250);
}
function slHighlight(d) {
  SL.cells.forEach(el => el.classList.remove('hit', 'glow'));
  d.wins.forEach(w => { for (let r = 0; r < w.len; r++) for (let k = 0; k < 3; k++) { const i = r * 3 + k; if (d.grid[i] === w.s || d.grid[i] === 9) SL.cells[i].classList.add('hit'); } });
  if (d.lanterns >= 6) d.grid.forEach((g, i) => { if (g === 10) SL.cells[i].classList.add('glow'); });
}

/* ---------- Le Souffle du Loup (bonus) ---------- */
function slPaintCell(i, lv, pop) {
  const el = SL.cells[i]; el.className = 'sc ' + (lv ? 'l' + lv : 'plot'); el.innerHTML = lv ? `<span class="sy${pop ? ' hs' : ''}">${SL_HOUSE[lv]}</span>` : '<span class="sy" style="opacity:.12;font-size:.5em">·</span>';
}
async function slBonus(d) {
  const B = d.bonus, u = d.unit, lv = B.init.slice();
  SL.cells.forEach(el => el.classList.remove('hit', 'glow'));
  await slBanner(`🏮 ${d.lanterns} LANTERNES !<small>LE SOUFFLE DU LOUP</small>`, 1700); sound('win');
  $('slHud').classList.remove('hidden'); let won = 0; $('slBonusWin').textContent = '0'; $('slLeft').textContent = '6'; $('slHudMid').textContent = '';
  lv.forEach((x, i) => slPaintCell(i, x, true)); await slSleep(900);
  // les tours : des lanternes tombent et améliorent les maisons
  for (const st of B.steps) {
    st.landed.forEach(i => { const dr = document.createElement('div'); dr.className = 'drop'; dr.innerHTML = '<span class="sy">🏮</span>'; SL.cells[i].appendChild(dr); });
    if (st.landed.length) sound('tick'); else $('slHudMid').textContent = 'aucune lanterne…';
    await slSleep(st.landed.length ? 600 : 350);
    SL.cells.forEach(el => el.querySelectorAll('.drop').forEach(x => x.remove()));
    for (const up of st.ups) {
      if (up.redirect != null) { SL.cells[up.redirect].classList.add('red'); await slSleep(250); SL.cells[up.redirect].classList.remove('red'); }
      lv[up.cell] = up.to; slPaintCell(up.cell, up.to, true); SL.cells[up.cell].classList.add('up'); setTimeout(() => SL.cells[up.cell].classList.remove('up'), 650); sound('coin');
    }
    $('slLeft').textContent = st.left; $('slHudMid').textContent = st.landed.length >= 3 ? '🎁 +1 tour !' : st.landed.length ? st.landed.length + ' lanterne' + (st.landed.length > 1 ? 's' : '') : 'aucune lanterne…';
    if (st.landed.length >= 3) sound('win');
    await slSleep(st.ups.length ? 650 : 250);
  }
  $('slHudMid').textContent = '';
  // les hurlements
  for (const bl of B.blows) {
    if (!bl.items.length) continue;
    await slBanner(bl.level === 4 ? '🏰 MANOIR COMPLET !<small>jackpot GRAND offert</small>' : `🐺 HURLEMENT ${bl.level}/3<small>${bl.level === 1 ? 'les tombes' : bl.level === 2 ? 'les cryptes' : 'les manoirs'} s’effondrent</small>`, 1100);
    sound('dice'); bl.items.forEach(it => { if (it.cell >= 0) SL.cells[it.cell].classList.add('blow'); }); await slSleep(650);
    for (const it of bl.items) {
      const coins = Math.round(it.mult * u); won += coins; $('slBonusWin').textContent = fmtN(won);
      const cell = it.cell >= 0 ? SL.cells[it.cell] : null;
      if (cell) { const p = document.createElement('div'); p.className = 'prize' + (it.jp ? ' jp' : ''); p.innerHTML = it.jp ? `${SL_JPN[it.jp]}<small>${fmtN(coins)} 🪙</small>` : `${fmtN(coins)}<small>×${(it.mult).toFixed(2)}</small>`; cell.appendChild(p); }
      if (it.jp) { sound('win'); const j = $('slJp_' + it.jp); if (j) j.classList.add('on'); await slSleep(900); } else { sound('coin'); await slSleep(220); }
    }
    await slSleep(500);
  }
  $('slBonusWin').textContent = fmtN(Math.round(B.total * u));
  await slBanner(`TOTAL DU BONUS<small>${fmtN(Math.round(B.total * u))} 🪙</small>`, 1700);
}

/* ---------- Fin du tour, double ou rien, encaissement ---------- */
function slEndRound(d) {
  SL.playing = false; $('slSkip').classList.add('hidden');
  SL.pending = d.payout; SL.active = d.payout > 0; SL.g = 0;
  if (d.payout > 0) {
    $('slWin').className = 'sl-win big'; $('slWin').textContent = `🎉 GAIN : ${fmtN(d.payout)} 🪙 (×${(d.payout / d.cost).toFixed(2)})`; if (d.mult >= 10 || d.buy) sound('win');
    slGambleShow(); document.querySelectorAll('.sc.hit').forEach(x => x.classList.add('hit'));
  } else { $('slWin').className = 'sl-win lose'; $('slWin').textContent = 'Pas de gain… 🌑'; sound('dclose'); }
  SL.busy = false; $('slSpinBtn').disabled = false;
  if (SL.endData) { const e = SL.endData; SL.endData = null; slEnd(e); }
}
function slGambleShow(keepCard) {
  const can = SL.pending > 0 && SL.pending <= SL.unit * 100 && SL.g < 5;
  $('slGamble').classList.remove('hidden'); $('slGpend').textContent = fmtN(SL.pending) + ' 🪙'; $('slGnext').textContent = can ? fmtN(SL.pending * 2) + ' 🪙' : '—';
  $('slGladder').innerHTML = ['×2', '×4', '×8', '×16', '×32'].map((x, i) => `<i class="${i < SL.g ? 'done' : i === SL.g && can ? 'cur' : ''}">${x}</i>`).join('');
  if (!keepCard) { const c = $('slGcard'); c.className = 'slg-card'; c.textContent = '?'; }
  document.querySelectorAll('#slGamble .slg-red,#slGamble .slg-black').forEach(b => { b.disabled = !can; b.style.opacity = can ? 1 : .4; });
  $('slGnote').textContent = SL.g >= 5 ? 'Maximum atteint : encaisse ton gain !' : SL.pending > SL.unit * 100 ? 'Gain trop élevé pour doubler (maximum 100× la mise).' : 'Double ou rien : trouve la couleur de la carte. Le gain en attente est encaissé automatiquement au prochain tour.';
}
function slGamble(color) { if (!SL.active) return; document.querySelectorAll('#slGamble button').forEach(b => { b.disabled = true; }); sound('card'); socket.emit('sl-gamble', { roomCode: S.code, color }); }
function slCollect() { if (!SL.active) return; document.querySelectorAll('#slGamble button').forEach(b => { b.disabled = true; }); socket.emit('sl-collect', { roomCode: S.code }); }
socket.on('sl-gamble-res', d => {
  const c = $('slGcard'), suit = ['♥', '♦', '♠', '♣'][d.suit], rank = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][d.rank];
  c.className = 'slg-card show flip ' + (d.suit < 2 ? 'rd' : 'bk'); c.textContent = rank + suit;
  if (d.ok) { SL.pending = d.pending; SL.g = d.g; sound('win'); $('slWin').textContent = `✅ Bien vu ! Gain en attente : ${fmtN(d.pending)} 🪙`; setTimeout(() => slGambleShow(true), 700); }
  else { sound('dclose'); $('slWin').className = 'sl-win lose'; $('slWin').textContent = '💀 Mauvaise couleur… le gain est perdu.'; }
});
function slEnd(d) {
  SL.active = false; $('slGamble').classList.add('hidden');
  if (d.how === 'collect') { $('slWin').className = 'sl-win big'; $('slWin').textContent = `💰 Encaissé : +${fmtN(d.win)} 🪙`; sound('coin'); }
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

/* ---------- Achat de bonus ---------- */
function slBuyOpen() {
  if (SL.busy) return; const u = parseInt($('slBet').value) || 0; if (u <= 0) return alert('Entre une mise valide !');
  const desc = ['', 'Départ avec 6 tombes 🪦, à améliorer pendant 6 tours', 'Départ avec 6 cryptes 🏚️ (déjà niveau 2) — gros prix assurés', 'Départ avec 6 manoirs 🏰 (niveau maximum) — le jackpot est tout près'];
  $('slBuyModal').innerHTML = `<h4>🏮 Acheter le Souffle du Loup</h4><p>Lance directement le bonus. Prix = multiple de ta mise (${fmtN(u)} 🪙). Même rentabilité (98 %) que le jeu normal.</p>` +
    [1, 2, 3].map(k => { const B = SL.buy[k], cost = B.price * u, ok = S.balance >= cost; return `<button class="slb-o" ${ok ? '' : 'disabled'} onclick="slBuy(${k})"><span class="ic">${SL_HOUSE[k]}</span><span><b>${esc(B.n)}</b><small>${desc[k]}</small></span><span class="pr">${fmtN(cost)} 🪙<small>×${B.price}</small></span></button>`; }).join('') +
    '<button class="sl-x" onclick="slBuyClose()">Annuler</button>';
  $('slBuyBack').classList.remove('hidden');
}
function slBuyClose() { $('slBuyBack').classList.add('hidden'); }
function slBuy(k) { slBuyClose(); slSpin(k); }
Object.assign(window, { slInit, slSpin, slSkip, slTurboToggle, slGamble, slCollect, slBuyOpen, slBuyClose, slBuy });
