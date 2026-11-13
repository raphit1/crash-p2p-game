/* ============================================================
   slot.js — moteur de la machine à sous « LA NUIT DU LOUP » (serveur uniquement)
   Inspirée du fonctionnement de Huff N' Puff, en version sombre :
     • 5 rouleaux × 3 lignes, 243 façons de gagner (gauche → droite, 3 symboles mini)
     • 🌕 Pleine lune = Wild (rouleaux 2, 3, 4)
     • 🏮 Lanterne = symbole bonus. 6 lanterneS ou plus en un tour → « LE SOUFFLE DU LOUP » :
         chaque lanterne devient une TOMBE ; 6 tours pour les améliorer (Tombe → Crypte → Manoir hanté) ;
         une lanterne sur un Manoir en améliore une autre ; 3 lanternes en un tour = tour offert.
         Puis le loup hurle 3 fois : 1er hurlement = les Tombes, 2e = les Cryptes, 3e = les Manoirs → prix (et jackpots !).
     • À 5 lanternes seulement, le loup peut parfois en souffler une 6e (rarement).
     • Achat de bonus : 3 niveaux, prix calculés pour garder la même rentabilité.
   Toutes les valeurs sont des MULTIPLES de la mise. Le hasard vient d'une fonction rng() → [0,1) (graine HMAC vérifiable).
   RTP visé : 98 % (mesuré par simulation : voir tools/slot-sim.js).
   ============================================================ */
'use strict';
const COLS = 5, ROWS = 3, CELLS = COLS * ROWS;
// symboles : indices
const SYM = ['A', 'K', 'Q', 'J', 'BA', 'SP', 'OW', 'VA', 'WO', 'WD', 'LA'];
const WD = 9, LA = 10;
// poids des symboles normaux (identiques sur tous les rouleaux ; le Wild n'existe que sur 2-3-4)
const W_SYM = [14, 14, 13, 13, 10, 10, 8, 6, 4];
const W_WILD = 5;
const P_LANTERN = [0.145, 0.145, 0.145, 0.145, 0.145]; // chance qu'une case soit une lanterne (par rouleau)
const TOPUP_P = 0.07; // à exactement 5 lanternes : chance qu'une 6e apparaisse
// gains par « façon » pour 3 / 4 / 5 symboles (× mise totale) — multipliés par PAY_SCALE (réglage fin du RTP)
const PAY = [[.10, .32, .9], [.10, .32, .9], [.12, .4, 1.1], [.12, .4, 1.1], [.2, .7, 2.2], [.2, .7, 2.2], [.35, 1.1, 4.5], [.55, 1.8, 7], [.9, 3.2, 13]];
let PAY_SCALE = 2.17;

// ----- Bonus -----
const BONUS_SPINS = 6, BONUS_MAX_SPINS = 16, P_LAND = 0.075; // chance qu'une lanterne tombe sur UNE case donnée, à chaque tour bonus
const JP = { mini: 15, minor: 60, major: 300, grand: 3000 };
// prix de chaque niveau de maison : [valeur × mise ou nom de jackpot, poids]
const PRIZES = [
    null,
    [[1, 30], [2, 25], [3, 18], [5, 12], [8, 7], [12, 4], [20, 2], ['mini', 1]],
    [[2, 22], [4, 22], [6, 18], [10, 14], [16, 9], [25, 6], [40, 4], [80, .6], ['mini', 2], ['minor', 1.5]],
    [[5, 20], [10, 20], [15, 18], [25, 14], [40, 10], [60, 7], [100, 4], [200, 1.2], [400, .4], ['minor', 1.5], ['major', .7], ['grand', .04]]
];
let BONUS_SCALE = 0.26; // réglage fin
const MAX_WIN = 10000; // plafond d'un tour (× mise)

const pickW = (rng, list) => { let t = 0; for (const x of list) t += x[1]; let r = rng() * t; for (const x of list) { r -= x[1]; if (r < 0) return x[0]; } return list[list.length - 1][0]; };
const SYM_TOTAL = W_SYM.reduce((a, b) => a + b, 0);
function drawSym(rng, reel) {
    if (rng() < P_LANTERN[reel]) return LA;
    const wild = reel >= 1 && reel <= 3 ? W_WILD : 0;
    let r = rng() * (SYM_TOTAL + wild);
    for (let i = 0; i < W_SYM.length; i++) { r -= W_SYM[i]; if (r < 0) return i; }
    return wild ? WD : W_SYM.length - 1;
}
// grille : tableau de 15 cases, index = rouleau*3 + ligne
function evalWays(grid) {
    const wins = []; let total = 0;
    for (let s = 0; s < 9; s++) {
        let len = 0, ways = 1;
        for (let r = 0; r < COLS; r++) {
            let c = 0; for (let k = 0; k < ROWS; k++) { const g = grid[r * ROWS + k]; if (g === s || g === WD) c++; }
            if (!c) break; len++; ways *= c;
        }
        if (len >= 3) { const pay = PAY[s][len - 3] * PAY_SCALE * ways; wins.push({ s, len, ways, pay }); total += pay; }
    }
    return { wins, total };
}

// prix d'une maison de niveau L
function prize(rng, L) {
    const v = pickW(rng, PRIZES[L]);
    return typeof v === 'string' ? { jp: v, mult: JP[v] } : { mult: v * BONUS_SCALE };
}
// Déroulé complet d'un bonus. init = niveaux de départ (tableau de 15 : 0 = vide, 1..3). Renvoie { steps, blows, total, full }
function runBonus(rng, init) {
    const lv = init.slice(), steps = []; let left = BONUS_SPINS, done = 0;
    while (left > 0 && done < BONUS_MAX_SPINS) {
        left--; done++;
        const landed = []; for (let i = 0; i < CELLS; i++) if (rng() < P_LAND) landed.push(i);
        const ups = [];
        landed.forEach(i => {
            let t = i;
            if (lv[t] >= 3) { // Manoir déjà au max : la lanterne en améliore une autre (jamais de tour perdu)
                const cand = []; for (let k = 0; k < CELLS; k++) if (lv[k] >= 1 && lv[k] < 3) cand.push(k);
                if (!cand.length) for (let k = 0; k < CELLS; k++) if (lv[k] === 0) cand.push(k);
                t = cand.length ? cand[Math.floor(rng() * cand.length)] : -1;
            }
            if (t >= 0) { ups.push({ cell: t, from: lv[t], to: lv[t] + 1, redirect: t !== i ? i : undefined }); lv[t]++; }
        });
        let bonusSpin = false;
        if (landed.length >= 3 && left + done < BONUS_MAX_SPINS) { left++; bonusSpin = true; }
        steps.push({ landed, ups, left, bonusSpin });
    }
    // les 3 hurlements
    const blows = []; let total = 0;
    for (let L = 1; L <= 3; L++) {
        const items = [];
        for (let i = 0; i < CELLS; i++) if (lv[i] === L) { const p = prize(rng, L); items.push(Object.assign({ cell: i }, p)); total += p.mult; }
        blows.push({ level: L, items });
    }
    const full = lv.every(x => x >= 1);
    if (full) { const p = { cell: -1, jp: 'grand', mult: JP.grand, full: true }; blows.push({ level: 4, items: [p] }); total += p.mult; }
    return { steps, blows, total, full, final: lv };
}

// niveaux de départ d'un bonus acheté : 6 cases au hasard au niveau donné
const BUY = [
    null,
    { id: 1, name: 'Tombes', lvl: 1, count: 6, price: 27 },
    { id: 2, name: 'Cryptes', lvl: 2, count: 6, price: 54 },
    { id: 3, name: 'Manoirs hantés', lvl: 3, count: 6, price: 93 }
];
function buyInit(rng, lvl, count) {
    const init = new Array(CELLS).fill(0), pool = [...Array(CELLS).keys()];
    for (let k = 0; k < count; k++) init[pool.splice(Math.floor(rng() * pool.length), 1)[0]] = lvl;
    return init;
}

// Un tour complet. opts.buy = 1..3 pour un bonus acheté. total = gain en × mise (jamais plus que MAX_WIN)
function spin(rng, opts = {}) {
    if (opts.buy) {
        const B = BUY[opts.buy], init = buyInit(rng, B.lvl, B.count), bonus = runBonus(rng, init);
        return { grid: null, wins: [], base: 0, lanterns: B.count, topup: null, bonus: Object.assign(bonus, { init, bought: B.id }), total: Math.min(MAX_WIN, bonus.total) };
    }
    const grid = []; for (let r = 0; r < COLS; r++) for (let k = 0; k < ROWS; k++) grid.push(drawSym(rng, r));
    const { wins, total: base } = evalWays(grid);
    let lanterns = grid.filter(g => g === LA).length, topup = null;
    if (lanterns === 5 && rng() < TOPUP_P) { // « il m'en manque une » : le loup en souffle une de plus
        const empty = []; grid.forEach((g, i) => { if (g !== LA) empty.push(i); });
        topup = empty[Math.floor(rng() * empty.length)]; grid[topup] = LA; lanterns = 6;
    }
    let bonus = null, total = base;
    if (lanterns >= 6) {
        const init = grid.map(g => (g === LA ? 1 : 0));
        bonus = runBonus(rng, init); bonus.init = init; total += bonus.total;
    }
    return { grid, wins, base, lanterns, topup, bonus, total: Math.min(MAX_WIN, total) };
}
const setScale = (pay, bonus) => { if (pay != null) PAY_SCALE = pay; if (bonus != null) BONUS_SCALE = bonus; };
const getScale = () => ({ pay: PAY_SCALE, bonus: BONUS_SCALE });
module.exports = { spin, runBonus, evalWays, BUY, JP, MAX_WIN, SYM, COLS, ROWS, CELLS, setScale, getScale, TOPUP_P, BONUS_SPINS };
