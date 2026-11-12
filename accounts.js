/* ============================================================
   accounts.js — comptes joueurs (pseudo + mot de passe) et sessions.
   - Mots de passe : scrypt + sel aléatoire (jamais stockés en clair).
   - Sessions : jeton aléatoire gardé dans le navigateur (localStorage) ;
     le serveur ne garde que son empreinte SHA-256.
   - Stockage :
       • EN LIGNE (Render gratuit…) : base Upstash Redis (gratuite, permanente) via ses
         variables UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN. Le disque de Render
         est effacé à chaque redéploiement, donc un fichier local y perdrait tous les comptes.
       • EN LOCAL (ton PC) : simple fichier DATA_DIR/accounts.json, sans rien à configurer.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const { BADGES } = require('./badges');

const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DIR, 'accounts.json');
const SESSION_TTL = 90 * 24 * 3600 * 1000; // 90 jours
const MAX_SESSIONS_PER_USER = 10;
const NAME_RE = /^[\p{L}\p{N}_-]{3,20}$/u;

const REMOTE_URL = process.env.UPSTASH_REDIS_REST_URL, REMOTE_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REMOTE_KEY = 'crash-p2p:accounts';
const remote = async cmd => {
    const r = await fetch(REMOTE_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + REMOTE_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
    return j.result;
};

let db = { users: {}, sessions: {} };
let storageOk = true; // si le chargement échoue, on bloque tout : on ne doit JAMAIS écraser la vraie base avec une base vide
const ready = (async () => {
    try {
        if (REMOTE_URL && REMOTE_TOKEN) {
            const v = await remote(['GET', REMOTE_KEY]);
            if (v) db = Object.assign(db, JSON.parse(v));
            console.log('✅ Comptes chargés depuis Upstash (' + Object.keys(db.users).length + ' comptes)');
        } else {
            try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) { /* premier lancement */ }
            console.log('ℹ️ Comptes stockés dans ' + FILE + (process.env.RENDER ? ' — ⚠️ disque éphémère sur Render : configure Upstash !' : ''));
        }
    } catch (e) { storageOk = false; console.error('❌ Base de comptes injoignable :', e.message); }
})();

let saveTimer = null, saving = Promise.resolve();
async function writeNow() {
    if (!storageOk) return;
    const json = JSON.stringify(db);
    try {
        if (REMOTE_URL && REMOTE_TOKEN) await remote(['SET', REMOTE_KEY, json]);
        else {
            fs.mkdirSync(DIR, { recursive: true });
            const tmp = FILE + '.tmp';
            fs.writeFileSync(tmp, json);
            fs.renameSync(tmp, FILE);
        }
    } catch (e) { console.error('❌ Sauvegarde des comptes impossible :', e.message, '— nouvel essai dans 5 s'); setTimeout(save, 5000); }
}
function save() { // écritures groupées (200 ms)
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; saving = saving.then(writeNow); }, 200);
}
async function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saving = saving.then(writeNow); } await saving; }
// Render envoie SIGTERM avant un redéploiement : on termine l'écriture en cours avant de partir
process.on('SIGTERM', () => { flush().finally(() => process.exit(0)); });

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const key = name => String(name || '').trim().toLowerCase();

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const h = await scrypt(password, salt, 64);
    return salt.toString('hex') + ':' + h.toString('hex');
}
async function checkPassword(password, stored) {
    const [saltHex, hashHex] = String(stored).split(':');
    if (!saltHex || !hashHex) return false;
    const h = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
    const ref = Buffer.from(hashHex, 'hex');
    return h.length === ref.length && crypto.timingSafeEqual(h, ref);
}

function newSession(k) {
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions[sha(token)] = { user: k, created: Date.now() };
    const mine = Object.entries(db.sessions).filter(([, s]) => s.user === k).sort((a, b) => a[1].created - b[1].created);
    while (mine.length > MAX_SESSIONS_PER_USER) delete db.sessions[mine.shift()[0]];
    save();
    return token;
}

// Anti force brute : 5 échecs => blocage 60 s (par adresse + pseudo)
const fails = new Map();
function locked(id) { const f = fails.get(id); return !!(f && f.n >= 5 && Date.now() < f.until); }
function fail(id) { const f = fails.get(id) || { n: 0, until: 0 }; f.n++; if (f.n >= 5) f.until = Date.now() + 60000; fails.set(id, f); }

async function register(username, password) {
    await ready; if (!storageOk) return { error: 'Base de comptes indisponible, réessaie dans un instant.' };
    username = String(username || '').trim();
    password = String(password || '');
    if (!NAME_RE.test(username)) return { error: 'Pseudo invalide : 3 à 20 caractères (lettres, chiffres, _ ou -).' };
    if (password.length < 6 || password.length > 100) return { error: 'Mot de passe : 6 caractères minimum.' };
    const k = key(username);
    if (db.users[k]) return { error: 'Ce pseudo est déjà pris.' };
    db.users[k] = { name: username, pass: await hashPassword(password), created: Date.now() };
    return { name: username, token: newSession(k) };
}

async function login(username, password, ip) {
    await ready; if (!storageOk) return { error: 'Base de comptes indisponible, réessaie dans un instant.' };
    const k = key(username), id = ip + '|' + k;
    if (locked(id)) return { error: 'Trop d\'essais. Réessaie dans une minute.' };
    const u = db.users[k];
    // même coût de calcul que le compte existe ou non (pas de fuite sur les pseudos)
    const ok = u ? await checkPassword(String(password || ''), u.pass) : (await hashPassword('x'), false);
    if (!ok) { fail(id); return { error: 'Pseudo ou mot de passe incorrect.' }; }
    fails.delete(id);
    return { name: u.name, token: newSession(k) };
}

async function resume(token) {
    await ready; if (!storageOk) return null;
    const s = db.sessions[sha(String(token || ''))];
    if (!s) return null;
    if (Date.now() - s.created > SESSION_TTL) { delete db.sessions[sha(token)]; save(); return null; }
    const u = db.users[s.user];
    return u ? { name: u.name } : null;
}

function logout(token) { if (db.sessions[sha(String(token || ''))]) { delete db.sessions[sha(token)]; save(); } }

/* ------------------------------------------------------------------ */
/*  Profil joueur + classement général                                 */
/*  Stocké dans db.users[clé].prof : ~250 octets par joueur (compteurs + 12 derniers %), */
/*  écrit UNE fois par fin de session → très peu de place et de commandes Upstash.       */
/* ------------------------------------------------------------------ */
const clampPct = x => Math.max(-100, Math.min(1e6, Number(x) || 0));
const newProf = () => ({ n: 0, sp: 0, best: null, worst: null, c1: 0, g: 0, w: 0, tp: 0, tg: 0, tl: 0, bm: 0, msg: 0, gp: [], bd: [], last: [], ls: [] });
async function recordSession(k, sess, allGames) {
    await ready; const u = db.users[k]; if (!u || !storageOk) return [];
    const p = u.prof = Object.assign(newProf(), u.prof || {});
    const pct = clampPct(sess.pct);
    p.n++; p.sp = Math.round((p.sp + pct) * 100) / 100;
    p.best = p.best == null ? pct : Math.max(p.best, pct); p.worst = p.worst == null ? pct : Math.min(p.worst, pct);
    if (sess.champ) p.c1++;
    p.g += sess.g | 0; p.w += sess.w | 0; p.tp += Math.round(sess.profit) || 0; { const pf = Math.round(sess.profit) || 0; if (pf > 0) p.tg = (p.tg || 0) + pf; else p.tl = (p.tl || 0) - pf; } p.msg += sess.msgs | 0;
    p.bm = Math.max(p.bm, Math.min(1e9, sess.bm || 0));
    (sess.gp || []).forEach(g => { if (!p.gp.includes(g)) p.gp.push(g); });
    p.last.push(Math.round(pct * 10) / 10); if (p.last.length > 12) p.last.shift();
    p.ls.push([Date.now(), Math.round(pct * 10) / 10, Math.round(sess.profit) || 0, sess.g | 0, sess.champ ? 1 : 0]); if (p.ls.length > 12) p.ls.shift();
    const fresh = BADGES.filter(b => !p.bd.includes(b.id) && b.test(p, Object.assign({}, sess, { pct }), allGames || []));
    fresh.forEach(b => p.bd.push(b.id));
    save();
    return fresh.map(b => ({ id: b.id, e: b.e, n: b.n, d: b.d }));
}
function profileOf(name) {
    const u = db.users[key(name)]; if (!u) return null;
    const p = Object.assign(newProf(), u.prof || {});
    return { name: u.name, since: u.created, n: p.n, avg: p.n ? p.sp / p.n : 0, best: p.best, worst: p.worst, c1: p.c1, g: p.g, w: p.w, tp: p.tp, tg: p.tg, tl: p.tl, bm: p.bm, msg: p.msg, last: p.last, ls: p.ls,
        badges: BADGES.map(b => ({ id: b.id, e: b.e, n: b.n, d: b.d, got: p.bd.includes(b.id) })) };
}
function leaderboard(limit = 50) {
    return Object.values(db.users).filter(u => u.prof && u.prof.n > 0)
        .map(u => ({ name: u.name, avg: u.prof.sp / u.prof.n, n: u.prof.n, best: u.prof.best, tp: u.prof.tp, tg: u.prof.tg || 0, tl: u.prof.tl || 0, badges: (u.prof.bd || []).length }))
        .sort((a, b) => b.avg - a.avg).slice(0, limit);
}

module.exports = { register, login, resume, logout, key, flush, recordSession, profileOf, leaderboard };
