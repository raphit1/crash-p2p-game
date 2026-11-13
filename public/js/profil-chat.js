'use strict';
/* ---------- Général : classement (moyenne des % par session) + profils + badges ---------- */
let genView = 'board', genBoard = null, genProf = null, genMode = 'pct', genSel = -1;
function sideVis() {
  $('sideTabs').classList.remove('hidden');
  document.querySelectorAll('#sideTabs .sb[data-t=charts],#sideTabs .sb[data-t=chat],.ch-tabs button[data-t=charts],.ch-tabs button[data-t=chat]').forEach(x => { x.style.display = S.code ? '' : 'none'; });
  if (!S.code && sideTab !== 'gen') sideSet('gen');
}
function genOpen() { socket.emit('gen-get'); if (genView !== 'board') socket.emit('prof-get', { name: genView }); genRender(); }
/* Corps d'un profil (statistiques, dernières sessions, badges) : utilisé par le classement ET par « Mon profil » */
function profBody(p) {
  let h = '';
      const got = p.badges.filter(x => x.got).length, mx = Math.max(10, ...p.last.map(Math.abs));
      h += `<div class="ch-tiles"><div class="ch-tile"><b>${p.n}</b><span>Sessions</span></div><div class="ch-tile"><b class="${p.avg >= 0 ? 'text-green' : 'text-red'}">${p.n ? fmtPctG(p.avg) : '—'}</b><span>Moyenne</span></div><div class="ch-tile"><b>${p.c1}</b><span>Victoires 🏆</span></div><div class="ch-tile"><b class="text-green">${p.best == null ? '—' : fmtPctG(p.best)}</b><span>Meilleure</span></div><div class="ch-tile"><b class="text-red">${p.worst == null ? '—' : fmtPctG(p.worst)}</b><span>Pire</span></div><div class="ch-tile"><b>${p.bm ? xf(p.bm) : '—'}</b><span>Record mult.</span></div><div class="ch-tile"><b>${fmtN(p.g)}</b><span>Parties</span></div><div class="ch-tile"><b class="${p.tp >= 0 ? 'text-green' : 'text-red'}">${p.tp >= 0 ? '+' : '−'}${eur(Math.abs(p.tp) / 100)}</b><span>Gain net 💶</span></div><div class="ch-tile"><b>${fmtN(p.msg)}</b><span>Messages</span></div></div>`;
      if (p.canReset) h += `<div class="gn-top"><button data-act="reset" style="border-color:#f87171;color:#f87171">🗑️ Remettre mes stats à zéro (admin)</button></div>`;
      const ls = (p.ls && p.ls.length) ? p.ls : p.last.map(v => [0, v, 0, 0, 0]);
      if (ls.length) {
        const mxs = Math.max(10, ...ls.map(r => Math.abs(r[1])));
        h += `<div class="ch-sub">Dernières sessions <span style="font-weight:600;color:#9a90ad">(touche une barre)</span></div><div class="pf-wrap">${ls.map((r, i) => {
          const v = r[1], hh = Math.max(3, Math.abs(v) / mxs * 90), c = v >= 0 ? '#4ade80' : '#f87171', lab = `<em style="color:${c}">${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}%</em>`;
          return `<div class="pf-col${i === genSel ? ' on' : ''}" data-s="${i}"><div class="h">${v >= 0 ? lab + `<i style="height:${hh}%;background:${c}"></i>` : ''}</div><div class="l">${v < 0 ? `<i style="height:${hh}%;background:${c}"></i>` + lab : ''}</div></div>`;
        }).join('')}</div>`;
        const r = ls[genSel];
        if (r) h += `<div class="pf-det"><b>${r[0] ? new Date(r[0]).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Session'}</b> · <b class="${r[1] >= 0 ? 'text-green' : 'text-red'}">${fmtPctG(r[1])}</b>${r[0] ? `<br>${r[2] >= 0 ? 'Gagné' : 'Perdu'} : <b class="${r[2] >= 0 ? 'text-green' : 'text-red'}">${eur(Math.abs(r[2]) / 100)}</b> · ${r[3]} partie${r[3] > 1 ? 's' : ''}${r[4] ? ' · 🏆 1er de la room' : ''}` : ''}</div>`;
      }
      h += `<div class="ch-sub">Badges ${got}/${p.badges.length}</div><div class="bd-grid">${p.badges.map(x => `<div class="bd${x.got ? '' : ' lock'}" title="${esc(x.d)}"><span class="e">${x.got ? x.e : '🔒'}</span><div><b>${esc(x.n)}</b><span>${esc(x.d)}</span></div></div>`).join('')}</div>`;
  return h;
}
function genRender() {
  const b = $('genBody'); if (!b) return; const top = b.scrollTop; let h = '';
  if (genView === 'board') {
    h += `<div class="gn-top"><button data-act="me">👤 Mon profil</button><button data-act="refresh">🔄 Actualiser</button></div><div class="gn-top"><button data-act="m-pct" style="${genMode === 'pct' ? 'border-color:#d4a24c' : ''}">📊 Moyenne %</button><button data-act="m-net" style="${genMode === 'net' ? 'border-color:#d4a24c' : ''}">💶 Gains</button><button data-act="m-loss" style="${genMode === 'loss' ? 'border-color:#d4a24c' : ''}">📉 Pertes</button></div><div class="ch-sub" style="margin-top:2px">${{ pct: '📊 Classement — moyenne des %', net: '💶 Classement — argent gagné (net)', loss: '📉 Classement — argent perdu' }[genMode]}</div><div class="ch-note" style="text-align:left">${{ pct: 'Moyenne des % de gain de chaque session terminée', net: 'Somme de tout ce que chacun a gagné moins perdu, sur toutes ses sessions (utile surtout à plusieurs)', loss: 'Total des sous perdus sur toutes les sessions (comptées depuis cette mise à jour)' }[genMode]}</div>`;
    if (!genBoard) h += '<div class="feed-empty">Chargement…</div>';
    else if (!genBoard.board.length) h += '<div class="feed-empty">Personne n’a encore terminé de session. Le classement apparaîtra à la fin de la première !</div>';
    else {
      const rows = genBoard.board.slice();
      if (genMode === 'net') rows.sort((a, b) => b.tp - a.tp); else if (genMode === 'loss') rows.sort((a, b) => b.tl - a.tl);
      h += rows.map((r, i) => {
        const big = genMode === 'pct' ? `<span class="${r.avg >= 0 ? 'text-green' : 'text-red'}">${fmtPctG(r.avg)}</span>`
          : genMode === 'net' ? `<span class="${r.tp >= 0 ? 'text-green' : 'text-red'}">${r.tp >= 0 ? '+' : '−'}${eur(Math.abs(r.tp) / 100)}</span>`
          : `<span class="text-red">−${eur(r.tl / 100)}</span>`;
        const sm = genMode === 'pct' ? `${r.n} session${r.n > 1 ? 's' : ''} · 🏅 ${r.badges}` : genMode === 'net' ? `gagné ${eur(r.tg / 100)} · perdu ${eur(r.tl / 100)}` : `${r.n} session${r.n > 1 ? 's' : ''}`;
        return `<div class="gn-row${r.name === S.myName ? ' me' : ''}" data-n="${esc(r.name)}"><span class="rk">${i < 3 ? ['🥇', '🥈', '🥉'][i] : '#' + (i + 1)}</span>${avHTML(r.name, r.cos, 34)}<span class="n">${nm(r.name)}<small class="lvtag">Niv. ${r.cos ? r.cos.lv : 1}</small></span><span class="v">${big}<small>${sm}</small></span></div>`;
      }).join('');
    }
  } else {
    const p = genProf && genProf.name.toLowerCase() === genView.toLowerCase() ? genProf : null;
    h += `<div class="gn-top"><button data-act="back">← Classement</button></div>`;
    if (!p) h += '<div class="feed-empty">Chargement…</div>';
    else {
      h += profHero(p) + profBody(p);
    }
  }
  b.innerHTML = h; b.scrollTop = top;
}
$('genBody').addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a) { const t = a.dataset.act; if (t === 'm-pct' || t === 'm-net' || t === 'm-loss') { genMode = t.slice(2); genRender(); } else if (t === 'back') { genView = 'board'; genOpen(); } else if (t === 'reset') { if (confirm('Remettre à zéro tes stats, ton classement et tes badges ? Impossible d’annuler.')) socket.emit('prof-reset'); } else if (t === 'refresh') genOpen(); else if (t === 'me') { openMe(); } return; }
  const c = e.target.closest('.pf-col'); if (c) { genSel = genSel === +c.dataset.s ? -1 : +c.dataset.s; genRender(); return; }
  const r = e.target.closest('.gn-row'); if (r) { genView = r.dataset.n; genProf = null; genSel = -1; $('genBody').scrollTop = 0; genOpen(); }
});
socket.on('gen-data', d => { genBoard = d; if (chOpen && sideTab === 'gen') genRender(); });
socket.on('prof-reset-ok', () => { genSel = -1; socket.emit('gen-get'); });
socket.on('prof-data', d => { genProf = d; if (chOpen && sideTab === 'gen') genRender(); });
function badgeToast(list) {
  const t = $('bdToast'); t.innerHTML = '<b>🏅 Badge' + (list.length > 1 ? 's' : '') + ' débloqué' + (list.length > 1 ? 's' : '') + ' !</b>' + list.map(x => `<div style="font-size:15px;margin-top:3px">${x.e} <b style="display:inline;font-size:15px;color:#fff;text-transform:none">${esc(x.n)}</b><div style="font-size:11px;color:#cdbf9f">${esc(x.d)}</div></div>`).join('');
  t.classList.add('show'); sound('win'); clearTimeout(badgeToast.t); badgeToast.t = setTimeout(() => t.classList.remove('show'), 6000);
}
socket.on('badges-new', list => {
  if (!list || !list.length) return; badgeToast(list);
  const el = $('endBadges'); if (el) el.innerHTML = '<h4 style="margin:0 0 6px;text-align:left">🏅 Nouveaux badges</h4><div class="bd-grid">' + list.map(x => `<div class="bd"><span class="e">${x.e}</span><div><b>${esc(x.n)}</b><span>${esc(x.d)}</span></div></div>`).join('') + '</div>';
});

/* ---------- Réglages (gardés dans le navigateur) ---------- */
const CFG_KEY = 'cfgV1'; let cfg = { m: 100, s: 100, rm: false };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) {}
function cfgApply(save) {
  Snd.setVol('music', cfg.m / 100); Snd.setVol('sfx', cfg.s / 100); document.documentElement.classList.toggle('rm', !!cfg.rm);
  $('stMusic').value = cfg.m; $('stSfx').value = cfg.s; $('stRM').checked = !!cfg.rm; $('stMV').textContent = cfg.m + ' %'; $('stSV').textContent = cfg.s + ' %';
  if (save) { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }
}
$('stMusic').addEventListener('input', e => { cfg.m = +e.target.value; cfgApply(true); });
$('stSfx').addEventListener('input', e => { cfg.s = +e.target.value; cfgApply(true); });
$('stSfx').addEventListener('change', () => { Snd.unlock(); sound('win'); });
$('stRM').addEventListener('change', e => { cfg.rm = e.target.checked; cfgApply(true); });
$('stTest').addEventListener('click', () => { startAudio(); sound('win'); });
cfgApply(false);

/* ---------- Chat ---------- */
function chatBadge() { const b = $('chatBadge'); b.textContent = chatUnread > 9 ? '9+' : chatUnread; b.classList.toggle('hidden', !chatUnread); }
function chatRow(m) { const t = new Date(m.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); return `<div class="cm${m.name === S.myName ? ' me' : ''}"><span class="cn">${avHTML(m.name, m.cos, 22)} ${nm(m.name)}<span class="ct">${t}</span></span>${esc(m.text)}</div>`; }
function chatPaint(forceBottom) {
  const l = $('chatList'), near = forceBottom || l.scrollHeight - l.scrollTop - l.clientHeight < 80;
  l.innerHTML = chatRows.length ? chatRows.map(chatRow).join('') : '<div class="feed-empty">Aucun message. Dis bonjour 👋</div>';
  if (near) l.scrollTop = l.scrollHeight;
}
$('chatForm').addEventListener('submit', e => { e.preventDefault(); const i = $('chatInput'), t = i.value.trim(); if (!t || !S.code) return; socket.emit('chat-send', { roomCode: S.code, text: t }); i.value = ''; });
socket.on('chat-log', rows => { chatRows = Array.isArray(rows) ? rows : []; chatUnread = 0; chatBadge(); if (chOpen && sideTab === 'chat') chatPaint(true); });
socket.on('chat-msg', m => {
  chatRows.push(m); if (chatRows.length > 80) chatRows.shift();
  if (chOpen && sideTab === 'chat') chatPaint(false);
  else if (m.name !== S.myName) { chatUnread++; chatBadge(); sound('tick'); }
});
function chartBack() { chSel = null; chRender(); }
$('chartBody').addEventListener('click', e => { const r = e.target.closest('.ch-pl'); if (r) { chSel = r.dataset.n; $('chartBody').scrollTop = 0; chRender(); } });
socket.on('hist-data', d => { chData = d; if (chOpen) chRender(); });

setInterval(() => { if (!$('feedPanel').classList.contains('hidden')) feedRender(); }, 5000); // rafraîchit les « il y a Xs »

/* Fonctions appelées par les onclick du HTML (à la fin : tous les fichiers sont chargés) */

/* Fonctions appelées par les onclick du HTML (à la fin : tous les fichiers sont chargés) */
Object.assign(window, { pkStart, admToggle, admUnlock, mnStart, mnCash, copyRoomCode, voteStop, setStake, onStakeInput, leaveRoom, authSubmit, logout, createRoom, joinRoom, launchGame, switchGame, returnToHub, openHistoryModal, closeHistoryModal, toggleMusic, startIcefieldGame, cashoutIcefield, onColsChange, startJm, crStart, crGo, crCash, arStart, arThrow, rlSpin, rlClear, rlRepeat, bjDeal, bjHit, bjStand, bjDouble, bjSplit, bjInsurance, rlUndo, toggleFeed, chartToggle, chartBack, rematch, dcRoll, cfFlip, hlStart, hlCash });
