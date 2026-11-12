'use strict';
/* ============================================================
   DÉS · HI-LO · PILE OU FACE (résultats calculés par le serveur, équitables prouvables)
   ============================================================ */
const xf = v => 'x' + (v >= 1000 ? Math.round(v).toLocaleString('fr-FR') : (+v).toFixed(2));
function quickBinder(boxId, inputId, after) {
  $(boxId).addEventListener('click', e => {
    const b = e.target.closest('button'), amt = $(inputId); if (!b || amt.disabled) return;
    if (b.dataset.a) amt.value = b.dataset.a;
    else if (b.dataset.f === 'max') amt.value = Math.max(1, Math.floor(S.balance));
    else amt.value = Math.max(1, Math.floor((parseFloat(amt.value) || 0) * b.dataset.f));
    if (after) after();
  });
}
const pfShow = (id, hash) => { $(id).textContent = 'Prochain hash (graine engagée) : ' + hash; };
const pfProofTxt = (g, pr) => `Graine révélée : ${pr.seed} (SHA-256 = ${pr.hash}) — résultat = HMAC-SHA256(graine, "${g}:${pr.n}") ÷ 2^52.`;
socket.on('pf-hash', d => { S.pfHash = d.hash; if (S.dcInited && $('dcProof') && !$('dcProof').textContent) pfShow('dcProof', d.hash); if (S.cfInited && !$('cfProof').textContent) pfShow('cfProof', d.hash); });

/* ---------- Dés ---------- */
function dcState() { const c = Math.max(0.01, Math.min(98, parseFloat($('dcChance').value) || 49.5)); return { chance: Math.round(c * 100) / 100, over: S.dcOver, amount: parseInt($('dcBet').value) || 0 }; }
function dcPaint() {
  const { chance, over, amount } = dcState(), mult = Math.round(0.985 / chance * 100 * 10000) / 10000;
  $('dcUnder').classList.toggle('on', !over); $('dcOver').classList.toggle('on', over);
  const z = $('dcZone'); z.style.left = over ? (100 - chance) + '%' : '0'; z.style.width = chance + '%';
  $('dcMult').textContent = xf(mult); $('dcGain').textContent = Math.floor(amount * mult).toLocaleString('fr-FR') + ' 🪙';
  $('dcCond').textContent = over ? '> ' + ((9999 - Math.round(chance * 100)) / 100).toFixed(2) : '< ' + chance.toFixed(2);
}
function dcInit() {
  if (!S.dcInited) {
    S.dcInited = true; S.dcOver = false;
    $('dcUnder').onclick = () => { S.dcOver = false; dcPaint(); }; $('dcOver').onclick = () => { S.dcOver = true; dcPaint(); };
    $('dcChance').addEventListener('input', () => { $('dcSlider').value = $('dcChance').value; dcPaint(); });
    $('dcSlider').addEventListener('input', () => { $('dcChance').value = $('dcSlider').value; dcPaint(); });
    $('dcBet').addEventListener('input', dcPaint); quickBinder('dcQuick', 'dcBet', dcPaint);
  }
  dcPaint(); socket.emit('pf-hash', { roomCode: S.code });
}
function dcRoll() {
  const st = dcState(); if (!st.amount || st.amount <= 0) return alert('Entre une mise valide !');
  sound('dice'); socket.emit('dc-roll', { roomCode: S.code, amount: st.amount, chance: st.chance, over: st.over });
}
socket.on('dc-result', d => {
  $('dcMark').style.left = d.roll + '%';
  const n = $('dcNum'); n.textContent = d.roll.toFixed(2); n.className = 'dc-num ' + (d.win ? 'win' : 'lose');
  sound(d.win ? 'win' : 'dclose');
  $('dcStatus').textContent = d.win ? `🎉 Gagné ! +${d.net.toLocaleString('fr-FR')} 🪙 (${xf(d.mult)})` : `Perdu : ${d.roll.toFixed(2)} ${d.over ? 'n’est pas > ' : 'n’est pas < '}${d.target.toFixed(2)}`;
  S.dcHist = S.dcHist || []; S.dcHist.unshift({ cls: d.win ? 'cr-win' : 'cr-lose', txt: d.roll.toFixed(2) }); S.dcHist.length = Math.min(S.dcHist.length, 30);
  setH($('dcHist'), S.dcHist.map(h => `<div class="history-pill ${h.cls}">${h.txt}</div>`).join(''));
  $('dcProof').textContent = pfProofTxt('dice', d.proof) + ' Prochain hash : ' + d.nextHash;
});

/* ---------- Pile ou Face ---------- */
function cfPaint() { const a = parseInt($('cfBet').value) || 0; $('cfGain').textContent = Math.floor(a * 1.97).toLocaleString('fr-FR') + ' 🪙'; $('cfPile').classList.toggle('on', S.cfSide === 0); $('cfFace').classList.toggle('on', S.cfSide === 1); }
function cfInit() {
  if (!S.cfInited) {
    S.cfInited = true; S.cfSide = 0; S.cfAngle = 0; S.cfStreak = 0;
    $('cfPile').onclick = () => { S.cfSide = 0; cfPaint(); }; $('cfFace').onclick = () => { S.cfSide = 1; cfPaint(); };
    $('cfBet').addEventListener('input', cfPaint); quickBinder('cfQuick', 'cfBet', cfPaint);
  }
  cfPaint(); socket.emit('pf-hash', { roomCode: S.code });
}
function cfFlip() {
  const a = parseInt($('cfBet').value); if (!a || a <= 0) return alert('Entre une mise valide !');
  sound('coin'); socket.emit('cf-flip', { roomCode: S.code, amount: a, side: S.cfSide });
}
socket.on('cf-result', d => {
  const cur = ((S.cfAngle % 360) + 360) % 360, target = d.coin === 1 ? 180 : 0;
  S.cfAngle += 360 * 4 + ((target - cur) + 360) % 360; // tours supplémentaires, toujours dans le même sens
  $('cfCoin').style.transform = `rotateY(${S.cfAngle}deg)`;
  setTimeout(() => {
    sound(d.win ? 'win' : 'dclose');
    S.cfStreak = d.win ? S.cfStreak + 1 : 0; $('cfStreak').textContent = S.cfStreak;
    $('cfStatus').textContent = d.win ? `🎉 ${d.coin === 1 ? 'Face' : 'Pile'} ! +${d.net.toLocaleString('fr-FR')} 🪙` : `${d.coin === 1 ? 'Face' : 'Pile'} : perdu.`;
    S.cfHist = S.cfHist || []; S.cfHist.unshift({ cls: d.win ? 'cr-win' : 'cr-lose', txt: d.coin === 1 ? '👑' : '€' }); S.cfHist.length = Math.min(S.cfHist.length, 30);
    setH($('cfHist'), S.cfHist.map(h => `<div class="history-pill ${h.cls}">${h.txt}</div>`).join(''));
    $('cfProof').textContent = pfProofTxt('coin', d.proof) + ' Prochain hash : ' + d.nextHash;
  }, 1000);
});

/* ---------- Hi-Lo ---------- */
const HL_R = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], HL_S = ['♠', '♥', '♦', '♣'];
const hlRed = c => c.s === 1 || c.s === 2;
const hlCardHtml = c => `<div class="pcard${hlRed(c) ? ' red' : ''}"><div class="c1">${HL_R[c.r]}<i>${HL_S[c.s]}</i></div><div class="big">${HL_S[c.s]}</div><div class="c2">${HL_R[c.r]}<i>${HL_S[c.s]}</i></div></div>`;
function hlPaint() {
  const st = S.hlState, active = !!(st && st.active);
  $('hlBet').disabled = active; $('hlStartBtn').classList.toggle('hidden', active);
  $('hlBtns').style.display = active ? 'grid' : 'none'; $('hlSkip').style.display = active ? 'block' : 'none';
  $('hlCashBtn').classList.toggle('hidden', !(active && st.steps > 0));
  if (active) {
    $('hlMult').textContent = st.steps ? xf(st.mult) : '—'; $('hlSteps').textContent = st.steps;
    $('hlGain').textContent = st.steps ? Math.floor(st.bet * st.mult).toLocaleString('fr-FR') + ' 🪙' : '0 🪙';
    $('hlHi').disabled = !(st.nextHi); $('hlLo').disabled = !(st.nextLo);
    $('hlHiS').textContent = st.nextHi ? `${xf(st.nextHi)} · ${Math.round(st.pHi * 100)} %` : 'impossible';
    $('hlLoS').textContent = st.nextLo ? `${xf(st.nextLo)} · ${Math.round(st.pLo * 100)} %` : 'impossible';
    if (st.steps) $('hlCashBtn').textContent = 'ENCAISSER ' + Math.floor(st.bet * st.mult).toLocaleString('fr-FR') + ' 🪙 (' + xf(st.mult) + ')';
  }
}
function hlInit() {
  if (!S.hlInited) {
    S.hlInited = true; S.hlTrail = [];
    quickBinder('hlQuick', 'hlBet');
    $('hlHi').onclick = () => hlGuess('hi'); $('hlLo').onclick = () => hlGuess('lo');
    $('hlSkip').onclick = () => { if (S.hlState && S.hlState.active && !S.hlWait) { sound('card'); socket.emit('hl-skip', { roomCode: S.code }); } };
  }
  hlPaint();
  const me = S.me; if (me && me.hl && me.hl.active && !(S.hlState && S.hlState.active)) socket.emit('hl-state', { roomCode: S.code });
}
function hlStart() {
  const a = parseInt($('hlBet').value); if (!a || a <= 0) return alert('Entre une mise valide !');
  if (S.hlWait) return; S.hlWait = true; setTimeout(() => { S.hlWait = false; }, 1500); sound('bet'); S.hlBet = a; $('hlProof').textContent = '';
  socket.emit('hl-start', { roomCode: S.code, amount: a });
}
function hlGuess(dir) { const st = S.hlState; if (!st || !st.active || S.hlWait) return; S.hlWait = true; setTimeout(() => { S.hlWait = false; }, 1500); socket.emit('hl-guess', { roomCode: S.code, dir }); }
const hlCash = () => { const st = S.hlState; if (st && st.active && st.steps && !S.hlWait) { S.hlWait = true; socket.emit('hl-cashout', { roomCode: S.code }); } };
function hlShowCard(c) { $('hlTable').innerHTML = hlCardHtml(c); }
function hlTrailAdd(c) { S.hlTrail.push(c); if (S.hlTrail.length > 10) S.hlTrail.shift(); setH($('hlTrail'), S.hlTrail.map(x => `<span class="hl-mini${hlRed(x) ? ' red' : ''}">${HL_R[x.r]}${HL_S[x.s]}</span>`).join('')); }
socket.on('hl-started', d => {
  S.hlWait = false; if (!d.resume) S.hlTrail = [];
  S.hlState = { active: true, bet: d.bet || S.hlBet, steps: d.steps, mult: d.mult, nextHi: d.nextHi, nextLo: d.nextLo, pHi: d.pHi, pLo: d.pLo, card: d.card };
  $('hlProof').textContent = 'Hash SHA-256 de la graine : ' + d.hash; hlShowCard(d.card); hlTrailAdd(d.card);
  $('hlStatus').textContent = 'Plus haut ou plus bas ? Tu peux aussi passer la carte gratuitement.'; hlPaint();
});
socket.on('hl-result', d => {
  S.hlWait = false; const st = S.hlState; if (!st) return;
  if (d.seed) $('hlProof').textContent = `Graine révélée : ${d.seed} — carte n = rang ⌊HMAC-SHA256(graine, "hilo:n") × 13⌋ (0 = As … 12 = Roi).`;
  if (d.skip) { sound('card'); Object.assign(st, { card: d.card, nextHi: d.nextHi, nextLo: d.nextLo, pHi: d.pHi, pLo: d.pLo }); hlShowCard(d.card); hlTrailAdd(d.card); hlPaint(); return; }
  if (d.cashout) { st.active = false; sound('win'); hlShowCard(d.card); $('hlStatus').textContent = d.message; hlPaint(); return; }
  if (!d.win) { st.active = false; sound('mnboom'); hlShowCard(d.card); hlTrailAdd(d.card); $('hlStatus').textContent = d.message; hlPaint(); return; }
  sound('mngem'); Object.assign(st, { steps: d.steps, mult: d.mult, nextHi: d.nextHi, nextLo: d.nextLo, pHi: d.pHi, pLo: d.pLo, card: d.card });
  hlShowCard(d.card); hlTrailAdd(d.card); $('hlStatus').textContent = `✅ Bien vu ! ${xf(d.mult)} — continue ou encaisse.`; hlPaint();
});

/* ============================================================
   PANNEAU ADMIN SECRET — tout est vérifié côté serveur ; sans le bon code, ce panneau ne reçoit jamais aucune donnée.
   ============================================================ */
function admToggle() { const p = $('admPanel'); const open = p.style.display !== 'block'; p.style.display = open ? 'block' : 'none'; if (open) { if (S.isAdmin) admRefresh(); else $('admCode').focus(); } }
function admUnlock() { socket.emit('admin-unlock', { code: $('admCode').value }); $('admCode').value = ''; }
function admRefresh() { if (S.isAdmin && $('admPanel').style.display === 'block') socket.emit('admin-list', { roomCode: S.code }); }
function admGive(name, amount) { amount = Math.round(Number(amount)); if (!Number.isFinite(amount) || !amount) return; socket.emit('admin-give', { roomCode: S.code, name, amount }); const i = document.querySelector(`#admPanel input[data-give="${CSS.escape(name)}"]`); if (i) { i.value = ''; i.placeholder = (amount > 0 ? '+' : '') + amount + ' ✓'; setTimeout(() => { i.placeholder = 'jetons 🪙'; }, 1500); } }
function admSet(name, pct) { socket.emit('admin-set', { roomCode: S.code, name, pct }); }
socket.on('admin-state', d => {
  S.isAdmin = !!d.ok; if (d.ok) { $('whoami').innerHTML = nm(S.myName || ''); $('admGear').classList.add('adm-on'); if (S.code) $('admGear').style.display = 'block'; }
  $('admLock').style.display = d.ok ? 'none' : 'block'; $('admBody').style.display = d.ok ? 'block' : 'none';
  $('admErr').textContent = d.ok ? '' : d.locked ? 'Trop d\'essais, attends 1 min.' : 'Code incorrect.';
  if (d.ok) admRefresh();
});
// Rendu "clé par joueur" : on ne reconstruit jamais une ligne qu'on est en train d'éditer (c'était le bug qui effaçait ce que tu tapais)
socket.on('admin-players', list => {
  const body = $('admBody');
  if (!body.querySelector('#admHead')) body.innerHTML = '<div id="admHead" style="margin-bottom:6px;color:#a78bfa;font-size:13px">🎭 % du bénéfice touché à chaque victoire (100 = normal, sans limite). Tape un nombre puis OK ou Entrée. Ligne « jetons » : ajoute des jetons en silence (négatif = retire).</div><div id="admAll"></div><div id="admRows"></div>';
  const btns = n => `<button class="adm-q" data-act="set" data-n="${esc(n)}" data-v="0">0</button><button class="adm-q" data-act="set" data-n="${esc(n)}" data-v="100">100</button><button class="adm-q" data-act="div" data-n="${esc(n)}">÷2</button><button class="adm-q dbl" data-act="mul" data-n="${esc(n)}">×2</button>`;
  const card = (n, label) => `<div class="adm-card" data-card="${esc(n)}"><div class="adm-head"><b>${label}</b><small class="adm-info"></small></div><div class="adm-ctl"><input type="number" min="0" step="any" inputmode="decimal" data-name="${esc(n)}" placeholder="%"><button class="adm-q ok" data-act="ok" data-n="${esc(n)}">OK</button>${btns(n)}</div><div class="adm-ctl" style="margin-top:8px"><input type="number" step="1" inputmode="numeric" data-give="${esc(n)}" placeholder="jetons 🪙"><button class="adm-q ok" data-act="give" data-n="${esc(n)}">OK</button>${[100, 500, 1000, 5000, 10000].map(v => `<button class="adm-q" data-act="fill" data-n="${esc(n)}" data-v="${v}">${v >= 1000 ? v / 1000 + 'k' : v}</button>`).join('')}</div></div>`;
  if (!$('admAll').firstChild) $('admAll').innerHTML = card('*', 'Tout le monde');
  const rows = $('admRows'), seen = new Set();
  list.forEach(p => {
    seen.add(p.name);
    let c = [...rows.children].find(x => x.dataset.card === p.name);
    if (!c) { rows.insertAdjacentHTML('beforeend', card(p.name, esc(p.name))); c = rows.lastElementChild; }
    c.dataset.pct = p.pct;
    c.querySelector('.adm-info').textContent = `${p.balance} 🪙 · ${p.profit >= 0 ? '+' : ''}${p.profit} · ${p.games} parties · actuel ${p.pct}%`;
    const inp = c.querySelector('input');
    if (document.activeElement !== inp && !inp.dataset.dirty) inp.value = p.pct; // jamais écrasé pendant que tu tapes
  });
  [...rows.children].forEach(c => { if (!seen.has(c.dataset.card)) c.remove(); });
});
const admApply = (n, v) => { v = Number(v); if (!Number.isFinite(v) || v < 0) return; admSet(n, v); const i = document.querySelector(`#admPanel input[data-name="${CSS.escape(n)}"]`); if (i) { i.dataset.dirty = ''; if (n !== '*') i.value = v; } };
$('admPanel').addEventListener('input', e => { const i = e.target.closest('input[data-name]'); if (i) i.dataset.dirty = '1'; });
$('admPanel').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const i = e.target.closest('input[data-name]'), g = e.target.closest('input[data-give]'); if (i) admApply(i.dataset.name, i.value); else if (g) admGive(g.dataset.give, g.value); });
$('admPanel').addEventListener('click', e => {
  const b = e.target.closest('.adm-q'); if (!b) return;
  const n = b.dataset.n, card = b.closest('.adm-card'), inp = card.querySelector('input[data-name]'), gv = card.querySelector('input[data-give]');
  if (b.dataset.act === 'give') return admGive(n, gv.value);
  if (b.dataset.act === 'fill') { gv.value = (parseFloat(gv.value) || 0) + +b.dataset.v; return gv.focus(); }
  const cur = n === '*' ? (parseFloat(inp.value) || 100) : (parseFloat(inp.value) || +card.dataset.pct || 0);
  if (b.dataset.act === 'ok') admApply(n, inp.value);
  else if (b.dataset.act === 'set') { inp.value = b.dataset.v; admApply(n, b.dataset.v); }
  else if (b.dataset.act === 'mul') { const v = Math.round((cur === 0 ? 100 : cur) * 2 * 100) / 100; inp.value = v; admApply(n, v); }
  else if (b.dataset.act === 'div') { const v = Math.round(cur / 2 * 100) / 100; inp.value = v; admApply(n, v); }
});
setInterval(admRefresh, 2500);

/* ============================================================
   PLINKO 🔴 — 8 à 16 rangées, 4 risques (Faible / Moyen / Élevé / ULTRA), jusqu'à 20 billes par lancer.
   Le serveur tire le chemin de chaque bille (graine HMAC, vérifiable) et l'envoie ; ici on ne fait que l'animer.
   Tables de multiplicateurs : /plinko-tables.js (partagé avec le serveur, RTP exact 98,5 %).
   ============================================================ */
const PKT = window.PlinkoTables;
const PK_NAMES = { low: 'Faible', medium: 'Moyen', high: 'Élevé', ultra: 'ULTRA' };
const pkLabel = m => m >= 10000 ? Math.round(m / 1000) + 'k' : m >= 1000 ? (m / 1000).toFixed(1).replace('.0', '') + 'k' : m >= 100 ? String(Math.round(m)) : m >= 10 ? m.toFixed(1).replace('.0', '') : m.toFixed(2).replace(/\.?0+$/, '');
const pkColor = m => { const t = Math.max(0, Math.min(1, (Math.log10(Math.max(m, .1)) + 1) / 4.2)); return `hsl(${Math.round(58 - 58 * t)} 92% ${Math.round(54 - 8 * t)}%)`; };
const pkGeo = n => { const W = 680, dx = Math.min(44, (W - 24) / (n + 2)), dy = Math.min(32, 470 / n), top = 26, slotH = 30, slotY = top + (n - 1) * dy + 36;
  return { W, H: Math.round(slotY + slotH + 14), dx, dy, top, n, cx: W / 2, slotY, slotH, pr: Math.max(2.6, dx * .085), br: Math.max(4.4, dx * .16) }; };
const pkX = (g, r, k) => g.cx + (k - r / 2) * g.dx; // x du piton frappé à la rangée r par une bille qui a fait k "droite"
let pkLastSnd = 0;
const pkSnd = (name, note) => { const t = performance.now(); if (t - pkLastSnd < 16 && name === 'pkpeg') return; pkLastSnd = t; S.pkNote = note == null ? Math.random() : note; sound(name); };

function pkDrawStatic() {
  const n = S.pkRows, g = S.pkGeo = pkGeo(n), mults = PKT.multipliers(n, S.pkRisk), cv = $('pkCanvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = g.W * dpr; cv.height = g.H * dpr; cv.style.aspectRatio = g.W + ' / ' + g.H;
  const off = S.pkStatic = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
  const c = off.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let r = 0; r < n; r++) for (let j = 0; j < r + 3; j++) {
    const x = g.cx + (j - (r + 2) / 2) * g.dx, y = g.top + r * g.dy;
    c.beginPath(); c.arc(x, y, g.pr, 0, 7); c.fillStyle = '#dbe4ff'; c.shadowColor = 'rgba(160,190,255,.7)'; c.shadowBlur = 5; c.fill();
  }
  c.shadowBlur = 0;
  const sw = g.dx - 3;
  mults.forEach((m, k) => {
    const x = g.cx + (k - n / 2) * g.dx - sw / 2, y = g.slotY;
    c.fillStyle = pkColor(m); c.beginPath(); c.roundRect(x, y, sw, g.slotH, 6); c.fill();
    c.fillStyle = 'rgba(0,0,0,.78)'; c.font = `800 ${Math.max(8, Math.min(12, sw * .34))}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(pkLabel(m), x + sw / 2, y + g.slotH / 2 + 1);
  });
  S.pkMults = mults; S.pkPegHit = {}; S.pkFlash = {};
  pkPaintFrame(performance.now());
}
function pkPaintFrame(now) {
  const cv = $('pkCanvas'), g = S.pkGeo; if (!cv || !g || !S.pkStatic) return;
  const c = cv.getContext('2d'), dpr = cv.width / g.W; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, g.W, g.H); c.drawImage(S.pkStatic, 0, 0, g.W, g.H);
  for (const key in S.pkPegHit) { // éclat des pitons touchés
    const age = now - S.pkPegHit[key]; if (age > 350) { delete S.pkPegHit[key]; continue; }
    const [r, j] = key.split(',').map(Number), x = g.cx + (j - (r + 2) / 2) * g.dx, y = g.top + r * g.dy, a = 1 - age / 350;
    c.beginPath(); c.arc(x, y, g.pr + 3 + 5 * (1 - a), 0, 7); c.fillStyle = `rgba(255,255,255,${(.45 * a).toFixed(2)})`; c.fill();
  }
  for (const k in S.pkFlash) { // case qui s'illumine quand une bille y tombe
    const age = now - S.pkFlash[k], a = 1 - age / 520; if (a <= 0) { delete S.pkFlash[k]; continue; }
    const sw = g.dx - 3, x = g.cx + (k - g.n / 2) * g.dx - sw / 2;
    c.fillStyle = `rgba(255,255,255,${(.55 * a).toFixed(2)})`; c.beginPath(); c.roundRect(x, g.slotY + 3 * a, sw, g.slotH, 6); c.fill();
  }
  const pops = S.pkPops || [];
  for (let i = pops.length - 1; i >= 0; i--) { // multiplicateur qui s'envole au-dessus de la case
    const p = pops[i], age = now - p.t; if (age > 800) { pops.splice(i, 1); continue; }
    c.globalAlpha = 1 - age / 800; c.fillStyle = p.col; c.font = '800 15px system-ui,sans-serif'; c.textAlign = 'center'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 3;
    c.strokeText(p.txt, p.x, p.y - age * .05); c.fillText(p.txt, p.x, p.y - age * .05); c.globalAlpha = 1;
  }
  for (const b of S.pkBalls || []) { // billes
    if (b.pos && b.vis) { const gr = c.createRadialGradient(b.pos.x - g.br * .35, b.pos.y - g.br * .35, 1, b.pos.x, b.pos.y, g.br);
      gr.addColorStop(0, '#fff'); gr.addColorStop(.35, b.col); gr.addColorStop(1, '#7a0f2a'); c.beginPath(); c.arc(b.pos.x, b.pos.y, g.br, 0, 7); c.fillStyle = gr; c.shadowColor = b.col; c.shadowBlur = 8; c.fill(); c.shadowBlur = 0; }
  }
}
function pkBallPos(b, now) { // position de la bille (ou null) + événements (touche un piton / tombe dans une case)
  const el = now - b.t0; if (el < 0) return null;
  const g = b.g, n = g.n, st = b.step, seg = Math.floor(el / st), u = (el - seg * st) / st;
  b.vis = b.n === S.pkRows && b.risk === S.pkRisk; // si tu changes de plateau, les billes déjà lâchées continuent "hors écran" (historique compris)
  const kBefore = i => { let k = 0; for (let q = 0; q < i; q++) k += +b.bits[q]; return k; };
  const C = i => ({ x: pkX(g, i, kBefore(i)), y: g.top + i * g.dy - g.pr - g.br + 1 });
  while (b.ev < Math.min(seg, n + 1)) { // seg = nombre de contacts déjà faits
    const i = b.ev; // contact n°i : piton de la rangée i (i < n) ou case d'arrivée (i == n)
    if (i < n) { if (b.vis) { const k = kBefore(i); S.pkPegHit[i + ',' + (k + 1)] = now; pkSnd('pkpeg'); } }
    else { b.done = true; pkLanded(b, now); }
    b.ev++;
  }
  if (seg > n) return null; // arrivée : la bille disparaît dans la case
  let a, z, hop = 0;
  if (seg === 0) { a = { x: g.cx, y: g.top - g.dy * 1.4 }; z = C(0); }
  else if (seg < n) { a = C(seg - 1); z = C(seg); hop = g.dy * .42; }
  else { a = C(n - 1); z = { x: g.cx + (b.slot - n / 2) * g.dx, y: g.slotY + g.slotH * .45 }; }
  const e = seg === 0 || seg === n ? u * u : u; // 1re chute et plongeon final : accélèrent ; entre les pitons : rebond
  const xe = seg > 0 && seg < n ? (1 - Math.cos(Math.PI * u)) / 2 : u;
  return { x: a.x + (z.x - a.x) * xe, y: a.y + (z.y - a.y) * e - hop * 4 * u * (1 - u) * (seg > 0 && seg < n ? 1 : 0) };
}
function pkLanded(b, now) { // UNE bille est arrivée : case qui s'allume, multiplicateur, ligne d'historique rien que pour elle
  const g = b.g, net = b.win - b.unit;
  if (b.vis) {
    S.pkFlash[b.slot] = now; (S.pkPops = S.pkPops || []).push({ x: g.cx + (b.slot - g.n / 2) * g.dx, y: g.slotY - 4, t: now, txt: '×' + pkLabel(b.mult), col: pkColor(b.mult) });
  }
  pkSnd('pkland', Math.min(1, Math.max(0, (Math.log10(Math.max(b.mult, .1)) + 1) / 4.2))); if (b.mult >= 10) sound('win');
  S.pkHist = S.pkHist || []; S.pkHist.unshift({ cls: b.win >= b.unit ? 'cr-win' : 'cr-lose', txt: '×' + pkLabel(b.mult) }); S.pkHist.length = Math.min(S.pkHist.length, 40);
  setH($('pkHist'), S.pkHist.map(h => `<div class="history-pill ${h.cls}">${h.txt}</div>`).join(''));
  $('pkStatus').textContent = `Bille : ×${pkLabel(b.mult)} → ${net > 0 ? '+' : ''}${net} 🪙`;
}
function pkLoop(now) {
  if (S.view !== 'pk') { S.pkBalls.filter(b => !b.done).forEach(b => { b.done = true; b.vis = false; pkLanded(b, now); }); S.pkBalls = []; S.pkRun = false; return; } // tu quittes l'écran : les billes en vol sont comptées d'un coup
  for (const b of S.pkBalls) b.pos = pkBallPos(b, now);
  pkPaintFrame(now);
  S.pkBalls = S.pkBalls.filter(b => !b.done);
  if (S.pkBalls.length || Object.keys(S.pkFlash).length || (S.pkPops || []).length || Object.keys(S.pkPegHit).length) requestAnimationFrame(pkLoop); else S.pkRun = false;
}
function pkLaunch(d) {
  const now = performance.now(), g = pkGeo(d.rows); S.pkBalls = S.pkBalls || [];
  d.paths.forEach((bits, j) => S.pkBalls.push({ bits, slot: d.slots[j], mult: d.mults[j], win: d.wins[j], unit: d.unit, n: d.rows, risk: d.risk, g, t0: now + 60 + j * d.stagger, step: d.step, ev: 0, done: false, vis: true, col: ['#ff4d6d', '#ffb703', '#4cc9f0', '#80ed99', '#c77dff'][j % 5], pos: null }));
  if (!S.pkRun) { S.pkRun = true; requestAnimationFrame(pkLoop); }
}
const pkBallsVal = () => Math.max(1, Math.min(20, parseInt($('pkBalls').value) || 1));
function pkTotal() {
  const amt = parseInt($('pkBetAmount').value) || 0, n = pkBallsVal();
  $('pkTotal').textContent = amt > 0 ? `Mise totale : ${(amt * n).toLocaleString('fr-FR')} 🪙 (${n} bille${n > 1 ? 's' : ''} × ${amt.toLocaleString('fr-FR')})` : 'Mise totale : —';
}
function pkPaint() { // jamais de bouton bloqué : on peut relancer des billes à tout moment
  document.querySelectorAll('#pkRisks .cr-mode').forEach(b => { b.classList.toggle('on', b.dataset.r === S.pkRisk); b.querySelector('small').textContent = 'max ×' + pkLabel(PKT.multipliers(S.pkRows, b.dataset.r)[0]); });
  pkTotal();
}
function pkSetRows(v, force) {
  v = Math.max(PKT.MIN_ROWS, Math.min(PKT.MAX_ROWS, v | 0)); if (v === S.pkRows && !force) return;
  S.pkRows = v; $('pkRows').value = v; pkDrawStatic(); pkPaint();
}
function pkInit() {
  if (!S.pkInited) {
    S.pkInited = true; S.pkRows = 12; S.pkRisk = 'medium'; S.pkBalls = [];
    $('pkRisks').innerHTML = PKT.RISKS.map(r => `<button class="cr-mode${r === 'ultra' ? ' pk-ultra' : ''}" data-r="${r}">${PK_NAMES[r]}<small></small></button>`).join('');
    $('pkRisks').addEventListener('click', e => { const b = e.target.closest('.cr-mode'); if (!b) return; S.pkRisk = b.dataset.r; pkDrawStatic(); pkPaint(); });
    $('pkRowsMinus').onclick = () => pkSetRows(S.pkRows - 1); $('pkRowsPlus').onclick = () => pkSetRows(S.pkRows + 1);
    $('pkRows').addEventListener('change', () => pkSetRows(parseInt($('pkRows').value) || 12, true));
    $('pkRowQuick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) pkSetRows(+b.dataset.n); });
    $('pkBallQuick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { $('pkBalls').value = b.dataset.n; pkTotal(); } });
    $('pkBalls').addEventListener('input', pkTotal); $('pkBetAmount').addEventListener('input', pkTotal);
    $('pkQuick').addEventListener('click', e => {
      const b = e.target.closest('button'), amt = $('pkBetAmount'); if (!b) return;
      if (b.dataset.a) amt.value = b.dataset.a;
      else if (b.dataset.f === 'max') amt.value = Math.max(1, Math.floor(S.balance / pkBallsVal()));
      else amt.value = Math.max(1, Math.floor((parseFloat(amt.value) || 0) * b.dataset.f));
      pkTotal();
    });
  }
  pkSetRows(S.pkRows, true); pkPaint();
}
function pkStart() { // aucun cooldown : tu peux spammer, même avec 20 billes déjà en l'air
  const amount = parseInt($('pkBetAmount').value), balls = pkBallsVal();
  if (!amount || amount <= 0) return alert('Entre une mise valide !');
  sound('bet'); $('pkBalls').value = balls;
  socket.emit('pk-start', { roomCode: S.code, amount, rows: S.pkRows, risk: S.pkRisk, balls });
}
socket.on('pk-started', d => {
  $('pkProof').textContent = 'Hash SHA-256 de la graine : ' + d.hash;
  pkLaunch(d); sound('pkdrop');
});
socket.on('pk-result', d => { // dernière bille d'un lancer arrivée : la graine est révélée
  $('pkProof').textContent = `Graine révélée : ${d.seed} — SHA-256(graine) = hash du lancer ; bille j, rangée i : bit = 1er chiffre hexa de HMAC-SHA256(graine, "plinko:j:i") modulo 2 (1 = droite). Cases : ${d.slots.join(', ')}.`;
});
