/* ============================================================
   shared-constants.js — Source de vérité UNIQUE des constantes
   et formules de probabilité, partagée entre le serveur (require)
   et le client (servi en /shared-constants.js par server.js).
   Les deux côtés utilisent donc exactement les mêmes nombres :
   plus de divergence possible entre l'affichage client et le calcul serveur.
   ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') module.exports = factory();
    else root.GAMES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const RTP = 0.985; // espérance de gain cible : 98,5 % sur Crash, Icefield, Just mixed, Chicken Road, Arrows X
    const START_BALANCE = 1000; // solde initial d'un joueur dans une room
    const MAX_BET = 1e12;        // plafond de mise par tour (anti-abus / anti-overflow)

    /* --------- Mise d'entrée en euros, jetons et redistribution du pot --------- */
    const TOKENS_PER_EUR = 100; // 5 € = 500 jetons
    const STAKE_MIN_EUR = 0.1;  // mise d'entrée minimale dans une room
    const STAKE_MAX_EUR = 1e9;   // quasi illimité (garde-fou technique seulement)
    const PERF_FLOOR = 0.10;    // plancher du facteur de performance

    // Redistribution du pot (tout est calculé en centimes entiers pour ne perdre aucun centime).
    //   P_i = (solde final - mise initiale) / mise initiale
    //   C_i = mise initiale × max(0,10 ; 1 + P_i)
    //   gain_i = pot × C_i / Σ C
    // players : [{ stake (en €), initial (jetons de départ), final (jetons finaux) }]
    const settlePot = players => {
        const stakeC = players.map(p => Math.round(p.stake * 100));
        const potCents = stakeC.reduce((a, b) => a + b, 0);
        const rows = players.map(p => {
            const perf = p.initial > 0 ? (p.final - p.initial) / p.initial : 0;
            return { perf, weight: p.initial * Math.max(PERF_FLOOR, 1 + perf) };
        });
        const sumW = rows.reduce((a, r) => a + r.weight, 0) || 1;
        const raw = rows.map(r => potCents * r.weight / sumW);
        const pay = raw.map(Math.floor);
        let rest = potCents - pay.reduce((a, b) => a + b, 0); // centimes restants : aux plus grosses parts décimales
        raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { pay[i]++; rest--; } });
        return { potCents, rows: rows.map((r, i) => ({ perf: r.perf, weight: r.weight, payoutCents: pay[i], netCents: pay[i] - stakeC[i] })) };
    };
    // Qui paie qui (le moins de virements possible) à partir des gains/pertes nets : [{ name, netCents }]
    const settleTransfers = list => {
        const give = list.filter(x => x.netCents < 0).map(x => ({ name: x.name, c: -x.netCents })).sort((a, b) => b.c - a.c);
        const take = list.filter(x => x.netCents > 0).map(x => ({ name: x.name, c: x.netCents })).sort((a, b) => b.c - a.c);
        const out = [];
        let i = 0, j = 0;
        while (i < give.length && j < take.length) {
            const c = Math.min(give[i].c, take[j].c);
            if (c > 0) out.push({ from: give[i].name, to: take[j].name, cents: c });
            give[i].c -= c; take[j].c -= c;
            if (give[i].c === 0) i++;
            if (take[j].c === 0) j++;
        }
        return out;
    };

    /* --------- Crash (style Aviator) --------- */
    // 1,5 % de crash instantané (x1.00), sinon crash = floor(100 × RTP/(1-r))/100 avec r ∈ [0,1)
    const CRASH_INSTANT_CHANCE = 0.015;

    /* --------- Icefield --------- */
    const ICE_STEPS = 8;
    // Multiplicateur au pas `step` avec `cols` colonnes : RTP / ((cols-1)/cols)^step
    const iceMultiplier = (cols, step) => parseFloat((RTP / Math.pow((cols - 1) / cols, step)).toFixed(2));

    /* --------- Just mixed (3 gobelets) --------- */
    // 2 chances sur 3 de gagner, payé RTP / (2/3) → espérance exacte = RTP
    const JM_MULT = Math.round(RTP / (2 / 3) * 1000) / 1000; // x1.478

    /* --------- Chicken Road --------- */
    // p = risque par voie ; multiplicateur du pas k = RTP / (1-p)^k
    const CR_MODES = {
        easy:   { name: 'Facile',    steps: 24, p: 0.12 },
        medium: { name: 'Moyen',     steps: 22, p: 0.20 },
        hard:   { name: 'Difficile', steps: 20, p: 0.33 }
    };
    const crMultiplier = (mode, k) => Math.floor(RTP / Math.pow(1 - CR_MODES[mode].p, k) * 100) / 100;

    /* --------- Arrows X --------- */
    // Table = [multiplicateur, poids]. "hit" est résolu algébriquement pour que
    // l'espérance soit exactement RTP : hit = RTP × Σpoids / Σ(multiplicateur × poids).
    const AR_MODES = {
        easy:   { name: 'Facile',    max: 20,  rows: [[0.5,2],[0.6,5],[0.7,7],[0.8,7],[0.9,7],[1,11],[1.25,6],[1.5,5],[2,4],[3,3],[4,2],[5,1.5],[8,1],[10,0.6],[20,0.3]] },
        medium: { name: 'Moyen',     max: 100, rows: [[0.5,5],[0.6,7],[0.7,8],[0.8,12],[0.9,10],[1,10],[1.5,10],[2,8],[3,6],[4,4],[5,3],[8,2.5],[10,1.7],[25,1],[50,0.5],[100,0.3]] },
        hard:   { name: 'Difficile', max: 500, rows: [[0.5,10],[0.6,10],[0.7,10],[0.8,12],[0.9,10],[1,8],[1.5,7],[2,6],[3,5],[4,4],[5,3],[8,2.5],[10,2],[25,1.5],[100,1],[500,0.5]] }
    };
    // Probabilité de toucher la cible (le reste = raté x0).
    const arHit = mode => {
        const c = AR_MODES[mode];
        const tot = c.rows.reduce((a, r) => a + r[1], 0);
        const wsum = c.rows.reduce((a, [m, w]) => a + m * w, 0);
        return RTP * tot / wsum;
    };
    // Table normalisée [{ m, p, from, to }] — cache recréable à volonté (pas de mutation cachée).
    const _arrowCache = {};
    const arrowTable = mode => {
        if (!AR_MODES[mode]) return null;
        if (!_arrowCache[mode]) {
            const hit = arHit(mode), tot = AR_MODES[mode].rows.reduce((a, r) => a + r[1], 0);
            let acc = 0;
            _arrowCache[mode] = AR_MODES[mode].rows.map(([m, w]) => {
                const p = w / tot * hit, from = acc; acc += p;
                return { m, p, from, to: acc };
            });
        }
        return _arrowCache[mode];
    };

    /* --------- Roulette européenne (0-36, un seul zéro) --------- */
    // Payouts classiques : avantage maison naturel de 2,70 % dû au zéro, aucun facteur artificiel.
    const RL_RED_ARR = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const RL_RED = new Set(RL_RED_ARR);
    const RL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]; // ordre réel de la roue
    const rlColor = n => n === 0 ? 'green' : RL_RED.has(n) ? 'red' : 'black';
    const RL_BETS = { red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2, dozen: 3, column: 3, straight: 36 };
    // Le numéro sort-il gagnant pour ce type de pari ? (sel = numéro visé, ou groupe 1-12 / 1-3 selon le type)
    const rlWin = (kind, num, sel) => {
        switch (kind) {
            case 'straight': return num === sel;
            case 'red':   return rlColor(num) === 'red';
            case 'black': return rlColor(num) === 'black';
            case 'odd':   return num !== 0 && num % 2 === 1;
            case 'even':  return num !== 0 && num % 2 === 0;
            case 'low':   return num >= 1 && num <= 18;
            case 'high':  return num >= 19 && num <= 36;
            case 'dozen': return num !== 0 && Math.floor((num - 1) / 12) + 1 === sel;
            case 'column': return num !== 0 && ((num - 1) % 3) + 1 === sel;
            default: return false;
        }
    };

    /* --------- Petit picto utilisé dans le flux "Historique des paris" --------- */
    const GAME_ICONS = { crash: '✈️', ice: '🧊', jm: '🥤', cr: '🐔', ar: '🎯', rl: '🎡', bj: '🃏', mn: '💣', pk: '🔴' };

    return {
        RTP, START_BALANCE, MAX_BET, TOKENS_PER_EUR, STAKE_MIN_EUR, STAKE_MAX_EUR, PERF_FLOOR, settlePot, settleTransfers, CRASH_INSTANT_CHANCE,
        ICE_STEPS, iceMultiplier,
        JM_MULT,
        CR_MODES, crMultiplier,
        AR_MODES, arHit, arrowTable,
        RL_RED, RL_RED_ARR, RL_ORDER, rlColor, RL_BETS, rlWin,
        GAME_ICONS
    };
});
