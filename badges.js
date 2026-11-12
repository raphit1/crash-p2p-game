/* ============================================================
   badges.js — liste des badges et règles pour les débloquer.
   Chaque badge : { id, e (emoji), n (nom), d (description), test(profil, session) }.
   - « profil » = statistiques cumulées du compte (voir accounts.js : recordSession)
   - « session » = résumé de la session qui vient de se terminer
   Un badge débloqué est gardé pour toujours dans le profil (liste d'identifiants : très léger).
   ============================================================ */
'use strict';
const BADGES = [
    { id: 'first',   e: '🎬', n: 'Baptême',          d: 'Terminer ta première session',                      test: p => p.n >= 1 },
    { id: 'pro10',   e: '🎖️', n: 'Habitué',          d: 'Terminer 10 sessions',                              test: p => p.n >= 10 },
    { id: 'pro50',   e: '🏅', n: 'Vétéran',          d: 'Terminer 50 sessions',                              test: p => p.n >= 50 },
    { id: 'green',   e: '📈', n: 'Dans le vert',     d: 'Finir une session en positif',                      test: p => p.best > 0 },
    { id: 'double',  e: '🚀', n: 'Doublé',           d: 'Finir une session à +100 % ou plus',                test: p => p.best >= 100 },
    { id: 'x10',     e: '💎', n: 'Dix fois plus',    d: 'Finir une session à +900 % ou plus',                test: p => p.best >= 900 },
    { id: 'm10',     e: '🔥', n: 'Gros coup',        d: 'Un gain à x10 ou plus sur un seul pari',            test: p => p.bm >= 10 },
    { id: 'm100',    e: '⚡', n: 'Jackpot',          d: 'Un gain à x100 ou plus sur un seul pari',           test: p => p.bm >= 100 },
    { id: 'm1000',   e: '👑', n: 'Légende',          d: 'Un gain à x1000 ou plus sur un seul pari',          test: p => p.bm >= 1000 },
    { id: 'champ',   e: '🏆', n: 'Champion',         d: 'Finir 1er d\'une room (à plusieurs)',               test: p => p.c1 >= 1 },
    { id: 'king',    e: '🥇', n: 'Roi de la table',  d: 'Finir 1er de 5 rooms',                              test: p => p.c1 >= 5 },
    { id: 'surv',    e: '🩹', n: 'Survivant',        d: 'Finir avec moins de 10 % de ta mise de départ, mais pas à 0', test: (p, s) => !!s && s.final > 0 && s.final < s.initial * 0.1 },
    { id: 'broke',   e: '💀', n: 'Ruiné',            d: 'Finir une session à 0 jeton',                       test: (p, s) => !!s && s.final <= 0 },
    { id: 'comeback',e: '🔄', n: 'Remontada',        d: 'Descendre sous −50 % puis finir en positif',        test: (p, s) => !!s && s.minPct <= -50 && s.pct > 0 },
    { id: 'grind',   e: '🎰', n: 'Acharné',          d: 'Jouer 100 parties au total',                        test: p => p.g >= 100 },
    { id: 'addict',  e: '🤯', n: 'Accro',            d: 'Jouer 500 parties au total',                        test: p => p.g >= 500 },
    { id: 'all',     e: '🧭', n: 'Touche-à-tout',    d: 'Avoir joué à tous les jeux',                        test: (p, s, all) => all.every(k => p.gp.includes(k)) },
    { id: 'chat',    e: '💬', n: 'Bavard',           d: 'Envoyer 50 messages dans le chat',                  test: p => p.msg >= 50 }
];
module.exports = { BADGES };
