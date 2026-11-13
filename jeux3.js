'use strict';
/* ============================================================
   ARROWS X 🎯 — fléchettes sur cible annulaire, RTP exact 98,5 %
   Mêmes tables de multiplicateurs que le serveur (AR_MODES dans server.js).
   Le serveur résout "hit = 0,985 × Σpoids / Σ(m×poids)" pour garantir l'espérance ;
   ici on ne fait que recalculer hit pour l'affichage et dessiner les anneaux.
   Les rayons des anneaux sont PROPORTIONNELS aux probabilités réelles : la surface
   d'un anneau = sa chance de tomber dessus (cible honnête, comme au fléchettes réel).
   La résolution du lancer se fait par tirage aléatoire uniforme sur l'aire totale
   (π·R²) : chaque anneau [r1,r2] couvre une aire proportionnelle à son poids.
   ============================================================ */
const AR_RTP = 0.985;
const AR_MODES = {
    easy:   { name: 'Facile',    max: 20,  rows: [[0.5,2],[0.6,5],[0.7,7],[0.8,7],[0.9,7],[1,11],[1.25,6],[1.5,5],[2,4],[3,3],[4,2],[5,1.5],[8,1],[10,0.6],[20,0.3]] },
    medium: { name: 'Moyen',     max: 100, rows: [[0.5,5],[0.6,7],[0.7,8],[0.8,12],[0.9,10],[1,10],[1.5,10],[2,8],[3,6],[4,4],[5,3],[8,2.5],[10,1.7],[25,1],[50,0.5],[100,0.3]] },
    hard:   { name: 'Difficile', max: 500, rows: [[0.5,10],[0.6,10],[0.7,10],[0.8,12],[0.9,10],[1,8],[1.5,7],[2,6],[3,5],[4,4],[5,3],[8,2.5],[10,2],[25,1.5],[100,1],[500,0.5]] }
};
// Probabilité de toucher la cible (le reste = x0, raté). Résolution algébrique : hit = RTP × Σpoids / Σ(m×poids).
const arHit = mode => { const c = AR_MODES[mode], tot = c.rows.reduce((a, r) => a + r[1], 0), wsum = c.rows.reduce((a, [m, w]) => a + m * w, 0); return AR_RTP * tot / wsum; };
// Preuve du RTP : Σ(poids × multiplicateur) / Σpoids × hit = AR_RTP exactement (par construction de "hit").
// Rayons normalisés (hors bordure décorative) : r_i = √(Σ poids restants / Σ poids total) — dérivés des mêmes
// constantes que le serveur, donc identiques partout. Le tirage visuel suit la même géométrie.
function arRadii(mode) {
  const rows = AR_MODES[mode].rows, tot = rows.reduce((a, r) => a + r[1], 0);
  let acc = 0; const out = [];
  for (let i = rows.length - 1; i >= 0; i--) { acc += rows[i][1]; out[i] = Math.sqrt(acc / tot); } // out[i] = rayon extérieur normalisé de l'anneau i (croissant avec i ? non : décroissant → on stocke par index)
  return out; // out[i] ∈ (0,1], out[0] (petit gain) ≈ ... en réalité out[i] correspond au cumul des anneaux i..fin
}
const AR_COLS = ['#f43f5e','#fb923c','#fbbf24','#4ade80','#38bdf8','#a78bfa','#e879f9','#2dd4bf']; // couleurs vibrantes, centre → extérieur
const ARROW = '<g class="ar-arrow"><path d="M-3 -1.3L-31 -1.3L-31 1.3L-3 1.3Z" fill="#e2e8f0"/><path d="M-3 .2L-31 .2L-31 1.3L-3 1.3Z" fill="#aab4c4"/><path d="M-25 -1.3L-31 -6.2L-37 -6.2L-33 0L-37 6.2L-31 6.2L-25 1.3Z" fill="#f43f5e"/><path d="M-27 0L-32 0" stroke="#fde68a" stroke-width=".8"/><rect x="-39" y="-1.8" width="2.4" height="3.6" rx="1" fill="#fde68a"/><polygon points="1,0 -8,-3.4 -6,0 -8,3.4" fill="#fde68a" stroke="#b98a1f" stroke-width=".5" stroke-linejoin="round"/></g>';
// Le tireur : archer de profil (capuche, plume, carquois). Tout bouge via arPose() : levée de l'arc, bandage de la corde jusqu'à la
// joue, tremblement, relâchement (la corde vibre, la main recule), retour au repos. Coordonnées locales : pieds en (0,0), regarde à droite.
const AR_A = { x: 9, y: -55.5 }; // point d'ancrage (joue) : la main de corde y arrive à pleine traction
const AR_SC = 1.5, AR_OX = 74, AR_OY = 270, AR_ARW = AR_SC * .87; // placement du tireur dans la scène (translate + scale) ; AR_ARW = échelle de la flèche en vol
const arL2G = (x, y) => [AR_OX + AR_SC * x, AR_OY + AR_SC * y];
const arLerp = (a, b, k) => a + (b - a) * k, arClamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const arSmooth = k => k * k * (3 - 2 * k);
const ARCHER = `<g id="arArcher">
  <ellipse cx="2" cy="3" rx="30" ry="5.5" fill="rgba(0,0,0,.42)"/>
  <path id="arCape" d="" fill="#4a2f7a" stroke="rgba(212,162,76,.55)" stroke-width="1" stroke-linejoin="round"/>
  <g stroke-linecap="round" fill="none">
    <path d="M-3 -28L-10 -14L-13 -2" stroke="#241b38" stroke-width="7"/>
    <path d="M3 -28L11 -14L15 -2" stroke="#2c2244" stroke-width="7"/>
    <path d="M-11.5 -9L-13.3 -1.5M12.5 -9L15.3 -1.5" stroke="#3b2814" stroke-width="8"/>
    <path d="M-16.5 .6h8.5M12 .6h9" stroke="#2a1a0c" stroke-width="4"/>
  </g>
  <g id="arUpper">
    <path id="arBackArm" d="" fill="none" stroke="#e8c39e" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path id="arBackSleeve" d="" fill="none" stroke="#1b6b5a" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(-8,-46) rotate(-24)"><rect x="-3.2" y="-2" width="7" height="28" rx="3" fill="#6b3f12" stroke="#d4a24c" stroke-width=".9"/>
      <path d="M-1.5 -2L-2 -8M.8 -2L1 -9M3 -2L4 -7" stroke="#e2e8f0" stroke-width="1.4"/><path d="M-2.4 -7.5l-.9-3.6 2.1 1zM1.7 -8.5l.2-3.6 1.9 1.4zM4 -6.5l1-3.5 1.5 1.6z" fill="#f43f5e"/></g>
    <g id="arTorso">
      <path d="M-6.5 -27L-5 -50Q3 -55 11 -50L9 -27Z" fill="#1b6b5a" stroke="rgba(212,162,76,.5)" stroke-width="1"/>
      <path d="M-6.7 -30.5H9.4L9.1 -27H-6.9Z" fill="#8a5a1c"/><rect x="1" y="-31.2" width="4" height="4.6" rx="1" fill="#ffd45c"/>
      <path d="M-5 -50Q3 -55 11 -50L9.6 -45Q3 -49 -4 -45Z" fill="#4a2f7a" stroke="rgba(212,162,76,.55)" stroke-width="1"/>
      <rect x="0" y="-54" width="5.2" height="7" rx="2" fill="#d8ac84"/>
      <circle cx="3" cy="-61" r="8.2" fill="#e8c39e"/>
      <path d="M-6 -57Q-8.5 -74 4 -73.5Q14.5 -72 12.8 -63Q6 -69 0 -57Z" fill="#4a2f7a" stroke="rgba(212,162,76,.6)" stroke-width="1" stroke-linejoin="round"/>
      <path id="arFeather" d="" fill="#f43f5e"/>
      <circle cx="8.3" cy="-62" r="1.15" fill="#241b38"/><path d="M6.8 -64.7q2.2-1 3.8-.2" stroke="#4a2f20" stroke-width=".9" fill="none" stroke-linecap="round"/><path d="M11 -60.6l1.7 1.7-2 .3" stroke="#c9976c" stroke-width=".9" fill="none" stroke-linejoin="round"/>
    </g>
    <path id="arBowBack" d="" fill="none" stroke="#4a2a0a" stroke-width="3.8" stroke-linecap="round"/>
    <path id="arBow" d="" fill="none" stroke="#c98a2e" stroke-width="2.1" stroke-linecap="round"/>
    <path id="arString" d="" fill="none" stroke="#f1ead6" stroke-width=".9" stroke-linejoin="round"/>
    <g id="arNock" opacity="0">${ARROW}</g>
    <path id="arFrontArm" d="" fill="none" stroke="#e8c39e" stroke-width="4.6" stroke-linecap="round"/>
    <path id="arFrontSleeve" d="" fill="none" stroke="#1b6b5a" stroke-width="6.2" stroke-linecap="round"/>
    <circle id="arGripHand" r="3" fill="#e8c39e" stroke="#c9976c" stroke-width=".6"/>
    <circle id="arPullHand" r="2.7" fill="#e8c39e" stroke="#c9976c" stroke-width=".6"/>
  </g>
</g>`;
// État de pose (0 = repos, 1 = plein) ; arPose() en déduit chaque forme, à chaque image.
//   u : levée de l'arc / ouverture · p : traction de la CORDE · hp : position de la MAIN (peut dépasser 1 : recul après le tir)
//   rel : vibration de la corde (px) · th : angle de visée (rad) · nock : flèche encochée visible · hold : tremblement
const arNewPose = () => ({ u: 0, p: 0, hp: 0, rel: 0, th: -.25, nock: false, hold: false });
function arPose(now) {
  const E = S.arEls; if (!E || !E.cape.isConnected) return;
  const P = S.arP, th = arLerp(.5, P.th, P.u), d = [Math.cos(th), Math.sin(th)], n = [-d[1], d[0]];
  const aim = [AR_A.x + 27 * Math.cos(P.th), AR_A.y + 27 * Math.sin(P.th)], G0 = [33, -37];
  const tr = P.hold ? Math.sin(now / 21) * .45 : 0; // tremblement à pleine traction
  const G = [arLerp(G0[0], aim[0], P.u), arLerp(G0[1], aim[1], P.u) + tr];
  const br = Math.sin(now / 620) * .55 * (1 - .7 * P.u); // respiration
  const R0 = [G[0] - d[0] * 6, G[1] - d[1] * 6], bend = 4 * P.p;
  const T = [R0[0] - n[0] * 33 - d[0] * bend, R0[1] - n[1] * 33 - d[1] * bend], B = [R0[0] + n[0] * 33 - d[0] * bend, R0[1] + n[1] * 33 - d[1] * bend];
  const C = [G[0] + d[0] * 8, G[1] + d[1] * 8];
  const N = [G[0] - d[0] * (6 + 21 * P.p) + d[0] * P.rel, G[1] - d[1] * (6 + 21 * P.p) + d[1] * P.rel]; // point d'encoche sur la corde
  const Hd = [G[0] - d[0] * (6 + 21 * P.hp), G[1] - d[1] * (6 + 21 * P.hp)], Hr = [11, -35];
  const ha = arClamp(P.hp * 8); // la main « saisit » la corde dès que la traction commence : elle la suit ensuite exactement
  const H = [arLerp(Hr[0], Hd[0], ha), arLerp(Hr[1], Hd[1], ha)];
  const k = Math.min(P.hp, 1.15), Sb = [1, -47], Sf = [9, -46.5];
  const El = [arLerp(15, -4, k), arLerp(-33, -57, k)]; // coude arrière : monte et recule quand on bande
  const f = v => v.map(x => x.toFixed(1)).join(' ');
  E.bow.setAttribute('d', `M${f(T)}Q${f(C)} ${f(B)}`); E.bowB.setAttribute('d', `M${f(T)}Q${f(C)} ${f(B)}`);
  E.str.setAttribute('d', `M${f(T)}L${f(N)}L${f(B)}`);
  E.back.setAttribute('d', `M${f(Sb)}L${f(El)}L${f(H)}`); E.backS.setAttribute('d', `M${f(Sb)}L${f(El)}`);
  E.front.setAttribute('d', `M${f(Sf)}L${f(G)}`); E.frontS.setAttribute('d', `M${f(Sf)}L${f([arLerp(Sf[0], G[0], .55), arLerp(Sf[1], G[1], .55)])}`);
  E.gh.setAttribute('cx', G[0].toFixed(1)); E.gh.setAttribute('cy', G[1].toFixed(1)); E.ph.setAttribute('cx', H[0].toFixed(1)); E.ph.setAttribute('cy', H[1].toFixed(1));
  const tip = [N[0] + d[0] * 33, N[1] + d[1] * 33];
  E.nock.setAttribute('opacity', P.nock ? 1 : 0); E.nock.setAttribute('transform', `translate(${f(tip).replace(' ', ',')}) rotate(${(th * 57.2958).toFixed(1)}) scale(.87)`);
  const sw = Math.sin(now / 340) * 2 - 3 * P.u; // cape et plume qui flottent
  E.cape.setAttribute('d', `M-4 -50Q${(-13 + sw).toFixed(1)} -42 ${(-20 + sw * 1.6).toFixed(1)} -18L-8 -24Q-6 -38 -4 -46Z`);
  E.feather.setAttribute('d', `M3 -73Q${(-6 + sw).toFixed(1)} -81 ${(-15 + sw * 1.4).toFixed(1)} -77Q${(-6 + sw).toFixed(1)} -76 3 -71Z`);
  E.torso.setAttribute('transform', `translate(0 ${br.toFixed(2)}) rotate(${(-2.2 * P.p).toFixed(2)} 0 -28)`);
}
function arArcherLoop(now) { if (S.view !== 'ar') { S.arLoop = false; return; } arPose(now); requestAnimationFrame(arArcherLoop); }
function arBuild(mode) {
  const svg = $('arSvg'), cx = 420, cy = 132, R = 104, rows = AR_MODES[mode].rows;
  const rad = arRadii(mode); // rad[i] = rayon extérieur normalisé de l'anneau i (l'anneau i va de rad[i+1]… à rad[i])
  let s = `<defs><radialGradient id="arGlow" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="#ffe6aa" stop-opacity=".28"/><stop offset="1" stop-color="#ffe6aa" stop-opacity="0"/></radialGradient>
    <radialGradient id="arWood" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="#5d4326"/><stop offset="1" stop-color="#2a1c0d"/></radialGradient>
    <radialGradient id="arBull" cx="42%" cy="38%" r="75%"><stop offset="0" stop-color="#fff3c4"/><stop offset=".55" stop-color="#ffd45c"/><stop offset="1" stop-color="#b07a17"/></radialGradient>
    <filter id="arShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity=".55"/></filter></defs>`;
  s += `<rect width="640" height="320" fill="url(#arGlow)"/>`;
  s += `<ellipse cx="${cx}" cy="${cy + R + 16}" rx="${R + 34}" ry="12" fill="rgba(0,0,0,.45)"/>`; // ombre portée au sol
  s += `<circle cx="${cx}" cy="${cy}" r="${R + 16}" fill="url(#arWood)" stroke="rgba(212,162,76,.6)" stroke-width="3.5" filter="url(#arShadow)"/>`; // couronne bois + cadre doré
  for (let k = 0; k < 24; k++) { // clous décoratifs sur le cerclage bois
    const a = k * Math.PI / 12;
    s += `<circle cx="${(cx + Math.cos(a) * (R + 11)).toFixed(1)}" cy="${(cy + Math.sin(a) * (R + 11)).toFixed(1)}" r="1.6" fill="rgba(255,224,150,.55)"/>`;
  }
  // Cible « fléchettes » haut de gamme : fond liège, secteurs alternés rouge/noir comme une vraie cible,
  // fil métallique fin entre chaque anneau, bullseye doré. AUCUNE étiquette multiplicateur : le gain
  // n'apparaît qu'en l'air, après le lancer (demande utilisateur).
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#caa06a"/>`; // lit de liège sous les secteurs
  for (let i = rows.length - 1; i >= 0; i--) { // du plus grand anneau (extérieur) vers le centre
    const rr = R * rad[i];
    s += `<circle class="ring" data-i="${i}" cx="${cx}" cy="${cy}" r="${rr.toFixed(1)}" fill="${AR_COLS[Math.floor(i * AR_COLS.length / rows.length)]}" stroke="rgba(0,0,0,.4)" stroke-width="1.2"/>`;
  }
  // secteurs alternés (rouge sombre / noir) par-dessus, en fondu : effet « vrai board de fléchettes »
  for (let k = 0; k < 16; k++) {
    const a0 = k * Math.PI / 8, a1 = a0 + Math.PI / 16;
    if (k % 2) continue;
    s += `<path d="M${cx} ${cy}L${(cx + Math.cos(a0) * R).toFixed(1)} ${(cy + Math.sin(a0) * R).toFixed(1)}A${R} ${R} 0 0 1 ${(cx + Math.cos(a1) * R).toFixed(1)} ${(cy + Math.sin(a1) * R).toFixed(1)}Z" fill="rgba(10,6,18,.32)"/>`;
  }
  for (let i = 0; i < rows.length; i++) { // fils métalliques entre anneaux (vraie cible)
    const rr = R * rad[i];
    s += `<circle cx="${cx}" cy="${cy}" r="${rr.toFixed(1)}" fill="none" stroke="rgba(230,235,245,.55)" stroke-width="1.1"/>`;
  }
  s += `<circle cx="${cx}" cy="${cy}" r="${(R * rad[rows.length - 1]).toFixed(1)}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.6"/>`; // contour du bullseye
  s += `<circle id="arBullEye" cx="${cx}" cy="${cy}" r="9" fill="url(#arBull)" stroke="rgba(120,70,10,.8)" stroke-width="1.4"/>`; // bullseye doré
  s += `<circle cx="${cx}" cy="${cy}" r="2.4" fill="#fff" opacity=".95"/>`;
  s += `<g id="arStuck"></g>`; // les fléchettes plantées s'accumulent ici (jusqu'à 8, puis on purge)
  s += `<path id="arTrail" d="" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>`; // traînée de la flèche
  s += `<g transform="translate(${AR_OX},${AR_OY}) scale(${AR_SC})">` + ARCHER + `</g>`; // le tireur, à gauche, vise la cible
  s += `<g id="arArrowWrap" transform="translate(130,190) rotate(-14)" opacity="0">${ARROW}</g>`; // flèche en vol
  svg.innerHTML = s;
  S.arBuilt = mode;
  const g = id => $(id);
  S.arEls = { cape: g('arCape'), feather: g('arFeather'), bow: g('arBow'), bowB: g('arBowBack'), str: g('arString'), back: g('arBackArm'), backS: g('arBackSleeve'),
    front: g('arFrontArm'), frontS: g('arFrontSleeve'), gh: g('arGripHand'), ph: g('arPullHand'), nock: g('arNock'), torso: g('arTorso') };
  S.arP = arNewPose(); arPose(performance.now());
  if (!S.arLoop) { S.arLoop = true; requestAnimationFrame(arArcherLoop); } // respiration / cape en continu
}
function arInfo() {
  const c = AR_MODES[S.arMode];
  $('arInfo').textContent = `Chance de toucher : ${(arHit(S.arMode) * 100).toFixed(1)} % · ${c.rows.length} anneaux · max x${c.max} · RTP 98,5 %`;
  document.querySelectorAll('#arModes .cr-mode').forEach(b => b.classList.toggle('on', b.dataset.m === S.arMode));
  $('arModeName').textContent = c.name;
  $('arHitPct').textContent = (arHit(S.arMode) * 100).toFixed(1) + ' %';
  $('arMax').textContent = 'x' + c.max;
}
function arControls() {
  const active = !!(S.arState && S.arState.active);
  show('arStartBtn', !active); show('arThrowBtn', active);
  $('arBetAmount').disabled = active; $('arDarts').disabled = active; document.querySelectorAll('#arDartQuick button').forEach(b => { b.disabled = active; }); arTotal();
  document.querySelectorAll('#arModes .cr-mode').forEach(b => { b.disabled = active; });
  $('arStatus').textContent = active ? 'Fléchette armée — relance autant de fois que tu veux (nouvelle mise à chaque lancer).' : 'Choisis un mode, mise, puis arme ta fléchette.';
}
const arDartsVal = () => Math.max(1, Math.min(20, parseInt($('arDarts').value) || 1));
function arTotal() { const a = parseInt($('arBetAmount').value) || 0, n = arDartsVal(); $('arTotal').textContent = a > 0 ? `Mise totale : ${(a * n).toLocaleString('fr-FR')} 🪙 (${n} fléchette${n > 1 ? 's' : ''} × ${a.toLocaleString('fr-FR')})` : 'Mise totale : —'; }
function arSync() { // appelé par sync() à chaque update-room : recolle le client au serveur sans jamais rien bloquer
  if (S.view !== 'ar' || S.arThrowing) return;
  const st = S.arState, active = !!(st && st.active);
  if (active && st.mode !== S.arBuilt) arBuild(st.mode);
  arControls();
}
function arToast(msg) { const t = $('arToast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); }
function arHistPush(win, text) {
  S.arHist.unshift({ win, text }); S.arHist.length = Math.min(S.arHist.length, 12);
  setH($('arHist'), S.arHist.map(h => `<div class="history-pill ${h.win ? 'cr-win' : 'cr-lose'}">${h.text}</div>`).join(''));
}
function arRingFlash(i) { const r = $('arSvg').querySelector(`.ring[data-i="${i}"]`); if (!r) return; r.classList.add('hot'); setTimeout(() => r.classList.remove('hot'), 1200); }
// Échelle viewBox → pixels du conteneur : le stage fait 640×320 en coordonnées SVG.
const arScale = () => { const r = $('arStage').getBoundingClientRect(); return { kx: r.width / 640, ky: r.height / 320 }; };
function arFeathers(x, y, n = 10) { // petites plumes qui volent quand la flèche touche (repère viewBox → pixels du conteneur)
  const st = $('arStage'), { kx, ky } = arScale();
  for (let i = 0; i < n; i++) {
    const f = document.createElement('i'); f.className = 'ar-fth'; f.style.left = (x * kx) + 'px'; f.style.top = (y * ky) + 'px'; st.appendChild(f);
    f.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${(Math.random() - .5) * 130}px,${-25 - Math.random() * 80}px) rotate(${Math.random() * 500}deg)`, opacity: 0 }],
              { duration: 650 + Math.random() * 450, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => f.remove();
  }
}
function arDust(x, y, n = 8) { // nuage de poussière quand la fléchette se plante à côté
  const st = $('arStage'), { kx, ky } = arScale();
  for (let i = 0; i < n; i++) {
    const f = document.createElement('i'); f.className = 'ar-dust'; f.style.left = (x * kx) + 'px'; f.style.top = (y * ky) + 'px'; st.appendChild(f);
    f.animate([{ transform: 'none', opacity: .9 }, { transform: `translate(${(Math.random() - .5) * 90}px,${-10 - Math.random() * 40}px) scale(${.4 + Math.random()})`, opacity: 0 }],
              { duration: 550 + Math.random() * 400, easing: 'ease-out' }).onfinish = () => f.remove();
  }
}
// Le multiplicateur apparaît "dans l'air" au-dessus de la cible, uniquement une fois le résultat connu.
function arPop(mult, win, amount) {
  const p = $('arPop');
  p.className = 'ar-pop' + (win ? '' : ' miss'); p.innerHTML = ''; void p.offsetWidth; // reset propre de l'animation CSS
  p.innerHTML = `<span class="big">${win ? 'x' + mult : 'x0'}</span><span class="sub">${win ? '+' + amount + ' 🪙' : '💨 Raté !'}</span>`;
  p.classList.add('show');
  clearTimeout(S.arPopT); S.arPopT = setTimeout(() => p.classList.remove('show'), 2000);
}
// flèche « plantée » : la précédente s'estompe, la nouvelle vibre un court instant (retour élastique)
function arStuckArrow(x, y, rot, scale = AR_ARW * .85) {
  const g = $('arStuck'); if (!g) return null;
  while (g.children.length >= 8) g.removeChild(g.firstChild);
  [...g.children].forEach(c => c.setAttribute('opacity', '.45'));
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const set = off => el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(rot + off).toFixed(1)}) scale(${scale})`);
  set(0); el.innerHTML = ARROW; g.appendChild(el);
  tween(560, k => set(Math.sin(k * 34) * 7 * Math.pow(1 - k, 2)));
  return el;
}
function arRipple(x, y, color = '#ffd45c') { // onde de choc à l'impact
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1)); c.setAttribute('fill', 'none'); c.setAttribute('stroke', color); c.setAttribute('stroke-width', '2');
  $('arSvg').appendChild(c);
  tween(480, k => { c.setAttribute('r', (3 + 26 * k).toFixed(1)); c.setAttribute('opacity', (.85 * (1 - k)).toFixed(2)); c.setAttribute('stroke-width', (2.4 * (1 - k) + .3).toFixed(2)); }).then(() => c.remove());
}
async function arAnimateThrow(d) { // armement → traction → tenue → relâchement → vol (trajectoire réaliste) → impact
  S.arThrowing = true; const sp = d.fast ? .42 : 1; // fléchettes suivantes d'une rafale : même animation, en plus rapide
  const tok = S.arTok = (S.arTok || 0) + 1, alive = () => S.arTok === tok;
  const wrap = $('arArrowWrap'), trail = $('arTrail'), P = S.arP || (S.arP = arNewPose());
  const cx = 420, cy = 132, R = 104, mode = d.mode || S.arBuilt || 'easy', rows = AR_MODES[mode].rows, rad = arRadii(mode);
  const tipOf = th => arL2G(AR_A.x + 33 * Math.cos(th), AR_A.y + 33 * Math.sin(th)); // pointe de la flèche encochée (repère scène)
  let end, th, feathers = 0, hitIdx = -1;
  if (d.success) {
    hitIdx = rows.findIndex(r => r[0] === d.multiplier);
    // point d'impact aléatoire DANS la bande annulaire de l'anneau gagné (géométrie cohérente avec les probabilités)
    const rOut = hitIdx >= 0 ? R * rad[hitIdx] : 6, rIn = hitIdx >= 0 && hitIdx + 1 < rows.length ? R * rad[hitIdx + 1] : 0;
    const rr = Math.sqrt(Math.random() * (rOut * rOut - rIn * rIn) + rIn * rIn), ang = Math.random() * Math.PI * 2;
    end = { x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr };
    feathers = Math.max(6, Math.round(rows.length - (hitIdx >= 0 ? hitIdx : 0)));
  } else if (Math.random() < .62) end = { x: 235 + Math.random() * 105, y: 285 + Math.random() * 7 };   // tir mou : retombe au sol AVANT la cible
  else end = { x: 545 + Math.random() * 60, y: 285 + Math.random() * 7 };                                  // tir trop long : passe devant et se plante derrière
  let S0 = tipOf(-.25); // visée : la flèche part le long de son axe, la gravité courbe le reste (3 passes : la pointe dépend de l'angle)
  for (let it = 0; it < 3; it++) {
    th = d.success ? Math.atan2(end.y - S0[1], end.x - S0[0]) - (5 + Math.random() * 5) * Math.PI / 180
      : Math.atan2(cy - S0[1], cx - S0[0]) - (end.x < cx ? 4 : 6) * Math.PI / 180;
    S0 = tipOf(th);
  }
  const p1x = (S0[0] + end.x) / 2, p1y = S0[1] + Math.tan(th) * (p1x - S0[0]); // parabole lancée dans l'axe de la flèche
  const bez = k => { const m = 1 - k; return { x: m * m * S0[0] + 2 * m * k * p1x + k * k * end.x, y: m * m * S0[1] + 2 * m * k * p1y + k * k * end.y,
    a: Math.atan2(2 * m * (p1y - S0[1]) + 2 * k * (end.y - p1y), 2 * m * (p1x - S0[0]) + 2 * k * (end.x - p1x)) }; };
  // 1) le tireur arme : il lève l'arc, encoche et bande la corde jusqu'à la joue
  sound('lift'); P.th = th; P.rel = 0; P.hold = false;
  const u0 = P.u, p0 = P.p, h0 = P.hp;
  await tween(310 * sp, k => { if (!alive()) return; const e = arSmooth(k), q = arSmooth(arClamp((k - .25) / .75));
    P.u = arLerp(u0, 1, e); P.nock = P.u > .35; P.p = arLerp(p0, 1, q); P.hp = arLerp(h0, 1, q); });
  if (!alive()) return;
  // 2) tenue : il vise, léger tremblement
  P.hold = true; await wait((80 + Math.random() * 60) * sp); P.hold = false;
  if (!alive()) return;
  // 3) relâchement : la corde claque et vibre, la main recule, la flèche part
  sound('twang'); P.nock = false;
  wrap.setAttribute('opacity', 1); trail.setAttribute('opacity', .6);
  const pts = [];
  (async () => { // geste du tireur, en parallèle du vol
    await tween(260 * sp, k => { if (!alive()) return; const t = k * .26;
      P.p = Math.max(0, 1 - k * 9); P.rel = 6 * Math.sin(t * 52) * Math.exp(-t * 12); P.hp = 1 + .26 * (1 - Math.exp(-k * 14)) - .3 * arSmooth(k); });
    if (!alive()) return;
    const hp1 = P.hp; P.rel = 0; P.p = 0;
    await tween(420 * sp, k => { if (!alive()) return; const e = arSmooth(k); P.u = 1 - e; P.hp = hp1 * (1 - e); P.th = arLerp(th, -.25, e); });
    if (alive()) { P.u = 0; P.hp = 0; }
  })();
  const dist = Math.hypot(end.x - S0[0], end.y - S0[1]);
  await tween((360 + dist * .42) * sp, k0 => {
    const k = k0 * (1.2 - .2 * k0), q = bez(k);
    wrap.setAttribute('transform', `translate(${q.x.toFixed(1)},${q.y.toFixed(1)}) rotate(${(q.a * 57.2958).toFixed(1)}) scale(${AR_ARW.toFixed(3)})`);
    pts.push(q.x.toFixed(1) + ' ' + q.y.toFixed(1)); if (pts.length > 10) pts.shift();
    trail.setAttribute('d', 'M' + pts.join('L'));
  });
  const fin = bez(1), rot = fin.a * 57.2958;
  wrap.setAttribute('opacity', 0); wrap.setAttribute('transform', 'translate(130,190) rotate(-14)');
  tween(260, k => trail.setAttribute('opacity', (.6 * (1 - k)).toFixed(2))); // la traînée s'efface
  // 4) impact
  if (d.success) {
    sound('tap'); arFeathers(end.x, end.y, feathers); arRingFlash(hitIdx); arRipple(end.x, end.y);
    arStuckArrow(end.x, end.y, rot);
    if (d.multiplier >= 8) sound('win');
  } else {
    sound('miss'); arDust(end.x, end.y - 4, 9); arRipple(end.x, end.y, '#c9b89a');
    const st = arStuckArrow(end.x, end.y, rot); // plantée dans le sol, puis disparaît doucement
    setTimeout(() => { if (st && st.isConnected) tween(500, k => st.setAttribute('opacity', (.9 * (1 - k)).toFixed(2))).then(() => st.remove()); }, 1100);
    $('arStage').classList.add('shake'); setTimeout(() => $('arStage').classList.remove('shake'), 400);
  }
  arPop(d.multiplier, d.success, d.winnings); // ← le multiplicateur apparaît dans l'air, pas sur la cible
  await wait(350 * sp);
  if (alive()) S.arThrowing = false;
  if (S.arState && S.arState.active) arControls(); // partie relancée entre-temps : on réaffiche tout de suite le bouton LANCER
}
function arInit() {
  if (!$('arModes').children.length) {
    $('arModes').innerHTML = Object.entries(AR_MODES).map(([id, m]) => `<button class="cr-mode" data-m="${id}">${m.name}<small>max x${m.max}</small></button>`).join('');
    $('arModes').addEventListener('click', e => {
      const b = e.target.closest('.cr-mode'); if (!b || (S.arState && S.arState.active)) return;
      S.arMode = b.dataset.m; arBuild(S.arMode); arInfo(); arControls();
    });
    $('arDartQuick').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) { $('arDarts').value = b.dataset.n; arTotal(); } });
    $('arDarts').addEventListener('input', arTotal); $('arBetAmount').addEventListener('input', arTotal);
    $('arQuick').addEventListener('click', e => {
      const b = e.target.closest('button'), amt = $('arBetAmount'); if (!b || amt.disabled) return;
      if (b.dataset.a) amt.value = b.dataset.a;
      else if (b.dataset.f === 'max') amt.value = Math.max(1, Math.floor(S.balance / arDartsVal()));
      else amt.value = Math.max(1, Math.floor((parseFloat(amt.value) || 0) * b.dataset.f));
    });
  }
  if (S.arBuilt !== S.arMode || !$('arSvg').children.length) arBuild(S.arMode);
  arInfo(); arSync();
}
function arStart() {
  const amount = parseInt($('arBetAmount').value);
  if (!amount || amount <= 0) return alert('Entre une mise valide !');
  if (S.arState && S.arState.active) return;
  sound('bet'); S.arBusy = true;
  socket.emit('ar-start', { roomCode: S.code, amount, mode: S.arMode, darts: arDartsVal() });
}
function arThrow() { // aucune cooldown serveur : on peut spammer les lancers dès que la partie est armée.
  if (!(S.arState && S.arState.active) || S.arBusy) return;
  if (S.arThrowing) { S.arPendingThrow = true; return; } // animation en cours : on met la prochaine demande en file
  S.arBusy = true;
  socket.emit('ar-throw', { roomCode: S.code });
}
socket.on('ar-started', d => {
  S.arBusy = false;
  $('arHash').textContent = d.hash;
  socket.emit('ar-throw', { roomCode: S.code }); // l'animation suit immédiatement le lancement serveur
});
socket.on('ar-result', d => {
  S.arBusy = false;
  if (S.arState) S.arState.active = false;
  const tt = d.throws && d.throws.length ? d.throws : [d], multi = tt.length > 1;
  $('arProof').textContent = `Graine révélée : ${d.seed} — SHA-256(graine) = hash ci-dessus ; u = HMAC-SHA256(graine,"arrow"${multi ? ', puis "arrow:1", "arrow:2"…' : ''}) = ${tt.map(x => x.u).join(', ')} (mode ${S.arBuilt})`;
  if (!multi) { arHistPush(d.success, d.success ? 'x' + d.multiplier : '💨 x0'); arToast(d.message); }
  else arHistPush(d.winnings >= d.bet, `${tt.filter(x => x.success).length}/${tt.length} · x${d.totalMult}`);
  arControls();
  (async () => { // rafale : la 1re fléchette à vitesse normale, les suivantes plus vite
    for (let j = 0; j < tt.length; j++) await arAnimateThrow(Object.assign({}, tt[j], { mode: S.arBuilt, fast: j > 0 }));
    if (multi) arToast(d.message);
  })();
});
// ressource "mise en attente" pour le spam de fléchettes : si l'utilisateur relance pendant une animation,
// on mémorise sa demande et on repart dès que l'animation se termine (le serveur, lui, n'a aucun cooldown).
socket.on('update-room', () => {
  if (S.view === 'ar' && S.arPendingThrow && !S.arThrowing && !S.arBusy && S.arState && S.arState.active) {
    S.arPendingThrow = false;
    socket.emit('ar-throw', { roomCode: S.code });
  }
});

/* ============================================================
   ROULETTE EUROPÉENNE 🎡 — tapis classique 0-36, un seul zéro.
   Payouts classiques (plein x36, simple chance x2, douzaine/colonne x3) :
   avantage maison naturel de 2,70 % dû au zéro, aucun facteur artificiel.
   ============================================================ */
// attache un écouteur une seule fois à un conteneur persistant (les clics sont délégués,
// donc ça continue de marcher quand on régénère le HTML interne)
// ⚠️ bindOnce est volontairement supprimé : c'était LA cause du « gel » de la Roulette et du Blackjack.
// rlBuildTable() régénère #rlTable en innerHTML à chaque retour sur l'écran ; l'écouteur « une seule fois »
// restait accroché aux anciens boutons détruits → plus aucun clic ne passait (et S.rlBusy bloquait le reste).
// Les écouteurs sont désormais attachés directement après chaque création du HTML : toujours vivants, jamais dupliqués.
const RL_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const RL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]; // ordre réel de la roue
const rlColor = n => n === 0 ? 'green' : RL_RED.has(n) ? 'red' : 'black';
const rlLabel = b => b.kind === 'straight' ? 'Plein ' + b.sel : b.kind === 'dozen' ? `Douzaine ${b.sel}` : b.kind === 'column' ? `Colonne ${b.sel}`
  : ({ red: 'Rouge', black: 'Noir', odd: 'Impair', even: 'Pair', low: '1-18', high: '19-36' })[b.kind];
function rlBuildTable() {
  let html = '<div class="rl-table"><button class="rl-cell green" data-k="straight" data-s="0" style="grid-row:span 3">0</button>';
  for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) {
    const n = col * 3 + (3 - row);
    html += `<button class="rl-cell ${rlColor(n)}" data-k="straight" data-s="${n}" style="grid-row:${row + 1};grid-column:${col + 2}">${n}</button>`;
  }
  html += '</div><div class="rl-out">';
  html += `<button class="rl-cell rl-dozen" data-k="dozen" data-s="1">1ère 12 (x3)</button><button class="rl-cell rl-dozen" data-k="dozen" data-s="2">2e 12 (x3)</button><button class="rl-cell rl-dozen" data-k="dozen" data-s="3">3e 12 (x3)</button>`;
  html += `<button class="rl-cell" data-k="low" data-s="0">1-18 (x2)</button><button class="rl-cell" data-k="even" data-s="0">Pair (x2)</button><button class="rl-cell red" data-k="red" data-s="0">Rouge (x2)</button>`;
  html += `<button class="rl-cell black" data-k="black" data-s="0">Noir (x2)</button><button class="rl-cell" data-k="odd" data-s="0">Impair (x2)</button><button class="rl-cell" data-k="high" data-s="0">19-36 (x2)</button>`;
  html += `<button class="rl-cell rl-col" data-k="column" data-s="1">Colonne 1 (x3)</button><button class="rl-cell rl-col" data-k="column" data-s="2">Colonne 2 (x3)</button><button class="rl-cell rl-col" data-k="column" data-s="3">Colonne 3 (x3)</button>`;
  html += '</div>';
  $('rlTable').innerHTML = html; // tapis numéroté + paris extérieurs, régénéré à chaque retour sur l'écran
  // Écouteurs attachés APRÈS création du HTML (et donc ré-attachés si on quitte puis revient sur la Roulette) :
  // c'est ce qui remplace bindOnce, dont l'écouteur « une seule fois » mourait avec l'ancien innerHTML → jeu gelé.
  $('rlTable').addEventListener('click', e => {
    const c = e.target.closest('.rl-cell'); if (!c || S.rlBusy || S.rlSpinning) return;
    const amount = parseInt($('rlBetAmount').value);
    if (!amount || amount <= 0) return alert('Choisis un montant de jeton valide !');
    S.rlBusy = true; // verrou temporaire : libéré dès que le serveur renvoie la table synchronisée (sync → rlRenderChips)
    socket.emit('rl-bet', { roomCode: S.code, kind: c.dataset.k, sel: c.dataset.s, amount });
  });
  $('rlQuick').addEventListener('click', e => {
    const b = e.target.closest('button'), amt = $('rlBetAmount'); if (!b) return;
    if (b.dataset.a) amt.value = b.dataset.a;
    else if (b.dataset.f === 'max') amt.value = S.balance;
    else if (b.dataset.f) amt.value = Math.max(1, Math.floor((parseFloat(amt.value) || 0) * b.dataset.f));
  });
}
function rlRenderChips() { // jetons dorés sur chaque case jouée + total de la table
  document.querySelectorAll('.rl-chip').forEach(c => c.remove());
  const agg = {};
  S.rlBets.forEach(b => { const key = b.kind + ':' + b.sel; agg[key] = (agg[key] || 0) + b.amount; });
  Object.entries(agg).forEach(([key, tot]) => {
    const [k, s] = key.split(':');
    const cell = document.querySelector(`.rl-cell[data-k="${k}"][data-s="${s}"]`);
    if (!cell) return;
    cell.style.position = 'relative';
    const chip = document.createElement('span'); chip.className = 'rl-chip'; chip.textContent = tot; cell.appendChild(chip);
  });
  const total = S.rlBets.reduce((a, b) => a + b.amount, 0);
  $('rlTotalVal').textContent = total;
  $('rlBetsCount').textContent = S.rlBets.length + (S.rlBets.length > 1 ? ' paris' : ' pari');
  $('rlSpinBtn').disabled = !total || !!S.rlSpinning;
  S.rlBusy = false; // la table reçue du serveur est la preuve que le dernier jeton est passé → on déverrouille les clics
}
function rlHistPush(num, color, win) {
  S.rlHist.unshift({ num, color, win }); S.rlHist.length = Math.min(S.rlHist.length, 14);
  setH($('rlHist'), S.rlHist.map(h => `<div class="history-pill rl-${h.color}${h.win ? ' cr-win' : ''}" style="background:${h.color === 'red' ? '#b32633' : h.color === 'green' ? '#0f7a44' : '#1c2230'}">${h.num}</div>`).join(''));
}
/* ---- Roue : dessin SVG (ordre réel européen) + animation image par image ---- */
const RL_SEG = 360 / 37;
const rlPolar = (r, deg) => [50 + r * Math.sin(deg * Math.PI / 180), 50 - r * Math.cos(deg * Math.PI / 180)]; // deg : 0 = haut, sens horaire
function rlSector(i, r0, r1) {
  const a0 = i * RL_SEG, a1 = (i + 1) * RL_SEG, [x0, y0] = rlPolar(r1, a0), [x1, y1] = rlPolar(r1, a1), [x2, y2] = rlPolar(r0, a1), [x3, y3] = rlPolar(r0, a0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r1} ${r1} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}A${r0} ${r0} 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z`;
}
function rlBuildWheel() {
  let pockets = '', frets = '', nums = '';
  RL_ORDER.forEach((n, i) => {
    const fill = n === 0 ? '#0f8a4c' : RL_RED.has(n) ? '#c1283a' : '#161a26';
    pockets += `<path d="${rlSector(i, 25, 40.5)}" fill="${fill}"/>`;
    const [fx0, fy0] = rlPolar(25, i * RL_SEG), [fx1, fy1] = rlPolar(40.5, i * RL_SEG);
    frets += `<path d="M${fx0.toFixed(2)} ${fy0.toFixed(2)}L${fx1.toFixed(2)} ${fy1.toFixed(2)}" />`;
    nums += `<text transform="rotate(${((i + .5) * RL_SEG).toFixed(2)} 50 50)" x="50" y="14.4">${n}</text>`;
  });
  $('rlWheelSvg').innerHTML = `
  <defs>
    <radialGradient id="rlWood" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#b9772f"/><stop offset=".6" stop-color="#7a4515"/><stop offset="1" stop-color="#3d210a"/></radialGradient>
    <radialGradient id="rlCone" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#3a2a52"/><stop offset=".7" stop-color="#1c1230"/><stop offset="1" stop-color="#0d0818"/></radialGradient>
    <radialGradient id="rlBallG" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#d7dde6"/><stop offset="1" stop-color="#7d8896"/></radialGradient>
    <radialGradient id="rlHub" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".6" stop-color="#d4a24c"/><stop offset="1" stop-color="#7a5316"/></radialGradient>
  </defs>
  <circle cx="50" cy="50" r="49.6" fill="url(#rlWood)"/>
  <circle cx="50" cy="50" r="46.6" fill="#0d0814" stroke="rgba(255,225,150,.55)" stroke-width=".5"/>
  <circle cx="50" cy="50" r="43.8" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="4.4"/>
  <g id="rlWheelRot">
    <circle cx="50" cy="50" r="41.2" fill="#d4a24c"/>
    ${pockets}
    <g stroke="#e8c26a" stroke-width=".35">${frets}</g>
    <circle cx="50" cy="50" r="25" fill="url(#rlCone)" stroke="#d4a24c" stroke-width=".9"/>
    <g fill="#fff" font-size="3.7" font-weight="800" text-anchor="middle" dominant-baseline="central" font-family="Inter,Arial,sans-serif">${nums}</g>
    <path id="rlHi" d="" fill="none" stroke="#ffd45c" stroke-width="1.1" stroke-linejoin="round" opacity="0"/>
    <g stroke="#d4a24c" stroke-width="1.3" stroke-linecap="round" opacity=".9"><path d="M50 36V64M36 50H64"/></g>
    <circle cx="50" cy="50" r="6.3" fill="url(#rlHub)"/><circle cx="50" cy="50" r="2.3" fill="#2b1a05"/>
  </g>
  <circle id="rlBallShadow" r="1.9" fill="rgba(0,0,0,.45)" opacity="0"/>
  <circle id="rlBall" r="1.85" fill="url(#rlBallG)" opacity="0"/>`;
  rlSetWheel(S.rlWheelAngle = 0);
}
function rlSetWheel(a) { $('rlWheelRot').setAttribute('transform', `rotate(${a.toFixed(2)} 50 50)`); }
function rlSetBall(worldDeg, r) {
  const [x, y] = rlPolar(r, worldDeg), b = $('rlBall'), sh = $('rlBallShadow');
  b.setAttribute('cx', x.toFixed(2)); b.setAttribute('cy', y.toFixed(2)); b.setAttribute('opacity', 1);
  sh.setAttribute('cx', (x + .5).toFixed(2)); sh.setAttribute('cy', (y + .9).toFixed(2)); sh.setAttribute('opacity', 1);
}
// La roue ralentit sur D ms (3-6 s, tirée par le serveur) ; la bille tourne en sens inverse sur la piste, puis tombe, rebondit
// et se pose pile dans la case du numéro tiré (position calculée dans le repère de la roue : elle ne peut pas se tromper).
function rlAnimate(num, D, done) {
  const wTotal = (2.4 + Math.random() * 1.2) * 360, w0 = S.rlWheelAngle || 0;
  const pocket = RL_ORDER.indexOf(num) * RL_SEG + RL_SEG / 2;
  const dropAt = Math.max(D - 1700, D * 0.5), dropT = D - dropAt;
  const b0 = Math.random() * 360, bTotal = (5 + Math.random() * 2) * 360;
  const easeW = x => 1 - Math.pow(1 - x, 2.4);
  const wAt = t => w0 + wTotal * easeW(Math.min(t / D, 1));
  const bAt = t => b0 - bTotal * (1 - Math.pow(1 - Math.min(t / dropAt, 1), 1.9)); // sens inverse de la roue
  const phiDrop = bAt(dropAt) - wAt(dropAt);
  const delta = -(((phiDrop - pocket) % 360 + 360) % 360 + 360); // encore ~1 tour (relatif à la roue) avant de se poser
  const t0 = performance.now(); S.rlHi && S.rlHi(false);
  $('rlHi').setAttribute('opacity', 0);
  let ticked = 0;
  const frame = now => {
    const t = Math.min(now - t0, D), w = wAt(t);
    rlSetWheel(w);
    if (t < dropAt) rlSetBall(bAt(t), 43.6);
    else {
      const y = (t - dropAt) / dropT, e = 1 - Math.pow(1 - y, 3);
      const hop = y > .5 ? Math.abs(Math.sin((y - .5) * Math.PI * 4.5)) * Math.pow(1 - y, 1.6) : 0;
      const r = 33 + 10.6 * Math.pow(1 - e, 1.4) + 4.2 * hop;
      rlSetBall(w + phiDrop + delta * e + Math.sin(y * 40) * 2.2 * (1 - y) * (y > .45 ? 1 : 0), r);
    }
    const tk = Math.floor(t / 230); if (t < dropAt && tk > ticked) { ticked = tk; if (tk % 2 === 0) sound('rltick'); } // cliquetis de la bille
    if (t < D) return requestAnimationFrame(frame);
    S.rlWheelAngle = w % 360; rlSetWheel(S.rlWheelAngle);
    rlSetBall(S.rlWheelAngle + pocket, 33); // posée dans sa case, tourne avec la roue
    const hi = $('rlHi'); hi.setAttribute('d', rlSector(RL_ORDER.indexOf(num), 25, 40.5)); hi.setAttribute('opacity', 1);
    done();
  };
  requestAnimationFrame(frame);
}
function rlInit() {
  if (!$('rlTable').children.length) rlBuildTable();
  if (!$('rlWheelRot')) rlBuildWheel();
  rlRenderChips();
  $('rlSpinBtn').disabled = !S.rlBets.length || !!S.rlSpinning;
}
function rlSpin() {
  if (S.rlBusy || S.rlSpinning || !S.rlBets.length) return;
  S.rlBusy = true; sound('bet');
  $('rlStatus').textContent = 'Les jeux sont faits…';
  socket.emit('rl-spin', { roomCode: S.code });
}
const rlClear = () => { if (!S.rlBusy && !S.rlSpinning && S.rlBets.length) socket.emit('rl-clear', { roomCode: S.code }); };
const rlUndo = () => { if (!S.rlBusy && !S.rlSpinning && S.rlBets.length) socket.emit('rl-undo', { roomCode: S.code }); };
function rlRepeat() { // rejoue la même combinaison de paris (nouvelle mise débitée par le serveur)
  if (S.rlBusy || S.rlSpinning || !S.rlLast) return;
  S.rlBusy = true;
  S.rlLast.forEach(b => socket.emit('rl-bet', { roomCode: S.code, kind: b.kind, sel: b.sel, amount: b.amount }));
}
// 1) le serveur lance le tour : numéro (caché dans l'animation), durée 3-6 s tirée au hasard, empreinte publique
socket.on('rl-spin-start', d => {
  if (!$('rlWheelRot')) rlBuildWheel();
  S.rlBusy = false; S.rlSpinning = true; $('rlSpinBtn').disabled = true;
  document.getElementById('rlTable').classList.add('rl-spinning');
  const res = $('rlRes'); res.textContent = '?'; res.style.background = '#2b2036'; res.className = 'rl-res rl-wait';
  $('rlHash').textContent = d.publicHash; $('rlProof').textContent = 'Empreinte publiée AVANT le tirage : le résultat est déjà fixé.';
  $('rlStatus').textContent = 'Rien ne va plus… la roue tourne !';
  S.rlAnim = new Promise(resolve => rlAnimate(d.number, d.duration, () => {
    // la bille est posée : le numéro « tombe » (révélation)
    res.textContent = d.number; res.style.background = d.number === 0 ? '#0f7a44' : RL_RED.has(d.number) ? '#b32633' : '#1c2230';
    res.className = 'rl-res rl-pop'; sound('pop');
    $('rlStatus').textContent = `Le ${d.number} ${({ red: 'rouge', black: 'noir', green: 'vert' })[rlColor(d.number)]} !`;
    resolve();
  }));
  clearTimeout(S.rlSafeT); S.rlSafeT = setTimeout(() => { S.rlSpinning = false; document.getElementById('rlTable').classList.remove('rl-spinning'); }, d.duration + 5000);
});
// 2) le serveur règle le tour (solde, gains) juste après : on attend la fin de l'animation avant de l'afficher
socket.on('rl-result', d => {
  S.rlLast = d.betsSnapshot || null;
  (S.rlAnim || Promise.resolve()).then(() => {
    clearTimeout(S.rlSafeT); S.rlAnim = null; S.rlSpinning = false; S.rlBusy = false;
    document.getElementById('rlTable').classList.remove('rl-spinning');
    $('rlProof').textContent = `Numéro ${d.number} tiré depuis HMAC-SHA256(graine,"roulette") — graine révélée : ${d.seed} (SHA-256(graine) = hash ci-dessus)`;
    rlHistPush(d.number, d.color, d.winnings > 0);
    $('rlStatus').textContent = d.message;
    $('rlSpinBtn').disabled = !S.rlBets.length;
    sound(d.winnings > 0 ? 'win' : 'miss');
  });
});

/* ============================================================
   BLACKJACK 🃏 — les règles vivent côté serveur (blackjack.js) ; le client ne fait qu'afficher l'état reçu :
   mains du joueur (split possible), croupier (carte cachée jamais envoyée), totaux exacts, boutons autorisés.
   ============================================================ */
const BJ_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']; // r : 0 = As … 12 = Roi
const BJ_SUITS = ['♠', '♥', '♦', '♣']; // 0=pique, 1=cœur, 2=carreau, 3=trèfle
let bjNewN = 0; // ordre d'arrivée des nouvelles cartes : elles glissent l'une après l'autre depuis le sabot
const bjDly = cls => / new\b|^new\b/.test(' ' + cls) ? ` style="animation-delay:${(bjNewN++ * 0.22).toFixed(2)}s"` : '';
const bjCardHtml = (c, cls = '') => c === null ? `<div class="bj-card bj-back ${cls}"${bjDly(cls)}></div>`
  : `<div class="bj-card ${c.s === 1 || c.s === 2 ? 'red' : 'blk'} ${cls}"${bjDly(cls)}>${BJ_NAMES[c.r]}${BJ_SUITS[c.s]}<i>${BJ_NAMES[c.r]}${BJ_SUITS[c.s]}</i></div>`;
// total affiché : "7/17" pour une main souple (l'As vaut 1 ou 11), "BLACKJACK" pour un naturel
const bjTotalText = h => h.bj ? 'BJ' : (h.soft && h.total < 21 ? `${h.total - 10}/${h.total}` : String(h.total));
const BJ_TAG = { blackjack: 'Blackjack !', win: 'Gagné', push: 'Égalité', lose: 'Perdu', bust: 'Sauté' };
S.bjPrev = { d: 0, h: [] }; // nb de cartes déjà affichées : seules les NOUVELLES cartes s'animent

function bjSync(state) { // piloté par sync() : le client suit l'état serveur
  if (S.view !== 'bj' || S.bjBusy) return;
  bjPaint(state);
}
function bjBusyOn() { S.bjBusy = true; clearTimeout(S.bjBusyT); S.bjBusyT = setTimeout(() => { S.bjBusy = false; }, 4000); }
function bjPaint(st) {
  const phase = st ? st.phase : 'idle';
  const playing = phase === 'player' || phase === 'insurance';
  const prev = S.bjPrev; bjNewN = 0;
  // --- croupier
  if (!st || !st.dealer.cards.length) { setH($('bjDealer'), ''); $('bjDealerScore').innerHTML = ''; prev.d = 0; }
  else {
    const d = st.dealer, flip = prev.dHidden && !d.hidden;
    const cards = d.cards.map((c, i) => bjCardHtml(c, (i >= prev.d ? 'new ' : '') + (flip && i === 1 ? 'bj-flipface' : ''))).join('')
      + (d.hidden ? bjCardHtml(null, prev.d >= 2 ? '' : 'new') : '');
    setH($('bjDealer'), cards);
    prev.d = d.cards.length + (d.hidden ? 1 : 0); prev.dHidden = d.hidden;
    $('bjDealerScore').className = 'bj-scorebox' + (d.total > 21 ? ' bust' : d.bj ? ' bj' : '');
    setH($('bjDealerScore'), `<small>${d.hidden ? 'VISIBLE' : 'TOTAL'}</small>${d.bj ? 'BJ' : d.total > 21 ? d.total : bjTotalText({ total: d.total, soft: d.soft })}`);
  }
  // --- joueur (1 ou 2 mains)
  const hands = st ? st.hands : [];
  if (!hands.length) prev.h = [];
  setH($('bjPlayer'), hands.map((h, i) => {
    const n = prev.h[i] || 0;
    const cards = h.cards.map((c, k) => bjCardHtml(c, k >= n ? 'new' : '')).join('');
    prev.h[i] = h.cards.length;
    const cls = h.total > 21 ? ' bust' : h.bj ? ' bj' : '';
    return `<div class="bj-hand${phase === 'player' && st.active === i && hands.length > 1 ? ' act' : ''}"><div class="bj-cards">${cards}</div>`
      + `<div class="bj-scorebox${cls}"><small>MISE ${h.bet} 🪙${h.doubled ? ' ×2' : ''}</small>${bjTotalText(h)}</div>`
      + (h.outcome ? `<span class="bj-tag ${h.outcome}">${BJ_TAG[h.outcome]}</span>` : '') + `</div>`;
  }).join(''));
  // --- boutons
  show('bjDealBtn', !playing);
  show('bjHitBtn', phase === 'player'); show('bjStandBtn', phase === 'player');
  show('bjDoubleBtn', phase === 'player' && !!st.can.double);
  show('bjSplitBtn', phase === 'player' && !!st.can.split);
  show('bjInsBtn', phase === 'insurance'); show('bjNoInsBtn', phase === 'insurance');
  if (phase === 'insurance') $('bjInsBtn').textContent = `Assurance 🛡️ (${st.insuranceOffer} 🪙)`;
  $('bjBetAmount').disabled = playing;
  $('bjStatus').textContent = phase === 'insurance' ? 'Le croupier montre un As : veux-tu t\'assurer contre son blackjack ?'
    : phase === 'player' ? (hands.length > 1 ? `Main ${st.active + 1} sur ${hands.length} : tirer, rester, doubler` + (st.can.split ? ' ou séparer.' : '.') : 'À toi : tirer, rester, doubler' + (st.can.split ? ' ou séparer.' : '.'))
    : 'Mise, puis distribue !';
}
function bjHistPush(net, outcomes) {
  const bj = outcomes.includes('blackjack');
  const cls = net > 0 ? 'cr-win' : net === 0 ? '' : 'cr-lose';
  const txt = bj ? 'BJ!' : net > 0 ? 'Gagné' : net === 0 ? 'Nul' : outcomes.every(o => o === 'bust') ? 'Sauté' : 'Perdu';
  S.bjHist.unshift({ cls, txt }); S.bjHist.length = Math.min(S.bjHist.length, 12);
  setH($('bjHist'), S.bjHist.map(h => `<div class="history-pill ${h.cls}">${h.txt}</div>`).join(''));
}
function bjInit() {
  if (!S.bjInited) {
    S.bjInited = true;
    $('bjQuick').addEventListener('click', e => {
      const b = e.target.closest('button'), amt = $('bjBetAmount'); if (!b || amt.disabled) return;
      if (b.dataset.a) amt.value = b.dataset.a;
      else if (b.dataset.f === 'max') amt.value = S.balance;
      else amt.value = Math.max(1, Math.floor((parseFloat(amt.value) || 0) * b.dataset.f));
    });
  }
  bjPaint(S.meBj || null);
}
function bjDeal() {
  const amount = parseInt($('bjBetAmount').value);
  if (!amount || amount <= 0) return alert('Entre une mise valide !');
  bjBusyOn(); sound('bet');
  S.bjPrev = { d: 0, h: [] }; // nouvelle main : toutes les cartes s'animent
  $('bjMsg').textContent = ''; $('bjSeed').textContent = '—';
  socket.emit('bj-deal', { roomCode: S.code, amount });
}
const bjAct = ev => () => { if (!S.bjBusy) { bjBusyOn(); socket.emit(ev, { roomCode: S.code }); } };
const bjHit = bjAct('bj-hit'), bjStand = bjAct('bj-stand'), bjDouble = bjAct('bj-double'), bjSplit = bjAct('bj-split');
const bjInsurance = take => { if (!S.bjBusy) { bjBusyOn(); socket.emit('bj-insurance', { roomCode: S.code, take }); } };
socket.on('bj-state', d => {
  S.bjBusy = false;
  if (d.seed) $('bjSeed').textContent = d.seed;
  bjPaint(d.state);
  if (d.message) $('bjMsg').textContent = d.message;
});
socket.on('bj-result', d => {
  S.bjBusy = false;
  $('bjSeed').textContent = d.seed;
  bjPaint(d.state);
  $('bjMsg').textContent = d.message;
  bjHistPush(d.net, d.outcomes);
  sound(d.net > 0 ? 'win' : d.net === 0 ? 'pop' : 'miss');
});

// Boutons de mise rapide communs (10 / 50 / 100 / 500 / ÷2 / ×2 / Max) : mêmes réglages dans tous les jeux
[['iceQuick', 'iceBetAmount'], ['jmQuick', 'jmBetAmount']].forEach(([row, input]) => $(row).addEventListener('click', e => {
  const b = e.target.closest('button'), amt = $(input); if (!b || amt.disabled) return;
  if (b.dataset.a) amt.value = b.dataset.a;
  else if (b.dataset.f === 'max') amt.value = S.balance;
  else amt.value = Math.max(1, Math.floor((parseFloat(amt.value) || 0) * b.dataset.f));
}));

