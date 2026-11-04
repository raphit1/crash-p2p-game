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

module.exports = { register, login, resume, logout, key, flush };
