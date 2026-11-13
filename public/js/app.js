'use strict';
/* ---------- Actions (appelées par les onclick du HTML) ---------- */
const TOKENS_PER_EUR = 100, STAKE_MIN = 0.1, STAKE_MAX = 1e9, STAKE_RANGE = 'minimum 0,10 €'; // mêmes valeurs que le serveur (c'est lui qui a le dernier mot)
const eur = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €';
function stakeValue() {
  const n = Math.round(parseFloat(String($('stakeInput').value).replace(',', '.')) * 100) / 100;
  return Number.isFinite(n) && n >= STAKE_MIN && n <= STAKE_MAX ? n : null;
}
function onStakeInput() {
  const v = stakeValue();
  $('stakeInfo').textContent = v === null ? `Mise : ${STAKE_RANGE}` : `= ${Math.round(v * TOKENS_PER_EUR).toLocaleString('fr-FR')} jetons (1 € = ${TOKENS_PER_EUR} 🪙)`;
}
function setStake(v) { $('stakeInput').value = v; onStakeInput(); }
function copyRoomCode() { const c = S.code; if (!c) return; try { navigator.clipboard.writeText(c); $('roomChipCode').textContent = 'copié ✓'; setTimeout(() => { $('roomChipCode').textContent = S.code || c; }, 1200); } catch (e) {} }
function leaveRoom() { socket.emit('leave-room'); }
socket.on('left-room', () => location.reload());
function createRoom() {
  if (!S.myName) return alert('Connecte-toi d\'abord !');
  const stake = stakeValue(); if (stake === null) return alert(`Mise invalide : ${STAKE_RANGE}.`);
  Snd.unlock(); socket.emit('create-room', { duration: $('duration').value, stake });
}
function joinRoom() {
  const roomCode = $('roomCodeInput').value.trim().toUpperCase();
  if (!roomCode) return alert('Entre le code de la room !');
  const stake = stakeValue(); if (stake === null) return alert(`Mise invalide : ${STAKE_RANGE}.`);
  Snd.unlock(); socket.emit('join-room', { roomCode, stake });
}
onStakeInput();
const launchGame = () => socket.emit('launch-game-lobby', { roomCode: S.code, gameName: 'Hub' });
function switchGame(name) {
  startAudio(); // dans un clic : le navigateur autorise le son
  show('game-hub', false);
  socket.emit('join-game-table', { roomCode: S.code });
  S.view = name === 'Icefield' ? 'ice' : name === 'Just mixed' ? 'jm' : name === 'Chicken Road' ? 'cr'
         : name === 'Arrows X' ? 'ar' : name === 'Roulette' ? 'rl' : name === 'Blackjack' ? 'bj' : name === 'Mines' ? 'mn' : name === 'Plinko' ? 'pk' : name === 'Dés' ? 'dc' : name === 'Hi-Lo' ? 'hl' : name === 'Pile ou Face' ? 'cf' : name === 'Machine à sous' ? 'sl' : 'crash';
  if (S.view === 'ice') { show('icefield-screen'); updateIce(); }
  else if (S.view === 'jm') { show('jm-screen'); if (!S.jmCups) buildJm(); }
  else if (S.view === 'cr') { show('cr-screen'); crInit(); }
  else if (S.view === 'ar') { show('ar-screen'); arInit(); }
  else if (S.view === 'rl') { show('rl-screen'); rlInit(); }
  else if (S.view === 'bj') { show('bj-screen'); bjInit(); }
  else if (S.view === 'mn') { show('mn-screen'); mnInit(); }
  else if (S.view === 'pk') { show('pk-screen'); pkInit(); }
  else if (S.view === 'dc') { show('dc-screen'); dcInit(); }
  else if (S.view === 'hl') { show('hl-screen'); hlInit(); }
  else if (S.view === 'cf') { show('cf-screen'); cfInit(); }
  else if (S.view === 'sl') { show('sl-screen'); slInit(); }
  else { show('game-screen'); socket.emit('crash-join', { roomCode: S.code }); startCrashUI(); }
}
function returnToHub() {
  if (typeof slLeave === "function") try { slLeave(); } catch (e) {}
  if (S.view === 'crash') { socket.emit('crash-leave', { roomCode: S.code }); stopCrashUI(); } // le jeu Crash s'arrête chez toi ET sur le serveur si tu es seul
  S.view = 'hub';
  show('game-screen', false); show('icefield-screen', false); show('jm-screen', false); show('cr-screen', false); crStop();
  show('ar-screen', false); show('rl-screen', false); show('bj-screen', false); show('mn-screen', false); show('pk-screen', false); show('dc-screen', false); show('hl-screen', false); show('cf-screen', false); show('sl-screen', false); // Arrows/Roulette/Blackjack : aucun timer client, rien à arrêter
  show('game-hub');
}
function buildPanels() {
  $('betPanels').innerHTML = [0, 1].map(i => `<div class="bet-control-box">
    <div class="quick-bet-row">${[10, 50, 100, 500].map(a => `<button class="quick-btn" data-i="${i}" data-a="${a}">${a}</button>`).join('')}</div>
    <div class="quick-bet-row"><button class="quick-btn" data-i="${i}" data-f=".5">÷2</button><button class="quick-btn" data-i="${i}" data-f="2">×2</button><button class="quick-btn" data-i="${i}" data-f="max">Max</button></div>
    <div style="display:flex;gap:8px"><input type="number" id="amt${i}" value="${i ? 100 : 50}" min="1" style="margin:0;flex:2"><input type="number" step="0.1" min="1.01" id="auto${i}" placeholder="Auto cash-out" style="margin:0;flex:1.5"></div>
    <label class="auto-row"><input type="checkbox" id="ab${i}"> Relancer la mise automatiquement</label>
    <button class="act" id="act${i}" data-i="${i}"></button>
    <button class="btn-cancel hidden" id="cancel${i}" data-i="${i}">Annuler</button></div>`).join('');
  $('betPanels').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.dataset.i, amt = $('amt' + i);
    if (b.dataset.a) amt.value = b.dataset.a;
    else if (b.dataset.f === 'max') amt.value = S.balance;
    else if (b.dataset.f) amt.value = Math.max(1, Math.floor((parseFloat(amt.value) || 0) * b.dataset.f));
    else if (b.id.startsWith('act')) act(i);
    else if (b.id.startsWith('cancel')) { sound('cancel'); socket.emit('cancel-next-bet', { roomCode: S.code, slot: i }); }
  });
}
function act(i) {
  const s = S.slots[i] || {};
  if (S.phase === 'ended' || S.phase === 'waiting') return;
  if (S.phase === 'playing' && s.bet > 0 && !s.cashed) return socket.emit('cash-out', { roomCode: S.code, slot: i });
  if (S.phase === 'betting' ? s.bet > 0 : s.next > 0) return; // pari déjà posé
  const amount = parseInt($('amt' + i).value);
  if (!amount || amount <= 0) return alert('Entre un montant valide !');
  sound('bet');
  socket.emit('place-bet', { roomCode: S.code, slot: i, amount, autoCashOut: $('auto' + i).value });
}
function autoBets() {
  [0, 1].forEach(i => {
    const a = parseInt($('amt' + i).value);
    if ($('ab' + i).checked && !(S.slots[i].bet > 0) && a > 0 && S.balance >= a) act(i);
  });
}
buildPanels();

/* ---------- Rendu de l'interface ---------- */
function renderButtons() {
  [0, 1].forEach(i => {
    const s = S.slots[i], b = $('act' + i), ph = S.phase;
    let text, bg = '', cash = false, dis = false, cancel = false;
    if (ph === 'betting') {
      if (s.bet > 0) { text = `Pari enregistré : ${s.bet} 🪙 ✅`; bg = '#3b82f6'; cancel = true; }
      else { text = 'Parier'; bg = '#22c55e'; }
    } else if (ph === 'playing' && s.bet > 0 && !s.cashed) { text = `CASH OUT ${Math.floor(s.bet * S.shown)} 🪙`; cash = true; }
    else if (ph === 'playing' || ph === 'crashed') {
      if (s.next > 0) { text = `Prochain tour : ${s.next} 🪙 ✅`; bg = '#eab308'; cancel = true; }
      else { text = 'Parier pour le tour suivant'; bg = '#3b82f6'; }
    } else { text = 'En attente...'; dis = true; }
    b.textContent = text; b.style.background = bg; b.disabled = dis; b.classList.toggle('btn-cashout', cash);
    $('cancel' + i).classList.toggle('hidden', !cancel);
  });
}

const setH = (el, html) => { if (el && el._h !== html) { el._h = html; el.innerHTML = html; } }; // n'écrit dans le DOM que si ça a changé
// Somme des mises en cours côté client (mises à jour par sync() depuis le serveur) : sert au classement "fortune totale"
const extraEq = p => (p.rl ? p.rl.total : 0) + (p.bj && p.bj.phase && p.bj.phase !== 'idle' ? p.bj.bet : 0);
function renderPlayers(room) {
  const me = room.players.find(p => p.id === socket.id), sg = n => n >= 0 ? '+' : ''; S.me = me;
  if (me) {
    S.balance = me.balance; S.slots = me.slots;
    document.querySelectorAll('.playerBalance').forEach(e => { if (e.textContent != me.balance) e.textContent = me.balance; });
  }
  if (!$('lobby').classList.contains('hidden')) {
    setH($('playersList'), room.players.map(p => `<li class="pl-li">${avHTML(p.name, p.cos, 38)}<span>${nm(p.name)}<small class="lvtag">Niv. ${p.cos ? p.cos.lv : 1}</small></span> · mise ${eur(p.stake || 0)} (${p.balance} 🪙) ${p.isAdmin ? '👑 Hôte' : ''}${p.connected === false ? ' 💤 déconnecté' : ''}</li>`).join(''));
    $('potTotal').textContent = eur(room.players.reduce((a, p) => a + (p.stake || 0), 0));
  }
  if (S.view === 'crash') { // la liste des mises et les stats ne servent que sur l'écran Crash
    const avg = room.players.reduce((a, p) => a + p.stats.totalProfit, 0) / (room.players.length || 1);
    setH($('gamePlayersList'), room.players.map(p => {
      const st = p.slots.map(x => x.cashed ? `✅ +${x.win} 🪙` : x.bet > 0 ? `Mise ${x.bet} 🪙${x.auto ? ' (auto ' + x.auto + 'x)' : ''}` : x.next > 0 ? `Prête ${x.next} 🪙` : '').filter(Boolean).join(' · ');
      return `<li><b>${nm(p.name)}</b> - ${st || 'Observe'} | Profit: <span class="${p.stats.totalProfit >= avg ? 'text-green' : 'text-red'}">${sg(p.stats.totalProfit)}${p.stats.totalProfit} 🪙</span> (Solde: ${p.balance} 🪙)</li>`;
    }).join(''));
    if (me) setH($('myStatsBadge'), `<span>📊 <b>Mes Stats :</b> ${me.stats.gamesPlayed} jouées</span><span>Victoires : ${me.stats.wins}</span>
      <span>Profit : <span class="${me.stats.totalProfit >= 0 ? 'text-green' : 'text-red'}">${sg(me.stats.totalProfit)}${me.stats.totalProfit} 🪙</span></span>`);
  }
  if (room.status === 'waiting' && me) { show('adminControls', me.isAdmin); show('playerWaitingGame', !me.isAdmin); }
}

function pill(item) {
  const d = document.createElement('div');
  d.className = 'history-pill ' + (item.multiplier < 2 ? 'hist-low' : item.multiplier < 10 ? 'hist-mid' : 'hist-high');
  d.textContent = item.multiplier.toFixed(2) + 'x';
  d.onclick = () => alert(`🔍 Preuve Provably Fair :\n\n- Multiplicateur : ${item.multiplier}x\n- Hash publié avant la manche : ${item.hash}\n- Graine secrète révélée : ${item.secret}\n\nVérification :\n1) SHA-256(graine) doit être égal au hash publié\n2) Le crash est dérivé de HMAC-SHA256(graine, "crash")`);
  return d;
}
function renderHistory(list) {
  S.history = list;
  const bar = $('historyBar'); bar.innerHTML = '';
  list.slice(0, 8).forEach(i => bar.appendChild(pill(i)));
}
function openHistoryModal() {
  const g = $('fullHistoryGrid'); g.innerHTML = '';
  if (!S.history.length) g.innerHTML = '<p style="color:#9a90ad">Aucun historique pour l\'instant.</p>';
  S.history.forEach(i => g.appendChild(pill(i)));
  show('historyModal');
}
const closeHistoryModal = () => show('historyModal', false);

// La phase de jeu vient du serveur : un joueur qui arrive en cours de manche est synchronisé
function sync(room) {
  if (['betting', 'playing', 'crashed'].includes(room.status) && S.phase !== 'ended') S.phase = room.status;
  if (room.currentHash) $('currentHashDisplay').textContent = room.currentHash;
  renderPlayers(room); renderRank(room); if (S.view === 'crash') renderButtons(); if (room.history) renderHistory(room.history);
  const me = room.players.find(p => p.id === socket.id);
  S.iceState = me ? me.iceState : null;
  updateIce();
  S.crState = me ? me.cr : null;
  S.vip = new Set(room.players.filter(p => p.vip).map(p => p.name));
  S.mnState = me ? me.mn : null; if (S.view === 'mn') mnPaint();
  crSync();
  S.arState = me ? me.ar : null;
  arSync();
  S.rlBets = me && me.rl ? me.rl.bets : [];
  if (S.view === 'rl') rlRenderChips(); // pas à pas : sur les autres écrans, rien ne touche le tapis (les écouteurs restent intacts)
  S.meBj = me ? me.bj : null;
  bjSync(me ? me.bj : null);
  renderStopBar(room);
}

// Classement commun : trié sur le % de gain vs argent de départ (fortune = solde + mises en jeu, pour qu'il ne saute pas à chaque mise)
function renderRank(room) {
  const eq = p => p.balance + p.slots.reduce((a, x) => a + (x.cashed ? 0 : x.bet) + x.next, 0) + (p.iceState && p.iceState.active ? p.iceState.bet : 0) + (p.jm && p.jm.active ? p.jm.bet : 0) + (p.cr && p.cr.active ? p.cr.bet : 0) + (p.ar && p.ar.active ? p.ar.bet : 0) + (p.mn && p.mn.active ? p.mn.bet : 0) + (p.pk && p.pk.active ? p.pk.bet : 0) + (p.hl && p.hl.active ? p.hl.bet : 0) + extraEq(p); // mises en cours sur tous les jeux : le classement ne saute pas à chaque pari
  const pct = p => { const st = p.initialBalance || 1000; return (eq(p) - st) / st * 100; };
  const fmtPct = v => { const a = Math.abs(v); const t = a >= 100000 ? new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : v.toLocaleString('fr-FR', { maximumFractionDigits: a >= 100 ? 0 : 1 }); return (v >= 0 ? '+' : '') + t + ' %'; };
  const rows = [...room.players].sort((a, b) => pct(b) - pct(a));
  const mine = rows.findIndex(p => p.id === socket.id);
  const html = rows.map((p, i) => {
    const pr = eq(p) - (p.initialBalance || 1000);
    return `<div class="rank-row${p.id === socket.id ? ' me' : ''}"><b>${i < 3 ? ['🥇', '🥈', '🥉'][i] : '#' + (i + 1)}</b><span>${nm(p.name)}${p.connected === false ? ' 💤' : ''}</span><b>${eq(p)} 🪙</b><span class="${pr >= 0 ? 'text-green' : 'text-red'}">${pr >= 0 ? '+' : ''}${pr}</span><b class="${pr >= 0 ? 'text-green' : 'text-red'}">${fmtPct(pct(p))}</b></div>`;
  }).join('');
  document.querySelectorAll('.rankList').forEach(e => setH(e, html));
  document.querySelectorAll('.rankMe').forEach(e => e.textContent = mine >= 0 ? `Tu es #${mine + 1} sur ${rows.length}` : '');
}
function enterLobby(room) {
  S.code = room.code; sideVis();
  show('auth-screen', false); show('lobby');
  $('displayCode').textContent = room.code; $('roomChipCode').textContent = room.code; $('roomChip').style.display = 'flex'; $('admGear').style.display = (S.isAdmin || S.admCodeMode) ? 'block' : 'none';
  sync(room);
}

/* ---------- Animation du vol (60 fps) ---------- */
const stage = $('stage'), mBox = $('multiplierBox'), curve = $('flightCurve'), area = $('curveArea'),
      plane = $('planeGroup'), axis = $('axis'), flame = $('flame'), trail = $('trail'), boom = $('boom'), live = $('liveCashoutPreview');
// Pools d'éléments créés une seule fois : aucune création/suppression de DOM pendant l'animation
const SMOKE = 18; let lastT = 0, fno = 0;
$('smoke').innerHTML = Array.from({ length: SMOKE }, () => '<circle r="0" opacity="0" fill="#ffbe78"/>').join('');
S.sm = [...$('smoke').children].map(el => ({ el, l: 0, x: 0, y: 0 }));
$('clouds').innerHTML = Array.from({ length: 7 }, (_, i) => `<ellipse rx="${30 + (i * 13) % 34}" ry="${6 + (i * 5) % 6}" fill="rgba(255,225,200,${(.04 + (i % 3) * .015).toFixed(3)})"/>`).join('');
S.cl = [...$('clouds').children].map((el, i) => ({ el, x: i * 95 + (i % 2) * 40, y: 28 + (i * 47) % 180, k: .4 + (i % 3) * .3 }));
$('axis').innerHTML = '<text x="494" text-anchor="end"></text>'.repeat(4);
S.ax = [...$('axis').children];

// Zoom automatique : l'axe vertical s'adapte au multiplicateur ; l'avion se cabre en douceur le long de la courbe
function draw(m, now, dt = .016) {
  if (!(m >= 1)) m = 1; // garde-fou : aucune valeur invalide ne doit atteindre le SVG
  const top = Math.max(3, m * 1.2), lm = Math.log(m), xf = lm / Math.log(top), up = m > 1.001;
  const yf = v => 236 - (v - 1) / (top - 1) * 170, pt = k => [24 + k * 420 * xf, yf(Math.exp(lm * k))];
  let d = 'M24 236';
  for (let i = 1; i <= 30; i++) { const q = pt(i / 30); d += 'L' + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }
  const e = pt(1), p0 = pt(.94), raw = Math.atan2(e[1] - p0[1], e[0] - p0[0]) * 57.3, want = up && Number.isFinite(raw) ? raw : -3;
  if (!Number.isFinite(S.ang)) S.ang = -3;
  S.ang += (want - S.ang) * Math.min(1, Math.max(0, dt) * 9);
  const y = e[1] + Math.sin(now / 330) * (m > 2.5 ? 4 : 2) + (m > 6 ? Math.sin(now / 37) * .8 : 0);
  curve.setAttribute('d', up ? d : 'M24 236L24 236');
  area.setAttribute('d', up ? d + 'L' + e[0].toFixed(1) + ' 260L24 260Z' : '');
  plane.setAttribute('transform', `translate(${e[0].toFixed(1)} ${y.toFixed(1)}) rotate(${S.ang.toFixed(1)})`);
  if (fno % 6 === 0) S.ax.forEach((t, i) => { const v = 1 + (i + 1) / 4 * (top - 1); t.setAttribute('y', (yf(v) - 3).toFixed(0)); t.textContent = v.toFixed(1) + 'x'; });
  return { x: e[0], y };
}

function frame(now) {
  S.raf = 0; if (!S.crashRun) return;
  const dt = Math.max(0, Math.min(.05, (now - lastT) / 1000)), playing = S.phase === 'playing'; lastT = now; fno++;
  if (playing) {
    // extrapolation locale entre deux ticks serveur => mouvement continu à 60 fps
    S.shown = Math.max(S.shown, Math.min(S.target * Math.exp(.07 * (now - S.t0) / 1000), S.target * 1.03));
    const txt = S.shown.toFixed(2) + 'x';
    if (txt !== S.lastTxt) { // le DOM n'est touché que lorsque la valeur affichée change
      S.lastTxt = txt; mBox.textContent = txt;
      mBox.style.color = S.shown < 2 ? '#5cc8ff' : S.shown < 10 ? '#c58cff' : '#ffc24d';
      mBox.style.transform = `translate(-50%,-50%) scale(${(1 + Math.min(S.shown / 40, .25)).toFixed(3)})`;
      for (const m of [2, 5, 10, 25]) if (lastShown < m && S.shown >= m) sound('milestone');
      lastShown = S.shown;
      S.slots.forEach((s, i) => { if (s.bet > 0 && !s.cashed) $('act' + i).textContent = `CASH OUT ${Math.floor(s.bet * S.shown)} 🪙`; });
    }
  } else if (S.phase === 'betting') { S.shown = S.target = 1; S.lastTxt = ''; mBox.style.color = ''; mBox.style.transform = 'translate(-50%,-50%)'; }
  if (S.phase !== 'crashed') {
    const p = draw(S.shown, now, dt);
    flame.setAttribute('rx', playing ? 9 + Math.random() * 7 : 3 + Math.random() * 2);
    if (playing && fno % 2 === 0) { const s = S.sm[S.si = (S.si + 1) % SMOKE]; s.l = 1; s.x = p.x - 32; s.y = p.y + 2; }
  }
  if (S.phase === 'crashed' && S.fly) { // envol : accélération, cabrage, léger rétrécissement (profondeur), fondu final
    const F = S.fly, k = Math.min(1, (now - F.t0) / 1500), step = Math.max(0, Math.min(.05, (now - F.last) / 1000)); F.last = now;
    const ang = F.a - 38 * k * k, speed = 90 + 1250 * k * k;
    F.x += Math.cos(ang * Math.PI / 180) * speed * step; F.y += Math.sin(ang * Math.PI / 180) * speed * step;
    plane.setAttribute('transform', `translate(${F.x.toFixed(1)} ${F.y.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${(1 - .35 * k).toFixed(3)})`);
    plane.style.opacity = k > .8 ? ((1 - k) / .2).toFixed(2) : 1;
    flame.setAttribute('rx', 16 + Math.random() * 12);
    const sm = S.sm[S.si = (S.si + 1) % SMOKE]; sm.l = 1; sm.x = F.x - 30; sm.y = F.y + 2; // traînée de fumée
    if (k >= 1) { plane.style.opacity = 0; S.fly = null; }
  }
  const sp = playing ? 14 + S.shown * 14 : (S.phase === 'crashed' && S.fly ? 120 : 14);
  S.cl.forEach(c => { c.x -= dt * sp * c.k; if (c.x < -60) c.x += 620; c.el.setAttribute('transform', `translate(${c.x.toFixed(1)} ${c.y})`); });
  S.sm.forEach(s => { if (s.l > 0) { s.l -= dt * 2; s.x -= dt * sp; const l = Math.max(s.l, 0);
    s.el.setAttribute('cx', s.x.toFixed(1)); s.el.setAttribute('cy', s.y.toFixed(1)); s.el.setAttribute('r', (2 + (1 - l) * 8).toFixed(1)); s.el.setAttribute('opacity', (l * .4).toFixed(2)); } });
  S.raf = requestAnimationFrame(frame);
}
// L'animation de l'avion ne tourne QUE quand l'écran Crash est affiché
function startCrashUI() { if (S.crashRun) return; S.crashRun = true; lastT = performance.now(); if (!S.raf) S.raf = requestAnimationFrame(frame); }
function stopCrashUI() { S.crashRun = false; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; }

socket.on('crash-state', d => {
  S.phase = d.status === 'choosing_game' ? 'waiting' : d.status;
  S.target = S.shown = d.multiplier || 1; S.t0 = performance.now(); S.lastTxt = '';
  if (d.hash) $('currentHashDisplay').textContent = d.hash;
  sync(d.room);
});

/* ---------- Événements serveur ---------- */
socket.on('room-created', d => enterLobby(d.room));
socket.on('joined-success', enterLobby);
socket.on('update-room', sync);
socket.on('error-message', m => {
  alert(m);
  if (S.jmPhase === 'starting') S.jmPhase = 'idle';
  // Aucun jeu ne doit rester bloqué si le serveur refuse une action : on libère les verrous et on resynchronise.
  S.arBusy = false; S.rlBusy = false; S.bjBusy = false;
  if (S.crWait) { S.crWait = false; crSync(); }
  if (S.view === 'ar') arControls();
  if (S.view === 'rl') rlRenderChips();
  if (S.view === 'bj') bjPaint(S.meBj || null);
});

socket.on('navigate-to-game', d => { show('lobby', false); show('game-hub'); if (d && d.room) renderStopBar(d.room); });

socket.on('timer-update', d => {
  const m = Math.floor(d.timeRemaining / 60), s = d.timeRemaining % 60;
  document.querySelectorAll('.sessionTimerDisplay').forEach(e => e.textContent = `${m}:${s < 10 ? '0' : ''}${s}`);
});

socket.on('betting-phase', d => {
  if (S.phase === 'ended') return;
  S.phase = 'betting'; S.smoke = [];
  sound('start');
  mBox.classList.remove('crashed-text'); mBox.textContent = '1.00x';
  stage.classList.remove('shake'); plane.style.opacity = 1; S.fly = null; flame.setAttribute('rx', 3); trail.innerHTML = '';
  $('currentHashDisplay').textContent = d.hash;
  $('gameStatusText').textContent = `Prochaine manche dans ${d.countdown}s... Placez vos mises !`;
  live.textContent = '';
  sync(d.room);
  autoBets();
});

socket.on('betting-countdown', d => {
  if (d.countdown <= 3) sound('tick');
  if (S.phase !== 'ended') $('gameStatusText').textContent = `Prochaine manche dans ${d.countdown}s... Placez vos mises !`;
});

socket.on('playing-phase-started', room => {
  if (S.phase === 'ended') return;
  S.phase = 'playing'; S.shown = S.target = 1; S.t0 = performance.now(); S.smoke = []; lastShown = 1; sound('takeoff');
  $('gameStatusText').textContent = "L'avion décolle ! Bon vol ✈️";
  sync(room);
});

socket.on('multiplier-update', d => {
  if (S.phase === 'ended') return;
  S.target = d.multiplier; S.t0 = performance.now();
});

socket.on('game-crashed', d => {
  if (S.phase === 'ended') return;
  S.phase = 'crashed'; S.shown = d.multiplier;
  sound('flyoff');
  mBox.innerHTML = `<small style="display:block;font-size:.3em;letter-spacing:1px;color:#ff9aa5">L'avion s'est envolé !</small>${d.multiplier.toFixed(2)}x`; mBox.classList.add('crashed-text');
  $('gameStatusText').textContent = "L'avion s'est envolé ! Les mises non encaissées sont perdues.";
  live.textContent = '';
  const p = draw(S.shown, performance.now());
  trail.innerHTML = '';
  // l'avion ne s'écrase plus : il met les gaz, se cabre et file hors de l'écran (animé dans frame())
  S.fly = { x: p.x, y: p.y, a: S.ang, t0: performance.now(), last: performance.now() };
  sync(d.room);
});

socket.on('player-cashed-out', d => {
  if (d.socketId !== socket.id) return;
  sound('win');
  live.textContent = `Tu as gagné ${d.winnings} 🪙 ! (x${Number(d.multiplier).toFixed(2)})`;
});

socket.on('game-session-ended', d => {
  S.phase = 'ended'; Snd.stopMusic(); sound('win');
  $('finalPot').textContent = eur(d.pot);
  const box = $('finalLeaderboardList'); box.innerHTML = '';
  d.leaderboard.forEach((p, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'background:#0d0814;padding:10px;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px';
    const perf = (p.performance >= 0 ? '+' : '') + Math.round(p.performance * 100) + ' %';
    const gl = p.finalBalance - p.initialBalance, st = p.stats || {};
    row.innerHTML = `<span><b>#${i + 1} ${nm(p.name)}</b><br><small style="color:#94a3b8">mise ${eur(p.stake)} · ${fmtN(p.finalBalance)} 🪙 (${perf})</small><br><small class="${gl >= 0 ? 'text-green' : 'text-red'}">${gl >= 0 ? 'a gagné +' : 'a perdu −'}${fmtN(Math.abs(gl))} 🪙 (${fmtPctG(pctOf(p.finalBalance, p.initialBalance))})</small><br><small style="color:#7d7494">${st.gamesPlayed || 0} parties · ${st.wins || 0} gagnées</small></span>
      <span style="text-align:right">reçoit <b>${eur(p.payout)}</b><br><b class="${p.net >= 0 ? 'text-green' : 'text-red'}">${p.net >= 0 ? '+' : ''}${eur(p.net)}</b></span>`;
    box.appendChild(row);
  });
  $('finalTransfers').innerHTML = d.transfers.length
    ? d.transfers.map(t => `<div><b>${esc(t.from)}</b> → <b>${esc(t.to)}</b> : ${eur(t.amount)}</div>`).join('')
    : 'Personne ne doit rien à personne.';
  sideVis(); S.endData = d.charts || null; S.endSel = null; endCharts();
  $('rematchBtn').disabled = false; $('rematchBtn').textContent = '🔁 Continuer : nouvelle partie avec les mêmes joueurs'; $('rematchInfo').textContent = '';
  show('gameOverModal');
});
function endCharts() {
  const box = $('finalCharts'); if (!box) return; const d = S.endData;
  if (!d || !d.players.length) { box.innerHTML = ''; return; }
  const pls = d.players, sel = S.endSel ? pls.find(p => p.name === S.endSel) : null;
  let h = '<h4 style="margin:0 0 6px">📈 Évolution des fortunes</h4>';
  if (!sel) {
    h += chSvg(pls.map((p, i) => ({ name: p.name, color: chColor(p, i), pts: chSeries(p, d.t) })), false);
    h += '<div class="ch-sub" style="margin-top:6px">Clique sur un joueur pour voir son graphique et ses paris</div>';
    h += pls.map((p, i) => ({ p, i, pc: pctOf(p.eq, p.initial) })).sort((a, b) => b.pc - a.pc).map(({ p, i, pc }) =>
      `<div class="ch-pl" data-n="${esc(p.name)}"><i style="background:${chColor(p, i)};box-shadow:0 0 8px ${chColor(p, i)}"></i><span class="n">${nm(p.name)}</span><span class="v"><span class="${pc >= 0 ? 'text-green' : 'text-red'}">${fmtPctG(pc)}</span><small>${p.eq - p.initial >= 0 ? '+' : '−'}${fmtN(Math.abs(p.eq - p.initial))} 🪙 · ${fmtN(p.eq)} 🪙</small></span></div>`).join('');
  } else {
    const i = pls.indexOf(sel), pc = pctOf(sel.eq, sel.initial), ser = chSeries(sel, d.t), ys = ser.map(q => q[1]), best = Math.max(...ys), worst = Math.min(...ys), gl = sel.eq - sel.initial;
    h += `<button class="ch-back" style="width:auto;margin:0 0 8px;padding:4px 12px;font-size:12px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#f0dcae;cursor:pointer" data-back="1">← Tous les joueurs</button> <b>${nm(sel.name)}</b>`;
    h += chSvg([{ name: sel.name, color: chColor(sel, i), pts: ser }], true);
    h += `<div class="ch-tiles"><div class="ch-tile"><b>${fmtN(sel.eq)} 🪙</b><span>Final</span></div><div class="ch-tile"><b class="${gl >= 0 ? 'text-green' : 'text-red'}">${gl >= 0 ? '+' : '−'}${fmtN(Math.abs(gl))} 🪙</b><span>${gl >= 0 ? 'Gagné' : 'Perdu'}</span></div><div class="ch-tile"><b class="${pc >= 0 ? 'text-green' : 'text-red'}">${fmtPctG(pc)}</b><span>Évolution</span></div><div class="ch-tile"><b class="text-green">${fmtPctG(best)}</b><span>Pic</span></div><div class="ch-tile"><b class="text-red">${fmtPctG(worst)}</b><span>Plus bas</span></div><div class="ch-tile"><b>${(sel.stats && sel.stats.wins) || 0}/${(sel.stats && sel.stats.gamesPlayed) || 0}</b><span>Victoires</span></div></div>`;
    h += '<div class="ch-sub">Ses paris (récents en premier)</div><div style="max-height:220px;overflow-y:auto">' + (sel.bets.length ? sel.bets.map(feedRowHtml).join('') : '<div class="feed-empty">Aucun pari</div>') + '</div>';
  }
  box.innerHTML = h;
}
$('finalCharts').addEventListener('click', e => { if (e.target.closest('[data-back]')) { S.endSel = null; endCharts(); return; } const r = e.target.closest('.ch-pl'); if (r) { S.endSel = r.dataset.n; endCharts(); } });
function rematch() { $('rematchBtn').disabled = true; $('rematchBtn').textContent = 'Création de la nouvelle partie…'; socket.emit('rematch', { roomCode: S.code }); }
socket.on('rematch-go', () => location.reload()); // au rechargement, le compte est remis dans la nouvelle room (salon d'attente)
socket.on('rematch-info', d => {
  const el = $('rematchInfo'); if (!el) return;
  el.innerHTML = d && d.code ? `🔁 Déjà partis sur la nouvelle partie : ${d.names.map(nm).join(', ')}.<br>Clique sur « Continuer » pour les rejoindre (code <b>${esc(d.code)}</b>).` : '';
});
socket.on('error-message', () => { const b = $('rematchBtn'); if (b && b.disabled && S.phase === 'ended') { b.disabled = false; b.textContent = '🔁 Continuer : nouvelle partie avec les mêmes joueurs'; } });

// Connexion / reprise : le jeton de session est gardé dans le navigateur. À chaque (re)connexion on le renvoie au serveur,
// qui nous remet dans notre room (même après un rafraîchissement ou une coupure réseau).
const TOKEN_KEY = 'authToken';
const getTok = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
const setTok = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };
function authSubmit(mode) {
  const username = $('authUser').value.trim(), password = $('authPass').value;
  if (!username || !password) return alert('Entre ton pseudo et ton mot de passe !');
  socket.emit(mode === 'register' ? 'auth-register' : 'auth-login', { username, password });
}
function logout() { socket.emit('auth-logout'); setTok(null); location.reload(); }
socket.on('auth-ok', d => {
  S.myName = d.name; setTok(d.token);
  S.admCodeMode = !!d.adminCode; $('whoami').innerHTML = nm(d.name); $('authPass').value = ''; if (S.isAdmin) $('whoami').innerHTML = nm(d.name);
  if (!S.code) { show('loginCard', false); show('roomCards'); }
  sideVis();
});
socket.on('auth-error', m => alert(m));
socket.on('auth-invalid', () => { setTok(null); if (S.code) { alert('Session expirée : reconnecte-toi.'); location.reload(); } });
socket.on('resumed', d => {
  enterLobby(d.room);
  if (d.started) { show('lobby', false); if (S.view !== 'hub') returnToHub(); else show('game-hub'); }
});
socket.on('no-room', () => { if (S.code && S.phase !== 'ended') { alert('Cette room n\'existe plus (le serveur a redémarré ou la session est terminée).'); location.reload(); } });
socket.on('disconnect', () => { $('gameStatusText').textContent = '⚠️ Connexion perdue... reconnexion automatique'; });
socket.on('connect', () => { const t = getTok(); if (t) socket.emit('auth-token', { token: t }); S.wasConnected = true; });
