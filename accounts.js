/* ============================================================
   accounts.js — comptes joueurs (pseudo + mot de passe) et sessions.
   - Mots de passe : scrypt + sel aléatoire (jamais stockés en clair).
   - Sessions : jeton aléatoire gardé dans le navigateur (localStorage) ;
     le serveur ne garde que son empreinte SHA-256.
   - Stockage : un simple fichier JSON (DATA_DIR/accounts.json), sans dépendance.
     ⚠️ Sur un hébergeur à disque éphémère (Render gratuit…), ce fichier est effacé
     à chaque redéploiement : prends un disque persistant ou une vraie base si besoin.
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

let db = { users: {}, sessions: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) { /* premier lancement */ }

let saveTimer = null;
function save() { // écriture groupée + atomique (fichier temporaire puis rename)
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            fs.mkdirSync(DIR, { recursive: true });
            const tmp = FILE + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(db));
            fs.renameSync(tmp, FILE);
        } catch (e) { console.error('❌ Sauvegarde des comptes impossible :', e.message); }
    }, 200);
}

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
    const k = key(username), id = ip + '|' + k;
    if (locked(id)) return { error: 'Trop d\'essais. Réessaie dans une minute.' };
    const u = db.users[k];
    // même coût de calcul que le compte existe ou non (pas de fuite sur les pseudos)
    const ok = u ? await checkPassword(String(password || ''), u.pass) : (await hashPassword('x'), false);
    if (!ok) { fail(id); return { error: 'Pseudo ou mot de passe incorrect.' }; }
    fails.delete(id);
    return { name: u.name, token: newSession(k) };
}

function resume(token) {
    const s = db.sessions[sha(String(token || ''))];
    if (!s) return null;
    if (Date.now() - s.created > SESSION_TTL) { delete db.sessions[sha(token)]; save(); return null; }
    const u = db.users[s.user];
    return u ? { name: u.name } : null;
}

function logout(token) { if (db.sessions[sha(String(token || ''))]) { delete db.sessions[sha(token)]; save(); } }

module.exports = { register, login, resume, logout, key };
