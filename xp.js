/* ============================================================
   xp.js — niveaux, rangs (apparences autour du profil) et titres.
   Utilisé par le serveur ; le client reçoit la table des rangs avec « me-data ».
   ============================================================ */
'use strict';
const MAX_LEVEL = 150;
// XP nécessaire pour passer du niveau L au niveau L+1
const xpFor = L => 60 + 25 * L;
// XP cumulée nécessaire pour ATTEINDRE le niveau L (niveau 1 = 0 XP)
const xpAt = L => { let s = 0; for (let i = 1; i < L; i++) s += xpFor(i); return s; };
function levelInfo(xp) {
    xp = Math.max(0, Math.floor(Number(xp) || 0));
    let L = 1, left = xp;
    while (L < MAX_LEVEL && left >= xpFor(L)) { left -= xpFor(L); L++; }
    return { level: L, into: L >= MAX_LEVEL ? 0 : left, need: L >= MAX_LEVEL ? 0 : xpFor(L), xp };
}
// Rangs : { id, n (nom), lv (niveau requis), t (titre emblématique), c (couleur principale) }
const TIERS = [
    { id: 'bronze',   n: 'Bronze',      lv: 1,   t: 'Novice du Hasard',        c: '#cd7f32' },
    { id: 'argent',   n: 'Argent',      lv: 5,   t: 'Joueur Assidu',           c: '#cfd8e3' },
    { id: 'or',       n: 'Or',          lv: 10,  t: 'Chasseur de Gains',       c: '#ffd34d' },
    { id: 'platine',  n: 'Platine',     lv: 20,  t: 'Stratège de Table',       c: '#7fe7e0' },
    { id: 'diamant',  n: 'Diamant',     lv: 30,  t: 'Flambeur Étincelant',     c: '#7fc8ff' },
    { id: 'maitre',   n: 'Maître',      lv: 45,  t: 'Maître des Mises',        c: '#ff7a2f' },
    { id: 'grandmaitre', n: 'Grand Maître', lv: 60, t: 'Seigneur du Hasard',    c: '#c78bff' },
    { id: 'legende',  n: 'Légende',     lv: 80,  t: 'Légende du Casino',       c: '#ffcf33' },
    { id: 'mythique', n: 'Mythique',    lv: 100, t: 'Dieu du Jackpot',         c: '#a66bff' }
];
const tierFor = level => { let i = 0; TIERS.forEach((t, k) => { if (level >= t.lv) i = k; }); return i; };
module.exports = { MAX_LEVEL, xpFor, xpAt, levelInfo, TIERS, tierFor };
