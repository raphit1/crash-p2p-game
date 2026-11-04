const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const crypto = require('crypto');
const A = require('./accounts');
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

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
        code = 'CRASH-';
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
const STAKE_ERR = `Mise invalide : entre ${G.STAKE_MIN_EUR} € et ${G.STAKE_MAX_EUR} €.`;

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
                currentStep: p.iceState.currentStep, path: p.iceState.path,
                revealedTraps: p.iceState.revealedTraps, multipliers: p.iceState.multipliers
            } : null,
            jm: p.jm ? { active: p.jm.active, bet: p.jm.bet } : null,
            cr: p.cr ? { active: p.cr.active, bet: p.cr.bet, mode: p.cr.mode, step: p.cr.step } : null,
            ar: p.ar ? { active: p.ar.active, bet: p.ar.bet, mode: p.ar.mode } : null,
            rl: p.rl ? { active: p.rl.active, total: p.rl.total, bets: p.rl.bets.map(b => ({ kind: b.kind, sel: b.sel, amount: b.amount })) } : null,
            bj: p.bj ? bjPublic(p.bj, p.balance) : null,
            stats: p.stats
        })),
        history: full ? room.history : undefined // l'historique n'est envoyé qu'aux joueurs de la table Crash
    };
}

// Les changements sont regroupés : au plus un "update-room" toutes les 60 ms par room (petit serveur = moins de CPU et de bande passante)
function broadcast(room) {
    if (room._bt) return;
    room._bt = setTimeout(() => {
        room._bt = null;
        io.to(room.code).emit('update-room', publicRoom(room));
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
function feedAdd(room, entry) {
    if (!room.feed) room.feed = [];
    room.feed.unshift(entry);
    if (room.feed.length > 40) room.feed.length = 40;
    io.to(room.code).emit('bet-feed', room.feed.slice(0, 30));
}
function feedUpdate(room, id, patch) { // met à jour une ligne existante (ex. poulet qui avance, crash en vol)
    if (!room.feed) return;
    const it = room.feed.find(x => x.id === id);
    if (!it) return;
    Object.assign(it, patch);
    io.to(room.code).emit('bet-feed', room.feed.slice(0, 30));
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
    const room = rooms[String(roomCode || '').toUpperCase()];
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

function settlePending(room, player) { // règle les parties en cours d'un joueur qui part pour de bon
            // les lignes "en cours" du panneau latéral se règlent proprement à la déconnexion (pas de ligne bloquée en pending)
            if (player.cr && player.cr.active) {
                if (player.cr.feedId) feedUpdate(room, player.cr.feedId, { status: 'lost', win: 0, net: -player.cr.bet });
                player.cr.active = false;
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
        return true;
    }
    socket.emit('resumed', { room: publicRoom(room), started: room.status !== 'waiting' });
    socket.emit('bet-feed', (room.feed || []).slice(0, 30));
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
    const authOk = (name, token) => { socket.data.user = name; socket.data.token = token; socket.emit('auth-ok', { name, token }); resumeRoom(socket, name); };
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
    socket.on('auth-logout', () => { A.logout(socket.data.token); socket.data.user = null; socket.data.token = null; });

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
        const code = String(roomCode || '').trim().toUpperCase();
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
        socket.emit('bet-feed', (room.feed || []).slice(0, 30));
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
            if (sl.next > 0) { player.balance += sl.next; sl.next = 0; sl.nextAuto = 0; }
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
            if (!hasPending(room, player.name, 'crash')) {
                sl.feedId = feedId();
                feedAdd(room, stamp({ id: sl.feedId, game: 'crash', icon: GAME_ICONS.crash, name: player.name, bet: amount, mult: null, win: 0, net: -amount, status: 'pending' }));
            }
        } else if (room.status === 'playing' || room.status === 'crashed') {
            if (sl.next > 0) return;
            sl.next = amount; sl.nextAuto = auto;
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
        else if ((room.status === 'playing' || room.status === 'crashed') && sl.next > 0) { player.balance += sl.next; sl.next = 0; sl.nextAuto = 0; }
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
                const winnings = weightedRound(cr.bet * mult);
                player.balance += winnings;
                cr.active = false;
                player.stats.gamesPlayed++; player.stats.wins++; player.stats.totalProfit += winnings - cr.bet;
                if (cr.feedId) feedUpdate(room, cr.feedId, { status: 'won', mult, win: winnings, net: winnings - cr.bet });
                socket.emit('cr-result', { success: true, completed: true, step: k, multiplier: mult, winnings, seed: cr.seed, message: `🥚 Œuf d'or ! +${winnings} 🪙 (x${mult})` });
            } else {
                if (cr.feedId) feedUpdate(room, cr.feedId, { mult }); // le poulet avance : multiplicateur en direct
                socket.emit('cr-result', { success: true, completed: false, step: k, multiplier: mult });
            }
        }
        broadcast(room);
    });

    socket.on('cr-cashout', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const cr = player && player.cr;
        if (!room || !cr || !cr.active || cr.step === 0 || room.status === 'ended') return;

        const mult = crMultiplier(cr.mode, cr.step), winnings = weightedRound(cr.bet * mult);
        player.balance += winnings;
        cr.active = false;
        player.stats.gamesPlayed++; player.stats.wins++; player.stats.totalProfit += winnings - cr.bet;
        if (cr.feedId) feedUpdate(room, cr.feedId, { status: 'won', mult, win: winnings, net: winnings - cr.bet });
        socket.emit('cr-result', { success: true, cashout: true, step: cr.step, multiplier: mult, winnings, seed: cr.seed, message: `💰 Encaissé : +${winnings} 🪙 (x${mult})` });
        broadcast(room);
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
        player.balance += winnings;
        player.jm.active = false;
        player.stats.gamesPlayed++;
        if (win) player.stats.wins++;
        player.stats.totalProfit += winnings - bet;

        if (player.jm.feedId) feedUpdate(room, player.jm.feedId, { status: win ? 'won' : 'lost', mult: JM_MULT, win: winnings, net: winnings - bet });
        socket.emit('jm-result', { cup, empty, win, multiplier: JM_MULT, winnings,
            message: win ? `🎉 Gagné ! +${winnings} 🪙 (x${JM_MULT})` : '😬 Gobelet vide, perdu !' });
        broadcast(room);
    });

    /* ---------------- Arrows X (fléchettes sur cible, 3 modes, RTP exact 98,5 %) ---------------- */
    socket.on('ar-start', ({ roomCode, amount, mode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;
        if (player.ar && player.ar.active) return socket.emit('error-message', 'Lancer Arrows X déjà en cours !');
        if (!AR_MODES[mode]) return;

        amount = Math.floor(Number(amount)); // entier > 0
        { const a2 = stakeOf(socket, player, amount); if (a2 === null) return; }

        player.balance -= amount;
        const seed = crypto.randomBytes(16).toString('hex');
        player.ar = { active: true, bet: amount, mode, seed };
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
        let mult = 0;
        for (let i = 0; i < t.length; i++) { if (u <= t[i].to) { mult = t[i].m; break; } }
        const hit = mult > 0, winnings = hit ? weightedRound(ar.bet * mult) : 0;
        if (hit) player.balance += winnings;
        ar.active = false;
        player.stats.gamesPlayed++;
        if (hit) player.stats.wins++;
        player.stats.totalProfit += winnings - ar.bet;

        if (ar.feedId) feedUpdate(room, ar.feedId, { status: hit ? 'won' : 'lost', mult: hit ? mult : 0, win: winnings, net: winnings - ar.bet });
        socket.emit('ar-result', {
            success: hit, multiplier: hit ? mult : 0, winnings, seed: ar.seed, u: u.toFixed(10), mode: ar.mode, bet: ar.bet,
            message: hit ? `🎯 Dans le mille ! x${mult} → +${winnings} 🪙` : '💨 Raté ! La fléchette tombe à côté de la cible…'
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
            const winnings = weightedRound(rawReturn);
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
        const winnings = weightedRound(res.winnings);
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
            st.active = false;
            player.stats.gamesPlayed++;
            player.stats.totalProfit -= st.bet;
            if (st.feedId) feedUpdate(room, st.feedId, { status: 'lost', mult: null, win: 0, net: -st.bet }); st.feedId = null;
            socket.emit('icefield-result', { success: false, message: "🧊 La glace s'est brisée !" });
        } else {
            st.path.push(tileIndex);
            st.currentStep++;
            if (st.currentStep >= ICE_STEPS) {
                const mult = st.multipliers[ICE_STEPS - 1], winnings = Math.floor(st.bet * mult);
                player.balance += winnings;
                st.active = false;
                player.stats.gamesPlayed++; player.stats.wins++; player.stats.totalProfit += winnings - st.bet;
                if (st.feedId) feedUpdate(room, st.feedId, { status: 'won', mult, win: winnings, net: winnings - st.bet }); st.feedId = null;
                socket.emit('icefield-result', { success: true, completed: true, multiplier: mult, winnings, message: `🎉 Traversée réussie ! +${winnings} 🪙` });
            } else {
                if (st.feedId) feedUpdate(room, st.feedId, { mult: st.multipliers[st.currentStep - 1] }); // le Yéti avance : multiplicateur en direct
                socket.emit('icefield-result', { success: true, completed: false, step: st.currentStep });
            }
        }
        broadcast(room);
    });

    socket.on('icefield-cashout', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        const st = player && player.iceState;
        if (!room || !st || !st.active || st.currentStep === 0 || room.status === 'ended') return;

        const mult = st.multipliers[st.currentStep - 1], winnings = Math.floor(st.bet * mult);
        player.balance += winnings;
        st.active = false;
        player.stats.gamesPlayed++; player.stats.wins++; player.stats.totalProfit += winnings - st.bet;
        if (st.feedId) feedUpdate(room, st.feedId, { status: 'won', mult, win: winnings, net: winnings - st.bet }); st.feedId = null;
        socket.emit('icefield-result', { success: true, cashout: true, multiplier: mult, winnings, message: `💰 Encaissé : +${winnings} 🪙 (x${mult})` });
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
    const winnings = Math.floor(sl.bet * multiplier);
    player.balance += winnings;
    sl.cashed = true;
    sl.win = winnings - sl.bet;

    player.stats.gamesPlayed++;
    player.stats.wins++;
    player.stats.totalProfit += sl.win;

    if (sl.feedId) feedUpdate(room, sl.feedId, { status: 'won', mult: Number(multiplier.toFixed(2)), win: winnings, net: winnings - sl.bet }); // ligne "en vol" -> ✅ gagné
    sl.feedId = null;

    io.to(crashRoom(room)).emit('player-cashed-out', { socketId: player.id, playerName: player.name, slot: idx, multiplier, winnings });
    broadcast(room);
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

    // on rembourse les mises en cours pour que la fin de session soit équitable
    room.players.forEach(p => p.slots.forEach(sl => {
        if (sl.bet > 0 && !sl.cashed) p.balance += sl.bet;
        sl.bet = 0;
        p.balance += sl.next;
        sl.next = 0;
    }));

    // une traversée Icefield en cours à la fin de la session est remboursée
    room.players.forEach(p => { if (p.iceState && p.iceState.active) { p.balance += p.iceState.bet; p.iceState.active = false; } if (p.jm && p.jm.active) { p.balance += p.jm.bet; p.jm.active = false; } if (p.cr && p.cr.active) { p.balance += p.cr.bet; p.cr.active = false; } });

    // les parties Arrows X, Roulette et Blackjack en cours à la fin de la session sont remboursées
    room.players.forEach(p => {
        if (p.ar && p.ar.active) { p.balance += p.ar.bet; p.ar.active = false; }
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
    room.result = {
        leaderboard,
        pot: settled.potCents / 100,
        transfers: G.settleTransfers(leaderboard).map(t => ({ from: t.from, to: t.to, amount: t.cents / 100 }))
    };

    io.to(room.code).emit('game-session-ended', room.result);

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
