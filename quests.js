/* ============================================================
   quests.js — moteur de quêtes (renouvelables + permanentes) et XP.
   Aucune dépendance : toutes les fonctions travaillent sur la fiche d'un joueur « u »
   (u.xp, u.q = quêtes en cours, u.lc = compteurs à vie, u.qc = quêtes permanentes récupérées).
   Renouvellement :  ⚡ éclair 5 min · ⏱️ horaire 1 h · 📅 jour (minuit, heure de Paris) · 🗓️ semaine (lundi)
   ============================================================ */
'use strict';

const GN = { crash: 'Crash', ice: 'Icefield', jm: 'Just mixed', cr: 'Chicken Road', ar: 'Arrows X', rl: 'Roulette', bj: 'Blackjack', mn: 'Mines', pk: 'Plinko', dc: 'Dés', hl: 'Hi-Lo', cf: 'Pile ou Face', sl: 'Machine à sous' };
const OFF = new Set([]); // jeux pas encore disponibles : leurs quêtes ne sont pas proposées
const GAMES = Object.keys(GN).filter(g => !OFF.has(g));
const nf = n => n.toLocaleString('fr-FR');

/* ---- Modèles de quêtes : [spec, cible, xp] — le texte est fabriqué à partir de la spec ---- */
// spec : b = rounds joués · w = victoires · mN = gain à x N ou plus · wg = jetons misés · gn = jetons gagnés
//        msg = messages · sess = sessions finies · su = sessions en positif · ch = 1er d'une room à plusieurs
//        dist = jeux différents essayés · b:jeu / w:jeu = rounds / victoires sur un jeu
function text(spec, t) {
    const [m, g] = spec.split(':');
    const gm = g ? (GN[g] || g) : '';
    if (m === 'b') return g ? `Joue ${t} round${t > 1 ? 's' : ''} de ${gm}` : `Joue ${t} round${t > 1 ? 's' : ''}`;
    if (m === 'w') return g ? `Gagne ${t} fois à ${gm}` : `Gagne ${t} fois`;
    if (/^m\d+$/.test(m)) return `Fais ${t > 1 ? t + ' gains' : 'un gain'} à x${m.slice(1)} ou plus`;
    if (m === 'wg') return `Mise ${nf(t)} jetons au total`;
    if (m === 'gn') return `Gagne ${nf(t)} jetons au total`;
    if (m === 'msg') return t > 1 ? `Envoie ${t} messages dans le chat` : 'Envoie un message dans le chat';
    if (m === 'sess') return `Termine ${t} session${t > 1 ? 's' : ''}`;
    if (m === 'su') return `Termine ${t} session${t > 1 ? 's' : ''} en positif`;
    if (m === 'ch') return t > 1 ? `Finis 1er de ${t} rooms à plusieurs` : 'Finis 1er d’une room à plusieurs';
    if (m === 'dist') return `Essaie ${t} jeux différents`;
    return spec;
}
const ICON = spec => { const m = spec.split(':')[0]; return { b: '🎮', w: '🏆', wg: '🪙', gn: '💰', msg: '💬', sess: '🏁', su: '📈', ch: '👑', dist: '🧭' }[m] || (/^m\d+$/.test(m) ? '🔥' : '⭐'); };

const POOLS = {
    flash: { label: '⚡ Éclair', every: '5 min', count: 3, tpl: [
        ['b', 3, 15], ['b', 5, 25], ['w', 2, 20], ['w', 3, 30], ['m2', 1, 25], ['wg', 400, 15], ['dist', 2, 25], ['msg', 1, 10],
        ...['crash', 'pk', 'rl', 'bj', 'mn', 'dc', 'cf', 'hl', 'sl'].map(g => ['b:' + g, 2, 20])] },
    hour: { label: '⏱️ Horaire', every: '1 h', count: 3, tpl: [
        ['b', 15, 50], ['w', 8, 60], ['m3', 2, 70], ['m5', 1, 80], ['wg', 3000, 60], ['gn', 2000, 70], ['dist', 4, 80], ['msg', 5, 40],
        ...['crash', 'pk', 'rl', 'bj', 'mn', 'dc', 'cf', 'hl', 'sl', 'ice', 'cr', 'ar', 'jm'].map(g => ['b:' + g, 8, 55])] },
    day: { label: '📅 Du jour', every: 'minuit', count: 4, tpl: [
        ['b', 60, 150], ['w', 30, 170], ['m5', 3, 200], ['m10', 1, 220], ['wg', 20000, 160], ['gn', 15000, 180], ['dist', 6, 200], ['sess', 2, 150], ['su', 1, 180], ['msg', 20, 120], ['ch', 1, 250],
        ...GAMES.map(g => ['b:' + g, 25, 170]), ...['crash', 'pk', 'rl', 'sl'].map(g => ['w:' + g, 12, 190])] },
    week: { label: '🗓️ Semaine', every: 'lundi', count: 3, tpl: [
        ['b', 400, 600], ['w', 200, 650], ['m10', 5, 700], ['m50', 1, 800], ['wg', 200000, 600], ['gn', 100000, 700], ['sess', 8, 600], ['su', 4, 700], ['ch', 2, 800], ['dist', 10, 650],
        ...GAMES.map(g => ['b:' + g, 100, 600])] }
};
// index des modèles par id « période:n »
Object.values(POOLS).forEach(P => { P.tpl = P.tpl.filter(t => !OFF.has((t[0].split(':')[1] || ''))); });
const TPL = {}; Object.entries(POOLS).forEach(([per, P]) => P.tpl.forEach((t, i) => { TPL[per + ':' + i] = { spec: t[0], t: t[1], xp: t[2] }; }));

/* ---- Quêtes permanentes (paliers) ---- */
const LIFE = [];
const fam = (spec, tiers, xps) => tiers.forEach((t, i) => LIFE.push({ id: 'L:' + spec + ':' + t, spec, t, xp: xps[i] }));
fam('b', [25, 100, 500, 2000, 10000, 50000], [60, 150, 400, 1000, 2500, 6000]);
fam('w', [10, 50, 250, 1000, 5000], [60, 150, 400, 1000, 2500]);
fam('sess', [1, 5, 25, 100, 300], [50, 150, 500, 1500, 3500]);
fam('su', [1, 5, 25, 75], [80, 250, 800, 2000]);
fam('ch', [1, 5, 20, 50], [100, 300, 900, 2500]);
fam('m5', [1, 10, 50, 200], [60, 200, 600, 1800]);
fam('m10', [1, 5, 25, 100], [100, 300, 900, 2500]);
fam('m50', [1, 5, 20], [250, 800, 2400]);
fam('m100', [1, 3, 10], [500, 1500, 4000]);
fam('m1000', [1], [5000]);
fam('wg', [10000, 100000, 1000000, 10000000], [80, 300, 1200, 4000]);
fam('gn', [5000, 50000, 500000, 5000000], [80, 300, 1200, 4000]);
fam('msg', [10, 50, 250, 1000], [50, 150, 500, 1500]);
GAMES.forEach(g => fam('b:' + g, [20, 100, 500], [60, 200, 700]));
const LIFE_BY_ID = {}; LIFE.forEach(q => { LIFE_BY_ID[q.id] = q; });

/* ---- Fenêtres de temps (heure de Paris) ---- */
const TZ = 'Europe/Paris';
const parisDate = now => new Date(now).toLocaleDateString('sv-SE', { timeZone: TZ }); // AAAA-MM-JJ
const parisSecs = now => { const [h, m, s] = new Date(now).toLocaleTimeString('fr-FR', { timeZone: TZ, hour12: false }).split(':').map(Number); return (h % 24) * 3600 + m * 60 + s; };
const parisDow = now => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Date(now).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })); // 0 = dimanche
function windowOf(per, now) { // { key, left (ms avant le renouvellement) }
    if (per === 'flash') return { key: String(Math.floor(now / 300000)), left: 300000 - (now % 300000) };
    if (per === 'hour') return { key: String(Math.floor(now / 3600000)), left: 3600000 - (now % 3600000) };
    const dayLeft = (86400 - parisSecs(now)) * 1000;
    if (per === 'day') return { key: parisDate(now), left: dayLeft };
    const back = (parisDow(now) + 6) % 7; // jours écoulés depuis lundi
    return { key: parisDate(now - back * 86400000), left: dayLeft + (6 - back) * 86400000 };
}

const pick = (arr, n) => { const a = arr.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; };
function generate(per) { // choisit des modèles de familles différentes (pas deux « rounds » identiques…)
    const P = POOLS[per], idx = P.tpl.map((_, i) => i), chosen = [], seen = new Set();
    pick(idx, idx.length).forEach(i => { const sp = P.tpl[i][0].split(':')[0] + (P.tpl[i][0].includes(':') ? ':' + P.tpl[i][0].split(':')[1] : ''); if (chosen.length < P.count && !seen.has(sp)) { chosen.push(i); seen.add(sp); } });
    return chosen.map(i => ({ i: per + ':' + i, p: 0, c: 0 }));
}

function ensure(u, now = Date.now()) {
    const q = u.q = u.q || {}; u.lc = u.lc || {}; u.qc = u.qc || [];
    Object.keys(POOLS).forEach(per => { const w = windowOf(per, now); if (!q[per] || q[per].k !== w.key) q[per] = { k: w.key, it: generate(per) }; });
    return q;
}

/* ---- Évènements du jeu → progression ---- */
// ev : { t:'round', g, bet, net, mult, status:'won'|'lost' } · { t:'msg' } · { t:'sess', pct, champ }
const incFor = (spec, ev) => {
    const [m, g] = spec.split(':');
    if (ev.t === 'round') {
        const won = ev.status === 'won';
        if (m === 'b') return !g || g === ev.g ? 1 : 0;
        if (m === 'w') return won && (!g || g === ev.g) ? 1 : 0;
        if (/^m\d+$/.test(m)) return won && ev.mult >= +m.slice(1) ? 1 : 0;
        if (m === 'wg') return Math.max(0, ev.bet | 0);
        if (m === 'gn') return Math.max(0, ev.net | 0);
        if (m === 'dist') return 0; // géré à part
    } else if (ev.t === 'msg') return m === 'msg' ? 1 : 0;
    else if (ev.t === 'sess') { if (m === 'sess') return 1; if (m === 'su') return ev.pct > 0 ? 1 : 0; if (m === 'ch') return ev.champ ? 1 : 0; }
    return 0;
};
const LIFE_SPECS = [...new Set(LIFE.map(q => q.spec))];
// renvoie la liste des quêtes qui viennent d'être terminées : [{ text, xp, life }]
function event(u, ev, now = Date.now()) {
    const q = ensure(u, now), done = [];
    // compteurs à vie
    const before = {}; LIFE_SPECS.forEach(s => { before[s] = u.lc[s] || 0; });
    LIFE_SPECS.forEach(s => { const n = incFor(s, ev); if (n) u.lc[s] = (u.lc[s] || 0) + Math.min(n, 1e12); });
    LIFE.forEach(l => { const a = before[l.spec], b = u.lc[l.spec] || 0; if (a < l.t && b >= l.t && !u.qc.includes(l.id)) done.push({ text: text(l.spec, l.t), xp: l.xp, life: true }); });
    // quêtes renouvelables
    Object.keys(POOLS).forEach(per => q[per].it.forEach(it => {
        const T = TPL[it.i]; if (!T || it.p >= T.t) return;
        let n;
        if (T.spec === 'dist') { if (ev.t === 'round' && ev.g) { it.s = it.s || []; if (!it.s.includes(ev.g)) { it.s.push(ev.g); n = 1; } } }
        else n = incFor(T.spec, ev);
        if (!n) return;
        it.p = Math.min(T.t, it.p + n);
        if (it.p >= T.t) done.push({ text: text(T.spec, T.t), xp: T.xp, life: false });
    }));
    return done;
}

/* ---- Affichage ---- */
function view(u, now = Date.now()) {
    const q = ensure(u, now);
    const pools = Object.keys(POOLS).map(per => ({
        per, label: POOLS[per].label, left: windowOf(per, now).left,
        items: q[per].it.map((it, n) => { const T = TPL[it.i]; return { id: per + '#' + n, ic: ICON(T.spec), text: text(T.spec, T.t), p: it.p, t: T.t, xp: T.xp, c: it.c }; })
    }));
    // permanentes : on garde l'ordre des familles, avec la progression
    const life = LIFE.map(l => ({ id: l.id, ic: ICON(l.spec), text: text(l.spec, l.t), p: Math.min(l.t, u.lc[l.spec] || 0), t: l.t, xp: l.xp, c: u.qc.includes(l.id) ? 1 : 0, f: l.spec }));
    return { pools, life };
}

/* ---- Récupérer la récompense : renvoie l'XP gagnée (0 si impossible) ---- */
function claim(u, id, now = Date.now()) {
    const q = ensure(u, now);
    if (id.startsWith('L:')) {
        const l = LIFE_BY_ID[id]; if (!l || u.qc.includes(id) || (u.lc[l.spec] || 0) < l.t) return 0;
        u.qc.push(id); u.xp = (u.xp || 0) + l.xp; return l.xp;
    }
    const [per, n] = id.split('#'); const P = q[per]; const it = P && P.it[+n]; if (!it) return 0;
    const T = TPL[it.i]; if (!T || it.c || it.p < T.t) return 0;
    it.c = 1; u.xp = (u.xp || 0) + T.xp; return T.xp;
}
function claimAll(u, now = Date.now()) {
    const v = view(u, now); let total = 0, n = 0;
    v.pools.forEach(p => p.items.forEach(i => { if (!i.c && i.p >= i.t) { const g = claim(u, i.id, now); if (g) { total += g; n++; } } }));
    v.life.forEach(i => { if (!i.c && i.p >= i.t) { const g = claim(u, i.id, now); if (g) { total += g; n++; } } });
    return { xp: total, n };
}
const grantXp = (u, n) => { u.xp = Math.max(0, (u.xp || 0) + Math.floor(n)); return u.xp; };
module.exports = { ensure, event, view, claim, claimAll, grantXp, GN };
