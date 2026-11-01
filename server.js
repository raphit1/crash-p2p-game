<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Crash P2P - Arena Ultimate & Icefield</title>
    <style>
*{box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:radial-gradient(1100px 560px at 50% -8%,#3a1530 0,#150d22 45%,#07060d 100%) fixed;color:#efe9dc;margin:0;padding:18px;text-align:center;min-height:100vh}
.container{max-width:680px;margin:0 auto}
h1{font-size:32px;margin:6px 0 18px;letter-spacing:1px;background:linear-gradient(90deg,#f6dc9a,#d4a24c 50%,#f0707a);-webkit-background-clip:text;background-clip:text;color:transparent}
.card{background:linear-gradient(160deg,rgba(44,26,52,.9),rgba(18,12,28,.92));border:1px solid rgba(212,162,76,.22);padding:20px;border-radius:16px;margin-bottom:14px;text-align:left;box-shadow:0 12px 32px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06)}
input,select,button{display:block;width:100%;margin:10px 0;padding:13px;border-radius:10px;border:1px solid rgba(212,162,76,.2);font-size:16px;font-family:inherit}
input,select{background:#0d0814;color:#fff;outline:none;transition:border .2s,box-shadow .2s}
input:focus,select:focus{border-color:#d4a24c;box-shadow:0 0 0 3px rgba(212,162,76,.22)}
button{background:linear-gradient(180deg,#3fd68b,#17a057);color:#fff;font-weight:700;cursor:pointer;border:0;transition:transform .12s,filter .2s;box-shadow:0 6px 18px rgba(34,197,94,.28)}
button:hover{filter:brightness(1.1)}button:active{transform:scale(.97)}
button:disabled{opacity:.5;cursor:not-allowed;filter:none}
.hidden{display:none!important}
#game-screen, #icefield-screen{background:linear-gradient(180deg,#1a1026,#0c0814);border-radius:18px;padding:18px;border:1px solid rgba(212,162,76,.3);box-shadow:0 18px 50px rgba(0,0,0,.6)}

.history-container{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.history-bar{display:flex;gap:8px;overflow-x:auto;padding:4px 0;flex-grow:1;scrollbar-width:none}
.history-bar::-webkit-scrollbar{display:none}
.history-pill{padding:5px 12px;border-radius:999px;font-size:13px;font-weight:700;white-space:nowrap;cursor:pointer;display:inline-block;transition:transform .15s}
.history-pill:hover{transform:translateY(-2px)}
.hist-low{background:#12202e;color:#5cc8ff;border:1px solid #1f4660}
.hist-mid{background:#2a1244;color:#c58cff;border:1px solid #6b2fb3}
.hist-high{background:#43240c;color:#ffc24d;border:1px solid #b9771a;box-shadow:0 0 12px rgba(255,194,77,.35)}
.btn-history-more{background:#2b2036;color:#fff;width:auto;padding:6px 14px;font-size:14px;border-radius:999px;margin:0;box-shadow:none}
.provably-fair-box{background:#0d0814;padding:10px 14px;border-radius:10px;font-size:12px;color:#9a90ad;margin-bottom:10px;border:1px dashed rgba(212,162,76,.3);text-align:left;word-break:break-all}
.game-canvas-container{position:relative;aspect-ratio:500/260;background:radial-gradient(120% 120% at 0% 100%,#3b1236 0,#170c24 55%,#0a0610 100%);border-radius:14px;overflow:hidden;border:1px solid rgba(212,162,76,.35);box-shadow:inset 0 0 50px rgba(0,0,0,.65)}
.rays{position:absolute;left:0;bottom:0;width:0;height:0}
.rays::before{content:"";position:absolute;width:1000px;height:1000px;left:-500px;top:-500px;background:repeating-conic-gradient(rgba(255,214,140,.05) 0 7deg,transparent 7deg 14deg);animation:spin 60s linear infinite}
.game-svg{width:100%;height:100%;position:absolute;inset:0}
.multiplier-display{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:clamp(44px,13vw,80px);font-weight:900;font-variant-numeric:tabular-nums;color:#5cc8ff;text-shadow:0 0 24px currentColor,0 4px 12px rgba(0,0,0,.8);z-index:10;pointer-events:none;white-space:nowrap}
.crashed-text{color:#ff4d5e!important}

.bet-control-box{background:linear-gradient(180deg,#241731,#150d1f);padding:15px;border-radius:12px;margin-top:15px;border:1px solid rgba(212,162,76,.25)}
#actionBtn{font-size:18px;padding:16px;letter-spacing:.4px}
.btn-cashout{background:linear-gradient(180deg,#ffd45c,#e09a10)!important;color:#2a1700!important;font-size:20px!important;font-weight:900;box-shadow:0 0 0 0 rgba(251,191,36,.6);animation:pulse 1s infinite}
.btn-cancel{background:linear-gradient(180deg,#f0566a,#c02338)!important;margin-top:5px;box-shadow:none}
.quick-bet-row{display:flex;gap:6px;margin-bottom:8px}
.quick-btn{background:#2b2036;color:#e6d9bf;padding:8px 10px;font-size:13px;border-radius:8px;border:1px solid rgba(212,162,76,.2);flex:1;margin:0;box-shadow:none}
.quick-btn:hover{background:#3a2b49}
.stats-badge{background:#0d0814;padding:10px;border-radius:10px;font-size:13px;margin-top:10px;border:1px solid rgba(212,162,76,.2);display:flex;justify-content:space-around;gap:6px;flex-wrap:wrap}
.text-green{color:#3fd68b;font-weight:700}.text-red{color:#ff5d6e;font-weight:700}
.modal-overlay{position:fixed;inset:0;background:rgba(5,3,10,.88);backdrop-filter:blur(4px);display:flex;justify-content:center;align-items:center;z-index:9999}
.modal-content{background:linear-gradient(160deg,#2c1a34,#140d1d);padding:25px;border-radius:18px;width:90%;max-width:480px;max-height:80vh;overflow-y:auto;text-align:center;border:1px solid rgba(212,162,76,.4);box-shadow:0 20px 60px rgba(0,0,0,.7)}
.full-history-grid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-height:350px;overflow-y:auto;padding:15px 5px}
.game-thumbnail{background:linear-gradient(135deg,#8a1c3c,#d4562a 60%,#f0a63a);padding:22px;border-radius:14px;cursor:pointer;text-align:center;font-weight:800;font-size:20px;box-shadow:0 8px 24px rgba(212,86,42,.4);transition:transform .2s;margin-bottom:12px}
.game-thumbnail:hover{transform:scale(1.03)}
.game-thumbnail-ice{background:linear-gradient(135deg,#1e3a8a,#0284c7 60%,#38bdf8);box-shadow:0 8px 24px rgba(2,132,199,.4)}

/* --- STYLES ICEFIELD --- */
.icefield-grid{display:flex;flex-direction:column-reverse;gap:8px;margin:15px 0;background:#0d0814;padding:15px;border-radius:12px;border:1px solid rgba(56,189,248,.3)}
.ice-row{display:flex;gap:6px;justify-content:center}
.ice-tile{flex:1;height:45px;background:linear-gradient(180deg,#1e293b,#0f172a);border:1px solid #334155;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:18px;transition:all .15s}
.ice-tile.active-row{border-color:#38bdf8;box-shadow:0 0 10px rgba(56,189,248,.4);background:linear-gradient(180deg,#0284c7,#0369a1)}
.ice-tile.active-row:hover{transform:scale(1.04);filter:brightness(1.2)}
.ice-tile.success{background:linear-gradient(180deg,#22c55e,#15803d)!important;border-color:#4ade80!important}
.ice-tile.broken{background:linear-gradient(180deg,#ef4444,#b91c1c)!important;border-color:#f87171!important;animation:shake .4s}
.ice-tile.disabled{opacity:.4;cursor:not-allowed}
.ice-mult-badge{font-size:12px;color:#38bdf8;font-weight:bold;margin-bottom:4px;text-align:right}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes shake{0%,100%{transform:none}20%{transform:translate(-6px,3px)}40%{transform:translate(5px,-4px)}60%{transform:translate(-4px,-2px)}80%{transform:translate(3px,3px)}}
@keyframes pulse{50%{box-shadow:0 0 0 8px rgba(251,191,36,0)}}
ul{padding-left:20px;text-align:left}
</style>
</head>
<body>
    <div class="container">
        <h1>🚀 Crash P2P Arena</h1>

        <!-- 1. AUTH SCREEN -->
        <div id="auth-screen">
            <div class="card">
                <h3>Créer une Room</h3>
                <input type="text" id="createName" placeholder="Ton pseudo" maxlength="20">
                <label style="font-size: 14px; color: #94a3b8; display: block; margin-top: 8px;">Durée de la session :</label>
                <select id="duration">
                    <option value="1">1 minute (Test rapide)</option>
                    <option value="3">3 minutes</option>
                    <option value="5" selected>5 minutes</option>
                    <option value="10">10 minutes</option>
                    <option value="15">15 minutes</option>
                </select>
                <button onclick="createRoom()">Créer la partie</button>
            </div>
            <div class="card">
                <h3>Rejoindre une Room</h3>
                <input type="text" id="joinName" placeholder="Ton pseudo" maxlength="20">
                <input type="text" id="roomCodeInput" placeholder="Code de la room (ex: CRASH-XXXX)">
                <button onclick="joinRoom()">Rejoindre</button>
            </div>
        </div>

        <!-- 2. LOBBY PRINCIPAL -->
        <div id="lobby" class="hidden card">
            <h2>Salon d'attente</h2>
            <p>Code de la room : <b id="displayCode" style="color: #38bdf8;"></b></p>
            <h4>Joueurs connectés :</h4>
            <ul id="playersList"></ul>

            <div id="adminControls" class="hidden" style="margin-top: 20px;">
                <p style="color: #eab308; font-weight: bold;">Espace Admin : Choisis le jeu à ouvrir</p>
                <div class="game-thumbnail" onclick="launchGame('Crash Out')">
                    ✈️ Crash Out (Style Aviator)
                </div>
                <div class="game-thumbnail game-thumbnail-ice" onclick="launchGame('Icefield')">
                    🧊 Icefield (Traversée de Glace)
                </div>
            </div>

            <div id="playerWaitingGame" class="hidden" style="margin-top: 20px; text-align: center; color: #94a3b8;">
                <p>L'administrateur va bientôt lancer un jeu...</p>
            </div>
        </div>

        <!-- 3. SALON DE SÉLECTION DU JEU -->
        <div id="game-lobby-screen" class="hidden card" style="text-align: center;">
            <h2>🎮 Salon des Jeux</h2>
            <p>Jeu ouvert par l'hôte : <b id="gameTitleName" style="color: #c084fc;"></b></p>
            <div class="game-thumbnail" style="margin: 20px auto; max-width: 300px;" onclick="joinGameTable()">
                Entrer dans la table 🚀
            </div>
        </div>

        <!-- 4. ÉCRAN DE JEU AVIATOR PRO -->
        <div id="game-screen" class="hidden">
            <div style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #334155;">
                <span style="font-size: 14px; font-weight: bold; color: #eab308;">⏳ Temps restant : <span class="sessionTimerDisplay">--:--</span></span>
                <button id="musicBtn" class="btn-history-more" onclick="toggleMusic()" title="Musique on/off">🎵</button>
                <span style="font-size: 14px; color: #22c55e; font-weight: bold;">Solde : <span class="playerBalance">1000</span> 🪙</span>
            </div>

            <div class="history-container">
                <div class="history-bar" id="historyBar"></div>
                <button class="btn-history-more" onclick="openHistoryModal()">•••</button>
            </div>

            <div class="provably-fair-box">
                🔒 <b>Provably Fair Hash (SHA-256) :</b> <span id="currentHashDisplay" style="color: #38bdf8;">En attente...</span>
            </div>

            <div class="game-canvas-container" id="stage">
                <div class="rays"></div>
                <div id="multiplierBox" class="multiplier-display">1.00x</div>
                <svg class="game-svg" viewBox="0 0 500 260">
                    <defs>
                        <linearGradient id="gBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#d3dbe8"/><stop offset="1" stop-color="#7f8fa8"/></linearGradient>
                        <linearGradient id="gWing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9b8cf"/><stop offset="1" stop-color="#506178"/></linearGradient>
                        <linearGradient id="gCurve" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="500" y2="0"><stop offset="0" stop-color="#ff4d5e" stop-opacity=".15"/><stop offset="1" stop-color="#ffb347"/></linearGradient>
                        <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4d5e" stop-opacity=".4"/><stop offset="1" stop-color="#ff4d5e" stop-opacity="0"/></linearGradient>
                        <radialGradient id="gFlame"><stop offset="0" stop-color="#fffbc4"/><stop offset=".45" stop-color="#ff9d3c"/><stop offset="1" stop-color="#ff3c2f" stop-opacity="0"/></radialGradient>
                        <radialGradient id="gBoom"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#ffd24d"/><stop offset=".7" stop-color="#ff4d2f"/><stop offset="1" stop-color="#ff4d2f" stop-opacity="0"/></radialGradient>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    </defs>
                    <g stroke="rgba(255,255,255,.06)"><path d="M0 60H500M0 120H500M0 180H500M0 240H500M100 0V260M200 0V260M300 0V260M400 0V260"/></g>
                    <path id="curveArea" fill="url(#gArea)"/>
                    <path id="flightCurve" fill="none" stroke="url(#gCurve)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
                    <g id="trail"></g>
                    <g id="planeGroup" transform="translate(24 236)">
                        <g transform="scale(1.05)">
                            <ellipse id="flame" cx="-46" cy="0" rx="4" ry="3.4" fill="url(#gFlame)"/>
                            <path d="M-30 -3 L-44 -24 L-35 -24 L-12 -4Z" fill="#c81e3a"/>
                            <path d="M-4 3 L-26 27 L-15 27 L18 4Z" fill="url(#gWing)"/>
                            <rect x="2" y="9" width="17" height="7" rx="3.5" fill="#5b6b82"/><rect x="2" y="9" width="5" height="7" rx="2.5" fill="#cfd8e6"/>
                            <path d="M-38 -5 Q-34 -10 -12 -10 L24 -9 Q42 -6 48 1 Q42 8 24 9 L-12 9 Q-34 9 -38 4Z" fill="url(#gBody)" stroke="#8da0ba" stroke-width=".6"/>
                            <path d="M-36 3 L44 3" stroke="#c81e3a" stroke-width="2.2"/>
                            <g fill="#38bdf8"><circle cx="-18" cy="-3" r="1.7"/><circle cx="-10" cy="-3" r="1.7"/><circle cx="-2" cy="-3" r="1.7"/><circle cx="6" cy="-3" r="1.7"/><circle cx="14" cy="-3" r="1.7"/></g>
                            <path d="M28 -8 Q40 -6 45 -1 L30 -1Z" fill="#1d3a8a"/>
                        </g>
                    </g>
                    <circle id="boom" cx="0" cy="0" r="30" fill="url(#gBoom)"/>
                </svg>
            </div>

            <p id="gameStatusText" style="color: #94a3b8; margin: 10px 0; font-weight: bold;">En attente de la prochaine manche...</p>

            <div class="bet-control-box">
                <div class="quick-bet-row">
                    <button class="quick-btn" onclick="setBet(10)">10 🪙</button>
                    <button class="quick-btn" onclick="setBet(50)">50 🪙</button>
                    <button class="quick-btn" onclick="setBet(100)">100 🪙</button>
                    <button class="quick-btn" onclick="setBet(500)">500 🪙</button>
                </div>
                <div class="quick-bet-row">
                    <button class="quick-btn" onclick="multiplyBet(0.5)">÷2</button>
                    <button class="quick-btn" onclick="multiplyBet(2)">×2</button>
                    <button class="quick-btn" onclick="setMaxBet()">Max (All-in)</button>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 8px;">
                    <input type="number" id="betAmount" value="50" min="1" placeholder="Montant de la mise" style="margin:0; flex: 2;">
                    <input type="number" step="0.1" min="1.01" id="autoCashOutInput" placeholder="Auto Cash-Out (ex: 2.00)" style="margin:0; flex: 1.5;">
                </div>

                <button id="actionBtn" onclick="handleMainAction()">En attente de la prochaine manche...</button>
                <button id="cancelBtn" class="btn-cancel hidden" onclick="cancelBet()">Annuler le pari</button>

                <div id="liveCashoutPreview" style="margin-top: 8px; font-size: 15px; color: #38bdf8; font-weight: bold;"></div>
            </div>

            <div class="card" style="margin-top: 15px; background: #0f172a;">
                <h4 style="margin-top:0;">🏆 Leaderboard & Participants :</h4>
                <ul id="gamePlayersList"></ul>
            </div>
        </div>

        <!-- 5. ÉCRAN DE JEU ICEFIELD -->
        <div id="icefield-screen" class="hidden">
            <div style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #334155;">
                <span style="font-size: 14px; font-weight: bold; color: #eab308;">⏳ Temps restant : <span class="sessionTimerDisplay">--:--</span></span>
                <span style="font-size: 14px; color: #22c55e; font-weight: bold;">Solde : <span class="playerBalance">1000</span> 🪙</span>
            </div>

            <h3 style="margin: 5px 0; color: #38bdf8;">🧊 Icefield - Traversée de Glace</h3>
            <p id="iceStatusText" style="font-size: 14px; color: #94a3b8; margin: 5px 0;">Configure ta mise et le nombre de blocs par ligne !</p>

            <div class="icefield-grid" id="iceGrid"></div>

            <div class="bet-control-box">
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; color: #94a3b8; text-align: left; display: block;">Blocs par ligne (2 - 10) :</label>
                        <input type="number" id="iceColsInput" value="3" min="2" max="10" style="margin: 4px 0;">
                    </div>
                    <div style="flex: 1.5;">
                        <label style="font-size: 12px; color: #94a3b8; text-align: left; display: block;">Mise :</label>
                        <input type="number" id="iceBetAmount" value="50" min="1" style="margin: 4px 0;">
                    </div>
                </div>

                <button id="iceStartBtn" onclick="startIcefieldGame()">Lancer la traversée 🧊</button>
                <button id="iceCashoutBtn" class="btn-cashout hidden" onclick="cashoutIcefield()">ENCAISSER (CASH OUT)</button>
            </div>

            <div class="card" style="margin-top: 15px; background: #0f172a;">
                <h4 style="margin-top:0;">🏆 Leaderboard :</h4>
                <ul id="icePlayersList"></ul>
            </div>
        </div>
    </div>

    <!-- MODALES -->
    <div id="historyModal" class="modal-overlay hidden">
        <div class="modal-content">
            <h3 style="margin-top:0; color: #38bdf8;">📜 Historique Complet des Tours</h3>
            <div class="full-history-grid" id="fullHistoryGrid"></div>
            <button onclick="closeHistoryModal()" style="background: #ef4444; margin-top: 20px;">Fermer</button>
        </div>
    </div>

    <div id="gameOverModal" class="modal-overlay hidden">
        <div class="modal-content" style="border: 2px solid #eab308;">
            <h2 style="margin-top:0; color: #eab308;">🏁 Fin de la Session !</h2>
            <p style="color: #94a3b8; font-size: 14px;">Voici le classement final des joueurs :</p>
            <div id="finalLeaderboardList" style="text-align: left; margin: 15px 0; max-height: 250px; overflow-y: auto;"></div>
            <button onclick="location.reload()" style="background: #22c55e; margin-top: 20px;">Recommencer une partie</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
(() => {
'use strict';
const socket = io();
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);

const S = { code:null, phase:'waiting', gameName: 'Crash Out', balance:1000, bet:0, nextBet:0, cashed:false,
            history:[], target:1, shown:1, t0:0, smoke:[], wasConnected:false, iceState: null };

/* ---------- Audio ---------- */
const Snd = (() => {
  let ctx, sfx, musicBus, verb, noiseBuf, timer = null, nextT = 0, step = 0, musicOn = true;
  const BPM = 72, hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const CH = [{ b: 45, n: [57, 60, 64, 67, 71] }, { b: 41, n: [53, 57, 60, 64] }, { b: 48, n: [52, 55, 59, 64] }, { b: 43, n: [59, 62, 64, 67] }];

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain(); master.gain.value = .85; master.connect(ctx.destination);
    const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb = ctx.createConvolver(); verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = .4; verb.connect(vg); vg.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = .9; sfx.connect(master); sfx.connect(verb);
    musicBus = ctx.createGain(); musicBus.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    const send = ctx.createGain(); send.gain.value = .35;
    musicBus.connect(lp); lp.connect(master); lp.connect(send); send.connect(verb);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const n = noiseBuf.getChannelData(0); for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  }

  function tone(f, t, dur, o = {}) {
    const osc = ctx.createOscillator(), g = ctx.createGain(), v = o.v || .2, a = o.a || .008;
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.det) osc.detune.value = o.det;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + a);
    if (o.sus) { g.gain.setValueAtTime(v, t + dur - o.sus); g.gain.linearRampToValueAtTime(.0001, t + dur); }
    else g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    osc.connect(g); g.connect(o.dest || sfx); osc.start(t); osc.stop(t + dur + .05);
  }
  function noise(t, dur, o = {}) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(o.v || .1, t + (o.a || .005)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(o.dest || sfx); s.start(t, Math.random() * .5); s.stop(t + dur + .05);
  }

  const FX = {
    bet:       t => { tone(660, t, .14, { type: 'triangle', v: .16 }); tone(990, t + .06, .18, { type: 'triangle', v: .14 }); },
    cancel:    t => tone(520, t, .2, { type: 'triangle', to: 330, v: .14 }),
    tick:      t => tone(1250, t, .07, { v: .1 }),
    start:     t => { tone(784, t, .5, { v: .14 }); tone(1175, t + .09, .6, { v: .1 }); },
    takeoff:   t => { noise(t, 1.4, { f: 250, to: 3200, v: .13 }); tone(180, t, 1.2, { to: 420, v: .09, a: .3 }); },
    win:       t => [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(f, t + i * .075, .9, { type: 'triangle', v: .15 }); }),
    crash:     t => { tone(150, t, .6, { to: 38, v: .45 }); noise(t, .45, { f: 700, to: 90, v: .22 }); }
  };

  function pad(c, t, dur) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(musicBus);
    c.n.forEach(m => [-7, 7].forEach(d => tone(hz(m), t, dur, { type: 'triangle', v: .035, a: 1.1, sus: 1.2, det: d, dest: lp })));
  }
  function playStep(st, t) {
    const c = CH[Math.floor(st / 8) % 4], s = st % 8;
    if (s === 0) pad(c, t, 240 / BPM + 1);
    if (s === 0 || s === 5) tone(hz(c.b), t, s ? .5 : .9, { v: .2, a: .02, dest: musicBus });
    if (s === 0 || s === 4) tone(115, t, .3, { to: 42, v: .32, dest: musicBus });
    if (s === 2 || s === 6) noise(t, .16, { type: 'bandpass', f: 1800, v: .05, dest: musicBus });
  }
  function schedule() {
    if (nextT < ctx.currentTime - .3) nextT = ctx.currentTime + .05;
    while (nextT < ctx.currentTime + .5) {
      playStep(step, nextT);
      nextT += (30 / BPM) * (step % 2 ? .82 : 1.18);
      step++;
    }
  }
  const level = () => musicBus.gain.setTargetAtTime(musicOn ? .55 : 0, ctx.currentTime, .7);

  return {
    unlock() { init(); if (ctx.state === 'suspended') ctx.resume(); },
    play(name) { if (!ctx || !FX[name]) return; try { FX[name](ctx.currentTime + .01); } catch (e) {} },
    startMusic() { init(); if (timer) return; step = 0; nextT = ctx.currentTime + .1; timer = setInterval(schedule, 120); schedule(); level(); },
    stopMusic() { if (!timer) return; clearInterval(timer); timer = null; musicBus.gain.setTargetAtTime(0, ctx.currentTime, .6); },
    toggle() { musicOn = !musicOn; if (ctx && timer) level(); return musicOn; }
  };
})();
const sound = name => Snd.play(name);
const startAudio = () => { Snd.unlock(); Snd.startMusic(); };
const toggleMusic = () => { $('musicBtn').textContent = Snd.toggle() ? '🎵' : '🔇'; };

/* ---------- Handlers UI ---------- */
function createRoom() {
  const playerName = $('createName').value.trim();
  if (!playerName) return alert('Entre un pseudo !');
  socket.emit('create-room', { playerName, duration: $('duration').value });
}
function joinRoom() {
  const playerName = $('joinName').value.trim(), roomCode = $('roomCodeInput').value.trim().toUpperCase();
  if (!playerName || !roomCode) return alert('Remplis ton pseudo et le code !');
  socket.emit('join-room', { roomCode, playerName });
}
const launchGame = gameName => socket.emit('launch-game-lobby', { roomCode: S.code, gameName });
function joinGameTable() {
  socket.emit('join-game-table', { roomCode: S.code });
  show('game-lobby-screen', false);
  if (S.gameName === 'Icefield') {
    show('icefield-screen');
    renderIcefieldGrid();
  } else {
    show('game-screen');
  }
  startAudio();
}

/* ---------- Actions Crash ---------- */
const setBet = n => { $('betAmount').value = n; };
const multiplyBet = f => { $('betAmount').value = Math.max(1, Math.floor((parseFloat($('betAmount').value) || 0) * f)); };
const setMaxBet = () => { $('betAmount').value = S.balance; };
const cancelBet = () => { sound('cancel'); socket.emit('cancel-next-bet', { roomCode: S.code }); };

function handleMainAction() {
  if (S.phase === 'ended' || S.phase === 'waiting') return;
  if (S.phase === 'playing' && S.bet > 0 && !S.cashed) return socket.emit('cash-out', { roomCode: S.code });
  if (S.phase === 'betting' ? S.bet > 0 : S.nextBet > 0) return;
  const amount = parseInt($('betAmount').value);
  if (!amount || amount <= 0) return alert('Entre un montant valide !');
  sound('bet');
  socket.emit('place-bet', { roomCode: S.code, amount, autoCashOut: $('autoCashOutInput').value });
}

/* ---------- Actions Icefield ---------- */
function startIcefieldGame() {
  const amount = parseInt($('iceBetAmount').value);
  const cols = parseInt($('iceColsInput').value);
  if (!amount || amount <= 0) return alert('Entre un montant valide !');
  if (cols < 2 || cols > 10) return alert('Nombre de blocs entre 2 et 10 !');
  sound('bet');
  socket.emit('icefield-start-game', { roomCode: S.code, amount, cols });
}

function stepIcefield(tileIndex) {
  socket.emit('icefield-step', { roomCode: S.code, tileIndex });
}

function cashoutIcefield() {
  socket.emit('icefield-cashout', { roomCode: S.code });
}

function renderIcefieldGrid() {
  const grid = $('iceGrid');
  grid.innerHTML = '';
  const cols = S.iceState ? S.iceState.cols : (parseInt($('iceColsInput').value) || 3);
  const currentStep = S.iceState ? S.iceState.currentStep : 0;
  const active = S.iceState ? S.iceState.active : false;
  const path = S.iceState ? S.iceState.path : [];

  for (let row = 7; row >= 0; row--) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'ice-row';

    const multVal = S.iceState ? S.iceState.multipliers[row] : null;

    for (let col = 0; col < cols; col++) {
      const tile = document.createElement('div');
      tile.className = 'ice-tile';

      if (row < currentStep) {
        if (path[row] === col) {
          tile.classList.add('success');
          tile.textContent = '🧊';
        } else {
          tile.classList.add('disabled');
        }
      } else if (row === currentStep && active) {
        tile.classList.add('active-row');
        tile.textContent = '❓';
        tile.onclick = () => stepIcefield(col);
      } else {
        tile.classList.add('disabled');
      }

      rowDiv.appendChild(tile);
    }
    grid.appendChild(rowDiv);
  }

  show('iceStartBtn', !active);
  show('iceCashoutBtn', active && currentStep > 0);

  if (active && currentStep > 0) {
    const currentMult = S.iceState.multipliers[currentStep - 1];
    const gain = Math.floor(S.bet * currentMult);
    $('iceStatusText').textContent = `Étape ${currentStep}/8 - Multiplicateur actuel : x${currentMult} (Gain : ${gain} 🪙)`;
  } else if (!active) {
    $('iceStatusText').textContent = 'Prêt ? Choisis tes paramètres et lance la traversée !';
  }
}

/* ---------- Synchronisation ---------- */
function setBtn(text, bg, cashout = false, disabled = false) {
  const b = $('actionBtn');
  b.textContent = text; b.style.background = bg || ''; b.disabled = disabled;
  b.classList.toggle('btn-cashout', cashout);
}
function renderButtons() {
  const { phase, bet, nextBet, cashed } = S;
  let cancel = false;
  if (phase === 'betting') {
    if (bet > 0) { setBtn(`Pari enregistré : ${bet} 🪙 ✅`, '#3b82f6'); cancel = true; }
    else setBtn('Parier pour la manche', '#22c55e');
  } else if (phase === 'playing' && bet > 0 && !cashed) {
    setBtn('CASH OUT', '', true);
  } else if (phase === 'playing' || phase === 'crashed') {
    if (nextBet > 0) { setBtn(`Prochain tour préparé : ${nextBet} 🪙 ✅`, '#eab308'); cancel = true; }
    else setBtn('Parier pour le tour suivant ✈️', '#3b82f6');
  } else setBtn('En attente de la prochaine manche...', '', false, true);
  show('cancelBtn', cancel);
}

function renderPlayers(room) {
  const lobby = $('playersList'), game = $('gamePlayersList'), iceList = $('icePlayersList');
  lobby.innerHTML = '';
  if (game) game.innerHTML = '';
  if (iceList) iceList.innerHTML = '';

  const avg = room.players.reduce((s, p) => s + p.stats.totalProfit, 0) / (room.players.length || 1);
  let admin = false;

  room.players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${p.name} (${p.balance} 🪙) ${p.isAdmin ? '👑 Hôte' : ''}`;
    lobby.appendChild(li);

    let st = '';
    if (p.bet > 0) st = `Mise active: ${p.bet} 🪙`;
    if (p.cashedOut) st = `✅ Cash Out (+${p.winAmount} 🪙)`;
    const sign = p.stats.totalProfit >= 0 ? '+' : '';

    const gi = document.createElement('li');
    gi.innerHTML = `<b>${esc(p.name)}</b> - ${st || 'En attente'} | Profit: <span class="${p.stats.totalProfit >= avg ? 'text-green' : 'text-red'}">${sign}${p.stats.totalProfit} 🪙</span> (Solde: ${p.balance} 🪙)`;

    if (game) game.appendChild(gi);
    if (iceList) iceList.appendChild(gi.cloneNode(true));

    if (p.id === socket.id) {
      Object.assign(S, { balance: p.balance, bet: p.bet, nextBet: p.nextBet, cashed: p.cashedOut, iceState: p.iceState });
      document.querySelectorAll('.playerBalance').forEach(el => el.textContent = p.balance);
      admin = p.isAdmin;
    }
  });

  if (room.status === 'waiting') { show('adminControls', admin); show('playerWaitingGame', !admin); }
  if (room.selectedGame === 'Icefield') renderIcefieldGrid();
}

function sync(room) {
  S.gameName = room.selectedGame || 'Crash Out';
  if (['betting', 'playing', 'crashed'].includes(room.status) && S.phase !== 'ended') S.phase = room.status;
  if (room.currentHash) $('currentHashDisplay').textContent = room.currentHash;
  renderPlayers(room); renderButtons();
}
function enterLobby(room) {
  S.code = room.code;
  show('auth-screen', false); show('lobby');
  $('displayCode').textContent = room.code;
  sync(room);
}

/* ---------- Événements Sockets ---------- */
socket.on('room-created', d => enterLobby(d.room));
socket.on('joined-success', enterLobby);
socket.on('update-room', sync);
socket.on('error-message', alert);

socket.on('navigate-to-game', d => {
  S.gameName = d.gameName;
  show('lobby', false); show('game-lobby-screen');
  $('gameTitleName').textContent = d.gameName;
});

socket.on('timer-update', d => {
  const m = Math.floor(d.timeRemaining / 60), s = d.timeRemaining % 60;
  document.querySelectorAll('.sessionTimerDisplay').forEach(el => el.textContent = `${m}:${s < 10 ? '0' : ''}${s}`);
});

socket.on('icefield-result', d => {
  if (d.success) {
    if (d.completed || d.cashout) {
      sound('win');
      alert(d.message);
    }
  } else {
    sound('crash');
    alert(d.message);
  }
});

socket.on('betting-phase', d => {
  if (S.phase === 'ended' || S.gameName !== 'Crash Out') return;
  S.phase = 'betting'; S.cashed = false;
  sound('start');
  $('currentHashDisplay').textContent = d.hash;
  $('gameStatusText').textContent = `Prochaine manche dans ${d.countdown}s... Placez vos mises !`;
  sync(d.room);
});

socket.on('playing-phase-started', room => {
  if (S.phase === 'ended' || S.gameName !== 'Crash Out') return;
  S.phase = 'playing'; sound('takeoff');
  $('gameStatusText').textContent = "L'avion décolle ! Bon vol ✈️";
  sync(room);
});

socket.on('multiplier-update', d => {
  if (S.phase === 'ended' || S.gameName !== 'Crash Out') return;
  $('multiplierBox').textContent = d.multiplier.toFixed(2) + 'x';
});

socket.on('game-crashed', d => {
  if (S.phase === 'ended' || S.gameName !== 'Crash Out') return;
  S.phase = 'crashed';
  sound('crash');
  $('multiplierBox').textContent = d.multiplier.toFixed(2) + 'x (CRASH !)';
  $('gameStatusText').textContent = 'Crash ! La manche est terminée.';
  sync(d.room);
});

socket.on('game-session-ended', d => {
  S.phase = 'ended'; Snd.stopMusic(); sound('win');
  const box = $('finalLeaderboardList'); box.innerHTML = '';
  d.leaderboard.forEach((p, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'background:#0d0814;padding:10px;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px';
    row.innerHTML = `<span><b>#${i + 1} ${esc(p.name)}</b></span>
      <span>Solde : <b>${p.finalBalance} 🪙</b> (<span class="${p.profit >= 0 ? 'text-green' : 'text-red'}">${p.profit >= 0 ? '+' : ''}${p.profit}</span>)</span>`;
    box.appendChild(row);
  });
  show('gameOverModal');
});

Object.assign(window, { createRoom, joinRoom, launchGame, joinGameTable, setBet, multiplyBet, setMaxBet,
                        handleMainAction, cancelBet, toggleMusic, startIcefieldGame, stepIcefield, cashoutIcefield });
})();
</script>
</body>
</html>
