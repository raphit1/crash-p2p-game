/* ============================================================
   slot.js — moteur de la machine à sous « LA NUIT DU LOUP » (serveur uniquement)
   MÉCANIQUE IDENTIQUE à « Huff N' Even More Puff » (Light & Wonder) — seuls les graphismes changent :
     • 5 rouleaux × 3 lignes, 243 façons de gagner (3 symboles identiques ou plus, de gauche à droite)
     • 🌕 Wild (le Grand Méchant Loup) : rouleaux 2, 3, 4 seulement ; remplace tout sauf Lanterne / Scie / Scie dorée
     • 🏮 LANTERNE (= « Hard Hat ») : 6 ou plus n'importe où → 6 tours gratuits (« Tours Gratuits »),
         chaque lanterne déclenchante pose un cadre PAILLE
     • 🪚 SCIE (= « Buzz Saw ») : 3 ou plus n'importe où → LA ROUE (1 tour)
         SCIE DORÉE (rouleau 5 seulement) : si elle fait partie des 3 scies → directement la ROUE AMÉLIORÉE
     • La ROUE : Scie (Buzz Saw) · Mega Chapeau (Mega Hat) · Manoir (Mansion) · Tours Gratuits · Mini 20× · Minor 100× · Major 1000× · Grand 5000× · AMÉLIORATION
         ROUE AMÉLIORÉE : versions SUPER (grille 5×6 = 30 cases) des 4 bonus · Major · Grand · SUPER JACKPOT 7500×
     • Dans un bonus : 6 tours. Chaque lanterne qui tombe pose un cadre sur sa case ou l'améliore : Paille → Bois → Brique.
         Sur une Brique, elle améliore une autre case (ou ajoute un cadre) ; tout en Brique → prix de 10× la mise.
         3 lanternes ou plus pendant un tour → 1 tour en plus.
         – Scie : AVANT les tours, les scies de départ traversent la grille vers la droite et posent une maison sur chaque case traversée
         – Lanterne DORÉE (variante maison) : améliore une maison de 2 niveaux d'un coup
         – Mega Chapeau : un tour de départ avec uniquement des méga-lanternes 2×2, 3×3 ou 3×5 qui posent des cadres Paille
         – Manoir : toutes les cases traversées par les scies sont des cadres BRIQUE ; les lanternes ajoutent des Briques
         – Super : même chose sur 6 lignes (30 cases)
     • À la fin, le loup souffle sur chaque maison : Paille (Tombe) · Bois (Crypte) · Brique (Manoir hanté), chacune avec son prix
         (la Brique peut aussi contenir un jackpot, ou un tour de Roue — seulement pendant les Tours Gratuits)
     • Jackpots FIXES (× mise totale) : Mini 20 · Minor 100 · Major 1000 · Grand 5000 · Super 7500 (roue améliorée seulement)
     • Gain maximum : 7500× la mise
   Toutes les valeurs sont des MULTIPLES de la mise. Le hasard vient d'une fonction rng() → [0,1) (graine HMAC vérifiable).
   RTP visé : 99 % (mesuré par simulation : voir tools/slot-sim.js).
   ============================================================ */
'use strict';
const COLS = 5;
// symboles : indices
const SYM = ['WO', 'VA', 'OW', 'CF', 'CD', 'A', 'K', 'Q', 'J', 'TE', 'NE', 'WD', 'HT', 'SW', 'GS'];
const WD = 11, HT = 12, SW = 13, GS = 14, NPAY = 11;
// poids des symboles normaux (le Wild n'existe que sur les rouleaux 2-3-4)
const P = {
    W_SYM: [2, 3, 4, 6, 8, 24, 24, 18, 10, 5, 5],
    W_WILD: 8,
    P_HAT: 0.113,          // chance qu'une case soit une lanterne
    P_SAW: 0.028,          // chance qu'une case soit une scie (rouleaux 1-4 ; rouleau 5 : voir P_SAW5)
    P_SAW5: 0.022,          // rouleau 5 : scie normale
    P_GOLD: 0.0045,         // rouleau 5 : scie dorée
    PAY_SCALE: 4.5,
    // chance qu'une case reçoive une lanterne à chaque tour de bonus
    BH: { fs: 0.118, bs: 0.085, mh: 0.105, ms: 0.07 },
    BH_SUP: 1.25,          // grille 5×6 : les lanternes tombent 25 % plus souvent par case (elle se remplit vite, comme dans le vrai jeu)
    GH: 0.17, GH_SUP: 0.24, // lanterne DORÉE : améliore une maison de 2 niveaux d'un coup (Paille → Brique)
    JWM: { fs: 1, bs: 1, mh: 1, ms: 1, sfs: .08, sbs: .08, smh: .08, sms: .08 }, // fréquence des jackpots / tours de roue cachés dans les maisons, par bonus
    HSM: { fs: .2, bs: .358, mh: .31, ms: .376, sfs: .172, sbs: .172, smh: .172, sms: .172 }, // échelle des prix des maisons, par bonus (calibrage du RTP)
    SUP_EXTRA_SAWS: 2,     // grille 5×6 : scies supplémentaires
    // roue : poids de chaque case [code, poids]
    WHEEL1: [['bs', 24], ['mh', 24], ['ms', 4], ['fs', 30], ['mini', 12], ['minor', 3.5], ['major', 0.15], ['grand', 0.02], ['up', 2]],
    WHEEL2: [['sbs', 24], ['smh', 20], ['sms', 18], ['sfs', 24], ['major', 6], ['grand', 1.1], ['super', 0.16]],
    // prix des maisons : [valeur × mise ou code jackpot, poids]
    STRAW: [[0.5, 30], [0.75, 24], [1, 22], [1.25, 12], [1.5, 8], [2, 4]],
    STICK: [[2, 28], [3, 24], [4, 18], [5, 12], [6, 8], [8, 5], ['mini', 3], ['mini2', 0.8], ['minor', 0.35]],
    BRICK: [[10, 40], [15, 28], [20, 18], [25, 11], [40, 6], [50, 3], [75, 1.5], [100, .8], [150, .35], [250, .15], ['mini', 1.8], ['mini2', .5], ['minor', .3], ['major', .05], ['grand', .004]],
    WHEEL_BRICK: 0.045    // Brique pendant les Tours Gratuits : chance d'avoir un tour de Roue
};
const PAY = [ // [3, 4, 5 symboles] × mise totale, par « façon »
    [.12, .45, 1.5], [.09, .3, 1], [.05, .18, .6], [.03, .12, .4], [.02, .08, .25],
    [.016, .06, .2], [.016, .06, .2], [.016, .06, .2], [.016, .06, .2], [0, .04, .15], [0, .04, .15]
];
const JP = { mini: 20, mini2: 40, minor: 100, major: 1000, grand: 5000, super: 7500 };
const MAX_WIN = 7500;
const MAX_SPINS = 24, MAX_DEPTH = 2;

const pickW = (rng, list) => { let t = 0; for (const x of list) t += x[1]; let r = rng() * t; for (const x of list) { r -= x[1]; if (r < 0) return x[0]; } return list[list.length - 1][0]; };
const symTotal = () => P.W_SYM.reduce((a, b) => a + b, 0);
function drawSym(rng, reel) {
    let u = rng();
    if (u < P.P_HAT) return HT;
    u -= P.P_HAT;
    if (reel === 4) { if (u < P.P_GOLD) return GS; u -= P.P_GOLD; if (u < P.P_SAW5) return SW; u -= P.P_SAW5; }
    else { if (u < P.P_SAW) return SW; u -= P.P_SAW; }
    const wild = reel >= 1 && reel <= 3 ? P.W_WILD : 0;
    let r = rng() * (symTotal() + wild);
    for (let i = 0; i < P.W_SYM.length; i++) { r -= P.W_SYM[i]; if (r < 0) return i; }
    return wild ? WD : P.W_SYM.length - 1;
}
// grille de base : 15 cases, index = rouleau*3 + ligne
function evalWays(grid) {
    const wins = []; let total = 0;
    for (let s = 0; s < NPAY; s++) {
        let len = 0, ways = 1;
        for (let r = 0; r < COLS; r++) {
            let c = 0; for (let k = 0; k < 3; k++) { const g = grid[r * 3 + k]; if (g === s || g === WD) c++; }
            if (!c) break; len++; ways *= c;
        }
        if (len >= 3 && PAY[s][len - 3] > 0) { const pay = PAY[s][len - 3] * P.PAY_SCALE * ways; wins.push({ s, len, ways, pay }); total += pay; }
    }
    return { wins, total };
}

/* ---------- Maisons ---------- */
// lv : 1 Paille (Tombe) · 2 Bois (Crypte) · 3 Brique (Manoir hanté)
function housePrize(rng, lv, allowWheel, hs, jw) {
    if (lv === 3 && allowWheel && rng() < P.WHEEL_BRICK * jw) return { lv, wheel: true, mult: 0 };
    const v = pickW(rng, (lv === 1 ? P.STRAW : lv === 2 ? P.STICK : P.BRICK).map(([x, w]) => [x, typeof x === 'string' ? w * jw : w]));
    return typeof v === 'string' ? { lv, jp: v, mult: JP[v] } : { lv, mult: +(v * hs).toFixed(2) };
}

/* ---------- La Roue ---------- */
const FEATURE = { bs: ['bs', 0], mh: ['mh', 0], ms: ['ms', 0], fs: ['fs', 0], sbs: ['bs', 1], smh: ['mh', 1], sms: ['ms', 1], sfs: ['fs', 1] };
function wheel(rng, lv, depth) {
    const code = pickW(rng, lv === 1 ? P.WHEEL1 : P.WHEEL2);
    const seg = { t: 'wheel', lv, wedge: code, pay: 0, total: 0, next: null };
    if (code === 'up') { seg.next = wheel(rng, 2, depth); seg.total = seg.next.total; }
    else if (JP[code]) { seg.pay = JP[code]; seg.total = seg.pay; }
    else { const f = FEATURE[code]; seg.next = bonus(rng, f[0], !!f[1], { saws: null, hats: [] }, depth + 1); seg.total = seg.next.total; }
    return seg;
}

/* ---------- Un jeu bonus (6 tours) ---------- */
function bonus(rng, mode, sup, ctx, depth) {
    const R = sup ? 6 : 3, C = COLS * R, f = new Array(C).fill(0);
    const seg = { t: 'bonus', mode, sup, R, init: null, saws: [], mega: [], spins: [], reveal: [], credit: 0, total: 0, wheels: [] };
    const cell = (reel, row) => reel * R + row;
    const pickCells = (n, from) => { const pool = from.slice(), out = []; while (n-- > 0 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]); return out; };
    let saws = []; // [rouleau, ligne]
    if (mode === 'bs' || mode === 'ms') {
        let base = ctx.saws && ctx.saws.length >= 3 ? ctx.saws.map(i => [Math.floor(i / 3), i % 3]) : null; // cases de la grille 5×3 d'origine
        if (!base) { const n = 3 + Math.floor(rng() * 3); base = pickCells(n, [...Array(15).keys()]).map(i => [Math.floor(i / 3), i % 3]); }
        saws = base.slice(); if (sup) { base.forEach(([r, k]) => saws.push([r, k + 3])); const taken = new Set(saws.map(([r, k]) => r * R + k)); for (let n = 0; n < P.SUP_EXTRA_SAWS; n++) { const free = []; for (let r = 0; r < COLS; r++) for (let k = 0; k < R; k++) if (!taken.has(r * R + k)) free.push([r, k]); if (!free.length) break; const q = free[Math.floor(rng() * free.length)]; taken.add(q[0] * R + q[1]); saws.push(q); } }
        seg.saws = saws.map(([r, k]) => cell(r, k));
    }
    if (mode === 'fs') { // lanternes de départ : celles qui ont déclenché le bonus ; sinon (bonus venu de la Roue) 6 lanternes au hasard, 12 en grille 5×6
        if (ctx.hats && ctx.hats.length) ctx.hats.forEach(i => { f[cell(Math.floor(i / 3), i % 3)] = 1; });
        else pickCells(sup ? 12 : 6, [...Array(C).keys()]).forEach(c => { f[c] = 1; });
    }
    if (mode === 'mh') { // tour de départ : uniquement des méga-lanternes
        const cnt = 1 + (rng() < 0.35 ? 1 : 0) + (rng() < 0.12 ? 1 : 0), blocks = [];
        const sizes = [['2x2', 55], ['3x3', 38], ['3x5', 7]];
        for (let b = 0; b < cnt; b++) {
            const sz = pickW(rng, sizes), w = sz === '3x5' ? 5 : sz === '3x3' ? 3 : 2, h = sz === '2x2' ? 2 : 3;
            for (let tries = 0; tries < 12; tries++) {
                const r0 = Math.floor(rng() * (COLS - w + 1)), k0 = Math.floor(rng() * (R - h + 1)), cs = [];
                for (let r = 0; r < w; r++) for (let k = 0; k < h; k++) cs.push(cell(r0 + r, k0 + k));
                if (cs.some(c => blocks.some(bb => bb.cells.includes(c)))) continue;
                blocks.push({ size: sz, r0, k0, w, h, cells: cs }); break;
            }
        }
        blocks.forEach(bb => bb.cells.forEach(c => { f[c] = 1; })); seg.mega = blocks;
    }
    seg.init = f.slice();
    // BALAYAGE DES SCIES : avant les 6 tours, les scies tracent leur route de gauche à droite et posent une maison sur chaque case traversée
    seg.sweep = [];
    if (mode === 'bs' || mode === 'ms') {
        for (let j = 0; j < COLS; j++) {
            const here = saws.filter(s => s[0] <= j).map(s => cell(j, s[1])), ups = [];
            here.forEach(c => { const was = f[c], to = mode === 'ms' ? 3 : Math.min(3, was + 1); if (to !== was) { f[c] = to; ups.push({ c, from: was, to }); } });
            seg.sweep.push({ saws: here, ups });
        }
    }
    seg.afterSweep = f.slice();
    const p = P.BH[mode] * (sup ? P.BH_SUP : 1), gh = sup ? P.GH_SUP : P.GH;
    let left = 6, done = 0;
    const apply = (c, ups, gold) => { // une lanterne tombe sur la case c (dorée : +2 niveaux)
        const from = f[c], n = gold ? 2 : 1;
        const up = (t, redir) => { const was = f[t]; f[t] = mode === 'ms' ? 3 : Math.min(3, was + n); ups.push({ c: t, from: was, to: f[t], re: redir, g: gold ? 1 : undefined }); };
        if (mode === 'ms' ? from === 0 : from < 3) return up(c, undefined);
        // case déjà au maximum : une autre case est améliorée
        const cand = []; for (let k = 0; k < C; k++) if (f[k] < 3) cand.push(k);
        if (cand.length) up(cand[Math.floor(rng() * cand.length)], c);
        else { const cr = +(10 * P.HSM[(sup ? 's' : '') + mode]).toFixed(2); seg.credit += cr; ups.push({ c, credit: cr }); }
    };
    while (left > 0 && done < MAX_SPINS) {
        left--; done++;
        const touch = [], hats = [], golds = [], ups = [];
        for (let c = 0; c < C; c++) if (rng() < p) { hats.push(c); if (rng() < gh) golds.push(c); }
        hats.forEach(c => apply(c, ups, golds.includes(c)));
        const n = hats.length; let extra = false;
        if (n >= 3 && done + left < MAX_SPINS) { left++; extra = true; }
        seg.spins.push({ touch, hats, golds, ups, left, extra });
    }
    // le loup souffle sur les maisons
    const reveal = [];
    const allowWheel = (mode === 'fs') && depth < MAX_DEPTH;
    for (let c = 0; c < C; c++) if (f[c] > 0) {
        const hk = (sup ? 's' : '') + mode, hp = housePrize(rng, f[c], allowWheel, P.HSM[hk], P.JWM[hk]); hp.c = c; reveal.push(hp);
    }
    // ordre du souffle : Pailles, puis Bois, puis Briques
    reveal.sort((a, b) => a.lv - b.lv || a.c - b.c);
    seg.reveal = reveal; seg.final = f.slice();
    let total = seg.credit;
    reveal.forEach(h => { total += h.mult; });
    reveal.forEach(h => { if (h.wheel) { const w = wheel(rng, sup ? 2 : 1, depth + 1); h.w = w; seg.wheels.push(w); total += w.total; } });
    seg.total = total;
    return seg;
}

/* ---------- Un tour complet ---------- */
// opts.buy : 1 = la Roue · 2 = les Tours Gratuits · 3 = la Roue améliorée
const BUY = [
    null,
    { id: 1, name: 'La Roue', price: 45 },
    { id: 2, name: 'Tours Gratuits', price: 32.5 },
    { id: 3, name: 'Roue améliorée', price: 266 }
];
function spin(rng, opts = {}) {
    if (opts.buy) {
        const chain = [];
        if (opts.buy === 2) { const hats = []; const pool = [...Array(15).keys()]; for (let k = 0; k < 6; k++) hats.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]); chain.push(bonus(rng, 'fs', false, { hats }, 0)); }
        else chain.push(wheel(rng, opts.buy === 3 ? 2 : 1, 0));
        const t = chain.reduce((a, s) => a + s.total, 0);
        return { grid: null, wins: [], base: 0, hats: 0, saws: 0, gold: 0, chain, total: Math.min(MAX_WIN, t) };
    }
    const grid = []; for (let r = 0; r < COLS; r++) for (let k = 0; k < 3; k++) grid.push(drawSym(rng, r));
    const { wins, total: base } = evalWays(grid);
    const hatPos = [], sawPos = []; let gold = 0;
    grid.forEach((g, i) => { if (g === HT) hatPos.push(i); if (g === SW || g === GS) { sawPos.push(i); if (g === GS) gold++; } });
    const chain = []; let total = base;
    if (sawPos.length >= 3) chain.push(wheel(rng, gold ? 2 : 1, 0));
    if (hatPos.length >= 6) chain.push(bonus(rng, 'fs', false, { hats: hatPos }, 0));
    chain.forEach(s => { total += s.total; });
    return { grid, wins, base, hats: hatPos.length, saws: sawPos.length, gold, chain, total: Math.min(MAX_WIN, total) };
}
const getParams = () => P;
module.exports = { spin, wheel, bonus, evalWays, BUY, JP, MAX_WIN, SYM, COLS, P, getParams, drawSym, HT, SW, GS, WD };
