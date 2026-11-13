const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const crypto = require('crypto');
const A = require('./accounts');
const Q = require('./quests');
const SLOT = require('./slot');
const XPL = require('./xp');
// Constantes et formules de probabilité PARTAGÉES avec le client (une seule source de vérité).
// Servi au navigateur via GET /shared-constants.js (voir plus bas) : le client l'expose en window.GAMES.
const G = require('./shared-constants');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { perMessageDeflate: false });

// index.html doit être dans le dossier "public/"
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// Petite page ultra légère pour qu'un service de surveillance (UptimeRobot…) "réveille" le serveur toutes les 5 min et l'empêche de s'endormir sur Render gratuit
// Photo de profil (petite image JPEG ; ?v=… sert juste à rafraîchir le cache du navigateur)
app.get('/avatar/:name', async (req, res) => {
    try { const b = await A.avatarGet(req.params.name); if (!b) return res.status(404).end(); res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }).send(b); }
    catch (e) { res.status(404).end(); }
});
app.get('/health', (req, res) => res.type('text/plain').send('ok'));
// Le client charge les mêmes constantes que le serveur (window.GAMES) : zéro duplication.
app.get('/shared-constants.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'shared-constants.js')));

const rooms = {};
const ROOM_TTL_AFTER_END = 10 * 60 * 1000; // la room est supprimée 10 min après la fin
const ALLOWED_DURATIONS = [1, 3, 5, 10, 15];

// Jeu -> petit picto utilisé dans le flux "Historique des paris" (panneau latéral droit)
const GAME_ICONS = G.GAME_ICONS;

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/*  Mode troll (réservé à l'admin, invisible pour les autres joueurs)   */
/*  Chaque joueur a un "winPct" (100 = normal) : il multiplie le BÉNÉFICE */
/*  d'une victoire (la mise est toujours rendue). Jamais envoyé aux clients. */
/* ------------------------------------------------------------------ */
const ADMIN_HASH = process.env.ADMIN_CODE ? crypto.createHash('sha256').update(process.env.ADMIN_CODE).digest('hex') : 'e84a0cf426667af3350cf1eb77d712369e394f6b5b5f454fe32b221e5c5bab92';
const ADMIN_USER = (process.env.ADMIN_USER || '').trim().toLowerCase(); // optionnel : ne laisse déverrouiller que ce pseudo
// Multiplicateur AFFICHÉ (historique, messages) : cohérent avec le gain réellement versé quand le mode troll est actif
const round2 = x => Math.round(x * 100) / 100;
function shown(player, bet, winnings, mult) { const pct = player && typeof player.winPct === 'number' ? player.winPct : 100; return pct === 100 || !(bet > 0) ? mult : round2(winnings / bet); }
function dm(player, mult) { const pct = player && typeof player.winPct === 'number' ? player.winPct : 100; return pct === 100 || !(mult > 1) ? mult : round2(1 + (mult - 1) * pct / 100); } // multiplicateur "en direct"
function tilt(player, bet, winnings) {
    const pct = player && typeof player.winPct === 'number' ? player.winPct : 100;
    if (pct === 100 || !(winnings > bet)) return winnings;
    return bet + Math.max(0, Math.round((winnings - bet) * pct / 100));
}

/* ---------------- Plinko : chaque bille est réglée toute seule, quand elle touche sa case ---------------- */
const PK_STEP = 190, PK_STAGGER = 220, PK_MAX_BALLS = 20, PK_MAX_INFLIGHT = 400; // ms par rangée, délai entre deux billes, billes max par lancer / en l'air
function pkLand(room, player, ball) {
    if (ball.done) return; ball.done = true; if (ball.timer) { clearTimeout(ball.timer); ball.timer = null; }
    const q = player.pkQ || [], i = q.indexOf(ball); if (i >= 0) q.splice(i, 1);
    player.balance += ball.win; player.stats.gamesPlayed++; if (ball.win > ball.unit) player.stats.wins++;
    player.stats.totalProfit += ball.win - ball.unit;
    if (ball.feedId) feedUpdate(room, ball.feedId, { status: ball.win >= ball.unit ? 'won' : 'lost', mult: ball.mult, win: ball.win, net: ball.win - ball.unit });
    if (--ball.batch.left === 0) io.to(player.id).emit('pk-result', { seed: ball.batch.seed, rows: ball.batch.rows, risk: ball.batch.risk, slots: ball.batch.slots });
    broadcast(room);
}
function pkSettle(room, player) { (player.pkQ || []).slice().forEach(b => pkLand(room, player, b)); } // départ / fin de session : tout est réglé tout de suite

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans O/0/I/1 pour éviter les confusions
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
    } while (rooms[code]);
    return code;
}

function cleanName(name) {
    return String(name || '').trim().slice(0, 20);
}

// Mise d'entrée en euros (centimes autorisés) ; renvoie null si invalide.
function parseStake(v) {
    const n = Math.round(Number(v) * 100) / 100;
    return Number.isFinite(n) && n >= G.STAKE_MIN_EUR && n <= G.STAKE_MAX_EUR ? n : null;
}
const STAKE_ERR = `Mise invalide : minimum ${String(G.STAKE_MIN_EUR).replace('.', ',')} €.`;

/*
 * Provably fair :
 *  - on publie AVANT la manche : publicHash = SHA256(secretSeed)  (l'engagement)
 *  - le point de crash est calculé à partir de HMAC-SHA256(secretSeed, 'crash')
 *    => impossible à deviner avec le hash public seul
 *  - APRÈS la manche on révèle secretSeed : chacun peut vérifier les deux.
 * (Dans ta version, le crash était calculé depuis le hash public : n'importe qui
 *  pouvait donc prédire le crash avant la manche.)
 */
function generateProvablyFairRound() {
    const secretSeed = crypto.randomBytes(16).toString('hex');
    const publicHash = crypto.createHash('sha256').update(secretSeed).digest('hex');
    const resultHash = crypto.createHmac('sha256', secretSeed).update('crash').digest('hex');

    const seedInt = parseInt(resultHash.slice(0, 13), 16); // 52 bits
    const critical = seedInt / 4503599627370496;           // 2^52 -> [0, 1)

    let crashPoint = 1.00;
    if (critical >= G.CRASH_INSTANT_CHANCE) {
        const adjustedCritical = Math.min(critical, 0.9999999);
        crashPoint = Math.floor((G.RTP / (1 - adjustedCritical)) * 100) / 100;
        crashPoint = Math.max(1.01, crashPoint);
    }

    return { secretSeed, publicHash, crashPoint };
}

/* Constantes et formules des jeux : définies dans shared-constants.js (source unique,
   identique côté client). On les re-exporte ici sous leurs noms locaux pour ne rien casser. */
const ICE_STEPS = G.ICE_STEPS;                                  // Just mixed : 2 chances sur 3 de gagner, gain = RTP / probabilité = x1.478
const JM_MULT = G.JM_MULT;
// Icefield : multiplicateur = RTP / ((cols-1)/cols)^pas → espérance = RTP à chaque palier encaissable
const calculateIcefieldMultiplier = G.iceMultiplier;
// Chicken Road : p = probabilité de mourir à chaque pas ; multiplicateur du pas k = RTP / (1 - p)^k
// => l'espérance de gain est de 98,5 % quel que soit le pas où le joueur encaisse (multiplicateurs "équivalents" au risque)
const CR_MODES = G.CR_MODES;
const crMultiplier = G.crMultiplier;
// Arrows X : tables et résolution algébrique du "hit" (espérance exacte = RTP), voir shared-constants.js
const AR_MODES = G.AR_MODES;
const PK = require('./public/plinko-tables.js'); // tables Plinko (partagées avec le navigateur)
const arrowTable = G.arrowTable;
// Roulette européenne : tapis classique 0-36 (roue et probabilités réelles), payout plein x36 (avantage du 0 = house edge 2,70 %)
const RL_RED = G.RL_RED;
const RL_ORDER = G.RL_ORDER;
const rlColor = G.rlColor;
const RL_BETS = G.RL_BETS;
const rlWin = G.rlWin;
// Arrondi aléatoire pondéré : E[résultat] = valeur exacte -> n'importe quel arrondi préserve le RTP
const weightedRound = raw => { const fl = Math.floor(raw); return fl + (crypto.randomInt(1000000) / 1000000 < raw - fl ? 1 : 0); };

// Blackjack : règles dans blackjack.js (As = 1 ou 11, croupier reste sur tous les 17, BJ 3:2, assurance, split, double).
const BJ = require('./blackjack');
const BJ_DECK = (() => { const d = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d.push({ r, s }); return d; })();
// ce qu'il reste à rembourser si la main est interrompue (déconnexion, fin de session)
const bjPending = bj => (bj && bj.round && bj.round.phase !== 'done' ? bj.round.bet : 0);

const newSlot = () => ({ bet: 0, next: 0, auto: 0, nextAuto: 0, cashed: false, win: 0 });

function newPlayer(socket, name, isAdmin, stake) {
    const tokens = Math.round(stake * G.TOKENS_PER_EUR); // 5 € = 500 jetons
    return {
        id: socket.id,
        account: A.key(name), // le compte survit à un rafraîchissement : on retrouve le joueur par ce champ, plus par l'id de socket
        name: cleanName(name),
        stake, // mise d'entrée en € : visible par les autres joueurs, sert au calcul de la redistribution
        balance: tokens,
        initialBalance: tokens,
        isAdmin,
        inGame: false,
        connected: true,
        slots: [newSlot(), newSlot()],
        stats: { gamesPlayed: 0, wins: 0, totalProfit: 0 }
    };
}

/*
 * IMPORTANT : on n'envoie JAMAIS l'objet "room" brut aux clients.
 *  1) il contient des timers (setInterval) => structure circulaire => Socket.IO plante
 *     (c'est LA cause du "rien ne marche" quand la partie démarre)
 *  2) il contient crashPoint et currentSecret => les joueurs pourraient tricher
 */
function publicRoom(room, full = false) {
    return {
        code: room.code,
        status: room.status,
        selectedGame: room.selectedGame,
        timeRemaining: room.timeRemaining,
        live: sessionLive(room), // la session (chrono) a démarré : le vote « arrêter » a un sens
        stopVotes: room.stopVotes ? [...room.stopVotes] : [], // noms des joueurs qui votent « arrêter »
        multiplier: room.multiplier,
        currentHash: room.currentHash,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            stake: p.stake,
            initialBalance: p.initialBalance,
            balance: p.balance,
            isAdmin: p.isAdmin,
            inGame: p.inGame,
            connected: p.connected,
            slots: p.slots,
            iceState: p.iceState ? {
                cols: p.iceState.cols, bet: p.iceState.bet, active: p.iceState.active,
                currentStep: p.iceState.currentStep, path: p.iceState.path, lost: !!p.iceState.lost,
                revealedTraps: p.iceState.revealedTraps, multipliers: p.iceState.multipliers
            } : null,
            jm: p.jm ? { active: p.jm.active, bet: p.jm.bet } : null,
            cr: p.cr ? { active: p.cr.active, bet: p.cr.bet, mode: p.cr.mode, step: p.cr.step } : null,
            ar: p.ar ? { active: p.ar.active, bet: p.ar.bet, mode: p.ar.mode } : null,
            pk: { active: !!(p.pkQ && p.pkQ.length), bet: (p.pkQ || []).reduce((a, b) => a + b.unit, 0) },
            hl: p.hl ? { active: p.hl.active, bet: p.hl.bet, steps: p.hl.steps } : null,
            sl: p.sl ? { active: p.sl.active, pending: p.sl.pending } : null,
            mn: p.mn ? { active: p.mn.active, bet: p.mn.bet, mines: p.mn.mines, picks: p.mn.picks.slice() } : null,
            rl: p.rl ? { active: p.rl.active, total: p.rl.total, bets: p.rl.bets.map(b => ({ kind: b.kind, sel: b.sel, amount: b.amount })) } : null,
            bj: p.bj ? bjPublic(p.bj, p.balance) : null,
            vip: !!ADMIN_USER && String(p.name).toLowerCase() === ADMIN_USER, // couronne publique du créateur (le panneau, lui, reste privé)
            cos: A.cosOf(p.account),
            stats: p.stats
        })),
        history: full ? room.history : undefined // l'historique n'est envoyé qu'aux joueurs de la table Crash
    };
}

/* Fortune totale d'un joueur (solde + mises en jeu) et courbe dans le temps : alimente le panneau « Graphiques » */
function equityOf(p) {
    return p.balance + p.slots.reduce((a, x) => a + (x.cashed ? 0 : x.bet) + x.next, 0)
        + (p.iceState && p.iceState.active ? p.iceState.bet : 0) + (p.jm && p.jm.active ? p.jm.bet : 0) + (p.cr && p.cr.active ? p.cr.bet : 0)
        + (p.ar && p.ar.active ? p.ar.bet : 0) + (p.mn && p.mn.active ? p.mn.bet : 0) + (p.hl && p.hl.active ? p.hl.bet : 0) + (p.pkQ || []).reduce((a, b) => a + b.unit, 0)
        + (p.rl ? p.rl.total : 0) + bjPending(p.bj) + (p.sl && p.sl.active ? p.sl.pending : 0);
}
const pubBets = p => (p.betLog || []).slice(0, 60).map(b => ({ id: b.id, game: b.game, icon: b.icon, name: b.name, bet: b.bet, mult: b.mult, win: b.win, net: b.net, status: b.status, ts: b.ts, queued: !!b.queued }));
function sampleEquity(room) {
    const now = Date.now();
    room.players.forEach(p => {
        const h = p.eqHist = p.eqHist || [], e = equityOf(p), last = h[h.length - 1];
        if (last && last[1] === e && now - last[0] < 15000) return;
        if (last && now - last[0] < 700) { last[1] = e; return; } // trop rapproché : on met à jour le dernier point
        h.push([now, e]);
        if (h.length > 500) { const keep = [h[0]]; for (let i = 1; i < h.length - 1; i += 2) keep.push(h[i]); keep.push(h[h.length - 1]); p.eqHist = keep; }
    });
}

// Les changements sont regroupés : au plus un "update-room" toutes les 60 ms par room (petit serveur = moins de CPU et de bande passante)
function broadcast(room) {
    if (room._bt) return;
    room._bt = setTimeout(() => {
        room._bt = null;
        sampleEquity(room);
        io.to(room.code).emit('update-room', publicRoom(room));
        checkAutoStop(room);
    }, 60);
}

/* ------------------------------------------------------------------ */
/*  Historique des paris en direct (panneau latéral droit du client)   */
/*  Chaque entry : { id, game, icon, name, bet, mult, win, net, status } */
/*   - status 'pending' : mise en cours (encore jouable)               */
/*   - status 'won'/'lost' : tour réglé                                */
/*  On émet le flux complet (30 dernières lignes) à chaque changement : */
/*  c'est peu de données et ça reste toujours cohérent côté client.     */
/* ------------------------------------------------------------------ */
function noteMult(room, it) { // meilleur multiplicateur gagné (badges)
    if (it.status !== 'won' || !(it.mult > 0)) return;
    const pl = room.players.find(p => p.name === it.name);
    if (pl) pl.bestMult = Math.max(pl.bestMult || 0, Math.min(1e9, it.mult));
}
/* Quêtes + XP : tout tour réglé passe par le flux « Paris en direct » → un seul point d'entrée pour toutes les quêtes */
const qTimers = new Map();
function qState(u) { const xp = XPL.levelInfo(u.xp || 0); return Object.assign(Q.view(u), { xp }); }
function qPush(account, socketId) { // renvoie l'état des quêtes au joueur (au plus toutes les 3 s)
    if (qTimers.has(account)) return;
    qTimers.set(account, setTimeout(() => {
        qTimers.delete(account);
        const u = A.userRec(account); if (u) io.to(socketId).emit('q-state', qState(u));
    }, 3000));
}
function qEvent(pl, ev) {
    const u = pl && pl.account && A.userRec(pl.account); if (!u) return;
    const done = Q.event(u, ev);
    if (done.length) io.to(pl.id).emit('q-done', done);
    A.saveSoon(); qPush(pl.account, pl.id);
}
function questRound(room, it) {
    if (it._qd || (it.status !== 'won' && it.status !== 'lost')) return;
    it._qd = true;
    const pl = room.players.find(p => p.name === it.name);
    qEvent(pl, { t: 'round', g: it.game, bet: it.bet || 0, net: it.net != null ? it.net : (it.win || 0) - (it.bet || 0), mult: it.mult || 0, status: it.status });
}
function feedAdd(room, entry) {
    if (!room.feed) room.feed = [];
    room.feed.unshift(entry);
    if (room.feed.length > 80) room.feed.length = 80;
    const pl = room.players.find(p => p.name === entry.name); // journal personnel (même objet : il suit les mises à jour de la ligne)
    if (pl) { (pl.betLog = pl.betLog || []).unshift(entry); if (pl.betLog.length > 150) pl.betLog.length = 150; (pl.gamesSeen = pl.gamesSeen || new Set()).add(entry.game); noteMult(room, entry); questRound(room, entry); }
    io.to(room.code).emit('bet-feed', room.feed.slice(0, 60));
}
function feedUpdate(room, id, patch) { // met à jour une ligne existante (ex. poulet qui avance, crash en vol)
    if (!room.feed) return;
    const it = room.feed.find(x => x.id === id);
    if (!it) return;
    Object.assign(it, patch);
    noteMult(room, it); questRound(room, it);
    io.to(room.code).emit('bet-feed', room.feed.slice(0, 60));
}
const feedId = () => crypto.randomBytes(6).toString('hex');
const crashRoom = room => room.code + ':crash';

// horodatage : le panneau latéral client affiche « il y a Xs » et fait expirer les lignes silencieuses
function stamp(e) { e.ts = Date.now(); return e; }
// anti-doublon : tant qu'une ligne 'pending' existe pour (joueur, jeu), on ne recrée pas de nouvelle entrée
function hasPending(room, name, game) { return !!(room.feed && room.feed.some(x => x.status === 'pending' && x.name === name && x.game === game)); }

function clearRoomTimers(room) {
    Object.keys(room.timers).forEach(k => {
        clearInterval(room.timers[k]);
        clearTimeout(room.timers[k]);
        room.timers[k] = null;
    });
}

function destroyRoom(code) {
    const room = rooms[code];
    if (!room) return;
    clearRoomTimers(room);
    clearTimeout(room._bt);
    delete rooms[code];
}

function findPlayer(socket, roomCode) {
    const room = rooms[String(roomCode || '').toUpperCase().replace(/^CRASH-/, '')];
    if (!room) return {};
    const player = room.players.find(p => p.id === socket.id);
    return { room, player };
}

/* ------------------------------------------------------------------ */
/*  Helpers partagés par les jeux de la room                           */
/* ------------------------------------------------------------------ */

// Table Arrows X normalisée : le cache vit désormais dans shared-constants.js (partagé client/serveur).
const buildArrowTable = G.arrowTable;

// État public d'une main de Blackjack : la pile reste secrète, la carte cachée n'est révélée qu'au bon moment.
// Défini au niveau module (et non dans le handler de connexion) car publicRoom() s'en sert aussi.
function bjPublic(bj, balance = 0) {
    if (!bj || !bj.round) return null;
    return BJ.publicView(bj.round, balance);
}

/* ------------------------------------------------------------------ */
/*  Comptes : reprise de room après rafraîchissement / coupure         */
/* ------------------------------------------------------------------ */
const LEAVE_GRACE = 90 * 1000; // délai avant qu'un joueur déconnecté soit réellement retiré

/* ---------------- Machine à sous « La Nuit du Loup » : fin de tour (encaissement), partagée par tous les cas ---------------- */
const slHash = s => crypto.createHash('sha256').update(s).digest('hex');
const slU = (seed, label) => parseInt(crypto.createHmac('sha256', seed).update(label).digest('hex').slice(0, 13), 16) / 4503599627370496;
function slSeedOf(player) { if (!player.slp) { const seed = crypto.randomBytes(16).toString('hex'); player.slp = { seed, hash: slHash(seed), n: 0 }; } return player.slp; }
// how = 'collect' (on encaisse le gain en attente) ou 'lost' (gain perdu au double ou rien). Révèle la graine du tour puis en engage une nouvelle.
function slFinish(room, player, how) {
    const s = player.sl; if (!s || !s.active) return;
    s.active = false;
    const win = how === 'lost' ? 0 : s.pending; s.pending = 0;
    player.balance += win; player.stats.gamesPlayed++; if (win > s.cost) player.stats.wins++; player.stats.totalProfit += win - s.cost;
    if (s.feedId) feedUpdate(room, s.feedId, { status: win > s.cost ? 'won' : 'lost', win, net: win - s.cost, mult: win > 0 ? Math.round(win / s.cost * 100) / 100 : null });
    const sp = slSeedOf(player), proof = { seed: sp.seed, hash: sp.hash, n: sp.n };
    const seed = crypto.randomBytes(16).toString('hex'); player.slp = { seed, hash: slHash(seed), n: sp.n + 1 };
    io.to(player.id).emit('sl-end', { win, how, proof, nextHash: player.slp.hash });
    broadcast(room);
}
function settlePending(room, player) {
            if (player.sl && player.sl.active) slFinish(room, player, 'collect'); // un gain de machine à sous en attente est encaissé // règle les parties en cours d'un joueur qui part pour de bon
            pkSettle(room, player);
            // les lignes "en cours" du panneau latéral se règlent proprement à la déconnexion (pas de ligne bloquée en pending)
            if (player.cr && player.cr.active) {
                if (player.cr.feedId) feedUpdate(room, player.cr.feedId, { status: 'lost', win: 0, net: -player.cr.bet });
                player.cr.active = false;
            }
            if (player.hl && player.hl.active) {
                if (player.hl.feedId) feedUpdate(room, player.hl.feedId, { status: 'lost', win: 0, net: -player.hl.bet });
                player.hl.active = false;
            }
            if (player.mn && player.mn.active) {
                if (player.mn.feedId) feedUpdate(room, player.mn.feedId, { status: 'lost', win: 0, net: -player.mn.bet });
                player.mn.active = false;
            }
            if (player.ar && player.ar.active) {
                if (player.ar.feedId) feedUpdate(room, player.ar.feedId, { status: 'lost', win: 0, net: -player.ar.bet });
                player.ar.active = false;
            }
            if (player.jm && player.jm.active) {
                if (player.jm.feedId) feedUpdate(room, player.jm.feedId, { status: 'lost', win: 0, net: -player.jm.bet });
                player.jm.active = false;
            }
            if (player.iceState && player.iceState.active) {
                if (player.iceState.feedId) feedUpdate(room, player.iceState.feedId, { status: 'lost', win: 0, net: -player.iceState.bet });
                player.iceState.active = false;
            }
            if (player.rl && player.rl.active) {
                if (player.rl.feedId) feedUpdate(room, player.rl.feedId, { status: 'lost', win: 0, net: -player.rl.total });
                player.rl.active = false;
            }
            if (bjPending(player.bj)) {
                if (player.bj.feedId) feedUpdate(room, player.bj.feedId, { status: 'lost', win: 0, net: -player.bj.round.bet });
                player.bj.round.phase = 'done';
            }
            player.slots.forEach(sl => {
                if (sl.bet > 0 && !sl.cashed && sl.feedId) feedUpdate(room, sl.feedId, { status: 'lost', win: 0, net: -sl.bet });
                sl.feedId = null;
                if (sl.next > 0 && sl.nextFeedId) feedUpdate(room, sl.nextFeedId, { status: 'void', net: 0, queued: false });
                sl.nextFeedId = null;
            });
}

function finalizeLeave(code, player) {
    const room = rooms[code];
    if (!room || player.connected) return;
    const idx = room.players.indexOf(player);
    if (idx === -1) return;
    settlePending(room, player);
    if (room.status === 'waiting' || room.status === 'choosing_game') room.players.splice(idx, 1);
    if (!room.players.some(p => p.connected)) return destroyRoom(code);
    if (player.isAdmin) {
        player.isAdmin = false;
        const next = room.players.find(p => p.connected);
        if (next) next.isAdmin = true;
    }
    broadcast(room);
}

function removePlayer(room, player) {
    clearTimeout(player._leave);
    const idx = room.players.indexOf(player);
    if (idx === -1) return;
    room.players.splice(idx, 1);
    if (!room.players.length || (room.status !== 'ended' && !room.players.some(p => p.connected))) return destroyRoom(room.code);
    if (player.isAdmin) {
        player.isAdmin = false;
        const next = room.players.find(p => p.connected);
        if (next) next.isAdmin = true;
    }
    broadcast(room);
}
const dismissEnded = account => accountRooms(account).filter(r => r.status === 'ended').forEach(r => removePlayer(r, r.players.find(p => p.account === account)));

const accountRooms = account => Object.values(rooms).filter(r => r.players.some(p => p.account === account));

// « Continuer » : la nouvelle room regroupe les joueurs qui ont cliqué (mêmes pseudos, même mise de départ)
function rematchInfo(room) {
    const nr = room.nextCode && rooms[room.nextCode];
    return nr && nr.status === 'waiting' ? { code: nr.code, names: nr.players.map(p => p.name) } : { code: null, names: [] };
}

// Rattache le compte à sa room (non terminée de préférence) avec la nouvelle socket.
function resumeRoom(socket, name) {
    const k = A.key(name), list = accountRooms(k);
    const room = list.find(r => r.status !== 'ended') || list.filter(r => r.result).sort((a, b) => b.endedAt - a.endedAt)[0];
    if (!room) { socket.emit('no-room'); return false; }
    const player = room.players.find(p => p.account === k);
    clearTimeout(player._leave); player._leave = null;
    player.id = socket.id; player.connected = true; player.inCrash = false;
    socket.join(room.code);
    if (room.status === 'ended') { // session terminée : on réaffiche juste les résultats (pas le jeu)
        socket.emit('game-session-ended', room.result);
        socket.emit('chat-log', room.chat || []);
        socket.emit('rematch-info', rematchInfo(room));
        return true;
    }
    socket.emit('resumed', { room: publicRoom(room), started: room.status !== 'waiting' });
    socket.emit('bet-feed', (room.feed || []).slice(0, 60));
    socket.emit('chat-log', room.chat || []);
    broadcast(room);
    return true;
}

/* ------------------------------------------------------------------ */
/*  Sockets                                                            */
/* ------------------------------------------------------------------ */

io.on('connection', (socket) => {
    console.log(`Connexion : ${socket.id}`);
    const ip = socket.handshake.address || '';

    // ---- Comptes ----
    const authOk = (name, token) => {
        socket.data.user = name; socket.data.token = token;
        // Reconnaissance automatique de l'admin : ton compte (protégé par ton mot de passe) = ADMIN_USER sur Render
        const isAdm = !!ADMIN_USER && String(name).toLowerCase() === ADMIN_USER;
        socket.data.admin = isAdm;
        socket.emit('auth-ok', { name, token, adminCode: !ADMIN_USER }); // adminCode : sans ADMIN_USER, le panneau reste déverrouillable par code
        if (isAdm) socket.emit('admin-state', { ok: true, auto: true });
        resumeRoom(socket, name);
    };
    socket.on('auth-register', async ({ username, password } = {}) => {
        try { const r = await A.register(username, password); r.error ? socket.emit('auth-error', r.error) : authOk(r.name, r.token); }
        catch (e) { console.error(e); socket.emit('auth-error', 'Erreur serveur.'); }
    });
    socket.on('auth-login', async ({ username, password } = {}) => {
        try { const r = await A.login(username, password, ip); r.error ? socket.emit('auth-error', r.error) : authOk(r.name, r.token); }
        catch (e) { console.error(e); socket.emit('auth-error', 'Erreur serveur.'); }
    });
    socket.on('auth-token', async ({ token } = {}) => {
        try {
            const r = await A.resume(token);
            if (!r) return socket.emit('auth-invalid');
            authOk(r.name, token);
        } catch (e) { console.error(e); }
    });
    // Quitter la room : possible au salon d'attente, ou une fois la session terminée (résultats vus)
    socket.on('leave-room', () => {
        const name = socket.data.user;
        if (!name) return;
        const k = A.key(name);
        for (const room of accountRooms(k)) {
            const player = room.players.find(p => p.account === k);
            // on peut quitter avant le départ du chrono ou après la fin ; jamais en pleine session (sinon on récupérerait sa mise)
            const sessionRunning = room.status !== 'waiting' && room.status !== 'ended' && !!room.timers.session;
            if (!sessionRunning) { socket.leave(room.code); removePlayer(room, player); }
            else return socket.emit('error-message', 'La session est en cours : tu ne peux pas quitter, ton solde reste en jeu jusqu\'à la fin.');
        }
        socket.emit('left-room');
    });
    socket.on('rematch', ({ roomCode } = {}) => {
        const name = socket.data.user, room = rooms[String(roomCode || '').trim().toUpperCase().replace(/^CRASH-/, '')];
        if (!name || !room || room.status !== 'ended') return;
        const k = A.key(name), old = room.players.find(p => p.account === k);
        if (!old) return;
        let nr = room.nextCode && rooms[room.nextCode];
        if (nr && nr.status !== 'waiting') return socket.emit('error-message', 'La nouvelle partie a déjà commencé : crée une room ou rejoins-la avec son code.');
        if (accountRooms(k).some(r => r.status !== 'ended')) return resumeRoom(socket, name); // déjà dans une room en cours
        if (!nr) {
            const code = generateRoomCode();
            nr = rooms[code] = {
                code, duration: room.duration, timeRemaining: room.duration, status: 'waiting', selectedGame: null, players: [],
                multiplier: 1.00, crashPoint: 0, currentHash: '', currentSecret: '', loopStarted: false,
                timers: { session: null, count: null, play: null, next: null }, history: [], feed: []
            };
            room.nextCode = code;
        }
        if (!nr.players.some(p => p.account === k)) nr.players.push(newPlayer(socket, name, nr.players.length === 0, old.stake));
        socket.leave(room.code); socket.join(nr.code);
        removePlayer(room, old);
        if (rooms[room.code]) io.to(room.code).emit('rematch-info', rematchInfo(room)); // ceux qui regardent encore les résultats voient qui est parti sur la nouvelle room
        socket.emit('rematch-go');
        broadcast(nr);
    });
    socket.on('auth-logout', () => { socket.data.admin = false; A.logout(socket.data.token); socket.data.user = null; socket.data.token = null; });

    socket.on('create-room', ({ duration, stake } = {}) => {
        const name = socket.data.user;
        if (!name) return socket.emit('error-message', 'Connecte-toi d\'abord !');
        if (accountRooms(A.key(name)).some(r => r.status !== 'ended')) return resumeRoom(socket, name); // une seule room active par compte
        const myStake = parseStake(stake);
        if (myStake === null) return socket.emit('error-message', STAKE_ERR);
        dismissEnded(A.key(name)); // on quitte les anciennes rooms terminées

        const minutes = ALLOWED_DURATIONS.includes(parseInt(duration)) ? parseInt(duration) : 5;
        const durationInSeconds = minutes * 60;
        const roomCode = generateRoomCode();

        rooms[roomCode] = {
            code: roomCode,
            duration: durationInSeconds,
            timeRemaining: durationInSeconds,
            status: 'waiting',
            selectedGame: null,
            players: [newPlayer(socket, name, true, myStake)],
            multiplier: 1.00,
            crashPoint: 0,
            currentHash: '',
            currentSecret: '',
            loopStarted: false,
            timers: { session: null, count: null, play: null, next: null },
            history: [],
            feed: [] // flux "Historique des paris" (panneau latéral), émis en direct via 'bet-feed'
        };

        socket.join(roomCode);
        socket.emit('room-created', { roomCode, room: publicRoom(rooms[roomCode]) });
    });

    socket.on('join-room', ({ roomCode, stake } = {}) => {
        const code = String(roomCode || '').trim().toUpperCase().replace(/^CRASH-/, '');
        const room = rooms[code];
        const name = socket.data.user;

        if (!name) return socket.emit('error-message', 'Connecte-toi d\'abord !');
        if (!room) return socket.emit('error-message', "Cette room n'existe pas !");
        if (room.players.some(p => p.account === A.key(name))) return resumeRoom(socket, name); // déjà dans cette room : on reprend
        if (accountRooms(A.key(name)).some(r => r.status !== 'ended')) return socket.emit('error-message', 'Tu es déjà dans une autre room en cours.');
        const myStake = parseStake(stake);
        if (myStake === null) return socket.emit('error-message', STAKE_ERR);
        if (room.status === 'ended') return socket.emit('error-message', 'La session est terminée !');
        if (room.players.some(p => p.id === socket.id)) return;

        dismissEnded(A.key(name));
        room.players.push(newPlayer(socket, name, false, myStake));
        socket.join(code);

        socket.emit('joined-success', publicRoom(room));
        // le nouveau joueur reçoit tout de suite le flux des paris en cours/récents du panneau latéral
        socket.emit('bet-feed', (room.feed || []).slice(0, 60));
        socket.emit('chat-log', room.chat || []);
        // si l'hôte a déjà ouvert le jeu, on envoie directement le nouveau joueur dessus
        if (room.status !== 'waiting') {
            socket.emit('navigate-to-game', { gameName: room.selectedGame, room: publicRoom(room) });
        }
        broadcast(room);
    });

    socket.on('launch-game-lobby', ({ roomCode, gameName } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.isAdmin) return;
        if (room.status !== 'waiting') return;

        room.status = 'choosing_game';
        room.selectedGame = String(gameName || 'Hub').slice(0, 40);
        io.to(room.code).emit('navigate-to-game', { gameName: room.selectedGame, room: publicRoom(room) });
    });

    socket.on('join-game-table', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player) return;
        if (room.status === 'waiting' || room.status === 'ended') return;

        player.inGame = true;
        broadcast(room);

        if (!room.timers.session) startSessionTimer(room);
    });

    // La boucle Crash ne tourne QUE si au moins un joueur est à la table, et ses événements ne partent qu'à la table
    socket.on('crash-join', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || room.status === 'waiting' || room.status === 'ended') return;
        player.inCrash = true;
        socket.join(crashRoom(room));
        socket.emit('crash-state', { status: room.status, multiplier: room.multiplier, hash: room.currentHash, room: publicRoom(room, true) });
        if (!room.loopStarted) { room.loopStarted = true; startCrashLoop(room); }
        else if (room.crashIdle) { room.crashIdle = false; room.runRound(); }
    });

    // Profils et classement général (lecture seule, tout joueur connecté peut les consulter)
    socket.on('prof-get', ({ name } = {}) => {
        if (!socket.data.user) return;
        const pr = A.profileOf(String(name || socket.data.user));
        if (pr) socket.emit('prof-data', Object.assign(pr, { canReset: !!ADMIN_USER && String(socket.data.user).toLowerCase() === ADMIN_USER && A.key(pr.name) === ADMIN_USER }));
    });
    // Remise à zéro des stats du compte admin (réservé à ADMIN_USER, sur son propre profil)
    socket.on('prof-reset', async () => {
        if (!socket.data.user || !ADMIN_USER || String(socket.data.user).toLowerCase() !== ADMIN_USER) return;
        if (await A.resetProfile(socket.data.user)) { socket.emit('prof-data', Object.assign(A.profileOf(socket.data.user), { canReset: true })); socket.emit('prof-reset-ok'); }
    });
    /* ---------------- Mon profil : infos, apparence, mot de passe, photo, quêtes ---------------- */
    const meUser = () => (socket.data.user ? A.userRec(A.key(socket.data.user)) : null);
    const meData = () => {
        const u = meUser(); if (!u) return null;
        const info = XPL.levelInfo(u.xp || 0);
        return { name: u.name, since: u.created, info, top: XPL.tierFor(info.level), cos: A.cosOf(A.key(u.name)), cf: u.cf == null ? null : u.cf, ct: u.ct == null ? null : u.ct,
            tiers: XPL.TIERS.map((t, k) => (k > XPL.tierFor(info.level) && t.id === 'secret' ? { id: 'secret', n: '???', lv: 0, t: '???', c: '#555' } : t)), prof: A.profileOf(u.name), admin: !!socket.data.admin };
    };
    const meRefresh = () => { const d = meData(); if (d) socket.emit('me-data', d); accountRooms(A.key(socket.data.user)).forEach(r => broadcast(r)); };
    socket.on('me-get', () => { const d = meData(); if (d) socket.emit('me-data', d); });
    socket.on('me-cos', ({ fr, ti } = {}) => { if (socket.data.user && A.setCos(A.key(socket.data.user), fr, ti)) meRefresh(); });
    socket.on('me-pass', async ({ oldPass, newPass } = {}) => {
        if (!socket.data.user) return;
        try { const r = await A.changePassword(socket.data.user, oldPass, newPass, socket.data.token); socket.emit('me-pass-res', r.error ? { error: r.error } : { ok: true }); }
        catch (e) { console.error(e); socket.emit('me-pass-res', { error: 'Erreur serveur.' }); }
    });
    socket.on('me-avatar', async ({ data } = {}) => {
        if (!socket.data.user) return;
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
        if (!m || m[1].length > 40000) return socket.emit('me-avatar-res', { error: 'Image invalide ou trop lourde.' });
        const buf = Buffer.from(m[1], 'base64');
        if (buf.length < 100 || buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[2] !== 0xFF) return socket.emit('me-avatar-res', { error: 'Image invalide.' });
        try { await A.avatarSet(socket.data.user, buf); socket.emit('me-avatar-res', { ok: true }); meRefresh(); }
        catch (e) { console.error(e); socket.emit('me-avatar-res', { error: 'Enregistrement impossible, réessaie.' }); }
    });
    socket.on('me-avatar-del', async () => { if (!socket.data.user) return; await A.avatarDel(socket.data.user); meRefresh(); });
    socket.on('me-logout-all', () => { if (!socket.data.user) return; A.logoutAll(socket.data.user); socket.emit('me-logout-all-ok'); });
    socket.on('me-delete', async ({ pass } = {}) => {
        if (!socket.data.user) return;
        try {
            const r = await A.deleteAccount(socket.data.user, pass);
            if (r.error) return socket.emit('me-delete-res', { error: r.error });
            const k = A.key(socket.data.user); accountRooms(k).forEach(room => { const pl = room.players.find(x => x.account === k); if (pl) removePlayer(room, pl); });
            socket.data.user = null; socket.data.token = null; socket.data.admin = false; socket.emit('me-delete-res', { ok: true });
        } catch (e) { console.error(e); socket.emit('me-delete-res', { error: 'Erreur serveur.' }); }
    });
    socket.on('q-get', () => { const u = meUser(); if (u) socket.emit('q-state', qState(u)); });
    const qClaimed = (u, xp) => { const before = XPL.levelInfo(u.xp - xp).level; A.save(); socket.emit('xp-gain', { gain: xp, why: 'Quête', from: before, info: XPL.levelInfo(u.xp) }); socket.emit('q-state', qState(u)); accountRooms(A.key(socket.data.user)).forEach(r => broadcast(r)); };
    socket.on('q-claim', ({ id } = {}) => { const u = meUser(); if (!u) return; const xp = Q.claim(u, String(id || '')); if (xp) qClaimed(u, xp); });
    socket.on('q-claim-all', () => { const u = meUser(); if (!u) return; const r = Q.claimAll(u); if (r.xp) qClaimed(u, r.xp); });
    socket.on('gen-get', () => { if (socket.data.user) socket.emit('gen-data', { board: A.leaderboard(50), me: socket.data.user }); });

    // Chat de la room : 200 caractères max, 80 derniers messages gardés (un joueur qui arrive reçoit l'historique)
    socket.on('chat-send', ({ roomCode, text } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player) return;
        text = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 200);
        const now = Date.now();
        if (!text || (player._chatTs && now - player._chatTs < 250)) return;
        player._chatTs = now; player.msgs = (player.msgs || 0) + 1; qEvent(player, { t: 'msg' });
        const msg = { id: feedId(), name: player.name, text, ts: now, cos: A.cosOf(player.account) };
        (room.chat = room.chat || []).push(msg); if (room.chat.length > 80) room.chat.shift();
        io.to(room.code).emit('chat-msg', msg);
    });

    // Panneau « Graphiques » : courbe de fortune + paris de chaque joueur de la room
    socket.on('hist-get', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player) return;
        sampleEquity(room);
        socket.emit('hist-data', {
            t: Date.now(),
            players: room.players.map(p => ({
                name: p.name, vip: !!ADMIN_USER && String(p.name).toLowerCase() === ADMIN_USER,
                initial: p.initialBalance, eq: equityOf(p), connected: p.connected !== false,
                pts: (p.eqHist || []).slice(-400),
                bets: pubBets(p)
            }))
        });
    });

    socket.on('crash-leave', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player) return;
        player.inCrash = false;
        socket.leave(crashRoom(room));
        player.slots.forEach(sl => { // les mises qui ne sont pas encore parties sont rendues
            if (room.status === 'betting' && sl.bet > 0) {
                player.balance += sl.bet; sl.bet = 0; sl.auto = 0;
                if (sl.feedId) feedUpdate(room, sl.feedId, { status: 'void', net: 0 });
                sl.feedId = null;
            }
            if (sl.next > 0) {
                player.balance += sl.next; sl.next = 0; sl.nextAuto = 0;
                if (sl.nextFeedId) feedUpdate(room, sl.nextFeedId, { status: 'void', net: 0, queued: false });
                sl.nextFeedId = null;
            }
        });
        broadcast(room);
    });

    const slotOf = (player, i) => player.slots[i === 1 ? 1 : 0];

    /* Validation commune des montants misés : entier > 0, solde suffisant, plafond anti-abus.
       Renvoie le montant net ou null (message d'erreur émis). */
    const stakeOf = (socket, player, raw) => {
        const amount = Math.floor(Number(raw));
        if (!Number.isFinite(amount) || amount <= 0) { socket.emit('error-message', 'Montant invalide !'); return null; }
        if (amount > G.MAX_BET) { socket.emit('error-message', `Mise maximale : ${G.MAX_BET} 🪙 !`); return null; }
        if (player.balance < amount) { socket.emit('error-message', 'Solde insuffisant !'); return null; }
        return amount;
    };

    socket.on('place-bet', ({ roomCode, amount, autoCashOut, slot } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;

        amount = Math.floor(Number(amount)); // entier > 0
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }

        const pa = parseFloat(autoCashOut), auto = pa >= 1.01 ? pa : 0, sl = slotOf(player, slot);
        if (room.status === 'betting') {
            if (sl.bet > 0) return; // déjà misé : annuler avant de changer
            sl.bet = amount; sl.auto = auto; sl.cashed = false; sl.win = 0;
            // ligne "en vol" dans le panneau latéral : elle montera avec l'avion et sera réglée au crash ou au cash-out
            if (!sl.feedId) {
                sl.feedId = feedId();
                feedAdd(room, stamp({ id: sl.feedId, game: 'crash', icon: GAME_ICONS.crash, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending' }));
            }
        } else if (room.status === 'playing' || room.status === 'crashed') {
            if (sl.next > 0) return;
            sl.next = amount; sl.nextAuto = auto;
            // mise « pour la manche suivante » : elle apparaît aussi dans l'historique (⏳ manche suivante)
            sl.nextFeedId = feedId();
            feedAdd(room, stamp({ id: sl.nextFeedId, game: 'crash', icon: GAME_ICONS.crash, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending', queued: true }));
        } else return;

        player.balance -= amount;
        broadcast(room);
    });

    socket.on('cancel-next-bet', ({ roomCode, slot } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player) return;
        const sl = slotOf(player, slot);
        if (room.status === 'betting' && sl.bet > 0) {
            player.balance += sl.bet; sl.bet = 0; sl.auto = 0;
            if (sl.feedId) feedUpdate(room, sl.feedId, { status: 'void', net: 0 }); // ligne retirée du flux (bascule ci-dessous)
            sl.feedId = null;
        }
        else if ((room.status === 'playing' || room.status === 'crashed') && sl.next > 0) {
            player.balance += sl.next; sl.next = 0; sl.nextAuto = 0;
            if (sl.nextFeedId) feedUpdate(room, sl.nextFeedId, { status: 'void', net: 0, queued: false });
            sl.nextFeedId = null;
        }
        broadcast(room);
    });

    socket.on('cash-out', ({ roomCode, slot } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || room.status !== 'playing') return;
        const sl = slotOf(player, slot);
        if (sl.bet > 0 && !sl.cashed) processCashOut(player, sl, room.multiplier, room, slot === 1 ? 1 : 0);
    });

    /* ---------------- Chicken Road (3 modes, RTP 98,5 %, équitable prouvable) ---------------- */
    socket.on('cr-start', ({ roomCode, amount, mode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        if (player.cr && player.cr.active) return socket.emit('error-message', 'Partie Chicken Road déjà en cours !');
        if (!CR_MODES[mode]) return;

        amount = Math.floor(Number(amount)); // entier > 0
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }

        player.balance -= amount;
        const seed = crypto.randomBytes(16).toString('hex');
        const cr = player.cr = { active: true, bet: amount, mode, step: 0, seed, feedId: feedId() }; // ligne "en cours" dans le panneau latéral (mise débitée, pas encore réglée)
        feedAdd(room, stamp({ id: cr.feedId, game: 'cr', icon: GAME_ICONS.cr, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending' }));
        socket.emit('cr-started', { hash: crypto.createHash('sha256').update(seed).digest('hex') });
        broadcast(room);
    });

    socket.on('cr-step', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const cr = player && player.cr;
        if (!room || !cr || !cr.active || room.status === 'ended') return;

        const cfg = CR_MODES[cr.mode], k = cr.step + 1;
        // Le pas k est mortel si HMAC(graine, "step:k") tombe sous p : le joueur peut le vérifier quand la graine est révélée
        const u = parseInt(crypto.createHmac('sha256', cr.seed).update('step:' + k).digest('hex').slice(0, 13), 16) / 4503599627370496;
        if (u < cfg.p) {
            cr.active = false;
            player.stats.gamesPlayed++;
            player.stats.totalProfit -= cr.bet;
            if (cr.feedId) feedUpdate(room, cr.feedId, { status: 'lost', mult: null, win: 0, net: -cr.bet });
            socket.emit('cr-result', { success: false, step: k, seed: cr.seed, message: "💥 Le poulet s'est fait renverser !" });
        } else {
            cr.step = k;
            const mult = crMultiplier(cr.mode, k);
            if (k >= cfg.steps) { // dernière voie traversée : l'œuf d'or est encaissé automatiquement
                const winnings = tilt(player, cr.bet, weightedRound(cr.bet * mult));
                player.balance += winnings;
                cr.active = false;
                player.stats.gamesPlayed++; player.stats.wins++; player.stats.totalProfit += winnings - cr.bet;
                const sm = shown(player, cr.bet, winnings, mult);
                if (cr.feedId) feedUpdate(room, cr.feedId, { status: 'won', mult: sm, win: winnings, net: winnings - cr.bet });
                socket.emit('cr-result', { success: true, completed: true, step: k, multiplier: sm, winnings, seed: cr.seed, message: `🥚 Œuf d'or ! +${winnings} 🪙 (x${sm})` });
            } else {
                if (cr.feedId) feedUpdate(room, cr.feedId, { mult: dm(player, mult) }); // le poulet avance : multiplicateur en direct
                socket.emit('cr-result', { success: true, completed: false, step: k, multiplier: dm(player, mult) });
            }
        }
        broadcast(room);
    });

    socket.on('cr-cashout', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const cr = player && player.cr;
        if (!room || !cr || !cr.active || cr.step === 0 || room.status === 'ended') return;

        const mult = crMultiplier(cr.mode, cr.step), winnings = tilt(player, cr.bet, weightedRound(cr.bet * mult));
        player.balance += winnings;
        cr.active = false;
        player.stats.gamesPlayed++; player.stats.wins++; player.stats.totalProfit += winnings - cr.bet;
        const sm = shown(player, cr.bet, winnings, mult);
        if (cr.feedId) feedUpdate(room, cr.feedId, { status: 'won', mult: sm, win: winnings, net: winnings - cr.bet });
        const cfgN = CR_MODES[cr.mode]; let deadlyAt = null; // première voie mortelle après celle où il s'arrête (null = il pouvait aller jusqu'au bout)
        for (let k = cr.step + 1; k <= cfgN.steps; k++) { const u = parseInt(crypto.createHmac('sha256', cr.seed).update('step:' + k).digest('hex').slice(0, 13), 16) / 4503599627370496; if (u < cfgN.p) { deadlyAt = k; break; } }
        socket.emit('cr-result', { success: true, cashout: true, step: cr.step, multiplier: sm, winnings, seed: cr.seed, deadlyAt, message: `💰 Encaissé : +${winnings} 🪙 (x${sm})` });
        broadcast(room);
    });

    /* ---------------- Panneau admin secret (mode troll) ---------------- */
    let admFails = 0, admLockUntil = 0;
    socket.on('admin-unlock', ({ code } = {}) => {
        if (Date.now() < admLockUntil) return socket.emit('admin-state', { ok: false, locked: true });
        if (ADMIN_USER && String(socket.data.user || '').toLowerCase() !== ADMIN_USER) return socket.emit('admin-state', { ok: false });
        const h = crypto.createHash('sha256').update(String(code || '')).digest();
        const good = crypto.timingSafeEqual(h, Buffer.from(ADMIN_HASH, 'hex'));
        if (!good) { if (++admFails >= 5) { admLockUntil = Date.now() + 60000; admFails = 0; } return socket.emit('admin-state', { ok: false }); }
        admFails = 0; socket.data.admin = true; socket.emit('admin-state', { ok: true });
    });
    const admList = room => room.players.map(p => ({ name: p.name, balance: p.balance, pct: typeof p.winPct === 'number' ? p.winPct : 100, profit: p.stats ? p.stats.totalProfit : 0, games: p.stats ? p.stats.gamesPlayed : 0 }));
    socket.on('admin-list', ({ roomCode } = {}) => {
        if (!socket.data.admin) return socket.emit('admin-state', { ok: false });
        const { room } = findPlayer(socket, roomCode); if (!room) return;
        socket.emit('admin-players', admList(room));
    });
    socket.on('admin-set', ({ roomCode, name, pct } = {}) => {
        if (!socket.data.admin) return socket.emit('admin-state', { ok: false });
        const { room } = findPlayer(socket, roomCode); if (!room) return;
        pct = Number(pct); if (!Number.isFinite(pct)) return; pct = Math.max(0, Math.min(1e9, Math.round(pct * 100) / 100)); // pratiquement sans limite
        room.players.forEach(p => { if (name === '*' || p.name === name) p.winPct = pct; });
        socket.emit('admin-players', admList(room));
    });

    socket.on('admin-give', ({ roomCode, name, amount } = {}) => { // ajoute (ou retire si négatif) des jetons, en silence : aucun message, aucune ligne dans le fil
        if (!socket.data.admin) return socket.emit('admin-state', { ok: false });
        const { room } = findPlayer(socket, roomCode); if (!room) return;
        amount = Math.round(Number(amount)); if (!Number.isFinite(amount) || !amount) return;
        amount = Math.max(-1e12, Math.min(1e12, amount));
        room.players.forEach(p => { if (name === '*' || p.name === name) p.balance = Math.max(0, p.balance + amount); });
        socket.emit('admin-players', admList(room));
        broadcast(room);
    });

    /* ---------------- Plinko (8 à 16 rangées, 4 risques, plusieurs billes, RTP 98,5 %, équitable prouvable) ---------------- */
    // Chaque bille : à chaque rangée, bit = 1er bit de HMAC(graine, "plinko:bille:rangée") (0 = gauche, 1 = droite).
    // La case d'arrivée = nombre de "droite". Le serveur décide tout dès le lancer ; la mise est débitée tout de suite
    // et les gains sont versés quand les billes ont fini de tomber (animation côté client, mêmes durées).
    socket.on('pk-start', ({ roomCode, amount, rows, risk, balls } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        rows = Math.floor(Number(rows)); balls = Math.floor(Number(balls)); amount = Math.floor(Number(amount));
        if (!(rows >= PK.MIN_ROWS && rows <= PK.MAX_ROWS) || !PK.RISKS.includes(risk) || !(balls >= 1 && balls <= PK_MAX_BALLS)) return;
        if (!Number.isFinite(amount) || amount <= 0) return socket.emit('error-message', 'Montant invalide !');
        player.pkQ = player.pkQ || [];
        if (player.pkQ.length + balls > PK_MAX_INFLIGHT) return socket.emit('error-message', 'Trop de billes en l\'air, laisse-en retomber quelques-unes !');
        { const a2 = stakeOf(socket, player, amount * balls); if (a2 === null) return; } // pas de cooldown : on peut relancer à volonté tant que le solde suit
        player.balance -= amount * balls;
        const seed = crypto.randomBytes(16).toString('hex'), table = PK.multipliers(rows, risk), slots = [], wins = [], paths = [], mults = [];
        const batch = { seed, rows, risk, slots, left: balls };
        for (let j = 0; j < balls; j++) {
            let k = 0, bits = ''; for (let i = 0; i < rows; i++) { const b = parseInt(crypto.createHmac('sha256', seed).update(`plinko:${j}:${i}`).digest('hex')[0], 16) & 1; k += b; bits += b; }
            const win = tilt(player, amount, weightedRound(amount * table[k])), mult = shown(player, amount, win, table[k]);
            paths.push(bits); slots.push(k); wins.push(win); mults.push(mult);
            const fid = feedId(); // une ligne par bille dans « Paris en direct »
            feedAdd(room, stamp({ id: fid, game: 'pk', icon: GAME_ICONS.pk, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending' }));
            const ball = { unit: amount, win, mult, feedId: fid, batch, done: false, timer: null };
            ball.timer = setTimeout(() => pkLand(room, player, ball), j * PK_STAGGER + (rows + 1) * PK_STEP + 120);
            player.pkQ.push(ball);
        }
        socket.emit('pk-started', { hash: crypto.createHash('sha256').update(seed).digest('hex'), rows, risk, balls, unit: amount, slots, paths, mults, wins, step: PK_STEP, stagger: PK_STAGGER });
        broadcast(room);
    });


    /* ---------------- Dés / Pile ou face / Hi-Lo : équitables prouvables (RTP 98,5 %) ----------------
       Dés et Pile ou face sont instantanés : le serveur ENGAGE d'avance une graine (hash affiché avant le lancer),
       puis la révèle après chaque résultat et en engage une nouvelle. u = HMAC(graine, "jeu:n") dans [0,1).        */
    const sha256 = x => crypto.createHash('sha256').update(x).digest('hex');
    const hmacU = (seed, label) => parseInt(crypto.createHmac('sha256', seed).update(label).digest('hex').slice(0, 13), 16) / 4503599627370496;
    const pfOf = player => { if (!player.pf) { const seed = crypto.randomBytes(16).toString('hex'); player.pf = { seed, hash: sha256(seed), n: 0 }; } return player.pf; };
    const pfRotate = player => { const seed = crypto.randomBytes(16).toString('hex'); player.pf = { seed, hash: sha256(seed), n: 0 }; return player.pf; };
    // règle une mise instantanée : débite, crédite, statistiques et ligne « Paris en direct »
    function instantBet(room, player, game, amount, win, mult) {
        player.balance -= amount;
        const winnings = win ? tilt(player, amount, weightedRound(amount * mult)) : 0;
        player.balance += winnings; player.stats.gamesPlayed++; if (win) player.stats.wins++; player.stats.totalProfit += winnings - amount;
        const sm = win ? shown(player, amount, winnings, mult) : 0;
        feedAdd(room, stamp({ id: feedId(), game, icon: GAME_ICONS[game], name: player.name, bet: amount, mult: win ? sm : null, win: winnings, net: winnings - amount, status: win ? 'won' : 'lost' }));
        return { winnings, sm };
    }
    socket.on('pf-hash', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (room && player) socket.emit('pf-hash', { hash: pfOf(player).hash });
    });

    // Dés : un tirage de 0,00 à 99,99 ; « moins que » ou « plus que » ; chance de gagner réglable (0,01 % à 98 %)
    socket.on('dc-roll', ({ roomCode, amount, chance, over } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        amount = Math.floor(Number(amount));
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }
        const T = Math.round(Number(chance) * 100); if (!(T >= 1 && T <= 9800)) return socket.emit('error-message', 'Chance invalide (0,01 % à 98 %).');
        const pf = pfOf(player), r = Math.floor(hmacU(pf.seed, 'dice:' + pf.n) * 10000);
        const isOver = !!over, win = isOver ? r > 9999 - T : r < T;
        const mult = Math.round(0.985 * 10000 / T * 10000) / 10000;
        const { winnings, sm } = instantBet(room, player, 'dc', amount, win, mult);
        const proof = { seed: pf.seed, hash: pf.hash, n: pf.n }, nx = pfRotate(player);
        socket.emit('dc-result', { roll: r / 100, win, over: isOver, target: isOver ? (9999 - T) / 100 : T / 100, mult: win ? sm : mult, winnings, net: winnings - amount, proof, nextHash: nx.hash });
        broadcast(room);
    });

    // Pile ou face : 50/50, gain x1,97
    socket.on('cf-flip', ({ roomCode, amount, side } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        amount = Math.floor(Number(amount));
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }
        side = side === 1 ? 1 : 0; // 0 = pile, 1 = face
        const pf = pfOf(player), coin = hmacU(pf.seed, 'coin:' + pf.n) < 0.5 ? 0 : 1, win = coin === side;
        const { winnings, sm } = instantBet(room, player, 'cf', amount, win, 1.97);
        const proof = { seed: pf.seed, hash: pf.hash, n: pf.n }, nx = pfRotate(player);
        socket.emit('cf-result', { coin, side, win, mult: win ? sm : 1.97, winnings, net: winnings - amount, proof, nextHash: nx.hash });
        broadcast(room);
    });

    // Hi-Lo : carte suivante plus haute / plus basse (égalité = perdu). Série de victoires, encaisse quand tu veux.
    // Multiplicateur = 98,5 % / Π(probabilités) : le RTP reste exactement 98,5 % quel que soit le moment où tu encaisses.
    const hlCard = (seed, i) => ({ r: Math.floor(hmacU(seed, 'hilo:' + i) * 13), s: Math.floor(hmacU(seed, 'hilo-s:' + i) * 4) });
    const hlChances = r => ({ hi: (12 - r) / 13, lo: r / 13 });
    const hlPayload = hl => { const c = hlChances(hl.card.r); return { card: hl.card, steps: hl.steps, mult: Math.round(hl.m * 100) / 100, nextHi: c.hi > 0 ? Math.round(hl.m / c.hi * 100) / 100 : null, nextLo: c.lo > 0 ? Math.round(hl.m / c.lo * 100) / 100 : null, pHi: c.hi, pLo: c.lo }; };
    function hlEnd(room, player, cash) {
        const hl = player.hl; hl.active = false;
        const mult = Math.round(hl.m * 100) / 100;
        if (cash) {
            const winnings = tilt(player, hl.bet, weightedRound(hl.bet * mult));
            player.balance += winnings; player.stats.gamesPlayed++; player.stats.wins++; player.stats.totalProfit += winnings - hl.bet;
            const sm = shown(player, hl.bet, winnings, mult);
            if (hl.feedId) feedUpdate(room, hl.feedId, { status: 'won', mult: sm, win: winnings, net: winnings - hl.bet });
            return { winnings, sm };
        }
        player.stats.gamesPlayed++; player.stats.totalProfit -= hl.bet;
        if (hl.feedId) feedUpdate(room, hl.feedId, { status: 'lost', mult: null, win: 0, net: -hl.bet });
        return { winnings: 0, sm: 0 };
    }
    /* ---------------- Machine à sous : LA NUIT DU LOUP (RTP ≈ 98 %, voir slot.js) ----------------
       Chaque tour a sa graine, ENGAGÉE d'avance (hash affiché avant de jouer) et révélée à la fin du tour (encaissement ou perte au double).
       Toutes les valeurs aléatoires du tour = HMAC-SHA256(graine, "slot:n:i") ÷ 2^52, i = 0, 1, 2… dans l'ordre du moteur. */
    const slState = player => { const s = player.sl; return { hash: slSeedOf(player).hash, active: !!(s && s.active), pending: s && s.active ? s.pending : 0, unit: s ? s.unit : 0, g: s ? s.g : 0, buy: SLOT.BUY.slice(1).map(b => ({ n: b.name, price: b.price })), jp: SLOT.JP }; };
    socket.on('sl-hash', ({ roomCode } = {}) => { const { room, player } = findPlayer(socket, roomCode); if (room && player) socket.emit('sl-hash', slState(player)); });
    socket.on('sl-spin', ({ roomCode, amount, buy } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        if (player.sl && player.sl.active) slFinish(room, player, 'collect'); // un nouveau tour encaisse d'abord le gain précédent
        amount = Math.floor(Number(amount));
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }
        buy = [1, 2, 3].includes(+buy) ? +buy : 0;
        const cost = buy ? amount * SLOT.BUY[buy].price : amount;
        if (player.balance < cost) return socket.emit('error-message', 'Solde insuffisant pour ce bonus !');
        const sp = slSeedOf(player); let i = 0;
        const res = SLOT.spin(() => slU(sp.seed, 'slot:' + sp.n + ':' + (i++)), buy ? { buy } : {});
        const payout = res.total > 0 ? weightedRound(res.total * amount) : 0;
        player.balance -= cost;
        const fid = feedId();
        player.sl = { active: true, unit: amount, cost, pending: payout, g: 0, feedId: fid };
        feedAdd(room, stamp({ id: fid, game: 'sl', icon: GAME_ICONS.sl, name: player.name, bet: cost, mult: null, win: 0, net: -cost, status: 'pending' }));
        socket.emit('sl-result', { n: sp.n, hash: sp.hash, unit: amount, cost, buy, grid: res.grid, wins: res.wins, base: res.base, lanterns: res.lanterns, topup: res.topup, bonus: res.bonus, mult: res.total, payout });
        if (payout <= 0) slFinish(room, player, 'lost'); else broadcast(room);
    });
    socket.on('sl-collect', ({ roomCode } = {}) => { const { room, player } = findPlayer(socket, roomCode); if (room && player && player.sl && player.sl.active) slFinish(room, player, 'collect'); });
    // Double ou rien : rouge ou noir (carte tirée avec la même graine), gain ×2, jusqu'à 5 fois d'affilée (gain en attente ≤ 100× la mise)
    socket.on('sl-gamble', ({ roomCode, color } = {}) => {
        const { room, player } = findPlayer(socket, roomCode); const s = player && player.sl;
        if (!room || !s || !s.active || s.pending <= 0 || room.status === 'ended') return;
        if (color !== 'red' && color !== 'black') return;
        if (s.g >= 5) return socket.emit('error-message', 'Maximum 5 doublements d’affilée : encaisse !');
        if (s.pending > s.unit * 100) return socket.emit('error-message', 'Gain trop élevé pour doubler (maximum 100× la mise).');
        const sp = slSeedOf(player), suit = Math.floor(slU(sp.seed, 'slot:' + sp.n + ':g' + s.g) * 4), rank = Math.floor(slU(sp.seed, 'slot:' + sp.n + ':r' + s.g) * 13);
        const drawn = suit < 2 ? 'red' : 'black', ok = drawn === color; // suit : 0 ♥, 1 ♦ (rouges) · 2 ♠, 3 ♣ (noires)
        if (ok) { s.pending *= 2; s.g++; socket.emit('sl-gamble-res', { ok: true, suit, rank, pending: s.pending, g: s.g, more: s.g < 5 && s.pending <= s.unit * 100 }); broadcast(room); }
        else { socket.emit('sl-gamble-res', { ok: false, suit, rank, pending: 0, g: s.g }); slFinish(room, player, 'lost'); }
    });
    socket.on('hl-state', ({ roomCode } = {}) => { // reprise après rafraîchissement
        const { room, player } = findPlayer(socket, roomCode);
        if (room && player && player.hl && player.hl.active) socket.emit('hl-started', Object.assign({ hash: sha256(player.hl.seed), resume: true, bet: player.hl.bet }, hlPayload(player.hl)));
    });
    socket.on('hl-start', ({ roomCode, amount } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        if (player.hl && player.hl.active) return socket.emit('error-message', 'Partie Hi-Lo déjà en cours !');
        amount = Math.floor(Number(amount));
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }
        player.balance -= amount;
        const seed = crypto.randomBytes(16).toString('hex');
        const hl = player.hl = { active: true, bet: amount, seed, n: 0, steps: 0, m: 0.985, card: hlCard(seed, 0), feedId: feedId() };
        feedAdd(room, stamp({ id: hl.feedId, game: 'hl', icon: GAME_ICONS.hl, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending' }));
        socket.emit('hl-started', Object.assign({ hash: sha256(seed) }, hlPayload(hl)));
        broadcast(room);
    });
    socket.on('hl-guess', ({ roomCode, dir } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const hl = player && player.hl;
        if (!room || !hl || !hl.active || room.status === 'ended') return;
        const hi = dir === 'hi', c = hlChances(hl.card.r), p = hi ? c.hi : c.lo;
        if (!(p > 0)) return socket.emit('error-message', 'Impossible : aucune carte ne peut tomber de ce côté.');
        const prev = hl.card; hl.n++; const next = hlCard(hl.seed, hl.n);
        const win = hi ? next.r > prev.r : next.r < prev.r;
        if (win) {
            hl.m /= p; hl.steps++; hl.card = next;
            if (hl.feedId) feedUpdate(room, hl.feedId, { mult: dm(player, Math.round(hl.m * 100) / 100) });
            socket.emit('hl-result', Object.assign({ win: true, prev }, hlPayload(hl)));
        } else {
            hl.card = next; const mult = Math.round(hl.m * 100) / 100;
            hlEnd(room, player, false);
            socket.emit('hl-result', { win: false, prev, card: next, steps: hl.steps, seed: hl.seed, message: `💥 Perdu : ${hi ? 'plus haut' : 'plus bas'} raté` });
        }
        broadcast(room);
    });
    socket.on('hl-skip', ({ roomCode } = {}) => { // passer la carte : gratuit, sans changer le multiplicateur
        const { room, player } = findPlayer(socket, roomCode);
        const hl = player && player.hl;
        if (!room || !hl || !hl.active || room.status === 'ended') return;
        hl.n++; hl.card = hlCard(hl.seed, hl.n);
        socket.emit('hl-result', Object.assign({ skip: true }, hlPayload(hl)));
    });
    socket.on('hl-cashout', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const hl = player && player.hl;
        if (!room || !hl || !hl.active || !hl.steps || room.status === 'ended') return;
        const { winnings, sm } = hlEnd(room, player, true);
        socket.emit('hl-result', { cashout: true, card: hl.card, steps: hl.steps, multiplier: sm, winnings, seed: hl.seed, message: `💰 Encaissé : +${winnings} 🪙 (x${sm})` });
        broadcast(room);
    });

    /* ---------------- Mines (grille 5×5, 1 à 24 mines, RTP 98,5 %, équitable prouvable) ---------------- */
    const MN_N = 25, MN_RTP = 0.985;
    // multiplicateur après k cases sûres avec m mines : RTP / P(k cases sûres d'affilée) = RTP × Π (25-i)/(25-m-i)
    function mnMult(m, k) { let x = MN_RTP; for (let i = 0; i < k; i++) x *= (MN_N - i) / (MN_N - m - i); return Math.round(x * 100) / 100; }
    // Position des mines : mélange de Fisher-Yates piloté par HMAC(graine, "mines:i") — vérifiable une fois la graine révélée
    function mnLayout(seed, m) {
        const perm = Array.from({ length: MN_N }, (_, i) => i);
        for (let i = MN_N - 1; i > 0; i--) {
            const u = parseInt(crypto.createHmac('sha256', seed).update('mines:' + i).digest('hex').slice(0, 13), 16) / 4503599627370496;
            const j = Math.floor(u * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        return perm.slice(0, m);
    }
    function mnCashout(room, player, auto) {
        const mn = player.mn, mult = mnMult(mn.mines, mn.picks.length), winnings = tilt(player, mn.bet, weightedRound(mn.bet * mult));
        player.balance += winnings; mn.active = false;
        player.stats.gamesPlayed++; player.stats.wins++; player.stats.totalProfit += winnings - mn.bet;
        const sm = shown(player, mn.bet, winnings, mult);
        if (mn.feedId) feedUpdate(room, mn.feedId, { status: 'won', mult: sm, win: winnings, net: winnings - mn.bet });
        socket.emit('mn-result', { safe: true, cashout: true, completed: !!auto, multiplier: sm, winnings, picks: mn.picks.slice(), mines: mnLayout(mn.seed, mn.mines), seed: mn.seed,
            message: (auto ? '💎 Grille nettoyée ! ' : '💰 Encaissé : ') + `+${winnings} 🪙 (x${sm})` });
        broadcast(room);
    }
    socket.on('mn-start', ({ roomCode, amount, mines } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        if (player.mn && player.mn.active) return socket.emit('error-message', 'Partie Mines déjà en cours !');
        mines = Math.floor(Number(mines)); if (!(mines >= 1 && mines <= 24)) return;
        amount = Math.floor(Number(amount));
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }
        player.balance -= amount;
        const seed = crypto.randomBytes(16).toString('hex');
        const mn = player.mn = { active: true, bet: amount, mines, picks: [], seed, feedId: feedId() };
        feedAdd(room, stamp({ id: mn.feedId, game: 'mn', icon: GAME_ICONS.mn, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending' }));
        socket.emit('mn-started', { hash: crypto.createHash('sha256').update(seed).digest('hex') });
        broadcast(room);
    });
    socket.on('mn-pick', ({ roomCode, idx } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const mn = player && player.mn;
        if (!room || !mn || !mn.active || room.status === 'ended') return;
        idx = Math.floor(Number(idx)); if (!(idx >= 0 && idx < MN_N) || mn.picks.includes(idx)) return;
        const layout = mnLayout(mn.seed, mn.mines);
        if (layout.includes(idx)) {
            mn.active = false;
            player.stats.gamesPlayed++; player.stats.totalProfit -= mn.bet;
            if (mn.feedId) feedUpdate(room, mn.feedId, { status: 'lost', mult: null, win: 0, net: -mn.bet });
            socket.emit('mn-result', { safe: false, idx, picks: mn.picks.slice(), mines: layout, seed: mn.seed, message: '💥 BOUM ! Tu as marché sur une mine.' });
            return broadcast(room);
        }
        mn.picks.push(idx);
        if (mn.picks.length >= MN_N - mn.mines) return mnCashout(room, player, true); // toutes les cases sûres trouvées : encaissé d'office
        const mult = mnMult(mn.mines, mn.picks.length);
        if (mn.feedId) feedUpdate(room, mn.feedId, { mult: dm(player, mult) });
        socket.emit('mn-result', { safe: true, idx, multiplier: dm(player, mult) });
        broadcast(room);
    });
    socket.on('mn-cashout', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const mn = player && player.mn;
        if (!room || !mn || !mn.active || !mn.picks.length || room.status === 'ended') return;
        mnCashout(room, player, false);
    });

    /* ---------------- Just mixed (3 gobelets, RTP 98,5 %) ---------------- */
    socket.on('jm-start', ({ roomCode, amount } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        if (player.jm && player.jm.active) return;

        amount = Math.floor(Number(amount)); // entier > 0
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }

        player.balance -= amount;
        player.jm = { active: true, bet: amount };
        player.jm.feedId = feedId();
        feedAdd(room, stamp({ id: player.jm.feedId, game: 'jm', icon: GAME_ICONS.jm, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending' }));
        socket.emit('jm-started', { bet: amount });
        broadcast(room);
    });

    // Le gobelet vide est tiré par le serveur AU MOMENT DU CLIC : l'animation de mélange est purement visuelle
    socket.on('jm-pick', ({ roomCode, cup } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.jm || !player.jm.active || room.status === 'ended') return;
        cup = parseInt(cup);
        if (!(cup >= 0 && cup <= 2)) return;

        const empty = crypto.randomInt(3), win = cup !== empty, bet = player.jm.bet;
        let winnings = 0;
        if (win) { // arrondi aléatoire pondéré : l'espérance de gain reste exactement 98,5 %
            const raw = bet * JM_MULT, fl = Math.floor(raw);
            winnings = fl + (crypto.randomInt(1000000) / 1000000 < raw - fl ? 1 : 0);
        }
        winnings = tilt(player, player.jm.bet, winnings);
        player.balance += winnings;
        player.jm.active = false;
        player.stats.gamesPlayed++;
        if (win) player.stats.wins++;
        player.stats.totalProfit += winnings - bet;

        const sm = win ? shown(player, bet, winnings, JM_MULT) : JM_MULT;
        if (player.jm.feedId) feedUpdate(room, player.jm.feedId, { status: win ? 'won' : 'lost', mult: sm, win: winnings, net: winnings - bet });
        socket.emit('jm-result', { cup, empty, win, multiplier: sm, winnings,
            message: win ? `🎉 Gagné ! +${winnings} 🪙 (x${sm})` : '😬 Gobelet vide, perdu !' });
        broadcast(room);
    });

    /* ---------------- Arrows X (fléchettes sur cible, 3 modes, RTP exact 98,5 %) ---------------- */
    socket.on('ar-start', ({ roomCode, amount, mode, darts } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        if (player.ar && player.ar.active) return socket.emit('error-message', 'Lancer Arrows X déjà en cours !');
        if (!AR_MODES[mode]) return;

        amount = Math.floor(Number(amount)); // entier > 0 : mise PAR fléchette
        darts = Math.max(1, Math.min(20, Math.floor(Number(darts)) || 1)); // plusieurs fléchettes d'affilée (20 max)
        { const a2 = stakeOf(socket, player, amount * darts); if (a2 === null) return; }
        const unit = amount; amount = unit * darts; // mise totale débitée

        player.balance -= amount;
        const seed = crypto.randomBytes(16).toString('hex');
        player.ar = { active: true, bet: amount, unit, darts, mode, seed };
        player.ar.feedId = feedId(); // ligne "en cours" dans le panneau latéral (fléchette armée)
        feedAdd(room, stamp({ id: player.ar.feedId, game: 'ar', icon: GAME_ICONS.ar, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending' }));
        socket.emit('ar-started', { hash: crypto.createHash('sha256').update(seed).digest('hex') });
        broadcast(room);
    });

    socket.on('ar-throw', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const ar = player && player.ar;
        if (!room || !ar || !ar.active || room.status === 'ended') return;

        const cfg = AR_MODES[ar.mode];
        const t = buildArrowTable(ar.mode); // construit/cache la table normalisée (espérance garantie = AR_RTP)
        // u = HMAC(secretSeed,"arrow") -> [0,1) : provably fair, vérifiable à la révélation de la graine
        const u = parseInt(crypto.createHmac('sha256', ar.seed).update('arrow').digest('hex').slice(0, 13), 16) / 4503599627370496;
        // ⚠️ BUG CORRIGÉ (cause du RTP dément et des millions de pièces) : les "to" de la table sont des
        // probabilités CUMULÉES sur [0, hit] (ex. last.to ≈ 0,1685 en hard). L'ancien code comparait v∈[0,1]
        // à ces bornes non normalisées → dès que v > hit (~83 % des hits en hard) aucune ligne ne matchait et
        // le filet "mult = t[t.length-1].m" servait x500/x100/x20 quasi systématiquement (RTP simulé ≈ 7000 %).
        // On compare désormais u directement aux bornes cumulées : le trou [0, 1-hit] avant first.from = RATÉ (x0).
        // u_j = HMAC(graine, "arrow") pour la 1re fléchette, puis "arrow:1", "arrow:2"… pour les suivantes
        const throws = []; let rawSum = 0;
        for (let j = 0; j < ar.darts; j++) {
            const uj = j === 0 ? u : parseInt(crypto.createHmac('sha256', ar.seed).update('arrow:' + j).digest('hex').slice(0, 13), 16) / 4503599627370496;
            let m = 0; for (let i = 0; i < t.length; i++) { if (uj <= t[i].to) { m = t[i].m; break; } }
            const w = m > 0 ? weightedRound(ar.unit * m) : 0; rawSum += w; throws.push({ multiplier: m, success: m > 0, winnings: w, u: uj.toFixed(10) });
        }
        const winnings = tilt(player, ar.bet, rawSum), hits = throws.filter(x => x.success).length, hit = winnings > 0;
        if (winnings > 0) player.balance += winnings;
        const scale = rawSum > 0 ? winnings / rawSum : 1; throws.forEach(x => { x.winnings = Math.round(x.winnings * scale); }); // gains par fléchette cohérents avec le total versé
        ar.active = false;
        player.stats.gamesPlayed += ar.darts;
        if (winnings > ar.bet) player.stats.wins++;
        player.stats.totalProfit += winnings - ar.bet;
        const tm = shown(player, ar.bet, winnings, round2(rawSum / ar.bet));
        if (ar.feedId) feedUpdate(room, ar.feedId, { status: winnings >= ar.bet ? 'won' : 'lost', mult: hit ? tm : 0, win: winnings, net: winnings - ar.bet });
        const one = throws[0];
        socket.emit('ar-result', {
            success: one.success, multiplier: one.multiplier, winnings, seed: ar.seed, u: one.u, mode: ar.mode, bet: ar.bet, darts: ar.darts, throws, total: winnings, totalMult: tm,
            message: ar.darts === 1 ? (hit ? `🎯 Dans le mille ! x${tm} → +${winnings} 🪙` : '💨 Raté ! La fléchette tombe à côté de la cible…')
                : `🎯 ${hits}/${ar.darts} dans la cible · total ${winnings} 🪙 (x${tm})`
        });
        broadcast(room);
    });

    /* ---------------- Roulette européenne (probabilités classiques, plein x36, edge naturel du 0) ---------------- */
    // player.rl = { active, bets:[{kind,sel,amount}], total } ; les mises sont débitées jeton par jeton puis remboursées au tour
    socket.on('rl-clear', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.rl || player.rl.active) return;
        player.balance += player.rl.total;
        player.rl = { active: false, bets: [], total: 0 };
        broadcast(room);
    });

    socket.on('rl-bet', ({ roomCode, kind, sel, amount } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        if (player.rl && player.rl.active) return socket.emit('error-message', 'Tirage en cours, attends la fin du tour !');
        if (!RL_BETS[kind]) return;
        sel = parseInt(sel);
        if (kind === 'straight' && !(sel >= 0 && sel <= 36)) return;
        if (kind === 'dozen' && !(sel >= 1 && sel <= 3)) return;
        if (kind === 'column' && !(sel >= 1 && sel <= 3)) return;
        if (!['straight', 'dozen', 'column'].includes(kind)) sel = 0;

        amount = Math.floor(Number(amount)); // entier > 0
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }

        if (!player.rl) player.rl = { active: false, bets: [], total: 0 };
        player.balance -= amount;
        player.rl.total += amount;
        player.rl.bets.push({ kind, sel, amount });
        broadcast(room);
    });

    // vote « arrêter la partie » : la partie s'arrête quand TOUS les joueurs connectés ont voté oui (un joueur seul peut donc arrêter)
    socket.on('vote-stop', ({ roomCode, vote } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !sessionLive(room)) return;
        if (!room.stopVotes) room.stopVotes = new Set();
        if (vote) room.stopVotes.add(player.name); else room.stopVotes.delete(player.name);
        const voters = room.players.filter(p => p.connected);
        if (voters.length && voters.every(p => room.stopVotes.has(p.name))) stopRoomSoon(room, 'Tout le monde a voté : la partie s\'arrête.', () => {
            const v = room.players.filter(p => p.connected); return v.length > 0 && room.stopVotes && v.every(p => room.stopVotes.has(p.name));
        });
        broadcast(room);
    });

    // annule le dernier jeton posé (remboursé)
    socket.on('rl-undo', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.rl || player.rl.active || room.status === 'ended') return;
        const b = player.rl.bets.pop();
        if (!b) return;
        player.rl.total -= b.amount; player.balance += b.amount;
        broadcast(room);
    });

    // La roue tourne RL_SPIN_MIN..RL_SPIN_MAX ms (durée tirée au hasard par le serveur à chaque tour) ; le résultat n'est
    // crédité / diffusé (solde, "Paris en direct", classement) qu'une fois la bille tombée, pour ne rien dévoiler avant la fin.
    const RL_SPIN_MIN = 3000, RL_SPIN_MAX = 6000, RL_REVEAL_MS = 1000;
    socket.on('rl-spin', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const rl = player && player.rl;
        if (!room || !rl || rl.active || !rl.bets.length || room.status === 'ended') return;

        rl.active = true;
        const spinId = rl.spinId = crypto.randomBytes(6).toString('hex');
        const stake = rl.total;
        // ligne "en cours" dans le panneau latéral : une par table de jetons (le tour est en train de tourner)
        if (!hasPending(room, player.name, 'rl')) { // une seule ligne "en cours" par table de jetons
            rl.feedId = feedId();
            feedAdd(room, stamp({ id: rl.feedId, game: 'rl', icon: GAME_ICONS.rl, name: player.name, bet: stake, mult: null, win: 0, net: -stake, status: 'pending' }));
        }
        const seed = crypto.randomBytes(16).toString('hex');
        const publicHash = crypto.createHash('sha256').update(seed).digest('hex');
        const u = parseInt(crypto.createHmac('sha256', seed).update('roulette').digest('hex').slice(0, 13), 16) / 4503599627370496;
        const num = Math.floor(u * 37); // 0..36 équiprobables : roue européenne réelle (un seul zéro)
        const duration = RL_SPIN_MIN + crypto.randomInt(RL_SPIN_MAX - RL_SPIN_MIN + 1); // 3 à 6 secondes, au hasard
        broadcast(room); // la ligne "en cours" apparaît tout de suite
        socket.emit('rl-spin-start', { number: num, duration, publicHash });

        setTimeout(() => {
            // tour annulé entre-temps (déconnexion, fin de session) : la mise a déjà été remboursée, on ne fait rien
            if (!rl.active || rl.spinId !== spinId || room.status === 'ended') return;
            let rawReturn = 0;
            for (const b of rl.bets) if (rlWin(b.kind, num, b.sel)) rawReturn += b.amount * RL_BETS[b.kind];
            const winnings = tilt(player, rl.total, weightedRound(rawReturn));
            player.balance += winnings;

            const betsSnapshot = rl.bets.slice(); // copié avant reset : le client s'en sert pour le bouton "Rejouer"
            rl.active = false; rl.bets = []; rl.total = 0;
            player.stats.gamesPlayed++;
            if (winnings > 0) player.stats.wins++;
            player.stats.totalProfit += winnings - stake;

            feedUpdate(room, rl.feedId, { status: winnings > 0 ? 'won' : 'lost', mult: stake > 0 ? Math.round(winnings / stake * 100) / 100 : 0, win: winnings, net: winnings - stake });
            const cname = rlColor(num) === 'green' ? 'vert' : rlColor(num) === 'red' ? 'rouge' : 'noir';
            const net = winnings - stake;
            socket.emit('rl-result', { number: num, color: rlColor(num), stake, winnings, seed, publicHash, betsSnapshot,
                message: winnings > 0 ? `🎉 Le ${num} ${cname} ! Tu récupères ${winnings} 🪙 (${net >= 0 ? '+' : ''}${net} net)` : `😬 Le ${num} ${cname}… perdu !` });
            broadcast(room);
        }, duration + RL_REVEAL_MS);
    });

    /* ---------------- Blackjack (règles : blackjack.js) ---------------- */
    // player.bj = { seed, round (état de la main, voir blackjack.js), feedId }
    // (bjPublic est défini au niveau module : publicRoom() l'utilise aussi)

    const bjGet = roomCode => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || room.status === 'ended') return {};
        const bj = player.bj;
        if (!bj || !bj.round || bj.round.phase === 'done') return {};
        return { room, player, bj, r: bj.round };
    };

    socket.on('bj-deal', ({ roomCode, amount } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        if (bjPending(player.bj)) return socket.emit('error-message', 'Main déjà en cours !');

        amount = Math.floor(Number(amount)); // entier > 0
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }

        player.balance -= amount;
        // mélange provably fair : Fisher-Yates piloté par HMAC(seed, "shuffle:i") — la graine est révélée à la fin de la main
        const seed = crypto.randomBytes(16).toString('hex');
        const deck = BJ_DECK.slice();
        for (let i = deck.length - 1; i > 0; i--) {
            const j = parseInt(crypto.createHmac('sha256', seed).update('shuffle:' + i).digest('hex').slice(0, 8), 16) % (i + 1);
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        player.bj = { seed, round: BJ.deal(deck, amount), feedId: feedId() };
        // ligne "en cours" dans le panneau latéral (une par main) ; bjSettle la clôturera avec le résultat
        feedAdd(room, stamp({ id: player.bj.feedId, game: 'bj', icon: GAME_ICONS.bj, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending' }));
        bjAfter(room, player);
    });

    const BJ_HINT = { player: 'À toi de jouer.', insurance: 'Le croupier montre un As : assurance ?' };
    // après chaque action : si la main est finie on règle, sinon on renvoie l'état au joueur
    function bjAfter(room, player, message) {
        const r = player.bj.round;
        if (r.phase === 'done') return bjSettle(room, player);
        broadcast(room);
        bjSend(room, player, { message: message || BJ_HINT[r.phase] || '' });
    }

    function bjSend(room, player, extra = {}) { // la graine est envoyée avec chaque état : le client l'affiche dès la donne
        socket.emit('bj-state', Object.assign({ state: bjPublic(player.bj, player.balance), seed: player.bj ? player.bj.seed : null }, extra));
    }

    socket.on('bj-insurance', ({ roomCode, take } = {}) => {
        const { room, player, r } = bjGet(roomCode);
        if (!r || r.phase !== 'insurance') return;
        if (take) {
            const cost = BJ.insuranceCost(r);
            if (player.balance < cost) return socket.emit('error-message', 'Solde insuffisant pour l\'assurance !');
            player.balance -= cost;
        }
        BJ.insure(r, !!take);
        bjAfter(room, player, take ? 'Assurance prise.' : 'Pas d\'assurance.');
    });

    socket.on('bj-hit', ({ roomCode } = {}) => {
        const { room, player, r } = bjGet(roomCode);
        if (!r || r.phase !== 'player') return;
        BJ.hit(r);
        bjAfter(room, player);
    });

    socket.on('bj-stand', ({ roomCode } = {}) => {
        const { room, player, r } = bjGet(roomCode);
        if (!r || r.phase !== 'player') return;
        BJ.stand(r);
        bjAfter(room, player);
    });

    socket.on('bj-double', ({ roomCode } = {}) => {
        const { room, player, r } = bjGet(roomCode);
        if (!r || !BJ.canDouble(r)) return;
        const cost = r.hands[r.active].bet;
        if (player.balance < cost) return socket.emit('error-message', 'Solde insuffisant pour doubler !');
        player.balance -= cost;
        BJ.doubleDown(r);
        bjAfter(room, player);
    });

    socket.on('bj-split', ({ roomCode } = {}) => {
        const { room, player, r } = bjGet(roomCode);
        if (!r || !BJ.canSplit(r)) return;
        const cost = r.hands[r.active].bet;
        if (player.balance < cost) return socket.emit('error-message', 'Solde insuffisant pour séparer !');
        player.balance -= cost;
        BJ.split(r);
        bjAfter(room, player, 'Paire séparée : une carte par main.');
    });

    const BJ_TXT = { blackjack: 'Blackjack', win: 'gagné', push: 'égalité', lose: 'perdu', bust: 'sauté' };
    function bjSettle(room, player) {
        const bj = player.bj, r = bj.round, res = r.result;
        // seul un blackjack sur mise impaire donne un demi-jeton : arrondi tiré au sort, espérance exacte
        const winnings = tilt(player, res.committed, weightedRound(res.winnings));
        const committed = res.committed, net = winnings - committed;

        player.balance += winnings;
        player.stats.gamesPlayed++;
        if (net > 0) player.stats.wins++;
        player.stats.totalProfit += net;

        if (bj.feedId) feedUpdate(room, bj.feedId, { status: net > 0 ? 'won' : 'lost', mult: Math.round(winnings / committed * 100) / 100, win: winnings, net, bet: committed });
        bj.feedId = null;

        const ds = BJ.score(r.dealer).total;
        const parts = res.hands.map((h, i) => (res.hands.length > 1 ? `Main ${i + 1} : ` : '') + BJ_TXT[h.outcome]);
        if (res.insuranceStake) parts.push(res.insuranceWin ? 'assurance gagnée' : 'assurance perdue');
        const head = net > 0 ? `🎉 +${net} 🪙` : net === 0 ? '🤝 Mise rendue' : `😬 ${net} 🪙`;
        const message = `${head} — ${parts.join(' · ')}` + (res.dealerBJ ? ' (blackjack du croupier)' : ds > 21 ? ' (le croupier saute)' : ` (croupier : ${ds})`);

        socket.emit('bj-result', { net, winnings, committed, message, seed: bj.seed,
            insurance: { stake: res.insuranceStake, win: res.insuranceWin },
            state: bjPublic(bj, player.balance), outcomes: res.hands.map(h => h.outcome) });
        broadcast(room);
    }

    /* ---------------- Icefield (le Yéti avance de gauche à droite) ---------------- */
    socket.on('icefield-start-game', ({ roomCode, amount, cols } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        if (player.iceState && player.iceState.active) return socket.emit('error-message', 'Partie Icefield déjà en cours !');

        amount = Math.floor(Number(amount)); // entier > 0
        cols = Math.min(10, Math.max(2, parseInt(cols) || 3));
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }

        player.balance -= amount;
        const traps = [], multipliers = [];
        for (let i = 0; i < ICE_STEPS; i++) {
            traps.push(crypto.randomInt(cols));
            multipliers.push(calculateIcefieldMultiplier(cols, i + 1));
        }
        player.iceState = { cols, bet: amount, active: true, currentStep: 0, traps, multipliers, path: [], revealedTraps: [] };
        // ligne "en cours" dans le panneau latéral : elle se met à jour à chaque case glacée franchie
        if (!hasPending(room, player.name, 'ice')) {
            player.iceState.feedId = feedId();
            feedAdd(room, stamp({ id: player.iceState.feedId, game: 'ice', icon: GAME_ICONS.ice, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending' }));
        }
        broadcast(room);
    });

    socket.on('icefield-step', ({ roomCode, tileIndex } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const st = player && player.iceState;
        if (!room || !st || !st.active || room.status === 'ended') return;

        tileIndex = parseInt(tileIndex);
        if (!(tileIndex >= 0 && tileIndex < st.cols)) return;

        const trap = st.traps[st.currentStep];
        st.revealedTraps[st.currentStep] = trap;

        if (trap === tileIndex) {
            st.active = false; st.lost = true; st.revealedTraps = st.traps.slice(); // fin de traversée : on montre TOUS les pièges, même ceux qu'on n'a pas atteints
            player.stats.gamesPlayed++;
            player.stats.totalProfit -= st.bet;
            if (st.feedId) feedUpdate(room, st.feedId, { status: 'lost', mult: null, win: 0, net: -st.bet }); st.feedId = null;
            socket.emit('icefield-result', { success: false, message: "🧊 La glace s'est brisée !" });
        } else {
            st.path.push(tileIndex);
            st.currentStep++;
            if (st.currentStep >= ICE_STEPS) {
                const mult = st.multipliers[ICE_STEPS - 1], winnings = tilt(player, st.bet, Math.floor(st.bet * mult));
                player.balance += winnings;
                st.active = false; st.revealedTraps = st.traps.slice();
                player.stats.gamesPlayed++; player.stats.wins++; player.stats.totalProfit += winnings - st.bet;
                if (st.feedId) feedUpdate(room, st.feedId, { status: 'won', mult: shown(player, st.bet, winnings, mult), win: winnings, net: winnings - st.bet }); st.feedId = null;
                socket.emit('icefield-result', { success: true, completed: true, multiplier: shown(player, st.bet, winnings, mult), winnings, message: `🎉 Traversée réussie ! +${winnings} 🪙` });
            } else {
                if (st.feedId) feedUpdate(room, st.feedId, { mult: dm(player, st.multipliers[st.currentStep - 1]) }); // le Yéti avance : multiplicateur en direct
                socket.emit('icefield-result', { success: true, completed: false, step: st.currentStep });
            }
        }
        broadcast(room);
    });

    socket.on('icefield-cashout', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const st = player && player.iceState;
        if (!room || !st || !st.active || st.currentStep === 0 || room.status === 'ended') return;

        const mult = st.multipliers[st.currentStep - 1], winnings = tilt(player, st.bet, Math.floor(st.bet * mult));
        player.balance += winnings;
        st.active = false; st.revealedTraps = st.traps.slice(); // encaissé : on dévoile tous les pièges, y compris ceux des colonnes non franchies
        player.stats.gamesPlayed++; player.stats.wins++; player.stats.totalProfit += winnings - st.bet;
        const sm = shown(player, st.bet, winnings, mult);
        if (st.feedId) feedUpdate(room, st.feedId, { status: 'won', mult: sm, win: winnings, net: winnings - st.bet }); st.feedId = null;
        socket.emit('icefield-result', { success: true, cashout: true, multiplier: sm, winnings, message: `💰 Encaissé : +${winnings} 🪙 (x${sm})` });
        broadcast(room);
    });

    socket.on('disconnect', () => {
        console.log(`Connexion fermée : ${socket.id}`);

        for (const code of Object.keys(rooms)) {
            const room = rooms[code];
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx === -1) continue;

            const player = room.players[idx];


            // Pas de départ immédiat : un rafraîchissement ou une coupure réseau doit pouvoir reprendre la partie.
            // Le joueur reste dans la room (💤) ; s'il ne revient pas dans LEAVE_GRACE, on le règle et on le retire.
            player.connected = false;
            clearTimeout(player._leave);
            player._leave = setTimeout(() => finalizeLeave(code, player), LEAVE_GRACE);
            broadcast(room);
        }
    });
});

/* ------------------------------------------------------------------ */
/*  Logique de jeu                                                     */
/* ------------------------------------------------------------------ */

// Le flux "Historique des paris" (panneau latéral) a besoin d'un identifiant unique par socket :
// on le stocke sur la room au moment du pari, et processCashOut / game-crashed retrouvent le joueur avec.
const bySocket = (room, id) => room.players.find(p => p.id === id);

function processCashOut(player, sl, multiplier, room, idx) {
    const winnings = tilt(player, sl.bet, Math.floor(sl.bet * multiplier));
    player.balance += winnings;
    sl.cashed = true;
    sl.win = winnings - sl.bet;

    player.stats.gamesPlayed++;
    player.stats.wins++;
    player.stats.totalProfit += sl.win;

    if (sl.feedId) feedUpdate(room, sl.feedId, { status: 'won', mult: shown(player, sl.bet, winnings, Number(multiplier.toFixed(2))), win: winnings, net: winnings - sl.bet }); // ligne "en vol" -> ✅ gagné
    sl.feedId = null;

    io.to(crashRoom(room)).emit('player-cashed-out', { socketId: player.id, playerName: player.name, slot: idx, multiplier: shown(player, sl.bet, winnings, multiplier), winnings });
    broadcast(room);
}

/* ------------------------------------------------------------------ */
/*  Fin de partie anticipée : vote unanime + arrêt automatique         */
/* ------------------------------------------------------------------ */
const sessionLive = room => room.status !== 'waiting' && room.status !== 'ended' && !!room.timers.session;
// un joueur a de l'argent « dehors » (mise en cours dans un jeu) : il peut encore gagner, il n'est donc pas à zéro
const hasStake = p => p.slots.some(sl => (sl.bet > 0 && !sl.cashed) || sl.next > 0)
    || !!(p.iceState && p.iceState.active) || !!(p.jm && p.jm.active) || !!(p.cr && p.cr.active) || !!(p.ar && p.ar.active) || !!(p.mn && p.mn.active) || !!(p.hl && p.hl.active) || !!(p.sl && p.sl.active) || !!(p.pkQ && p.pkQ.length)
    || !!(p.rl && (p.rl.active || p.rl.bets.length)) || bjPending(p.bj) > 0;
const isBroke = p => p.balance <= 0 && !hasStake(p);
// Arrêt automatique : tout le monde à zéro, OU tous à zéro sauf un (rien à jouer entre soi).
// Un joueur seul continue tant qu'il lui reste des jetons ; il s'arrête seulement à zéro.
function autoStopReason(room) {
    const n = room.players.length; if (!n) return null;
    const alive = room.players.filter(p => !isBroke(p)).length;
    if (alive === 0) return n === 1 ? 'Tu n\'as plus de jetons : la partie s\'arrête.' : 'Tout le monde est à 0 : la partie s\'arrête.';
    if (n >= 2 && alive === 1) return 'Tous les autres joueurs sont à 0 : la partie s\'arrête.';
    return null;
}
function stopRoomSoon(room, message, check) { // petit délai pour laisser finir les animations (bille de roulette, etc.)
    if (room._stopPending) return;
    room._stopPending = true;
    io.to(room.code).emit('stop-notice', { message });
    setTimeout(() => {
        room._stopPending = false;
        if (sessionLive(room) && (!check || check())) endSession(room);
    }, 2500);
}
function checkAutoStop(room) {
    if (!sessionLive(room) || room._stopPending) return;
    const why = autoStopReason(room);
    if (why) return stopRoomSoon(room, why, () => !!autoStopReason(room));
    const v = room.players.filter(p => p.connected); // vote déjà unanime (ex. un joueur déconnecté ne bloque plus)
    if (room.stopVotes && v.length && v.every(p => room.stopVotes.has(p.name)))
        stopRoomSoon(room, 'Tout le monde a voté : la partie s\'arrête.', () => { const w = room.players.filter(p => p.connected); return w.length > 0 && !!room.stopVotes && w.every(p => room.stopVotes.has(p.name)); });
}

function startSessionTimer(room) {
    room.timers.session = setInterval(() => {
        room.timeRemaining--;
        io.to(room.code).emit('timer-update', { timeRemaining: Math.max(0, room.timeRemaining) });
        if (room.timeRemaining <= 0) endSession(room);
    }, 1000);
}

function endSession(room) {
    if (room.status === 'ended') return;
    clearRoomTimers(room);
    room.status = 'ended';
    room.stopVotes = null;

    room.players.forEach(p => { if (p.sl && p.sl.active) slFinish(room, p, 'collect'); }); // gains de machine à sous en attente : encaissés
    // on rembourse les mises en cours pour que la fin de session soit équitable
    room.players.forEach(p => p.slots.forEach(sl => {
        if (sl.bet > 0 && !sl.cashed) p.balance += sl.bet;
        if (sl.bet > 0 && !sl.cashed && sl.feedId) feedUpdate(room, sl.feedId, { status: 'void', net: 0, queued: false });
        if (sl.next > 0 && sl.nextFeedId) feedUpdate(room, sl.nextFeedId, { status: 'void', net: 0, queued: false });
        sl.feedId = null; sl.nextFeedId = null;
        sl.bet = 0;
        p.balance += sl.next;
        sl.next = 0;
    }));

    // une traversée Icefield en cours à la fin de la session est remboursée
    room.players.forEach(p => pkSettle(room, p));
    room.players.forEach(p => { if (p.iceState && p.iceState.active) { p.balance += p.iceState.bet; p.iceState.active = false; } if (p.jm && p.jm.active) { p.balance += p.jm.bet; p.jm.active = false; } if (p.cr && p.cr.active) { p.balance += p.cr.bet; p.cr.active = false; } });

    // les parties Arrows X, Roulette et Blackjack en cours à la fin de la session sont remboursées
    room.players.forEach(p => {
        if (p.ar && p.ar.active) { p.balance += p.ar.bet; p.ar.active = false; }
        if (p.mn && p.mn.active) { p.balance += p.mn.bet; p.mn.active = false; }
        if (p.hl && p.hl.active) { p.balance += p.hl.bet; p.hl.active = false; }
        if (p.rl && p.rl.active) { p.balance += p.rl.total; p.rl.active = false; p.rl.bets = []; p.rl.total = 0; }
        if (bjPending(p.bj)) { p.balance += p.bj.round.bet; p.bj.round.phase = 'done'; }
    });

    // Redistribution du pot : performance de chacun (solde final vs mise de départ), voir G.settlePot
    const settled = G.settlePot(room.players.map(p => ({ stake: p.stake, initial: p.initialBalance, final: p.balance })));
    const leaderboard = room.players.map((p, i) => ({
        name: p.name,
        stake: p.stake,
        initialBalance: p.initialBalance,
        finalBalance: p.balance,
        profit: p.balance - p.initialBalance,
        performance: settled.rows[i].perf,
        payout: settled.rows[i].payoutCents / 100,
        net: settled.rows[i].netCents / 100,
        netCents: settled.rows[i].netCents,
        stats: p.stats
    })).sort((a, b) => b.netCents - a.netCents || b.finalBalance - a.finalBalance);
    room.endedAt = Date.now();
    room.players.forEach(p => { const h = p.eqHist = p.eqHist || []; const last = h[h.length - 1]; if (last && Date.now() - last[0] < 700) last[1] = p.balance; else h.push([Date.now(), p.balance]); }); // dernier point de la courbe = solde final
    room.result = {
        charts: { t: Date.now(), players: room.players.map(p => ({ name: p.name, vip: !!ADMIN_USER && String(p.name).toLowerCase() === ADMIN_USER, initial: p.initialBalance, eq: p.balance, connected: true, pts: (p.eqHist || []).slice(-400), bets: pubBets(p), stats: p.stats })) },
        leaderboard,
        pot: settled.potCents / 100,
        transfers: G.settleTransfers(leaderboard).map(t => ({ from: t.from, to: t.to, amount: t.cents / 100 }))
    };

    io.to(room.code).emit('game-session-ended', room.result);

    // profils : on enregistre la session de chaque joueur qui a joué (un petit écrit par joueur) et on annonce les badges débloqués
    const bestBal = Math.max(...room.players.map(x => x.balance));
    room.players.forEach(p => {
        if (!p.account || !(p.stats.gamesPlayed > 0)) return;
        const ini = p.initialBalance || 1, pts = p.eqHist || [];
        const minPct = pts.reduce((m, q) => Math.min(m, (q[1] - ini) / ini * 100), 0);
        A.recordSession(p.account, {
            pct: (p.balance - ini) / ini * 100, final: p.balance, initial: ini, profit: settled.rows[room.players.indexOf(p)].netCents, minPct,
            champ: room.players.length >= 2 && p.balance === bestBal && room.players.filter(x => x.balance === bestBal).length === 1,
            g: p.stats.gamesPlayed, w: p.stats.wins, bm: p.bestMult || 0, gp: [...(p.gamesSeen || [])], msgs: p.msgs || 0
        }, Object.keys(G.GAME_ICONS)).then(list => {
            if (list.length) io.to(p.id).emit('badges-new', list);
            // XP de fin de session : base + parties jouées + bonus positif / victoire + badges débloqués
            const u = A.userRec(p.account); if (!u) return;
            const pct = (p.balance - ini) / ini * 100, champ = room.players.length >= 2 && p.balance === bestBal && room.players.filter(x => x.balance === bestBal).length === 1;
            const done = Q.event(u, { t: 'sess', pct, champ }); if (done.length) io.to(p.id).emit('q-done', done);
            const before = XPL.levelInfo(u.xp || 0).level;
            const gain = 20 + Math.min(40, Math.floor(p.stats.gamesPlayed / 3)) + (pct > 0 ? 15 : 0) + (champ ? 40 : 0) + list.length * 40;
            Q.grantXp(u, gain); A.save();
            io.to(p.id).emit('xp-gain', { gain, why: 'Session terminée', from: before, info: XPL.levelInfo(u.xp) });
            qPush(p.account, p.id);
        }).catch(e => console.error('profil :', e.message));
    });

    setTimeout(() => destroyRoom(room.code), ROOM_TTL_AFTER_END);
}

function startCrashLoop(room) {
    function runRound() {
        if (room.status === 'ended') return;

        room.status = 'betting';
        room.multiplier = 1.00;

        const roundData = generateProvablyFairRound();
        room.crashPoint = roundData.crashPoint;
        room.currentHash = roundData.publicHash;
        room.currentSecret = roundData.secretSeed;

        // les paris "préparés" deviennent les paris actifs de cette manche
        room.players.forEach(p => p.slots.forEach(sl => {
            sl.bet = sl.next; sl.auto = sl.next > 0 ? sl.nextAuto : 0;
            sl.next = 0; sl.nextAuto = 0; sl.cashed = false; sl.win = 0;
            sl.feedId = sl.nextFeedId || null; sl.nextFeedId = null; // la ligne « manche suivante » devient la ligne « en vol »
            if (sl.feedId) { const it = room.feed && room.feed.find(x => x.id === sl.feedId); if (it) it.queued = false; }
        }));

        let countdown = 5;
        io.to(crashRoom(room)).emit('betting-phase', { countdown, hash: room.currentHash, room: publicRoom(room) });

        room.timers.count = setInterval(() => {
            if (room.status === 'ended') return clearInterval(room.timers.count);
            countdown--;
            if (countdown > 0) {
                io.to(crashRoom(room)).emit('betting-countdown', { countdown });
            } else {
                clearInterval(room.timers.count);
                room.timers.count = null;
                startPlayingPhase();
            }
        }, 1000);
    }

    function startPlayingPhase() {
        if (room.status === 'ended') return;

        room.status = 'playing';
        io.to(crashRoom(room)).emit('playing-phase-started', publicRoom(room));

        const startTime = Date.now();

        room.timers.play = setInterval(() => {
            if (room.status === 'ended') return clearInterval(room.timers.play);

            const elapsedSeconds = (Date.now() - startTime) / 1000;
            room.multiplier = parseFloat(Math.max(1.00, Math.exp(0.07 * elapsedSeconds)).toFixed(2));

            // auto cash-out
            room.players.forEach(p => p.slots.forEach((sl, i) => {
                if (sl.bet > 0 && !sl.cashed && sl.auto > 0 && room.multiplier >= sl.auto && sl.auto <= room.crashPoint) {
                    processCashOut(p, sl, sl.auto, room, i);
                }
            }));

            if (room.multiplier >= room.crashPoint) {
                room.multiplier = room.crashPoint;
                clearInterval(room.timers.play);
                room.timers.play = null;
                room.status = 'crashed';

                room.history.unshift({
                    multiplier: room.crashPoint,
                    hash: room.currentHash,
                    secret: room.currentSecret,
                    time: new Date().toLocaleTimeString('fr-FR')
                });
                if (room.history.length > 50) room.history.pop();

                // crash : les lignes "en vol" du panneau latéral passent en ❌ perdu (le gain net = -mise)
                const lostIds = [];
                room.players.forEach(p => p.slots.forEach(sl => {
                    if (sl.bet > 0 && !sl.cashed) {
                        p.stats.gamesPlayed++; p.stats.totalProfit -= sl.bet;
                        if (sl.feedId) lostIds.push([sl.feedId, sl.bet]);
                    }
                    sl.bet = 0; sl.feedId = null; // slot réglé : plus de ligne "en vol" à poursuivre
                }));
                lostIds.forEach(([fid, bet]) => feedUpdate(room, fid, { status: 'lost', mult: Number(room.crashPoint.toFixed(2)), win: 0, net: -bet }));

                io.to(crashRoom(room)).emit('game-crashed', {
                    multiplier: room.crashPoint,
                    secret: room.currentSecret,
                    room: publicRoom(room, true)
                });

                room.timers.next = setTimeout(() => {
                    if (room.status === 'ended') return;
                    if (room.players.some(p => p.inCrash && p.connected)) runRound();
                    else room.crashIdle = true; // personne à la table : la boucle se met en pause
                }, 4000);
            } else {
                io.to(crashRoom(room)).emit('multiplier-update', { multiplier: room.multiplier });
            }
        }, 70);
    }

    room.runRound = runRound;
    runRound();
}

// Filet de sécurité : une erreur imprévue dans un handler est journalisée au lieu de tuer tout le serveur
// (sinon toutes les rooms freezent et les chronos s'arrêtent pour tout le monde).
process.on('uncaughtException', err => console.error('❌ uncaughtException :', err));
process.on('unhandledRejection', err => console.error('❌ unhandledRejection :', err));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Serveur prêt et lancé sur le port ${PORT}`);
});
