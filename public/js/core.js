'use strict';
const socket = io({ transports: ['websocket', 'polling'] }); // websocket direct : pas de long-polling
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Pseudo du créateur : rouge néon + couronne sur la 1re lettre, visible par TOUT LE MONDE (seul le panneau admin est privé)
const COS_MAP = {};
const nm = n => { if (n && String(n).trim().toLowerCase() === 'dario') return '<span class="daria-name">daria</span> 👀'; const e = esc(n); let r = e, vip = false; if (n && ((S.isAdmin && n === S.myName) || (S.vip && S.vip.has(n)))) { r = `<span class="adm-name">${e}</span>`; vip = true; } const f = vip ? 7 : n ? (COS_MAP[String(n).toLowerCase()] | 0) : 0; return f >= 5 ? `<span class="pn pn-${f}">${r}${f !== 6 ? '<i class="pst"><b></b><b></b><b></b><b></b></i>' : ''}</span>` : r; };
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);

/* ---------- État ---------- */
const S = { code:null, phase:'waiting', balance:1000, slots:[{},{}], iceState:null, iceBusy:false, iceAnimating:false, iceLanes:0, yetiPos:null, icePick:null, view:'hub', crashRun:false, raf:0, ang:-3, si:0, lastTxt:'', iceCol:0, iceGen:0, icePending:0, iceWait:false, yetiP:Promise.resolve(), crState:null, crGen:0, crPending:0, crWait:false, crP:Promise.resolve(), crStep:0, crMode:'easy', crBuilt:'', crLanes:[], crPos:{x:0,y:0}, crDead:false, crCars:0, crTimer:0, crPick:0, crBet:0, crHist:[], jmPhase:'idle', jmCups:null, jmAt:[0,1,2], jmPick:0,
            arState:null, arMode:'easy', arBuilt:'', arBusy:false, arThrowing:false, arHist:[], rlBets:[], rlBusy:false, rlHist:[], rlLast:null, bjBusy:false, bjHist:[], meBj:null,
            history:[], target:1, shown:1, t0:0, smoke:[], wasConnected:false };

/* ---------- Audio : effets doux + musique chill générative (aucun fichier à charger) ---------- */
const Snd = (() => {
  let ctx, sfx, musicBus, verb, noiseBuf, timer = null, nextT = 0, step = 0, musicOn = true, mVol = 1, sVol = 1;
  const BPM = 72, hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const CH = [ // Am9 · Fmaj7 · Cmaj7 · G6  (notes MIDI)
    { b: 45, n: [57, 60, 64, 67, 71] }, { b: 41, n: [53, 57, 60, 64] },
    { b: 48, n: [52, 55, 59, 64] },     { b: 43, n: [59, 62, 64, 67] } ];

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain(); master.gain.value = .85;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .2;
    master.connect(comp); comp.connect(ctx.destination); // compresseur : plus de saturation quand plusieurs sons se superposent
    const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb = ctx.createConvolver(); verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = .4; verb.connect(vg); vg.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = .9 * sVol;
    const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 9000; // adoucit les aigus des effets
    sfx.connect(sl); sl.connect(master); sl.connect(verb);
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

  // Effets : sinusoïdes/triangles arrondis + réverb, rien d'agressif
  const FX = {
    pkpeg:     t => { tone(1500 + Math.random() * 900, t, .04, { type: 'triangle', v: .05 }); tone(420 + Math.random() * 120, t, .03, { v: .035 }); },
    pkland:    t => { const f = 460 + (S.pkNote || 0) * 900; tone(f, t, .28, { type: 'triangle', v: .12 }); tone(f * 1.5, t + .04, .22, { v: .06 }); tone(f / 2, t, .12, { v: .06 }); },
    pkdrop:    t => { tone(900, t, .12, { type: 'triangle', to: 380, v: .06 }); },
    mngem:     t => { tone(988, t, .12, { type: 'triangle', v: .13 }); tone(1480, t + .06, .2, { v: .08 }); },
    mnboom:    t => { noise(t, .7, { f: 1800, to: 60, v: .55, a: .005 }); tone(90, t, .6, { to: 28, v: .5, a: .005 }); tone(55, t + .05, .5, { type: 'sawtooth', to: 25, v: .25 }); },
    dice:      t => { for (let i = 0; i < 6; i++) tone(300 + Math.random() * 500, t + i * .045, .05, { type: 'square', v: .05 }); noise(t, .3, { f: 2500, to: 800, v: .12 }); },
    dclose:    t => { tone(330, t, .25, { type: 'triangle', to: 180, v: .14 }); },
    coin:      t => { tone(1800, t, .5, { v: .08, to: 1500 }); tone(2400, t + .02, .45, { v: .05, to: 2100 }); tone(1800, t + .75, .3, { v: .1, to: 1200 }); },
    card:      t => { noise(t, .12, { f: 3500, to: 1200, v: .18, a: .002 }); tone(220, t, .08, { type: 'triangle', v: .06 }); },
    bet:       t => { tone(660, t, .14, { type: 'triangle', v: .16 }); tone(990, t + .06, .18, { type: 'triangle', v: .14 }); },
    cancel:    t => tone(520, t, .2, { type: 'triangle', to: 330, v: .14 }),
    tick:      t => tone(1250, t, .07, { v: .1 }),
    start:     t => { tone(784, t, .5, { v: .14 }); tone(1175, t + .09, .6, { v: .1 }); },
    // l'avion s'envole à la fin du multiplicateur : gros souffle de réacteur + moteur qui monte en régime, FORT
    flyoff:    t => { noise(t, 1.6, { type: 'bandpass', f: 300, to: 3400, v: .55, a: .12 }); noise(t + .04, 1.5, { f: 1000, to: 180, v: .4, a: .08 });
                      tone(105, t, 1.6, { type: 'sawtooth', to: 560, v: .24, a: .1 }); tone(108, t, 1.6, { type: 'sawtooth', to: 590, v: .18, a: .1, det: 18 });
                      tone(70, t, 1.1, { to: 38, v: .34, a: .02 }); },
    takeoff:   t => { noise(t, 1.2, { f: 200, to: 1800, v: .08, a: .25 }); tone(150, t, 1.1, { to: 340, v: .06, a: .4 }); },
    milestone: t => { tone(1047, t, .35, { type: 'triangle', v: .12 }); tone(1568, t + .07, .45, { v: .1 }); },
    win:       t => [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(f, t + i * .075, .9, { type: 'triangle', v: .15 }); tone(f * 2, t + i * .075, .6, { v: .05 }); }),
    crash:     t => { tone(140, t, .5, { to: 45, v: .32 }); noise(t, .35, { f: 600, to: 120, v: .14 }); tone(294, t + .04, .6, { type: 'triangle', to: 175, v: .07 }); },
    iceJump:   t => { noise(t, .08, { f: 2500, type: 'highpass', v: .09 }); tone(220, t, .12, { to: 140, v: .12 }); },
    iceStep:   t => { tone(880, t, .25, { type: 'triangle', v: .1 }); tone(1320, t + .05, .3, { v: .07 }); },
    // Perte : craquements secs, éclatement de la glace, plouf, puis petit accord triste
    iceLose:   t => {
      for (let i = 0; i < 7; i++) noise(t + i * .05 + Math.random() * .02, .05, { f: 3000 + Math.random() * 3000, type: 'highpass', v: .16 });
      tone(95, t, .5, { to: 50, v: .2 });
      noise(t + .4, .5, { f: 6000, to: 1200, type: 'bandpass', v: .2 });
      for (let i = 0; i < 9; i++) tone(2000 + Math.random() * 3500, t + .4 + i * .03, .35, { v: .05 });
      noise(t + .6, .7, { f: 900, to: 150, v: .2 });
      [392, 330, 262].forEach((f, i) => tone(f, t + .95 + i * .22, .9, { type: 'triangle', v: .12 }));
    },
    slide: t => noise(t, .16, { type: 'bandpass', f: 500 + Math.random() * 500, to: 900, v: .05 }),
    tap:   t => { tone(170, t, .12, { to: 90, v: .22 }); noise(t, .05, { f: 1800, v: .1 }); },
    pop:   t => tone(700, t, .14, { to: 350, v: .13 }),
    rltick: t => tone(2400, t, .035, { type: 'square', v: .03 }),
    twang: t => { tone(300, t, .22, { to: 170, type: 'triangle', v: .13 }); noise(t, .05, { f: 2600, v: .07 }); },
    lift:  t => noise(t, .25, { f: 400, to: 1800, v: .06 }),
    miss:  t => [330, 262].forEach((f, i) => tone(f, t + i * .18, .6, { type: 'triangle', v: .12 })),
    cluck: t => { tone(560, t, .07, { type: 'triangle', to: 820, v: .1 }); tone(380, t + .06, .06, { type: 'triangle', to: 300, v: .07 }); },
    // Voiture : souffle qui approche, klaxon, choc sourd, plumes, puis petit accord triste
    zoom:  t => { noise(t, .9, { type: 'bandpass', f: 250, to: 2600, v: .5, a: .25 }); noise(t + .35, .7, { f: 2200, to: 150, v: .4, a: .02 });
                  tone(90, t, .55, { type: 'sawtooth', to: 340, v: .22, a: .2 }); tone(340, t + .5, .5, { type: 'sawtooth', to: 85, v: .22, a: .02 });
                  tone(440, t + .1, .35, { type: 'square', v: .06 }); tone(554, t + .1, .35, { type: 'square', v: .06 }); },
    hit:   t => {
      noise(t, .3, { type: 'bandpass', f: 300, to: 1400, v: .08 });
      tone(330, t + .18, .22, { type: 'square', v: .04 }); tone(262, t + .18, .22, { type: 'square', v: .04 });
      tone(110, t + .3, .35, { to: 40, v: .3 }); noise(t + .3, .25, { f: 2500, to: 600, v: .12 });
      [392, 330, 262].forEach((f, i) => tone(f, t + .8 + i * .2, .8, { type: 'triangle', v: .1 }));
    }
  };

  // Musique lo-fi : accords en nappe, basse, batterie douce et petites notes aléatoires, croches swinguées
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
    if (s % 2) noise(t, .05, { type: 'highpass', f: 7000, v: .025, dest: musicBus });
    if (Math.random() < .6) {
      const m = hz(c.n[Math.floor(Math.random() * c.n.length)] + 12);
      tone(m, t, .9, { type: 'triangle', v: .06, a: .01, dest: musicBus });
      tone(m * 2, t, .35, { v: .015, dest: musicBus });
    }
  }
  function schedule() {
    if (nextT < ctx.currentTime - .3) nextT = ctx.currentTime + .05; // onglet resté en arrière-plan
    while (nextT < ctx.currentTime + .5) {
      playStep(step, nextT);
      nextT += (30 / BPM) * (step % 2 ? .82 : 1.18);
      step++;
    }
  }
  const level = () => musicBus.gain.setTargetAtTime(musicOn ? .55 * mVol : 0, ctx.currentTime, .7);

  return {
    unlock() { init(); if (ctx.state === 'suspended') ctx.resume(); },
    play(name) { if (!ctx || !FX[name]) return; try { FX[name](ctx.currentTime + .01); } catch (e) {} },
    startMusic() { init(); if (timer) return; step = 0; nextT = ctx.currentTime + .1; timer = setInterval(schedule, 120); schedule(); level(); },
    stopMusic() { if (!timer) return; clearInterval(timer); timer = null; musicBus.gain.setTargetAtTime(0, ctx.currentTime, .6); },
    setVol(k, v) { v = Math.max(0, Math.min(1, +v || 0)); if (k === 'music') { mVol = v; if (ctx && timer) level(); } else { sVol = v; if (ctx && sfx) sfx.gain.setTargetAtTime(.9 * v, ctx.currentTime, .05); } },
    ac: () => ctx, out: () => sfx, mus: () => musicBus, rv: () => verb, lvl: () => level(), noiseBuf: () => noiseBuf,
    toggle() { musicOn = !musicOn; if (ctx && timer) level(); return musicOn; },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }, resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  };
})();
const sound = name => Snd.play(name);
document.addEventListener('visibilitychange', () => document.hidden ? Snd.suspend() : Snd.resume()); // onglet caché : plus de son ni de calcul audio
const startAudio = () => { Snd.unlock(); Snd.startMusic(); };
const toggleMusic = () => { const i = Snd.toggle() ? '🎵' : '🔇'; document.querySelectorAll('.musicBtn').forEach(b => b.textContent = i); };
let lastShown = 1;
