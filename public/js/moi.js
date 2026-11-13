'use strict';
/* ============================================================
   moi.js — « Mon profil » : niveau & XP, quêtes, apparences (cadres), photo, mot de passe.
   + avHTML() : avatar avec cadre de rang, utilisé partout (classement, chat, salon…)
   ============================================================ */
// Rangs (mêmes noms/titres que xp.js ; les niveaux requis viennent du serveur avec « me-data »)
const TIERS = [
  { id: 'bronze', n: 'Bronze', t: 'Novice du Hasard', c: '#cd7f32' }, { id: 'argent', n: 'Argent', t: 'Joueur Assidu', c: '#cfd8e3' },
  { id: 'or', n: 'Or', t: 'Chasseur de Gains', c: '#ffd34d' }, { id: 'platine', n: 'Platine', t: 'Stratège de Table', c: '#7fe7e0' },
  { id: 'diamant', n: 'Diamant', t: 'Flambeur Étincelant', c: '#7fc8ff' }, { id: 'maitre', n: 'Maître', t: 'Maître des Mises', c: '#ff7a2f' },
  { id: 'grandmaitre', n: 'Grand Maître', t: 'Seigneur du Hasard', c: '#c78bff' }, { id: 'legende', n: 'Légende', t: 'Légende du Casino', c: '#ffcf33' },
  { id: 'mythique', n: 'Mythique', t: 'Dieu du Jackpot', c: '#a66bff' },
  { id: 'secret', n: 'SECRET', t: '???', c: '#ff1a2e' }
];
/* ---------- Toasts (quêtes, XP, niveaux) ---------- */
(() => { const d = document.createElement('div'); d.id = 'toasts'; document.body.appendChild(d); })();
function xpToast(html, cls, ms) {
  const el = document.createElement('div'); el.className = 'tst ' + (cls || ''); el.innerHTML = html; $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), ms || 4200); setTimeout(() => el.remove(), (ms || 4200) + 500);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
let myXp = null; // { level, into, need, xp }
function setMeBadge(info) { myXp = info; const b = $('meLv'); if (b && info) b.textContent = info.level; }
socket.on('q-done', list => { sound('tick'); list.slice(0, 3).forEach(q => xpToast(`<b>🎯 Quête terminée !</b><span>${esc(q.text)}</span><em>+${q.xp} XP · à récupérer dans 👤 Mon profil</em>`, 'quest')); if (list.length > 3) xpToast(`<b>🎯 +${list.length - 3} autres quêtes terminées</b>`, 'quest'); if (meOpen && meTab === 'q') socket.emit('q-get'); });
socket.on('xp-gain', d => {
  setMeBadge(d.info);
  if (d.info.level > d.from) { sound('win'); xpToast(`<b>⭐ NIVEAU ${d.info.level} !</b><span>+${d.gain} XP (${esc(d.why)})</span>`, 'lvl', 5200); }
  else xpToast(`<b>+${d.gain} XP</b><span>${esc(d.why)}</span>`, 'xp', 2600);
  if (meOpen) socket.emit('me-get');
});

/* ---------- Écran « Mon profil » ---------- */
let meOpen = false, meTab = 'ov', meD = null, qS = null, qAt = 0, meMsg = '';
const meEl = document.createElement('div'); meEl.id = 'meScreen'; meEl.className = 'hidden'; document.body.appendChild(meEl);
function openMe() { meOpen = true; meMsg = ''; meEl.classList.remove('hidden'); document.body.classList.add('me-open'); socket.emit('me-get'); socket.emit('q-get'); meRender(); }
function closeMe() { meOpen = false; meEl.classList.add('hidden'); document.body.classList.remove('me-open'); }
socket.on('me-data', d => { meD = d; setMeBadge(d.info); if (meOpen) meRender(); });
socket.on('q-state', d => { qS = d; qAt = Date.now(); setMeBadge(d.xp); if (meOpen) { if (meTab === 'q') qRender(); else meRender(); } });
$('meBtn').addEventListener('click', () => { if (meOpen) closeMe(); else openMe(); });

const fmtT = ms => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return d ? `${d} j ${h} h` : h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`; };
function meHero() {
  const d = meD, i = d.info, pct = i.need ? Math.round(i.into / i.need * 100) : 100, ti = TIERS[d.cos.ti];
  return `<div class="me-hero"><div class="me-av">${avHTML(d.name, d.cos, 120)}</div><div class="me-id"><div class="me-name">${nm(d.name)}</div><div class="me-title" style="--fc:${ti.c}">${esc(ti.t)}</div><div class="me-rank" style="color:${TIERS[d.top].c}">Rang ${esc(TIERS[d.top].n)}</div>
    <div class="xpbar"><i style="width:${pct}%"></i></div><div class="xpl"><b>Niveau ${i.level}</b><span>${i.need ? fmtN(i.into) + ' / ' + fmtN(i.need) + ' XP' : 'MAX'}</span></div></div></div>`;
}
function meRender() {
  if (!meOpen) return;
  const tabs = [['ov', '📊 Aperçu'], ['q', '🎯 Quêtes'], ['ap', '✨ Apparence'], ['pa', '⚙️ Paramètres']];
  const top = meEl.querySelector('.me-body') ? meEl.querySelector('.me-body').scrollTop : 0;
  let h = `<div class="me-wrap"><div class="me-bar"><button class="me-x" data-a="close">✕ Fermer</button><span>👤 Mon profil</span></div>`;
  if (!meD) h += '<div class="feed-empty">Chargement…</div>';
  else {
    h += meHero() + `<div class="me-tabs">${tabs.map(([k, n]) => `<button data-a="tab" data-t="${k}" class="${meTab === k ? 'on' : ''}">${n}${k === 'q' && qS ? claimable() ? ' <b class="dot">' + claimable() + '</b>' : '' : ''}</button>`).join('')}</div><div class="me-body">`;
    if (meTab === 'ov') h += `<div class="ch-note" style="text-align:left;margin-bottom:6px">Membre depuis le ${new Date(meD.since).toLocaleDateString('fr-FR')}</div>` + profBody(meD.prof);
    else if (meTab === 'q') h += '<div id="qBox"></div>';
    else if (meTab === 'ap') h += apRender();
    else h += paRender();
    h += '</div>';
  }
  meEl.innerHTML = h + '</div>';
  const b = meEl.querySelector('.me-body'); if (b) b.scrollTop = top;
  if (meTab === 'q') qRender();
}
const claimable = () => qS ? [...qS.pools.flatMap(p => p.items), ...qS.life].filter(i => !i.c && i.p >= i.t).length : 0;

/* ----- Quêtes ----- */
function qItem(i) {
  const ok = i.p >= i.t, pct = Math.min(100, Math.round(i.p / i.t * 100));
  return `<div class="qi${i.c ? ' cl' : ok ? ' ok' : ''}"><span class="qic">${i.ic}</span><div class="qt"><b>${esc(i.text)}</b><div class="qbar"><i style="width:${pct}%"></i></div><small>${fmtN(i.p)} / ${fmtN(i.t)}</small></div><div class="qr"><span>+${fmtN(i.xp)} XP</span>${i.c ? '<em>✔ Récupérée</em>' : ok ? `<button data-a="claim" data-id="${esc(i.id)}">Récupérer</button>` : ''}</div></div>`;
}
let qLife = false;
function qRender() {
  const box = $('qBox'); if (!box) return;
  if (!qS) { box.innerHTML = '<div class="feed-empty">Chargement…</div>'; return; }
  const n = claimable();
  let h = `<div class="q-top"><div class="q-sw"><button data-a="qmode" data-m="0" class="${qLife ? '' : 'on'}">🔄 Renouvelables</button><button data-a="qmode" data-m="1" class="${qLife ? 'on' : ''}">♾️ Permanentes</button></div>${n ? `<button class="q-all" data-a="claimall">🎁 Tout récupérer (${n})</button>` : ''}</div>`;
  if (!qLife) h += qS.pools.map(p => `<div class="q-sec"><div class="q-h"><b>${p.label}</b><span>Nouvelles dans <em class="qtime" data-ex="${qAt + p.left}">${fmtT(p.left)}</em></span></div>${p.items.map(qItem).join('')}</div>`).join('');
  else {
    const fams = []; qS.life.forEach(q => { let f = fams.find(x => x.f === q.f); if (!f) fams.push(f = { f: q.f, items: [] }); f.items.push(q); });
    // dans chaque famille : on montre les paliers récupérés (repliés) + le prochain
    h += `<div class="q-sec"><div class="q-h"><b>♾️ Quêtes permanentes</b><span>${qS.life.filter(q => q.c).length} / ${qS.life.length} terminées</span></div>${fams.map(f => {
      const next = f.items.find(q => !q.c), done = f.items.filter(q => q.c).length;
      return next ? qItem(next) + (done ? `<div class="q-fd">${done} palier${done > 1 ? 's' : ''} déjà récupéré${done > 1 ? 's' : ''}</div>` : '') : `<div class="qi cl"><span class="qic">${f.items[0].ic}</span><div class="qt"><b>${esc(f.items[f.items.length - 1].text)}</b><small>Tous les paliers terminés</small></div><div class="qr"><em>✔ Complet</em></div></div>`;
    }).join('')}</div>`;
  }
  const sc = box.parentElement.scrollTop; box.innerHTML = h; box.parentElement.scrollTop = sc;
}
setInterval(() => {
  if (!meOpen || meTab !== 'q') return; let exp = false;
  meEl.querySelectorAll('.qtime').forEach(e => { const left = +e.dataset.ex - Date.now(); e.textContent = fmtT(left); if (left <= -800) exp = true; });
  if (exp) socket.emit('q-get');
}, 1000);

/* ----- Apparence : cadre + titre par rang ----- */
function apRender() {
  const d = meD, curF = d.cos.fr, curT = d.cos.ti;
  let h = `<div class="ch-note" style="text-align:left;margin-bottom:8px">Plus tu montes de niveau, plus tu débloques de rangs. Choisis le cadre et le titre que les autres voient.</div><div class="ap-grid">`;
  h += TIERS.map((T, k) => {
    const lock = k > d.top, lv = d.tiers[k].lv;
    if (k === 9 && lock) return `<div class="ap-c lock sec"><div class="ap-av"><div class="sec-q">?</div></div><b>SECRET ???</b><small>???</small><em>🔒 ???</em></div>`;
    return `<div class="ap-c${lock ? ' lock' : ''}${curF === k ? ' selF' : ''}${curT === k ? ' selT' : ''}"><div class="ap-av">${avHTML(d.name, { lv: lock ? lv : d.cos.lv, fr: k, ti: k, av: d.cos.av }, k === 9 ? 52 : k >= 6 ? 60 : 76)}</div><b style="color:${T.c}">${esc(T.n)}</b><small>${esc(T.t)}</small>
      ${lock ? `<em>🔒 Niveau ${lv}</em>` : `<div class="ap-b"><button data-a="fr" data-k="${k}" class="${curF === k ? 'on' : ''}">${curF === k ? '✔ ' : ''}Cadre</button><button data-a="ti" data-k="${k}" class="${curT === k ? 'on' : ''}">${curT === k ? '✔ ' : ''}Titre</button></div>`}</div>`;
  }).join('') + '</div>';
  return h;
}

/* ----- Paramètres ----- */
function paRender() {
  const d = meD;
  return `<div class="pa-sec"><h4>📷 Photo de profil</h4><div class="pa-av">${avHTML(d.name, d.cos, 84)}<div><label class="pa-btn">Choisir une image<input type="file" id="avFile" accept="image/*" hidden></label>${d.cos.av ? '<button class="pa-btn ghost" data-a="avdel">Supprimer la photo</button>' : ''}<small>Elle est réduite automatiquement (petite image, très légère).</small></div></div></div>
  <div class="pa-sec"><h4>🔑 Changer le mot de passe</h4><input type="password" id="pwOld" placeholder="Ancien mot de passe" autocomplete="current-password"><input type="password" id="pwNew" placeholder="Nouveau mot de passe (6 caractères min.)" autocomplete="new-password"><input type="password" id="pwNew2" placeholder="Répète le nouveau mot de passe" autocomplete="new-password"><button class="pa-btn" data-a="pw">Changer le mot de passe</button><small>Tes autres appareils seront déconnectés.</small></div>
  <div class="pa-sec"><h4>🚪 Connexion</h4><button class="pa-btn ghost" data-a="logout">Se déconnecter</button><button class="pa-btn ghost" data-a="logoutall">Déconnecter tous mes appareils</button></div>
  <div class="pa-sec danger"><h4>⚠️ Supprimer mon compte</h4><small>Efface définitivement ton compte, tes stats, ton niveau et tes badges.</small><input type="password" id="delPw" placeholder="Ton mot de passe pour confirmer" autocomplete="current-password"><button class="pa-btn red" data-a="del">Supprimer définitivement mon compte</button></div>
  <div class="pa-msg" id="paMsg">${esc(meMsg)}</div>`;
}
const paMsg = (t, ok) => { meMsg = t; const e = $('paMsg'); if (e) { e.textContent = t; e.className = 'pa-msg ' + (ok ? 'ok' : 'bad'); } };
socket.on('me-pass-res', r => { if (r.ok) { paMsg('✅ Mot de passe changé !', true); ['pwOld', 'pwNew', 'pwNew2'].forEach(i => { if ($(i)) $(i).value = ''; }); } else paMsg(r.error, false); });
socket.on('me-avatar-res', r => paMsg(r.ok ? '✅ Photo enregistrée !' : r.error, !!r.ok));
socket.on('me-delete-res', r => { if (r.ok) { setTok(null); location.reload(); } else paMsg(r.error, false); });
socket.on('me-logout-all-ok', () => paMsg('✅ Tous tes autres appareils sont déconnectés à leur prochaine connexion.', true));

// Photo : recadrée en carré 128×128, JPEG
function sendAvatar(file) {
  if (!file || !/^image\//.test(file.type)) return paMsg('Choisis une image.', false);
  const rd = new FileReader();
  rd.onload = () => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), m = Math.min(im.width, im.height);
      x.fillStyle = '#1b1226'; x.fillRect(0, 0, 128, 128); x.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 128, 128);
      let q = .85, d = c.toDataURL('image/jpeg', q); while (d.length > 36000 && q > .3) { q -= .1; d = c.toDataURL('image/jpeg', q); }
      paMsg('Envoi…', true); socket.emit('me-avatar', { data: d });
    };
    im.onerror = () => paMsg('Impossible de lire cette image.', false); im.src = rd.result;
  };
  rd.readAsDataURL(file);
}
meEl.addEventListener('change', e => { if (e.target.id === 'avFile') sendAvatar(e.target.files[0]); });
meEl.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) { const c = e.target.closest('.pf-col'); if (c) { genSel = genSel === +c.dataset.s ? -1 : +c.dataset.s; meRender(); } return; }
  const a = b.dataset.a;
  if (a === 'close') closeMe();
  else if (a === 'tab') { meTab = b.dataset.t; meRender(); if (meTab === 'q') socket.emit('q-get'); }
  else if (a === 'qmode') { qLife = b.dataset.m === '1'; qRender(); }
  else if (a === 'claim') socket.emit('q-claim', { id: b.dataset.id });
  else if (a === 'claimall') socket.emit('q-claim-all');
  else if (a === 'fr') socket.emit('me-cos', { fr: +b.dataset.k, ti: meD.cos.ti });
  else if (a === 'ti') socket.emit('me-cos', { fr: meD.cos.fr, ti: +b.dataset.k });
  else if (a === 'avdel') socket.emit('me-avatar-del');
  else if (a === 'pw') { const o = $('pwOld').value, n = $('pwNew').value; if (n !== $('pwNew2').value) return paMsg('Les deux nouveaux mots de passe sont différents.', false); socket.emit('me-pass', { oldPass: o, newPass: n }); }
  else if (a === 'logout') logout();
  else if (a === 'logoutall') { if (confirm('Déconnecter tous tes appareils (celui-ci aussi) ?')) { socket.emit('me-logout-all'); setTimeout(logout, 400); } }
  else if (a === 'del') { if (confirm('Supprimer DÉFINITIVEMENT ton compte ? Impossible d’annuler.')) socket.emit('me-delete', { pass: $('delPw').value }); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && meOpen) closeMe(); });
// au chargement / à la connexion : récupère niveau et quêtes (pastille du bouton 👤)
socket.on('auth-ok', () => { socket.emit('me-get'); socket.emit('q-get'); });
Object.assign(window, { openMe, closeMe });
// Carte d'en-tête d'un profil consulté depuis le classement
function profHero(p) {
  const c = p.cos || { lv: 1, fr: 0, ti: 0, av: 0 }, ti = TIERS[c.ti | 0];
  return `<div class="ph"><div>${avHTML(p.name, c, 86)}</div><div class="ph-t"><div class="me-name" style="font-size:19px">${nm(p.name)}</div><div class="me-title" style="--fc:${ti.c}">${esc(ti.t)}</div><div class="ch-note" style="text-align:left">Niveau ${c.lv} · membre depuis le ${new Date(p.since).toLocaleDateString('fr-FR')}</div></div></div>`;
}
