'use strict';
/* ---------- Icefield : le Yéti traverse de gauche à droite ---------- */
const ICE_STEPS = 8;
const calcMult = (cols, step) => parseFloat((0.985 / Math.pow((cols - 1) / cols, step)).toFixed(2)); // mêmes formules que le serveur (RTP 98,5 %)
const CRACK = '<svg class="crack" viewBox="0 0 60 44" preserveAspectRatio="none"><path pathLength="1" d="M30 22L18 8M30 22L44 5M30 22L9 31M30 22L51 37M18 8L8 11M44 5L53 14M9 31L5 41M51 37L56 42"/></svg>';
const wait = ms => new Promise(r => setTimeout(r, ms));
const ctr = el => { const b = $('iceBoard').getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 }; };
const at = p => `translate(${(p.x - 23).toFixed(1)}px,${(p.y - 40).toFixed(1)}px)`;
const place = p => { $('yeti').style.transform = at(p); S.yetiPos = p; };
function toast(msg) { const t = $('iceToast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); }

function buildIce(lanes) {
  const b = $('iceBoard'); S.iceLanes = lanes;
  b.querySelectorAll('.ice-cell, .ice-tile, .ice-mult, .ice-bank').forEach(e => e.remove()); // updateIce réécrit className des tuiles (perd 'ice-cell') : on cible aussi .ice-tile, sinon les anciennes rangées restent en fantômes
  b.style.gridTemplateColumns = `56px repeat(${ICE_STEPS},minmax(0,1fr)) 56px`;
  // ⚠️ Le plateau est une grille CSS dont les LIGNES sont auto-calibrées par le navigateur :
  // quand on diminue le nombre de rangées, d'anciennes lignes invisibles persistent et les nouvelles
  // tuiles se placent trop bas → "fantômes" sous le plateau. On épingle donc explicitement la hauteur
  // des lignes (42px par rangée + l'en-tête des multiplicateurs) pour que le board soit toujours pile à jour.
  b.style.gridTemplateRows = `auto repeat(${lanes},42px)`;
  const mk = (cls, html, col, row, span) => {
    const d = document.createElement('div'); d.className = 'ice-cell ' + cls; d.innerHTML = html;
    d.style.gridColumn = col; d.style.gridRow = span ? `${row} / span ${span}` : row; b.appendChild(d); return d;
  };
  S.iceBank = mk('ice-bank', '🏔️', 1, 2, lanes); S.iceGoal = mk('ice-bank', '🏁', ICE_STEPS + 2, 2, lanes);
  S.iceMults = []; S.iceTiles = [];
  for (let c = 0; c < ICE_STEPS; c++) {
    S.iceMults.push(mk('ice-mult', 'x' + calcMult(lanes, c + 1), c + 2, 1));
    S.iceTiles.push([]);
    for (let r = 0; r < lanes; r++) {
      const t = mk('ice-tile dim', CRACK, c + 2, r + 2); t.onclick = () => iceClick(c, r); S.iceTiles[c].push(t);
    }
  }
}

function updateIce() {
  if ($('icefield-screen').classList.contains('hidden') || S.icePending > 0 || S.iceWait) return;
  const inp = Math.min(10, Math.max(2, parseInt($('iceColsInput').value) || 3));
  let st = S.iceState; if (st && !st.active && st.cols !== inp) st = null; // board vierge si on change le nombre de blocs
  const lanes = st ? st.cols : inp;
  if (S.iceLanes !== lanes) buildIce(lanes);
  const step = st ? st.currentStep : 0, active = !!(st && st.active), path = st ? st.path : [], traps = st ? st.revealedTraps : [];
  const lost = !!(st && st.lost), over = !!st && !active; // over = traversée terminée (perdue, encaissée ou finie)
  S.iceTiles.forEach((col, c) => col.forEach((t, r) => {
    let k = 'dim';
    if (c < step || (lost && c === step)) k = path[c] === r ? 'stepped' : traps[c] === r ? 'hole' : 'used';
    else if (c === step && active) k = 'live';
    else if (over && traps[c] !== undefined && traps[c] === r) { k = 'hole missed'; t.style.animationDelay = ((c - step) * 70) + 'ms'; } // piège non rencontré, dévoilé de gauche à droite
    t.className = 'ice-tile ' + k;
  }));
  S.iceMults.forEach((m, c) => m.classList.toggle('reached', c < step));
  $('yeti').style.opacity = lost ? 0 : 1;
  place(step === 0 || !st ? ctr(S.iceBank) : step >= ICE_STEPS && !active ? ctr(S.iceGoal) : ctr(S.iceTiles[step - 1][path[step - 1]]));
  S.iceCol = active ? step : 0; iceControls();
}

async function jumpTo(el, ms = 230) {
  const y = $('yeti'), from = S.yetiPos || ctr(S.iceBank), to = ctr(el), mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 28 };
  sound('iceJump');
  const a = y.animate([{ transform: at(from) }, { transform: at(mid) + ' scale(.93,1.08)', offset: .5 }, { transform: at(to) + ' scale(1.1,.9)', offset: .92 }, { transform: at(to) }],
                      { duration: ms, easing: 'cubic-bezier(.35,.1,.45,1)', fill: 'forwards' });
  await a.finished; place(to); a.cancel();
}

function shards(p) {
  const b = $('iceBoard');
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('i'), w = 8 + Math.random() * 14;
    s.className = 'shard';
    s.style.cssText = `left:${p.x - w / 2}px;top:${p.y - w / 2}px;width:${w}px;height:${w}px;clip-path:polygon(0 0,100% ${20 + Math.random() * 60}%,${30 + Math.random() * 50}% 100%)`;
    b.appendChild(s);
    s.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${(Math.random() - .5) * 110}px,${30 + Math.random() * 70}px) rotate(${Math.random() * 540}deg)`, opacity: 0 }],
              { duration: 650 + Math.random() * 350, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => s.remove();
  }
  const r = document.createElement('div'); r.className = 'splash'; r.style.left = p.x + 'px'; r.style.top = p.y + 'px'; b.appendChild(r); setTimeout(() => r.remove(), 900);
}


// Aucune attente : le clic part tout de suite au serveur, le Yéti saute déjà, et on peut enchaîner dès que le serveur a confirmé.
// Les animations sont mises en file (chain) et ne bloquent jamais les clics.
const chain = fn => {
  const g = S.iceGen; S.icePending++;
  S.yetiP = S.yetiP.then(() => g === S.iceGen ? fn(g) : null).catch(() => {}).then(() => { if (g === S.iceGen && --S.icePending === 0) updateIce(); });
};
function iceReset() {
  S.iceGen++; S.icePending = 0; S.yetiP = Promise.resolve(); S.iceWait = false; S.icePick = null;
  const y = $('yeti'); if (y.getAnimations) y.getAnimations().forEach(a => a.cancel());
  $('iceToast').classList.remove('show'); $('iceBoard').classList.remove('shake');
}
function iceControls() {
  const st = S.iceState, active = !!(st && st.active), step = S.iceCol, mult = active && step > 0 ? st.multipliers[step - 1] : 0;
  show('iceStartBtn', !active); show('iceCashoutBtn', active && step > 0);
  $('iceCashoutBtn').textContent = mult ? `ENCAISSER ${Math.floor(st.bet * mult)} 🪙` : 'ENCAISSER';
  $('iceColsInput').disabled = $('iceBetAmount').disabled = active;
  $('iceStatusText').textContent = active
    ? (step > 0 ? `Colonne ${step}/${ICE_STEPS} — x${mult} — gain ${Math.floor(st.bet * mult)} 🪙` : 'Choisis un bloc de la première colonne : le Yéti avance vers la droite !')
    : 'Choisis tes blocs et guide le Yéti de gauche à droite !';
}
function iceClick(c, r) {
  const st = S.iceState;
  if (S.iceWait || !st || !st.active || c !== S.iceCol) return;
  const pick = S.icePick = { c, r }, tile = S.iceTiles[c][r];
  S.iceWait = true;
  S.iceTiles[c].forEach(t => { t.className = 'ice-tile dim'; });
  tile.className = 'ice-tile stepping';
  socket.emit('icefield-step', { roomCode: S.code, tileIndex: r });
  chain(() => jumpTo(tile));
  setTimeout(() => { if (S.iceWait && S.icePick === pick) { S.iceWait = false; S.icePick = null; updateIce(); } }, 2500);
}
function startIcefieldGame() {
  const amount = parseInt($('iceBetAmount').value), cols = parseInt($('iceColsInput').value);
  if (!amount || amount <= 0) return alert('Entre une mise valide !');
  if (!(cols >= 2 && cols <= 10)) return alert('Entre 2 et 10 blocs par colonne !');
  iceReset(); // relance immédiate : on coupe les animations de la partie précédente
  sound('bet'); socket.emit('icefield-start-game', { roomCode: S.code, amount, cols });
}
const cashoutIcefield = () => { if (!S.iceWait && S.iceState && S.iceState.active) socket.emit('icefield-cashout', { roomCode: S.code }); };
const onColsChange = () => { if (!S.iceState || !S.iceState.active) updateIce(); };
socket.on('icefield-result', d => {
  S.iceWait = false;
  const end = () => { if (S.iceState) S.iceState.active = false; iceControls(); }; // le bouton "Lancer" revient tout de suite
  if (d.cashout) { end(); return chain(async () => { sound('win'); toast(d.message); }); }
  const p = S.icePick; S.icePick = null; if (!p) return;
  const tile = S.iceTiles[p.c][p.r];
  if (d.success) {
    S.iceCol = p.c + 1;
    if (d.completed) end(); else { S.iceTiles[S.iceCol].forEach(t => { t.className = 'ice-tile live'; }); iceControls(); }
    chain(async g => {
      tile.className = 'ice-tile stepped'; sound('iceStep');
      if (d.completed) { await jumpTo(S.iceGoal); if (g === S.iceGen) { sound('win'); toast(d.message); } }
    });
  } else {
    end();
    chain(async g => {
      const c = ctr(tile), y = $('yeti');
      tile.classList.add('cracking'); sound('iceLose'); await wait(280); if (g !== S.iceGen) return;
      tile.className = 'ice-tile hole'; shards(c); $('iceBoard').classList.add('shake');
      const f = y.animate([{ transform: at(c) }, { transform: at(c) + ' translateY(74px) rotate(28deg) scale(.6)', opacity: 0 }], { duration: 450, easing: 'ease-in', fill: 'forwards' });
      await f.finished; if (g !== S.iceGen) return; y.style.opacity = 0; f.cancel();
      $('iceBoard').classList.remove('shake'); toast(d.message);
    });
  }
});
window.addEventListener('resize', () => updateIce());

/* ---------- Just mixed : 3 gobelets, 2 billes ---------- */
const NS = 'http://www.w3.org/2000/svg', JM_X = [150, 300, 450], JM_Y = 232;
const tween = (ms, fn) => new Promise(res => { const t0 = performance.now(); (function f(now) { const k = Math.min(1, (now - t0) / ms); fn(k); k < 1 ? requestAnimationFrame(f) : res(); })(t0); });
const say = t => { $('jmStatus').textContent = t; };
const inner = id => S.jmCups[id].querySelector('.cup-in');
const setCup = (id, x, y, s = 1) => S.jmCups[id].setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})`);
const ball = i => $('jmB' + i);

function buildJm() {
  $('jmBalls').innerHTML = [0, 1, 2].map(i => `<circle id="jmB${i}" cx="${JM_X[i]}" cy="${JM_Y - 12}" r="13" fill="url(#jmBall)" opacity="0"/>`).join('');
  $('jmCups').innerHTML = [0, 1, 2].map(i => `<g class="cup" id="jmC${i}"><ellipse cx="0" cy="4" rx="42" ry="9" fill="rgba(0,0,0,.38)"/><g class="cup-in">
    <path d="M-37 0L-28 -88Q0 -98 28 -88L37 0Z" fill="url(#jmCup)"/><ellipse cx="0" cy="-90" rx="28" ry="7" fill="#fb7185"/>
    <path d="M-37 0Q0 9 37 0L36 -11Q0 -2 -36 -11Z" fill="url(#jmRim)"/><path d="M-20 -14L-14 -82" stroke="rgba(255,255,255,.45)" stroke-width="6" stroke-linecap="round"/></g></g>`).join('');
  S.jmCups = [0, 1, 2].map(i => $('jmC' + i)); S.jmAt = [0, 1, 2];
  S.jmCups.forEach((g, i) => { setCup(i, JM_X[i], JM_Y); g.onclick = () => jmPick(i); });
}

async function jmSwap(i, j, ms) { // deux gobelets échangent leur place en passant l'un devant l'autre
  const A = S.jmAt[i], B = S.jmAt[j], arc = 26 + Math.abs(i - j) * 12;
  S.jmCups[A].parentNode.appendChild(S.jmCups[A]); sound('slide');
  await tween(ms, k => {
    const e = k * k * (3 - 2 * k), s = Math.sin(Math.PI * e);
    setCup(A, JM_X[i] + (JM_X[j] - JM_X[i]) * e, JM_Y - arc * s, 1 + .1 * s);
    setCup(B, JM_X[j] + (JM_X[i] - JM_X[j]) * e, JM_Y + arc * .45 * s, 1 - .07 * s);
  });
  S.jmAt[i] = B; S.jmAt[j] = A;
}

async function jmRound() {
  S.jmPhase = 'anim'; $('jmSvg').classList.remove('pick'); show('jmStartBtn', false);
  buildJm(); say('Les billes se glissent sous les gobelets...');
  const e0 = Math.floor(Math.random() * 3);
  [0, 1, 2].forEach(i => inner(i).classList.add('lift')); sound('lift'); await wait(650);
  for (const i of [0, 1, 2].filter(x => x !== e0)) {            // 2 billes tombent, 1 emplacement reste vide
    ball(i).setAttribute('opacity', 1); sound('pop');
    await tween(420, k => ball(i).setAttribute('cy', JM_Y - 12 - 150 * (1 - (k < .7 ? (k / .7) ** 2 : 1 - .16 * Math.sin((k - .7) / .3 * Math.PI)))));
    await wait(120);
  }
  await wait(350); [0, 1, 2].forEach(i => inner(i).classList.remove('lift')); sound('tap'); await wait(650);
  [0, 1, 2].forEach(i => ball(i).setAttribute('opacity', 0));
  say('Ça mélange...');
  const n = 14;
  for (let s = 0; s < n; s++) {                                   // le mélange accélère
    const i = Math.floor(Math.random() * 3), j = (i + 1 + Math.floor(Math.random() * 2)) % 3;
    await jmSwap(i, j, 380 - 190 * s / (n - 1));
  }
  say('Choisis un gobelet !'); S.jmPhase = 'pick'; $('jmSvg').classList.add('pick');
}

function jmPick(id) {
  if (S.jmPhase !== 'pick') return;
  S.jmPhase = 'wait'; S.jmPick = id; $('jmSvg').classList.remove('pick');
  socket.emit('jm-pick', { roomCode: S.code, cup: S.jmAt.indexOf(id) });
  setTimeout(() => { if (S.jmPhase === 'wait') { S.jmPhase = 'idle'; show('jmStartBtn'); } }, 5000);
}

function confetti() {
  for (let i = 0; i < 24; i++) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', 300 + (Math.random() - .5) * 80); c.setAttribute('cy', 140); c.setAttribute('r', 2 + Math.random() * 3);
    c.setAttribute('fill', ['#ffd45c', '#ff4d5e', '#5cc8ff', '#4ade80'][i % 4]); $('jmFx').appendChild(c);
    c.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${(Math.random() - .5) * 440}px,${-70 + Math.random() * 220}px)`, opacity: 0 }],
              { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => c.remove();
  }
}

socket.on('jm-started', jmRound);
socket.on('jm-result', async d => {
  if (S.jmPhase !== 'wait') return;
  S.jmPhase = 'reveal';
  [0, 1, 2].forEach(i => { if (i !== d.empty) ball(i).setAttribute('opacity', 1); });
  inner(S.jmPick).classList.add('lift'); sound('lift'); await wait(800);
  [0, 1, 2].filter(c => c !== S.jmPick).forEach(c => inner(c).classList.add('lift'));
  const t = $('jmToast'); t.textContent = d.message; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400);
  if (d.win) { sound('win'); confetti(); } else sound('miss');
  say(d.win ? 'Bien joué ! Rejoue pour enchaîner.' : 'Dommage... retente ta chance !');
  await wait(1200); S.jmPhase = 'idle'; show('jmStartBtn');
});
function startJm() {
  if (S.jmPhase !== 'idle') return;
  const amount = parseInt($('jmBetAmount').value);
  if (!amount || amount <= 0) return alert('Entre une mise valide !');
  sound('bet'); S.jmPhase = 'starting'; socket.emit('jm-start', { roomCode: S.code, amount });
}

/* ---------- Chicken Road : le poulet traverse la route voie par voie ---------- */
const CR_RTP = 0.985; // mêmes formules que le serveur (RTP 98,5 %)
const CR_MODES = { easy: { name: 'Facile', steps: 24, p: .12 }, medium: { name: 'Moyen', steps: 22, p: .20 }, hard: { name: 'Difficile', steps: 20, p: .33 } };
const crMult = (mode, k) => Math.floor(CR_RTP / Math.pow(1 - CR_MODES[mode].p, k) * 100) / 100; // mêmes formules que le serveur
const LANE_W = 92, CURB_W = 120, GOAL_W = 150, CR_H = 230, CR_Y = .62;
const CAR_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#f97316'];
const CHICK = '<svg viewBox="0 0 48 56"><ellipse cx="24" cy="53" rx="13" ry="3" fill="rgba(0,0,0,.35)"/><path d="M10 30Q4 24 8 18Q12 24 16 26Z" fill="#f1f5f9"/><ellipse cx="22" cy="34" rx="14" ry="12" fill="#fff" stroke="#dfe5ec"/><path d="M14 34Q20 42 30 32Q24 28 14 34Z" fill="#eef2f7"/><circle cx="32" cy="20" r="9" fill="#fff" stroke="#dfe5ec"/><path d="M28 12Q30 5 33 11Q35 4 38 11Q38 14 36 14Z" fill="#e11d48"/><path d="M40 19L47 22L40 25Z" fill="#f59e0b"/><circle cx="35" cy="19" r="1.6" fill="#111827"/><path d="M19 45V52M26 45V52M16 52H22M23 52H29" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/></svg>';
const carSvg = c => `<svg viewBox="0 0 44 84"><rect x="4" y="4" width="36" height="76" rx="11" fill="${c}"/><rect x="9" y="22" width="26" height="22" rx="6" fill="#bfe3ff" opacity=".85"/><rect x="9" y="52" width="26" height="12" rx="4" fill="#9ec9ea" opacity=".7"/><rect x="8" y="78" width="8" height="4" rx="2" fill="#fff6c0"/><rect x="28" y="78" width="8" height="4" rx="2" fill="#fff6c0"/><rect x="8" y="2" width="8" height="3" fill="#ff3b3b"/><rect x="28" y="2" width="8" height="3" fill="#ff3b3b"/></svg>`;
const crN = () => CR_MODES[S.crBuilt || 'easy'].steps;
const crTr = p => `translate(${(p.x - 22).toFixed(1)}px,${(p.y - 44).toFixed(1)}px)`;
function crPt(k) { // centre de la voie k (0 = trottoir de départ, N+1 = l'œuf d'or) ; les pieds du poulet sont sur la plaque
  const N = crN(), x = k <= 0 ? CURB_W - 34 : k > N ? CURB_W + N * LANE_W + GOAL_W / 2 : CURB_W + (k - 1) * LANE_W + LANE_W / 2;
  return { x, y: CR_H * CR_Y };
}
function crCam(k = S.crStep) { // la caméra suit le poulet ; le décor défile plus lentement (parallaxe)
  const sw = $('crStage').clientWidth || 600, worldW = CURB_W + crN() * LANE_W + GOAL_W;
  const x = Math.max(Math.min(0, sw - worldW), Math.min(0, sw * .3 - crPt(k).x));
  $('crWorld').style.transform = `translateX(${x.toFixed(1)}px)`; $('crStage').style.backgroundPositionX = (x * .25).toFixed(1) + 'px';
}
function crPlace(k) { const p = crPt(k), c = $('crChick'); c.style.transform = crTr(p); S.crPos = p; crCam(k); }
function crBuild(mode) {
  const N = CR_MODES[mode].steps; S.crBuilt = mode;
  let html = '<div class="cr-curb"><span>🌳</span><span>🪧</span></div>';
  for (let k = 1; k <= N; k++) html += `<div class="cr-lane"><div class="cr-hole">x${crMult(mode, k).toFixed(2)}</div></div>`;
  html += `<div class="cr-goal">🥚</div><div class="cr-chick" id="crChick">${CHICK}</div>`;
  const w = $('crWorld'); w.innerHTML = html; w.style.width = (CURB_W + N * LANE_W + GOAL_W) + 'px';
  S.crLanes = [...w.querySelectorAll('.cr-lane')]; crPlace(0);
}
function crMarks() {
  const active = !!(S.crState && S.crState.active);
  S.crLanes.forEach((l, i) => { const k = i + 1; l.classList.toggle('done', k <= S.crStep && (active || !S.crDead)); l.classList.toggle('next', active && k === S.crStep + 1); });
}
function crInfo() {
  const m = CR_MODES[S.crMode];
  $('crInfo').textContent = `Risque : ${Math.round(m.p * 100)} % par voie · ${m.steps} voies · max x${crMult(S.crMode, m.steps).toFixed(2)} · RTP 98,5 %`;
  document.querySelectorAll('#crModes .cr-mode').forEach(b => b.classList.toggle('on', b.dataset.m === S.crMode));
}
function crControls() {
  const st = S.crState, active = !!(st && st.active), mode = active ? st.mode : S.crMode, N = CR_MODES[mode].steps, step = S.crStep;
  const mult = active && step > 0 ? crMult(mode, step) : 0, next = active && step < N ? crMult(mode, step + 1) : 0;
  show('crStartBtn', !active); show('crGoBtn', active); show('crCashBtn', active && step > 0);
  $('crCashBtn').textContent = mult ? `ENCAISSER ${Math.floor(st.bet * mult)} 🪙` : 'ENCAISSER';
  $('crMult').textContent = 'x' + (mult || 1).toFixed(2);
  $('crGain').textContent = active ? `${Math.floor(st.bet * (mult || 1))} 🪙` : '0 🪙';
  $('crNext').textContent = next ? 'x' + next.toFixed(2) : '—';
  $('crBetAmount').disabled = active; document.querySelectorAll('#crModes .cr-mode').forEach(b => { b.disabled = active; });
  $('crStatus').textContent = active ? (step ? `Voie ${step}/${N} — avance ou encaisse !` : 'Clique sur AVANCER : le poulet traverse la première voie.') : 'Choisis un mode, mise, puis fais traverser le poulet. Encaisse avant la prochaine voiture !';
}
function crSync() {
  if (S.view !== 'cr' || S.crPending > 0 || S.crWait) return;
  const st = S.crState, active = !!(st && st.active);
  if (active && st.mode !== S.crBuilt) { S.crMode = st.mode; crBuild(st.mode); crInfo(); }
  if (active) { S.crStep = st.step; crPlace(S.crStep); }
  crMarks(); crControls();
}
function crToast(msg) { const t = $('crToast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); }
function crHistPush(win, text) {
  S.crHist.unshift({ win, text }); S.crHist.length = Math.min(S.crHist.length, 12);
  setH($('crHist'), S.crHist.map(h => `<div class="history-pill ${h.win ? 'cr-win' : 'cr-lose'}">${h.text}</div>`).join(''));
}

// Les animations sont mises en file : elles ne bloquent jamais les clics (pas de temps d'attente)
const crChain = fn => {
  const g = S.crGen; S.crPending++;
  S.crP = S.crP.then(() => g === S.crGen ? fn(g) : null).catch(() => {}).then(() => { if (g === S.crGen && --S.crPending === 0) crSync(); });
};
function crReset() {
  S.crGen++; S.crPending = 0; S.crP = Promise.resolve(); S.crWait = false; S.crPick = 0; S.crDead = false; S.crStep = 0;
  const c = $('crChick'); if (c && c.getAnimations) c.getAnimations().forEach(a => a.cancel());
  if (S.crBuilt !== S.crMode) crBuild(S.crMode); else { S.crLanes.forEach(l => l.classList.remove('done', 'next', 'dead')); crPlace(0); }
  $('crChick').style.opacity = 1; $('crStage').classList.remove('shake'); $('crToast').classList.remove('show');
  $('crHash').textContent = '—'; $('crProof').textContent = '';
}
async function crHop(k, ms = 260) {
  const el = $('crChick'), a = S.crPos, b = crPt(k), mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 34 };
  sound('cluck'); crCam(k);
  const an = el.animate([{ transform: crTr(a) }, { transform: crTr(mid) + ' scale(.94,1.1)', offset: .5 }, { transform: crTr(b) + ' scale(1.1,.9)', offset: .92 }, { transform: crTr(b) }],
                        { duration: ms, easing: 'cubic-bezier(.35,.1,.45,1)', fill: 'forwards' });
  await an.finished; el.style.transform = crTr(b); S.crPos = b; an.cancel();
}
function crBurst(x, y, n = 12) {
  const w = $('crWorld');
  for (let i = 0; i < n; i++) {
    const f = document.createElement('i'); f.className = 'cr-fth'; f.style.left = x + 'px'; f.style.top = y + 'px'; w.appendChild(f);
    f.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${(Math.random() - .5) * 150}px,${-30 - Math.random() * 90}px) rotate(${Math.random() * 540}deg)`, opacity: 0 }],
              { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => f.remove();
  }
}
async function crZoom(g, deadlyAt, N) { // à l'encaissement : une voiture fonce sur la première voie qui t'aurait été fatale (même hors écran, on l'entend)
  if (deadlyAt == null) { crToast('🐔 Tu pouvais traverser jusqu\'au bout !'); return; }
  const lane = S.crLanes[deadlyAt - 1]; if (!lane) return;
  const car = document.createElement('div');
  car.className = 'cr-car'; car.style.left = (LANE_W / 2 - 22) + 'px'; car.innerHTML = carSvg(CAR_COLORS[deadlyAt % CAR_COLORS.length]); lane.appendChild(car);
  sound('zoom');
  const a = car.animate([{ transform: 'translateY(-200px)' }, { transform: 'translateY(' + (CR_H + 200) + 'px)' }], { duration: 650, easing: 'cubic-bezier(.6,0,.9,.6)', fill: 'forwards' });
  await a.finished; car.remove();
  if (g !== S.crGen) return;
  lane.classList.add('dead');
  const away = deadlyAt - S.crStep;
  crToast(away === 1 ? '🚗 La voie suivante était mortelle !' : `🚗 Tu pouvais encore passer ${away - 1} voie${away - 1 > 1 ? 's' : ''}… la ${deadlyAt}e était mortelle !`);
}
async function crHit(k, g) { // une voiture fonce sur la voie où le poulet vient d'atterrir
  const lane = S.crLanes[k - 1], ch = $('crChick'), p = crPt(k), car = document.createElement('div'), hitY = p.y - 80;
  car.className = 'cr-car'; car.style.left = (LANE_W / 2 - 22) + 'px'; car.innerHTML = carSvg(CAR_COLORS[k % CAR_COLORS.length]); lane.appendChild(car);
  sound('hit');
  const a = car.animate([{ transform: 'translateY(-100px)' }, { transform: `translateY(${hitY}px)` }], { duration: 380, easing: 'cubic-bezier(.5,0,1,1)', fill: 'forwards' });
  await a.finished; if (g !== S.crGen) return;
  lane.classList.add('dead'); $('crStage').classList.add('shake'); crBurst(p.x, p.y - 20, 14);
  car.animate([{ transform: `translateY(${hitY}px)` }, { transform: 'translateY(340px)' }], { duration: 650, easing: 'ease-in', fill: 'forwards' }).onfinish = () => car.remove();
  const f = ch.animate([{ transform: crTr(p) }, { transform: crTr({ x: p.x + 90, y: p.y - 130 }) + ' rotate(720deg) scale(.4)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
  await f.finished; if (g !== S.crGen) return;
  ch.style.opacity = 0; f.cancel(); $('crStage').classList.remove('shake');
}
function crTraffic() { // circulation d'ambiance : seulement sur l'écran visible, au plus 7 voitures à la fois
  if (S.view !== 'cr' || document.hidden || !S.crLanes.length || S.crCars > 6) return;
  const N = S.crLanes.length, cand = [];
  for (let k = Math.max(1, S.crStep - 2); k <= Math.min(N, S.crStep + 6); k++) if (k !== S.crStep && k !== S.crStep + 1) cand.push(k);
  if (!cand.length) return;
  const k = cand[Math.floor(Math.random() * cand.length)], down = k % 2 === 1, car = document.createElement('div');
  car.className = 'cr-car'; car.style.left = (LANE_W / 2 - 22) + 'px'; car.innerHTML = carSvg(CAR_COLORS[(k * 7 + S.crCars) % CAR_COLORS.length]);
  S.crLanes[k - 1].appendChild(car); S.crCars++;
  const a = down ? -100 : CR_H + 20, b = down ? CR_H + 20 : -100, rot = down ? 0 : 180;
  car.animate([{ transform: `translateY(${a}px) rotate(${rot}deg)` }, { transform: `translateY(${b}px) rotate(${rot}deg)` }], { duration: 1400 + Math.random() * 1300, easing: 'linear' })
     .onfinish = () => { car.remove(); S.crCars--; };
}
function crInit() {
  if (!$('crModes').children.length) {
    $('crModes').innerHTML = Object.entries(CR_MODES).map(([id, m]) => `<button class="cr-mode" data-m="${id}">${m.name}<small>${Math.round(m.p * 100)} % de risque</small></button>`).join('');
    $('crModes').addEventListener('click', e => {
      const b = e.target.closest('.cr-mode'); if (!b || (S.crState && S.crState.active)) return;
      S.crMode = b.dataset.m; crBuild(S.crMode); crInfo(); crControls();
    });
    $('crQuick').addEventListener('click', e => {
      const b = e.target.closest('button'), amt = $('crBetAmount'); if (!b || amt.disabled) return;
      if (b.dataset.a) amt.value = b.dataset.a;
      else if (b.dataset.f === 'max') amt.value = S.balance;
      else amt.value = Math.max(1, Math.floor((parseFloat(amt.value) || 0) * b.dataset.f));
    });
  }
  if (S.crBuilt !== S.crMode || !S.crLanes.length) crBuild(S.crMode);
  crInfo(); crSync(); crCam();
  clearInterval(S.crTimer); S.crTimer = setInterval(crTraffic, 600);
}
const crStop = () => { clearInterval(S.crTimer); S.crTimer = 0; };

function crStart() {
  const amount = parseInt($('crBetAmount').value);
  if (!amount || amount <= 0) return alert('Entre une mise valide !');
  if (S.crState && S.crState.active) return;
  crReset(); S.crBet = amount; sound('bet');
  socket.emit('cr-start', { roomCode: S.code, amount, mode: S.crMode });
}
function crGo() { // le clic part tout de suite au serveur et le poulet saute déjà : on peut enchaîner dès la confirmation
  const st = S.crState;
  if (S.crWait || !st || !st.active || S.crStep >= CR_MODES[st.mode].steps) return;
  const pick = S.crPick = S.crStep + 1; S.crWait = true;
  socket.emit('cr-step', { roomCode: S.code });
  crChain(() => crHop(pick));
  setTimeout(() => { if (S.crWait && S.crPick === pick) { S.crWait = false; crSync(); } }, 2500);
}
const crCash = () => { if (!S.crWait && S.crState && S.crState.active && S.crStep > 0) socket.emit('cr-cashout', { roomCode: S.code }); };

socket.on('cr-started', d => {
  S.crState = { active: true, bet: S.crBet, mode: S.crMode, step: 0 }; S.crStep = 0;
  $('crHash').textContent = d.hash; crMarks(); crControls();
});
socket.on('cr-result', d => {
  S.crWait = false;
  const mode = S.crState ? S.crState.mode : S.crMode, N = CR_MODES[mode].steps;
  const end = () => { if (S.crState) S.crState.active = false; crControls(); }; // le bouton "Lancer" revient tout de suite
  if (d.seed) $('crProof').textContent = `Graine révélée : ${d.seed} — SHA-256(graine) = hash ci-dessus ; la voie k est mortelle si HMAC-SHA256(graine, "step:k") < ${CR_MODES[mode].p}`;
  if (d.cashout) {
    end(); crHistPush(true, 'x' + d.multiplier.toFixed(2));
    return crChain(async g => { sound('win'); crBurst(S.crPos.x, S.crPos.y - 20, 10); crToast(d.message); await wait(500); if (g === S.crGen) await crZoom(g, d.deadlyAt); });
  }
  if (d.success) {
    S.crStep = d.step; crMarks();
    if (d.completed) { end(); crHistPush(true, 'x' + d.multiplier.toFixed(2)); } else crControls();
    if (d.completed) crChain(async g => { await crHop(N + 1); if (g === S.crGen) { sound('win'); crBurst(S.crPos.x, S.crPos.y - 20, 18); crToast(d.message); } });
  } else {
    S.crDead = true; S.crStep = d.step - 1; end(); crHistPush(false, 'perdu');
    crChain(async g => { await crHit(d.step, g); if (g === S.crGen) crToast(d.message); });
  }
});
window.addEventListener('resize', () => { if (S.view === 'cr') crCam(); });

/* ============================================================
   MINES 💣 — grille 5×5, 1 à 24 mines. Le serveur place les mines (graine HMAC, vérifiable) et ne les révèle qu'à la fin.
   Multiplicateur après k cases sûres = 0,985 / P(k sûres d'affilée) — même formule que server.js.
   ============================================================ */
const mnMult = (m, k) => { let x = .985; for (let i = 0; i < k; i++) x *= (25 - i) / (25 - m - i); return Math.round(x * 100) / 100; };
const mnFmt = x => 'x' + (x >= 1000 ? Math.round(x).toLocaleString('fr-FR') : x.toFixed(2));
function mnMinesVal() { return Math.max(1, Math.min(24, parseInt($('mnMines').value) || 1)); }
function mnPaint() {
  if (!$('mnGrid').children.length) return;
  const st = S.mnState, active = !!(st && st.active), end = S.mnEnd;
  const picks = new Set(active ? st.picks : end ? end.picks : (st ? st.picks : []));
  const mines = !active && end ? end.mines : [];
  [...$('mnGrid').children].forEach((c, i) => {
    const isMine = mines.includes(i), hit = end && end.hit === i;
    c.className = 'mn-cell' + (picks.has(i) ? ' safe' : '') + (isMine ? ' mine' : '') + (hit ? ' hit' : '') + (active && !picks.has(i) ? (S.mnWait ? ' wait' : ' live') : '');
    c.textContent = picks.has(i) ? '💎' : hit ? '💥' : isMine ? '💣' : '';
  });
  const m = active ? st.mines : (st && !active && st.mines ? st.mines : mnMinesVal()), k = picks.size;
  const cur = active || (end && end.hit < 0) ? (k ? mnMult(m, k) : 1) : (k && !end ? mnMult(m, k) : 1);
  const left = 25 - m - k;
  $('mnMult').textContent = mnFmt(active && k ? mnMult(m, k) : 1);
  $('mnGain').textContent = active && k ? Math.floor(st.bet * mnMult(m, k)) + ' 🪙' : '0 🪙';
  $('mnNext').textContent = active && left > 0 ? mnFmt(mnMult(m, k + 1)) : '—';
  show('mnStartBtn', !active); show('mnCashBtn', active && k > 0);
  $('mnMines').disabled = $('mnBetAmount').disabled = $('mnMinus').disabled = $('mnPlus').disabled = active;
  if (active && k > 0) $('mnCashBtn').textContent = 'ENCAISSER ' + Math.floor(st.bet * mnMult(m, k)) + ' 🪙 (' + mnFmt(mnMult(m, k)) + ')';
}
function mnInit() {
  if (!S.mnInited) {
    S.mnInited = true;
    $('mnGrid').innerHTML = Array.from({ length: 25 }, (_, i) => `<button class="mn-cell" data-i="${i}"></button>`).join('');
    $('mnGrid').addEventListener('click', e => { const b = e.target.closest('.mn-cell'); if (b) mnPick(+b.dataset.i); });
    $('mnQuick').addEventListener('click', e => {
      const b = e.target.closest('button'), amt = $('mnBetAmount'); if (!b || amt.disabled) return;
      if (b.dataset.a) amt.value = b.dataset.a;
      else if (b.dataset.f === 'max') amt.value = S.balance;
      else amt.value = Math.max(1, Math.floor((parseFloat(amt.value) || 0) * b.dataset.f));
    });
    const setM = v => { $('mnMines').value = Math.max(1, Math.min(24, v)); mnPaint(); };
    $('mnMineQuick').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !$('mnMines').disabled) setM(+b.dataset.m); });
    $('mnMinus').onclick = () => setM(mnMinesVal() - 1); $('mnPlus').onclick = () => setM(mnMinesVal() + 1);
    $('mnMines').addEventListener('change', () => setM(mnMinesVal()));
  }
  mnPaint();
}
function mnStart() {
  const amount = parseInt($('mnBetAmount').value);
  if (!amount || amount <= 0) return alert('Entre une mise valide !');
  if (S.mnWait) return; S.mnWait = true; sound('bet');
  setTimeout(() => { S.mnWait = false; mnPaint(); }, 2500);
  S.mnBet = amount; S.mnEnd = null; $('mnProof').textContent = '';
  socket.emit('mn-start', { roomCode: S.code, amount, mines: mnMinesVal() });
}
function mnPick(i) {
  const st = S.mnState; if (!st || !st.active || S.mnWait || st.picks.includes(i)) return;
  S.mnWait = true; mnPaint(); setTimeout(() => { if (S.mnWait) { S.mnWait = false; mnPaint(); } }, 2500);
  socket.emit('mn-pick', { roomCode: S.code, idx: i });
}
const mnCash = () => { const st = S.mnState; if (!S.mnWait && st && st.active && st.picks.length) { S.mnWait = true; socket.emit('mn-cashout', { roomCode: S.code }); } };
socket.on('mn-started', d => {
  S.mnWait = false; S.mnEnd = null;
  S.mnState = { active: true, bet: S.mnBet, mines: mnMinesVal(), picks: [] };
  $('mnProof').textContent = 'Hash SHA-256 de la graine : ' + d.hash;
  $('mnStatus').textContent = 'Dévoile une case sûre… ou encaisse dès que tu veux !'; mnPaint();
});
socket.on('mn-result', d => {
  S.mnWait = false; const st = S.mnState;
  if (d.seed) $('mnProof').textContent = `Graine révélée : ${d.seed} — SHA-256(graine) = hash ci-dessus ; mélange de Fisher-Yates avec HMAC-SHA256(graine, "mines:i"), les ${d.mines.length} premières cases du mélange sont les mines.`;
  if (d.safe === false) {
    if (st) { st.active = false; st.picks = d.picks; } S.mnEnd = { mines: d.mines, picks: d.picks, hit: d.idx };
    sound('mnboom'); $('mnStatus').textContent = d.message;
    $('mnGrid').classList.remove('shake'); void $('mnGrid').offsetWidth; $('mnGrid').classList.add('shake');
  } else if (d.cashout) {
    if (st) { st.active = false; st.picks = d.picks; } S.mnEnd = { mines: d.mines, picks: d.picks, hit: -1 };
    sound('win'); $('mnStatus').textContent = d.message;
  } else {
    if (st && !st.picks.includes(d.idx)) st.picks.push(d.idx);
    sound('mngem'); $('mnStatus').textContent = `💎 Sûr ! ${mnFmt(d.multiplier)} — continue ou encaisse.`;
  }
  mnPaint();
});


