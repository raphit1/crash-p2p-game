'use strict';
/* ============================================================
   sons-slot.js — ambiance sonore de la machine « LA NUIT DU LOUP » (tout est synthétisé, aucun fichier)
   Ambiance : drone grave, vent, hululements, hurlements lointains, petites notes de cloche en gamme mineure.
   Effets : rouleaux, lanternes, scies, roue qui tourne, cadres (paille / bois / brique), hurlement du loup,
            effondrement des maisons, pièces, jingles de gain différents selon la taille, jackpots…
   ============================================================ */
const SLX = (() => {
  let ctx = null, dest = null, rev = null, nb = null, amb = null, on = false, timers = [];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12), R = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  function ready() {
    try { Snd.unlock(); } catch (e) {}
    ctx = Snd.ac(); dest = Snd.out(); rev = Snd.rv(); nb = Snd.noiseBuf();
    return !!(ctx && dest);
  }
  const now = () => ctx.currentTime + .005;
  function tone(f, t, dur, o = {}) {
    const osc = ctx.createOscillator(), g = ctx.createGain(), v = o.v == null ? .18 : o.v, a = o.a || .006;
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.det) osc.detune.value = o.det;
    if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + .1); }
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + a);
    if (o.sus) { g.gain.setValueAtTime(v, t + dur - o.sus); g.gain.linearRampToValueAtTime(.0001, t + dur); } else g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let out = g;
    if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.setValueAtTime(o.lp, t); if (o.lpTo) f2.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur); osc.connect(f2); f2.connect(g); } else osc.connect(g);
    g.connect(o.dest || dest); if (o.rev && rev) { const s = ctx.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(rev); }
    osc.start(t); osc.stop(t + dur + .06);
  }
  function noise(t, dur, o = {}) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; s.loop = true; f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.q) f.Q.value = o.q;
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(o.v || .1, t + (o.a || .005));
    if (o.sus) { g.gain.setValueAtTime(o.v || .1, t + dur - o.sus); g.gain.linearRampToValueAtTime(.0001, t + dur); } else g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(o.dest || dest);
    if (o.rev && rev) { const x = ctx.createGain(); x.gain.value = o.rev; g.connect(x); x.connect(rev); }
    s.start(t, Math.random() * .5); s.stop(t + dur + .05);
  }
  // gammes (demi-tons) : pentatonique mineure et mode phrygien (ambiance sombre)
  const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22], PHRY = [0, 1, 3, 5, 7, 8, 10, 12];
  const bell = (m, t, v = .12, d = 1.6) => { tone(hz(m), t, d, { v, type: 'sine', a: .004, rev: .5 }); tone(hz(m + 12) * 1.003, t, d * .6, { v: v * .4, type: 'sine', a: .002, rev: .4 }); tone(hz(m + 19), t, d * .35, { v: v * .22, type: 'triangle' }); };

  /* ----- ambiance ----- */
  function ambStart() {
    if (!ready() || on) return; on = true;
    try { Snd.stopMusic(); } catch (e) {}
    amb = ctx.createGain(); amb.gain.value = 0; amb.connect(Snd.mus()); try { Snd.lvl(); } catch (e) {}
    amb.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    const t = ctx.currentTime;
    // drone : deux dents de scie désaccordées, filtrées, avec respiration lente
    [[55, -6], [55, 7], [82.4, 0], [110.2, 4]].forEach(([f, d], i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createBiquadFilter();
      o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f; o.detune.value = d; l.type = 'lowpass'; l.frequency.value = i < 2 ? 220 : 400; g.gain.value = i < 2 ? .1 : .05;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .05 + i * .02; lg.gain.value = g.gain.value * .7; lfo.connect(lg); lg.connect(g.gain); lfo.start(t);
      o.connect(l); l.connect(g); g.connect(amb); o.start(t); amb.__o = (amb.__o || []).concat([o, lfo]);
    });
    // vent : bruit passe-bande qui balaye
    const ws = ctx.createBufferSource(), wf = ctx.createBiquadFilter(), wg = ctx.createGain(); ws.buffer = nb; ws.loop = true; wf.type = 'bandpass'; wf.Q.value = .8; wf.frequency.value = 500; wg.gain.value = .05;
    const wl = ctx.createOscillator(), wlg = ctx.createGain(); wl.frequency.value = .07; wlg.gain.value = 300; wl.connect(wlg); wlg.connect(wf.frequency); wl.start(t);
    ws.connect(wf); wf.connect(wg); wg.connect(amb); ws.start(t); amb.__o.push(ws, wl);
    // cloches éparses
    const loop = () => { if (!on) return; const m = 45 + pick(PHRY) + pick([0, 0, 12, 12, 24]); bell(m, ctx.currentTime + .05, R(.035, .075), R(2.2, 3.4)); timers.push(setTimeout(loop, R(1800, 4800))); };
    timers.push(setTimeout(loop, 1200));
    // hulotte
    const owl = () => { if (!on) return; const t0 = ctx.currentTime + .05, f = R(330, 380); tone(f, t0, .42, { v: .05, type: 'sine', to: f * .86, rev: .9 }); tone(f * .94, t0 + .6, .55, { v: .05, type: 'sine', to: f * .8, rev: .9 }); timers.push(setTimeout(owl, R(14000, 30000))); };
    timers.push(setTimeout(owl, 6000));
    // loup lointain
    const wolf = () => { if (!on) return; howl(.06, 3.4); timers.push(setTimeout(wolf, R(40000, 80000))); };
    timers.push(setTimeout(wolf, 22000));
  }
  function ambStop() {
    if (!on) return; on = false; timers.forEach(clearTimeout); timers = [];
    if (amb) { const a = amb; a.gain.setTargetAtTime(0, ctx.currentTime, .3); setTimeout(() => { try { (a.__o || []).forEach(o => o.stop()); a.disconnect(); } catch (e) {} }, 1500); amb = null; }
    try { Snd.startMusic(); } catch (e) {}
  }
  // un « mood » : tension pendant les bonus (le drone devient plus aigu et un battement de cœur apparaît)
  let beatT = null;
  function heart(onoff) { clearInterval(beatT); beatT = null; if (!onoff) return; beatT = setInterval(() => { if (!ctx || !on) return; const t = now(); tone(58, t, .22, { v: .22, to: 38, type: 'sine' }); tone(54, t + .24, .2, { v: .16, to: 36, type: 'sine' }); }, 1150); }

  /* ----- rouleaux ----- */
  const FX = {
    click() { const t = now(); tone(520, t, .05, { v: .08, type: 'triangle' }); },
    spinStart() { const t = now(); noise(t, .8, { type: 'bandpass', f: 300, to: 2400, v: .12, q: 1.2, rev: .2 }); tone(70, t, .5, { v: .15, to: 150, type: 'sawtooth', lp: 400 }); tone(220, t, .4, { v: .05, to: 440, type: 'triangle' }); },
    reelRoll() { const t = now(); noise(t, .09, { type: 'bandpass', f: R(900, 1500), v: .035, q: 3 }); },
    reelStop(i) { const t = now(); tone(110 - i * 6, t, .2, { v: .24, to: 48, type: 'sine' }); noise(t, .06, { f: 2600, type: 'highpass', v: .09 }); tone(hz(48 + i * 2), t, .25, { v: .05, type: 'triangle' }); },
    tension() { const t = now(); tone(110, t, 1.5, { v: .1, to: 520, type: 'sawtooth', lp: 500, lpTo: 2400, a: .5, rev: .3 }); noise(t, 1.5, { type: 'highpass', f: 1500, to: 6000, v: .05, a: .8 }); },
    hat(k = 0) { const t = now(), m = 76 + [0, 2, 4, 7, 9, 12][Math.min(5, k)]; tone(hz(m), t, 1.2, { v: .13, rev: .6 }); tone(hz(m + 12), t, .8, { v: .06, type: 'triangle', rev: .5 }); tone(hz(m) * 2.76, t, .25, { v: .05 }); },
    saw() { const t = now(); noise(t, .5, { type: 'bandpass', f: 1800, to: 5200, v: .1, q: 6 }); tone(380, t, .45, { v: .06, type: 'sawtooth', to: 1100, lp: 2800 }); tone(hz(88), t + .05, .5, { v: .05, type: 'square', rev: .3 }); },
    gold() { const t = now(); [88, 91, 95, 100, 103, 107].forEach((m, i) => tone(hz(m), t + i * .07, 1.4, { v: .07, rev: .8 })); noise(t, 1, { type: 'highpass', f: 5000, v: .06, a: .2 }); tone(hz(64), t, 1.2, { v: .15, type: 'sawtooth', lp: 900, a: .1 }); },
    /* ----- gains (plusieurs jingles tirés au hasard : jamais le même « gling » deux fois d'affilée) ----- */
    win(level = 1) { // 1 petit · 2 moyen · 3 gros · 4 énorme
      const root = pick([57, 60, 62, 64]), t = now(), seq = pick([[0, 3, 7, 12], [0, 5, 7, 10, 12], [0, 3, 5, 7, 10], [0, 7, 3, 10, 12]]), n = 3 + level * 2;
      for (let i = 0; i < n; i++) { const m = root + seq[i % seq.length] + (i >= seq.length ? 12 : 0); bell(m + 12, t + i * (.09 - level * .006), .09 + level * .015, 1.2); }
      if (level >= 2) { tone(hz(root - 12), t, .8, { v: .12, type: 'triangle', rev: .3 }); noise(t + n * .08, .6, { type: 'highpass', f: 6000, v: .035 }); }
      if (level >= 3) { [0, 4, 7].forEach(k => tone(hz(root + k), t + .1, 1.6, { v: .06, type: 'sawtooth', lp: 1400, a: .08, rev: .5 })); tone(hz(root - 24), t, 1.2, { v: .2, to: hz(root - 36), type: 'sine' }); }
      if (level >= 4) { for (let i = 0; i < 9; i++) bell(root + 24 + (i % 4) * 5, t + .5 + i * .07, .08, 1.5); noise(t + .4, 2, { type: 'highpass', f: 3000, to: 9000, v: .07, a: .5 }); tone(hz(root - 12), t + .4, 2.2, { v: .12, type: 'sawtooth', lp: 600, lpTo: 2400, a: .4, rev: .5 }); }
    },
    coin(i = 0) { const t = now(), m = 84 + Math.min(i, 14); tone(hz(m), t, .18, { v: .08, type: 'square', lp: 4000 }); tone(hz(m + 7), t + .05, .22, { v: .07, type: 'triangle', rev: .3 }); },
    coinRun(n = 10, gap = .05) { for (let i = 0; i < n; i++) setTimeout(() => ctx && FX.coin(i), i * gap * 1000); },
    lanternDrop() { const t = now(); tone(1500, t, .35, { v: .05, to: 380, type: 'sine' }); setTimeout(() => ctx && tone(hz(88), now(), .5, { v: .08, rev: .6 }), 280); },
    extra() { const t = now(); [72, 76, 79, 84, 88].forEach((m, i) => bell(m, t + i * .06, .08, 1.2)); },
    frameUp(lv) {
      const t = now();
      if (lv <= 1) { noise(t, .25, { type: 'highpass', f: 2200, to: 5200, v: .09, q: .5 }); tone(hz(60), t, .18, { v: .08, type: 'triangle' }); }
      else if (lv === 2) { tone(190, t, .12, { v: .22, to: 120, type: 'triangle' }); tone(160, t + .1, .14, { v: .2, to: 100, type: 'triangle' }); noise(t, .1, { f: 1400, v: .08 }); }
      else { tone(70, t, .35, { v: .3, to: 36, type: 'sine' }); tone(hz(48) * 2.1, t, .5, { v: .1, type: 'square', lp: 2000, rev: .5 }); noise(t, .18, { f: 900, v: .16 }); tone(hz(84), t + .06, 1, { v: .05, rev: .7 }); }
    },
    sawCut() { const t = now(); noise(t, .55, { type: 'bandpass', f: 900, to: 4200, v: .13, q: 7 }); noise(t + .02, .45, { type: 'highpass', f: 3600, v: .05 }); tone(140, t, .55, { v: .1, type: 'sawtooth', to: 540, lp: 2400, vib: [28, 40] }); },
    goldHat() { const t = now(); [84, 88, 91, 96].forEach((m, i) => bell(m, t + i * .06, .09, 1.1)); noise(t, .4, { type: 'highpass', f: 4500, v: .05 }); },
    sawWhir() { const t = now(); noise(t, .7, { type: 'bandpass', f: 1200, to: 3800, v: .08, q: 5 }); tone(160, t, .7, { v: .06, type: 'sawtooth', to: 620, lp: 2000, vib: [22, 30] }); },
    megaHat() { const t = now(); tone(52, t, 1.2, { v: .34, to: 30, type: 'sine' }); noise(t, .9, { f: 400, to: 80, v: .2 }); [0, 3, 7, 10].forEach(k => tone(hz(45 + k), t + .1, 1.6, { v: .06, type: 'sawtooth', lp: 900, a: .3, rev: .6 })); },
    superUp() { const t = now(); tone(80, t, 1.4, { v: .14, to: 800, type: 'sawtooth', lp: 400, lpTo: 4000, a: .3, rev: .5 }); noise(t, 1.4, { type: 'highpass', f: 800, to: 8000, v: .08, a: .6 }); setTimeout(() => ctx && (tone(46, now(), 1.2, { v: .36, to: 28 }), noise(now(), .5, { f: 600, to: 100, v: .22 })), 1250); },
    /* ----- la roue ----- */
    wheelStart() { const t = now(); tone(hz(48), t, 1.2, { v: .12, type: 'sawtooth', lp: 500, a: .3, rev: .4 }); noise(t, .5, { type: 'bandpass', f: 600, to: 2400, v: .07, q: 1.4 }); },
    wheelTick(p = 1) { const t = now(); tone(780 * p, t, .035, { v: .14, type: 'triangle' }); tone(1560 * p, t, .02, { v: .05, type: 'square', lp: 3000 }); },
    wheelLand(kind) {
      const t = now(), up = kind === 'up';
      if (up) { for (let i = 0; i < 8; i++) tone(hz(60 + i * 3), t + i * .06, .7, { v: .09, type: 'triangle', rev: .5 }); noise(t, 1, { type: 'highpass', f: 2000, to: 8000, v: .06, a: .4 }); }
      else { [0, 4, 7, 12].forEach((k, i) => tone(hz(62 + k), t + i * .05, 1.4, { v: .09, type: 'sawtooth', lp: 1800, rev: .5 })); tone(hz(38), t, 1, { v: .22, to: 28 }); }
    },
    /* ----- le loup ----- */
    howl(big = 1) { howl(.14 * big, 2.6 + big); },
    huff() { const t = now(); noise(t, .9, { type: 'bandpass', f: 400, to: 1500, v: .2, q: .7, a: .35, rev: .35 }); noise(t + 1, .8, { type: 'bandpass', f: 500, to: 1900, v: .24, q: .7, a: .3, rev: .35 }); },
    collapse(big = 1) { const t = now(); noise(t, .9 * big, { f: 1400, to: 90, v: .26 }); tone(60, t, .6, { v: .34, to: 28, type: 'sine' }); for (let i = 0; i < 6 * big; i++) noise(t + .1 + i * .07, .1, { type: 'highpass', f: R(1500, 4000), v: .06 }); },
    prize(mult = 1) { const t = now(), m = 72 + Math.min(14, Math.floor(Math.log2(Math.max(1, mult)) * 2.2)); bell(m, t, .12, 1.2); tone(hz(m - 12), t, .5, { v: .1, type: 'triangle' }); if (mult >= 20) FX.win(2); },
    jackpot(k) { // mini · minor · major · grand · super : de plus en plus grandiose
      const lv = { mini: 1, minor: 2, major: 3, grand: 4, super: 5 }[k] || 1, t = now(), root = 55 + lv;
      for (let c = 0; c < lv + 1; c++) { [0, 4, 7, 12, 16].forEach((x, i) => tone(hz(root + x + c * 3), t + c * .55 + i * .05, 1.3, { v: .07, type: 'sawtooth', lp: 1600 + c * 400, rev: .5 })); }
      for (let i = 0; i < 6 + lv * 3; i++) bell(root + 24 + pick(PENTA) % 14, t + .2 + i * .09, .07 + lv * .01, 1.4);
      tone(hz(root - 24), t, 1.8, { v: .3, to: hz(root - 36), type: 'sine' }); noise(t, 2.4, { type: 'highpass', f: 2500, to: 9000, v: .07 + lv * .01, a: .5 });
      if (lv >= 4) { tone(300, t, 2.2, { v: .06, type: 'sine', to: 900, vib: [5, 40], rev: .6 }); howl(.14, 3.4); }
    },
    gambleCard() { const t = now(); noise(t, .12, { type: 'highpass', f: 3000, v: .08 }); tone(hz(70), t + .05, .2, { v: .06, type: 'triangle' }); },
    gambleWin() { const t = now(); [67, 71, 74, 79].forEach((m, i) => bell(m, t + i * .07, .1, 1)); },
    gambleLose() { const t = now(); tone(hz(55), t, .9, { v: .2, to: hz(40), type: 'sawtooth', lp: 700 }); tone(hz(54), t + .05, .9, { v: .14, to: hz(39), type: 'sawtooth', lp: 600 }); },
    bigBanner() { const t = now(); tone(hz(43), t, 1.6, { v: .26, to: hz(36), type: 'sine' }); [0, 7, 12, 15].forEach((k, i) => tone(hz(55 + k), t + .05 + i * .04, 1.5, { v: .06, type: 'sawtooth', lp: 1200, rev: .6 })); }
  };
  function howl(v, dur) { // hurlement de loup : glissando de voix avec vibrato + souffle
    const t = now(), f0 = R(250, 300);
    const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.9, t + dur * .38); o.frequency.linearRampToValueAtTime(f0 * 1.65, t + dur * .65); o.frequency.exponentialRampToValueAtTime(f0 * .8, t + dur);
    l.frequency.value = 5.5; lg.gain.value = 9; l.connect(lg); lg.connect(o.frequency);
    f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1300, t + dur * .4); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * .25); g.gain.setValueAtTime(v, t + dur * .6); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(dest); if (rev) { const s = ctx.createGain(); s.gain.value = .8; g.connect(s); s.connect(rev); }
    o.start(t); l.start(t); o.stop(t + dur + .1); l.stop(t + dur + .1);
    noise(t, dur, { type: 'bandpass', f: 900, v: v * .25, q: 2, a: dur * .3, rev: .6 });
  }
  const api = { start: ambStart, stop: ambStop, heart, ready, isOn: () => on };
  Object.keys(FX).forEach(k => { api[k] = (...a) => { try { if (!ctx && !ready()) return; if (ctx.state === 'suspended') ctx.resume(); FX[k](...a); } catch (e) {} }; });
  return api;
})();
