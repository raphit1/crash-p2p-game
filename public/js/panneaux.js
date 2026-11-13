'use strict';
/* ============================================================
   ARRÊTER LA PARTIE : vote (unanimité des joueurs connectés) + arrêt automatique décidé par le serveur
   ============================================================ */
function renderStopBar(room) {
  const bar = $('stopBar'), live = !!room.live && S.phase !== 'ended';
  bar.classList.toggle('hidden', !live); if (!live) return;
  const me = room.players.find(p => p.id === socket.id), votes = room.stopVotes || [], n = room.players.filter(p => p.connected).length;
  S.iVoted = !!(me && votes.includes(me.name));
  $('stopMsg').textContent = S.stopMsg || (votes.length ? `🛑 ${votes.length}/${n} veulent arrêter` : 'Partie en cours');
  const btn = $('stopBtn'); btn.textContent = S.iVoted ? '✋ Annuler mon vote' : '🛑 Arrêter la partie'; btn.classList.toggle('on', S.iVoted);
}
function voteStop() { socket.emit('vote-stop', { roomCode: S.code, vote: !S.iVoted }); }
socket.on('stop-notice', d => { S.stopMsg = d.message; $('stopMsg').textContent = d.message; clearTimeout(S.stopMsgT); S.stopMsgT = setTimeout(() => { S.stopMsg = ''; }, 3200); });


/* ============================================================
   PANNEAU LATÉRAL « 📡 PARIS EN DIRECT » (feed) — flux temps réel
   Le serveur émet 'bet-feed' (tableau des 30 derniers paris de la room,
   du plus récent au plus ancien). Chaque ligne : joueur, jeu, mise,
   multiplicateur, résultat net, statut (pending / win / loss / push / void).
   Rétractable via l'en-tête ; les « il y a Xs » sont rafraîchis toutes les 5 s.
   ============================================================ */
const FEED_NAMES = { crash:'Crash Out', ice:'Icefield', jm:'Just Mixed', cr:'Chicken Road', ar:'Arrows X', rl:'Roulette', bj:'Blackjack', mn:'Mines', pk:'Plinko', dc:'Dés', sl:'Machine à sous', hl:'Hi-Lo', cf:'Pile ou Face' };
let feedRows = [];
try { const fc = localStorage.getItem('feedCollapsed'); if (fc === '1' || (fc === null && window.innerWidth <= 700)) $('feedPanel').classList.add('collapsed'); } catch (e) { if (window.innerWidth <= 700) $('feedPanel').classList.add('collapsed'); } // sur téléphone, replié par défaut

function toggleFeed() {
  const p = $('feedPanel');
  p.classList.toggle('collapsed');
  try { localStorage.setItem('feedCollapsed', p.classList.contains('collapsed') ? '1' : '0'); } catch (e) {}
}
function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'il y a ' + s + 's';
  if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
  return 'il y a ' + Math.floor(s / 3600) + ' h';
}
function fmtN(v) { return Number(v).toLocaleString('fr-FR'); }
function feedRowHtml(r) {
  const cls = (r.status === 'won' || r.status === 'win') ? 'win' : r.status === 'push' ? 'push' : r.status === 'pending' ? 'pending' : 'loss';
  let netTxt, netCls;
  if (r.status === 'pending') { netTxt = r.queued ? '⏳ manche suivante' : '⏳ en cours'; netCls = 'pend'; }
  else if (r.status === 'void') { netTxt = 'annulé'; netCls = 'zero'; }
  else if (r.net > 0) { netTxt = '+' + fmtN(r.net) + ' 🪙'; netCls = 'pos'; }
  else if (r.net < 0) { netTxt = '−' + fmtN(-r.net) + ' 🪙'; netCls = 'neg'; }
  else { netTxt = '0 🪙'; netCls = 'zero'; }
  const mult = (r.status === 'pending' || r.mult == null) ? '' : (r.mult >= 1000 ? Math.round(r.mult) + 'x' : (+r.mult).toFixed(2).replace(/\.?0+$/, '') + 'x');
  const me = S.code && r.name === (S.myName || '') ? ' style="background:rgba(92,200,255,.08)"' : '';
  return `<div class="feed-row ${cls}"${me}>
    <span class="feed-ic">${r.icon || '🎲'}</span>
    <span class="feed-mid"><span class="feed-name">${nm(r.name)}</span>
      <span class="feed-sub">${FEED_NAMES[r.game] || r.game} · mise ${fmtN(r.bet)} 🪙${r.status !== 'pending' && r.win ? ' · gagne ' + fmtN(r.win) : ''} · ${ago(r.ts || Date.now())}</span></span>
    <span class="feed-right"><div class="feed-net ${netCls}">${netTxt}</div>${mult ? `<div class="feed-mult">${mult}</div>` : ''}</span>
  </div>`;
}
function feedRender() {
  const list = $('feedList');
  if (!list) return;
  if (!feedRows.length) { list.innerHTML = '<div class="feed-empty">Aucun pari pour l\u0027instant…</div>'; }
  else {
    const vis = feedRows.slice(0, 40);
    const top = list.scrollTop;
    list.innerHTML = vis.map(feedRowHtml).join('');
    if (top > 4) list.scrollTop = top; // ne pas remonter si l'utilisateur a scrollé
  }
  const wins = feedRows.filter(r => r.status === 'won' || r.status === 'win').length;
  const pend = feedRows.filter(r => r.status === 'pending').length;
  const vol = feedRows.reduce((a, r) => a + (Number(r.bet) || 0), 0);
  $('feedCount').textContent = `${feedRows.length} pari${feedRows.length > 1 ? 's' : ''}${pend ? ' · ' + pend + ' ⏳' : ''} · ${wins} gagnant${wins > 1 ? 's' : ''}`;
  $('feedVol').textContent = 'volume : ' + fmtN(vol) + ' 🪙';
}
socket.on('bet-feed', rows => { feedRows = Array.isArray(rows) ? rows : []; $('feedPanel').classList.remove('hidden'); $('sideTabs').classList.remove('hidden'); feedRender(); });
/* ============================================================
   PANNEAU GAUCHE « 📈 Graphiques » : courbe de fortune de chaque joueur (en %
   par rapport à l'argent de départ), clic sur un joueur = son graphique + ses paris.
   Le serveur garde la courbe ('hist-get' -> 'hist-data') ; rafraîchi toutes les 3 s tant que le panneau est ouvert.
   ============================================================ */
const CH_COLORS = ['#5cc8ff', '#ffb347', '#7cffb2', '#ff6fae', '#c4a1ff', '#ffe14a', '#ff7a5c', '#4ade80', '#38bdf8', '#f472b6'];
let chOpen = false, chData = null, chSel = null, chTimer = 0;
const pctOf = (eq, ini) => ini ? (eq - ini) / ini * 100 : 0;
function fmtPctG(v) { const a = Math.abs(v); const t = a >= 100000 ? new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : v.toLocaleString('fr-FR', { maximumFractionDigits: a >= 100 ? 0 : 1 }); return (v >= 0 ? '+' : '') + t + ' %'; }
function chColor(pl, i) { if (pl.vip) return '#ff2a3f'; if (String(pl.name).trim().toLowerCase() === 'dario') return '#ffc9dc'; return CH_COLORS[i % CH_COLORS.length]; }
function chSeries(pl, now) { const pts = (pl.pts || []).map(q => [q[0], pctOf(q[1], pl.initial)]); if (!pts.length) pts.push([now - 1000, 0]); pts.push([now, pctOf(pl.eq, pl.initial)]); return pts; }
function chSvg(series, single) {
  const W = 340, H = 200, L = 46, R = 12, T = 12, B = 24;
  let t0 = Infinity, t1 = -Infinity, ymin = 0, ymax = 0;
  series.forEach(s => s.pts.forEach(([t, y]) => { t0 = Math.min(t0, t); t1 = Math.max(t1, t); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }));
  if (!(t1 > t0)) t1 = t0 + 1000;
  const log = Math.max(Math.abs(ymin), Math.abs(ymax)) > 3000;
  const f = y => log ? Math.sign(y) * Math.log10(1 + Math.abs(y)) : y;
  let lo = f(ymin), hi = f(ymax); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * .08; lo -= pad; hi += pad;
  const X = t => L + (t - t0) / (t1 - t0) * (W - L - R), Y = y => T + (1 - (f(y) - lo) / (hi - lo)) * (H - T - B);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * i / 4, yy = T + (1 - i / 4) * (H - T - B);
    const real = log ? Math.sign(v) * (Math.pow(10, Math.abs(v)) - 1) : v;
    g += `<line x1="${L}" x2="${W - R}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#ffffff" stroke-opacity=".07"/><text x="${L - 5}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#9a90ad">${esc(fmtPctG(Math.round(real * 10) / 10).replace(' %', '%'))}</text>`;
  }
  const y0 = Y(0); g += `<line x1="${L}" x2="${W - R}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" stroke="#d4a24c" stroke-opacity=".55" stroke-dasharray="4 4"/>`;
  const dur = Math.max(1, Math.round((t1 - t0) / 1000)), dtxt = dur < 90 ? dur + ' s' : dur < 5400 ? Math.round(dur / 60) + ' min' : (dur / 3600).toFixed(1) + ' h';
  g += `<text x="${L}" y="${H - 7}" font-size="9" fill="#9a90ad">il y a ${dtxt}</text><text x="${W - R}" y="${H - 7}" font-size="9" fill="#9a90ad" text-anchor="end">maintenant</text>`;
  series.forEach(s => {
    const d = s.pts.map(([t, y], i) => (i ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(y).toFixed(1)).join(' ');
    if (single) {
      const last = s.pts[s.pts.length - 1], up = last[1] >= 0, col = up ? '#4ade80' : '#f87171';
      g += `<path d="${d} L${X(last[0]).toFixed(1)} ${y0.toFixed(1)} L${X(s.pts[0][0]).toFixed(1)} ${y0.toFixed(1)}Z" fill="${col}" fill-opacity=".14"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="3.6" fill="${col}"/>`;
    } else {
      const last = s.pts[s.pts.length - 1];
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="3.2" fill="${s.color}"/>`;
    }
  });
  return `<svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>${log ? '<div class="ch-note">échelle logarithmique (écarts énormes)</div>' : ''}`;
}
function chRender() {
  const body = $('chartBody'); if (!body) return;
  if (!chData || !chData.players.length) { body.innerHTML = '<div class="feed-empty">Pas encore de données…</div>'; return; }
  const now = chData.t, top = body.scrollTop, pls = chData.players;
  const sel = chSel ? pls.find(p => p.name === chSel) : null;
  if (chSel && !sel) chSel = null;
  $('chBack').classList.toggle('hidden', !sel);
  let h;
  if (!sel) {
    $('chTitle').textContent = '📈 Graphiques des joueurs';
    const ser = pls.map((p, i) => ({ name: p.name, color: chColor(p, i), pts: chSeries(p, now) }));
    h = chSvg(ser, false) + '<div class="ch-sub">Joueurs — clique pour voir le détail</div>';
    h += pls.map((p, i) => ({ p, i, pc: pctOf(p.eq, p.initial) })).sort((a, b) => b.pc - a.pc).map(({ p, i, pc }) =>
      `<div class="ch-pl" data-n="${esc(p.name)}"><i style="background:${chColor(p, i)};box-shadow:0 0 8px ${chColor(p, i)}"></i><span class="n">${nm(p.name)}${p.connected ? '' : ' 💤'}</span><span class="v"><span class="${pc >= 0 ? 'text-green' : 'text-red'}">${fmtPctG(pc)}</span><small>${fmtN(p.eq)} 🪙</small></span></div>`).join('');
  } else {
    const i = pls.indexOf(sel), pc = pctOf(sel.eq, sel.initial), ser = chSeries(sel, now);
    const ys = ser.map(q => q[1]), best = Math.max(...ys), worst = Math.min(...ys);
    $('chTitle').innerHTML = nm(sel.name);
    h = chSvg([{ name: sel.name, color: chColor(sel, i), pts: ser }], true);
    h += `<div class="ch-tiles"><div class="ch-tile"><b>${fmtN(sel.eq)} 🪙</b><span>Fortune</span></div><div class="ch-tile"><b class="${pc >= 0 ? 'text-green' : 'text-red'}">${fmtPctG(pc)}</b><span>Évolution</span></div><div class="ch-tile"><b>${fmtN(sel.initial)} 🪙</b><span>Départ</span></div><div class="ch-tile"><b class="text-green">${fmtPctG(best)}</b><span>Pic</span></div><div class="ch-tile"><b class="text-red">${fmtPctG(worst)}</b><span>Plus bas</span></div><div class="ch-tile"><b>${sel.bets.length}</b><span>Paris</span></div></div>`;
    h += '<div class="ch-sub">Ses paris (récents en premier)</div>' + (sel.bets.length ? sel.bets.map(feedRowHtml).join('') : '<div class="feed-empty">Aucun pari pour l\u0027instant…</div>');
  }
  body.innerHTML = h; body.scrollTop = top;
}
function chFetch() { if (S.code) socket.emit('hist-get', { roomCode: S.code }); }
let sideTab = 'charts', chatUnread = 0, chatRows = [];
function sideSet(tab) {
  sideTab = tab;
  document.querySelectorAll('.ch-tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === tab));
  document.querySelectorAll('#sideTabs .sb').forEach(x => x.classList.toggle('on', chOpen && x.dataset.t === tab));
  $('chHead').style.display = tab === 'charts' ? 'flex' : 'none';
  $('chartBody').classList.toggle('hidden', tab !== 'charts'); $('chatBody').classList.toggle('hidden', tab !== 'chat'); $('genBody').classList.toggle('hidden', tab !== 'gen'); $('setBody').classList.toggle('hidden', tab !== 'set');
  $('chatBody').style.display = tab === 'chat' ? 'flex' : 'none';
  clearInterval(chTimer);
  if (!chOpen) return;
  if (tab === 'charts') { chFetch(); chTimer = setInterval(chFetch, 3000); }
  else if (tab === 'chat') { chatUnread = 0; chatBadge(); chatPaint(true); setTimeout(() => $('chatInput').focus(), 320); }
  else if (typeof genOpen === 'function') genOpen();
}
function sideToggle(tab) {
  if (chOpen && sideTab === tab) chOpen = false; else chOpen = true;
  $('chartPanel').classList.toggle('open', chOpen); $('sideTabs').classList.toggle('open', chOpen);
  $('chartPanel').setAttribute('aria-hidden', chOpen ? 'false' : 'true');
  document.body.classList.toggle('side-open', chOpen);
  sideSet(tab);
}
function chartToggle() { sideToggle('charts'); }
document.querySelectorAll("#sideTabs .sb[data-t]").forEach(x => x.addEventListener("click", () => sideToggle(x.dataset.t)));
document.querySelectorAll('.ch-tabs button[data-t]').forEach(x => x.addEventListener('click', () => sideSet(x.dataset.t)));
document.querySelector('.ch-x').addEventListener('click', () => sideToggle(sideTab));
sideSet('charts');


