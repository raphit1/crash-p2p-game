const express = require('express');
const http = http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'CRASH-';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function generateProvablyFairRound() {
    const secretSeed = crypto.randomBytes(16).toString('hex');
    const publicHash = crypto.createHash('sha256').update(secretSeed).digest('hex');

    const seedInt = parseInt(publicHash.slice(0, 13), 16);
    const maxVal = 4503599627370496;
    const critical = seedInt / maxVal;

    let crashPoint = 1.00;
    if (critical < 0.015) {
        crashPoint = 1.00;
    } else {
        const rtpFactor = 0.985;
        const adjustedCritical = Math.min(critical, 0.9999999);
        crashPoint = Math.floor((rtpFactor / (1 - adjustedCritical)) * 100) / 100;
        crashPoint = Math.max(1.01, crashPoint);
    }

    return { secretSeed, publicHash, crashPoint };
}

io.on('connection', (socket) => {
    console.log(`Connexion : ${socket.id}`);

    // Création de room avec durée personnalisée (en minutes reçues du client)
    socket.on('create-room', ({ playerName, duration }) => {
        const roomCode = generateRoomCode();
        const durationInSeconds = (parseInt(duration) || 5) * 60; // Par défaut 5 min si non spécifié

        rooms[roomCode] = {
            code: roomCode,
            duration: durationInSeconds,
            timeRemaining: durationInSeconds,
            status: 'waiting',
            selectedGame: null,
            players: [{
                id: socket.id,
                name: playerName,
                balance: 1000,
                initialBalance: 1000,
                isAdmin: true,
                inGame: false,
                bet: 0,
                nextBet: 0,
                autoCashOut: 0,
                cashedOut: false,
                winAmount: 0,
                stats: { gamesPlayed: 0, wins: 0, totalProfit: 0 }
            }],
            multiplier: 1.00,
            crashPoint: 0,
            currentHash: '',
            currentSecret: '',
            loopStarted: false,
            sessionTimer: null,
            history: []
        };

        socket.join(roomCode);
        socket.emit('room-created', { roomCode, room: rooms[roomCode] });
    });

    socket.on('join-room', ({ roomCode, playerName }) => {
        const room = rooms[roomCode];
        if (!room) return socket.emit('error-message', "Cette room n'existe pas !");
        if (room.status !== 'waiting') return socket.emit('error-message', "La partie a déjà commencé !");

        room.players.push({
            id: socket.id,
            name: playerName,
            balance: 1000,
            initialBalance: 1000,
            isAdmin: false,
            inGame: false,
            bet: 0,
            nextBet: 0,
            autoCashOut: 0,
            cashedOut: false,
            winAmount: 0,
            stats: { gamesPlayed: 0, wins: 0, totalProfit: 0 }
        });

        socket.join(roomCode);
        io.to(roomCode).emit('update-room', room);
        socket.emit('joined-success', room);
    });

    socket.on('launch-game-lobby', ({ roomCode, gameName }) => {
        const room = rooms[roomCode];
        if (!room) return;
        room.status = 'choosing_game';
        room.selectedGame = gameName;
        io.to(roomCode).emit('navigate-to-game', { gameName, room });
    });

    socket.on('join-game-table', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player) player.inGame = true;

        io.to(roomCode).emit('update-room', room);

        if (!room.loopStarted) {
            room.loopStarted = true;
            startSessionTimer(roomCode);
            startCrashLoop(roomCode);
        }
    });

    socket.on('place-bet', ({ roomCode, amount, autoCashOut }) => {
        const room = rooms[roomCode];
        if (!room || room.status === 'ended') return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.balance < amount) return socket.emit('error-message', "Solde insuffisant !");

        if (room.status === 'betting') {
            player.balance -= amount;
            player.bet += amount;
            player.autoCashOut = parseFloat(autoCashOut) || 0;
            player.cashedOut = false;
        } else if (room.status === 'playing' || room.status === 'crashed') {
            player.balance -= amount;
            player.nextBet += amount;
            player.autoCashOut = parseFloat(autoCashOut) || 0;
        }

        io.to(roomCode).emit('update-room', room);
    });

    socket.on('cancel-next-bet', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (room.status === 'betting' && player.bet > 0) {
            player.balance += player.bet;
            player.bet = 0;
        } else if ((room.status === 'playing' || room.status === 'crashed') && player.nextBet > 0) {
            player.balance += player.nextBet;
            player.nextBet = 0;
        }

        io.to(roomCode).emit('update-room', room);
    });

    socket.on('cash-out', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || room.status !== 'playing') return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.bet <= 0 || player.cashedOut) return;

        processCashOut(player, room.multiplier, roomCode);
    });

    socket.on('disconnect', () => {
        console.log(`Connexion fermée : ${socket.id}`);
    });
});

function processCashOut(player, multiplier, roomCode) {
    const winnings = Math.floor(player.bet * multiplier);
    player.balance += winnings;
    player.cashedOut = true;
    player.winAmount = winnings - player.bet;

    player.stats.gamesPlayed++;
    player.stats.wins++;
    player.stats.totalProfit += player.winAmount;

    io.to(roomCode).emit('player-cashed-out', { socketId: player.id, playerName: player.name, multiplier, winnings });
    io.to(roomCode).emit('update-room', rooms[roomCode]);
}

// Gestion du chronomètre global de la session de jeu
function startSessionTimer(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.sessionTimer = setInterval(() => {
        if (room.timeRemaining > 0) {
            room.timeRemaining--;
            io.to(roomCode).emit('timer-update', { timeRemaining: room.timeRemaining });
        } else {
            clearInterval(room.sessionTimer);
            room.status = 'ended';
            
            // Calcul du classement final
            const leaderboard = [...room.players].map(p => ({
                name: p.name,
                finalBalance: p.balance,
                profit: p.balance - p.initialBalance,
                stats: p.stats
            })).sort((a, b) => b.finalBalance - a.finalBalance);

            io.to(roomCode).emit('game-session-ended', { leaderboard, room });
        }
    }, 1000);
}

function startCrashLoop(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    function runRound() {
        if (room.status === 'ended') return;

        room.status = 'betting';
        room.multiplier = 1.00;

        const roundData = generateProvablyFairRound();
        room.crashPoint = roundData.crashPoint;
        room.currentHash = roundData.publicHash;
        room.currentSecret = roundData.secretSeed;

        room.players.forEach(p => {
            if (p.nextBet > 0) {
                p.bet = p.nextBet;
                p.nextBet = 0;
                p.cashedOut = false;
                p.winAmount = 0;
            } else {
                if (p.bet > 0 && !p.cashedOut) {
                    p.stats.gamesPlayed++;
                    p.stats.totalProfit -= p.bet;
                }
                p.bet = 0;
                p.cashedOut = false;
                p.winAmount = 0;
            }
        });

        let countdown = 5;
        io.to(roomCode).emit('betting-phase', { countdown, hash: room.currentHash, room });

        const countInterval = setInterval(() => {
            if (room.status === 'ended') {
                clearInterval(countInterval);
                return;
            }
            countdown--;
            if (countdown > 0) {
                io.to(roomCode).emit('betting-countdown', { countdown });
            } else {
                clearInterval(countInterval);
                startPlayingPhase();
            }
        }, 1000);
    }

    function startPlayingPhase() {
        if (room.status === 'ended') return;

        room.status = 'playing';
        io.to(roomCode).emit('playing-phase-started', room);

        const startTime = Date.now();

        const playInterval = setInterval(() => {
            if (room.status === 'ended') {
                clearInterval(playInterval);
                return;
            }

            const elapsedSeconds = (Date.now() - startTime) / 1000;
            room.multiplier = parseFloat(Math.max(1.00, Math.exp(0.07 * elapsedSeconds)).toFixed(2));

            room.players.forEach(p => {
                if (p.bet > 0 && !p.cashedOut && p.autoCashOut > 0 && room.multiplier >= p.autoCashOut) {
                    processCashOut(p, p.autoCashOut, roomCode);
                }
            });

            if (room.multiplier >= room.crashPoint) {
                room.multiplier = room.crashPoint;
                clearInterval(playInterval);
                
                if (room.status !== 'ended') {
                    room.status = 'crashed';
                }
                
                room.history.unshift({
                    multiplier: room.crashPoint,
                    hash: room.currentHash,
                    secret: room.currentSecret,
                    time: new Date().toLocaleTimeString()
                });
                if (room.history.length > 50) room.history.pop();

                room.players.forEach(p => {
                    if (p.bet > 0 && !p.cashedOut) {
                        p.stats.gamesPlayed++;
                        p.stats.totalProfit -= p.bet;
                        p.bet = 0; 
                    }
                });

                io.to(roomCode).emit('game-crashed', { multiplier: room.crashPoint, secret: room.currentSecret, room });

                setTimeout(() => {
                    if (room.status !== 'ended') {
                        runRound();
                    }
                }, 4000);
            } else {
                io.to(roomCode).emit('multiplier-update', { multiplier: room.multiplier });
            }
        }, 70);
    }

    runRound();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Serveur prêt et lancé sur le port ${PORT}`);
});
