const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// index.html doit être dans le dossier "public/"
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const rooms = {};
const ROOM_TTL_AFTER_END = 10 * 60 * 1000; // la room est supprimée 10 min après la fin
const ALLOWED_DURATIONS = [1, 3, 5, 10, 15];

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
    if (critical >= 0.015) {
        const rtpFactor = 0.985;
        const adjustedCritical = Math.min(critical, 0.9999999);
        crashPoint = Math.floor((rtpFactor / (1 - adjustedCritical)) * 100) / 100;
        crashPoint = Math.max(1.01, crashPoint);
    }

    return { secretSeed, publicHash, crashPoint };
}

function newPlayer(socket, name, isAdmin) {
    return {
        id: socket.id,
        name: cleanName(name),
        balance: 1000,
        initialBalance: 1000,
        isAdmin,
        inGame: false,
        connected: true,
        bet: 0,
        nextBet: 0,
        autoCashOut: 0,
        nextAutoCashOut: 0,
        cashedOut: false,
        winAmount: 0,
        stats: { gamesPlayed: 0, wins: 0, totalProfit: 0 }
    };
}

/*
 * IMPORTANT : on n'envoie JAMAIS l'objet "room" brut aux clients.
 *  1) il contient des timers (setInterval) => structure circulaire => Socket.IO plante
 *     (c'est LA cause du "rien ne marche" quand la partie démarre)
 *  2) il contient crashPoint et currentSecret => les joueurs pourraient tricher
 */
function publicRoom(room) {
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
            balance: p.balance,
            isAdmin: p.isAdmin,
            inGame: p.inGame,
            connected: p.connected,
            bet: p.bet,
            nextBet: p.nextBet,
            autoCashOut: p.autoCashOut,
            cashedOut: p.cashedOut,
            winAmount: p.winAmount,
            stats: p.stats
        })),
        history: room.history
    };
}

function broadcast(room) {
    io.to(room.code).emit('update-room', publicRoom(room));
}

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
    delete rooms[code];
}

function findPlayer(socket, roomCode) {
    const room = rooms[String(roomCode || '').toUpperCase()];
    if (!room) return {};
    const player = room.players.find(p => p.id === socket.id);
    return { room, player };
}

/* ------------------------------------------------------------------ */
/*  Sockets                                                            */
/* ------------------------------------------------------------------ */

io.on('connection', (socket) => {
    console.log(`Connexion : ${socket.id}`);

    socket.on('create-room', ({ playerName, duration } = {}) => {
        const name = cleanName(playerName);
        if (!name) return socket.emit('error-message', 'Pseudo invalide !');

        const minutes = ALLOWED_DURATIONS.includes(parseInt(duration)) ? parseInt(duration) : 5;
        const durationInSeconds = minutes * 60;
        const roomCode = generateRoomCode();

        rooms[roomCode] = {
            code: roomCode,
            duration: durationInSeconds,
            timeRemaining: durationInSeconds,
            status: 'waiting',
            selectedGame: null,
            players: [newPlayer(socket, name, true)],
            multiplier: 1.00,
            crashPoint: 0,
            currentHash: '',
            currentSecret: '',
            loopStarted: false,
            timers: { session: null, count: null, play: null, next: null },
            history: []
        };

        socket.join(roomCode);
        socket.emit('room-created', { roomCode, room: publicRoom(rooms[roomCode]) });
    });

    socket.on('join-room', ({ roomCode, playerName } = {}) => {
        const code = String(roomCode || '').trim().toUpperCase();
        const room = rooms[code];
        const name = cleanName(playerName);

        if (!room) return socket.emit('error-message', "Cette room n'existe pas !");
        if (!name) return socket.emit('error-message', 'Pseudo invalide !');
        if (room.status === 'ended') return socket.emit('error-message', 'La session est terminée !');
        if (room.players.some(p => p.id === socket.id)) return;

        room.players.push(newPlayer(socket, name, false));
        socket.join(code);

        socket.emit('joined-success', publicRoom(room));
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
        room.selectedGame = String(gameName || 'Crash Out').slice(0, 40);
        io.to(room.code).emit('navigate-to-game', { gameName: room.selectedGame, room: publicRoom(room) });
    });

    socket.on('join-game-table', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player) return;
        if (room.status === 'waiting' || room.status === 'ended') return;

        player.inGame = true;
        broadcast(room);

        if (!room.loopStarted) {
            room.loopStarted = true;
            startSessionTimer(room);
            startCrashLoop(room);
        }
    });

    socket.on('place-bet', ({ roomCode, amount, autoCashOut } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || !player.inGame || room.status === 'ended') return;

        amount = Math.floor(Number(amount));
        if (!Number.isFinite(amount) || amount <= 0) return socket.emit('error-message', 'Montant invalide !');
        if (player.balance < amount) return socket.emit('error-message', 'Solde insuffisant !');

        const parsedAuto = parseFloat(autoCashOut);
        const auto = parsedAuto >= 1.01 ? parsedAuto : 0;

        if (room.status === 'betting') {
            if (player.bet > 0) return; // pari déjà placé (annule-le avant d'en refaire un)
            player.balance -= amount;
            player.bet = amount;
            player.autoCashOut = auto;
            player.cashedOut = false;
            player.winAmount = 0;
        } else if (room.status === 'playing' || room.status === 'crashed') {
            if (player.nextBet > 0) return;
            player.balance -= amount;
            player.nextBet = amount;
            player.nextAutoCashOut = auto;
        } else {
            return;
        }

        broadcast(room);
    });

    socket.on('cancel-next-bet', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player) return;

        if (room.status === 'betting' && player.bet > 0) {
            player.balance += player.bet;
            player.bet = 0;
            player.autoCashOut = 0;
        } else if ((room.status === 'playing' || room.status === 'crashed') && player.nextBet > 0) {
            player.balance += player.nextBet;
            player.nextBet = 0;
            player.nextAutoCashOut = 0;
        }

        broadcast(room);
    });

    socket.on('cash-out', ({ roomCode } = {}) => {
        const { room, player } = findPlayer(socket, roomCode);
        if (!room || !player || room.status !== 'playing') return;
        if (player.bet <= 0 || player.cashedOut) return;

        processCashOut(player, room.multiplier, room);
    });

    socket.on('disconnect', () => {
        console.log(`Connexion fermée : ${socket.id}`);

        for (const code of Object.keys(rooms)) {
            const room = rooms[code];
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx === -1) continue;

            const player = room.players[idx];
            if (room.status === 'waiting' || room.status === 'choosing_game') {
                room.players.splice(idx, 1);
            } else {
                player.connected = false; // on garde le joueur pour le classement final
            }

            if (!room.players.some(p => p.connected)) {
                destroyRoom(code);
                continue;
            }

            if (player.isAdmin) {
                player.isAdmin = false;
                const next = room.players.find(p => p.connected);
                if (next) next.isAdmin = true;
            }
            broadcast(room);
        }
    });
});

/* ------------------------------------------------------------------ */
/*  Logique de jeu                                                     */
/* ------------------------------------------------------------------ */

function processCashOut(player, multiplier, room) {
    const winnings = Math.floor(player.bet * multiplier);
    player.balance += winnings;
    player.cashedOut = true;
    player.winAmount = winnings - player.bet;

    player.stats.gamesPlayed++;
    player.stats.wins++;
    player.stats.totalProfit += player.winAmount;

    io.to(room.code).emit('player-cashed-out', {
        socketId: player.id,
        playerName: player.name,
        multiplier,
        winnings
    });
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
    room.players.forEach(p => {
        if (p.bet > 0 && !p.cashedOut) p.balance += p.bet;
        p.bet = 0;
        p.balance += p.nextBet;
        p.nextBet = 0;
    });

    const leaderboard = room.players
        .map(p => ({
            name: p.name,
            finalBalance: p.balance,
            profit: p.balance - p.initialBalance,
            stats: p.stats
        }))
        .sort((a, b) => b.finalBalance - a.finalBalance);

    io.to(room.code).emit('game-session-ended', { leaderboard });

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
        room.players.forEach(p => {
            p.bet = p.nextBet;
            p.autoCashOut = p.nextBet > 0 ? p.nextAutoCashOut : 0;
            p.nextBet = 0;
            p.nextAutoCashOut = 0;
            p.cashedOut = false;
            p.winAmount = 0;
        });

        let countdown = 5;
        io.to(room.code).emit('betting-phase', { countdown, hash: room.currentHash, room: publicRoom(room) });

        room.timers.count = setInterval(() => {
            if (room.status === 'ended') return clearInterval(room.timers.count);
            countdown--;
            if (countdown > 0) {
                io.to(room.code).emit('betting-countdown', { countdown });
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
        io.to(room.code).emit('playing-phase-started', publicRoom(room));

        const startTime = Date.now();

        room.timers.play = setInterval(() => {
            if (room.status === 'ended') return clearInterval(room.timers.play);

            const elapsedSeconds = (Date.now() - startTime) / 1000;
            room.multiplier = parseFloat(Math.max(1.00, Math.exp(0.07 * elapsedSeconds)).toFixed(2));

            // auto cash-out
            room.players.forEach(p => {
                if (p.bet > 0 && !p.cashedOut && p.autoCashOut > 0 && room.multiplier >= p.autoCashOut
                    && p.autoCashOut <= room.crashPoint) {
                    processCashOut(p, p.autoCashOut, room);
                }
            });

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

                room.players.forEach(p => {
                    if (p.bet > 0 && !p.cashedOut) {
                        p.stats.gamesPlayed++;
                        p.stats.totalProfit -= p.bet;
                    }
                    p.bet = 0;
                });

                io.to(room.code).emit('game-crashed', {
                    multiplier: room.crashPoint,
                    secret: room.currentSecret,
                    room: publicRoom(room)
                });

                room.timers.next = setTimeout(() => {
                    if (room.status !== 'ended') runRound();
                }, 4000);
            } else {
                io.to(room.code).emit('multiplier-update', { multiplier: room.multiplier });
            }
        }, 70);
    }

    runRound();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Serveur prêt et lancé sur le port ${PORT}`);
});
