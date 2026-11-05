/* ============================================================
   plinko-tables.js — tables de multiplicateurs du Plinko (partagé serveur + navigateur)
   8 à 16 rangées, 4 niveaux de risque : low / medium / high / ultra.
   • 16 rangées (low/medium/high) : valeurs classiques des casinos (16×…1000× sur les bords).
   • Autres rangées : mêmes extrémités "casino", profil intermédiaire interpolé.
   • Ultra : bords = 0,25 × 2^rangées (16 384× à 16 rangées).
   Dans TOUS les cas, les cases intérieures sont recalées pour que le RTP soit EXACTEMENT 98,5 %
   (les deux cases des bords restent intactes) : Σ P(case) × multiplicateur = 0,985.
   Probabilité de la case k = C(n,k) / 2^n.
   ============================================================ */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PlinkoTables = factory(); })(this, function () {
  const RTP = 0.985, MIN_ROWS = 8, MAX_ROWS = 16, RISKS = ['low', 'medium', 'high', 'ultra'];
  const EDGE = { 8: [5.6, 13, 29], 9: [5.6, 18, 43], 10: [8.9, 22, 76], 11: [8.4, 24, 120], 12: [10, 33, 170], 13: [8.1, 43, 260], 14: [7.1, 58, 420], 15: [15, 88, 620], 16: [16, 110, 1000] };
  const CENTER = { low: .5, medium: .3, high: .2, ultra: .1 };
  const POW = { low: 2.6, medium: 1.55, high: 1.8, ultra: 3 };
  const OFFICIAL16 = { // moitié gauche, du bord vers le centre
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5], medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3], high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2] };
  const probs = n => { const p = []; let c = 1; for (let k = 0; k <= n; k++) { p.push(c / Math.pow(2, n)); c = c * (n - k) / (k + 1); } return p; };
  const cache = {};
  function build(n, risk) {
    const key = n + risk; if (cache[key]) return cache[key];
    const P = probs(n), idx = RISKS.indexOf(risk);
    const edge = risk === "ultra" ? 0.25 * Math.pow(2, n) : EDGE[n][idx], pw = POW[risk];
    const profile = Cc => { // moitié gauche, du bord vers le centre
      const half = [];
      for (let i = 0; i <= Math.floor(n / 2); i++) {
        if (n === 16 && OFFICIAL16[risk]) { half.push(OFFICIAL16[risk][i]); continue; }
        const x = (n / 2 - i) / (n / 2); // 1 = bord, 0 = centre
        half.push(i === 0 ? edge : Cc * Math.pow(edge / Cc, Math.pow(x, pw)));
      }
      const mm = []; for (let k = 0; k <= n; k++) mm.push(half[Math.min(k, n - k)]);
      return mm;
    };
    const rtpOf = mm => mm.reduce((a, v, k) => a + v * P[k], 0);
    let C = CENTER[risk];
    if (!(n === 16 && OFFICIAL16[risk])) { // on cherche la valeur du centre qui donne ~98,5 % (profil naturel), le recalage final ne sert qu'à l'exactitude
      let lo = .02, hi = 1.2;
      for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; (rtpOf(profile(mid)) > RTP ? (hi = mid) : (lo = mid)); }
      C = (lo + hi) / 2;
    }
    const m = profile(C);
    let sEdge = P[0] * m[0] + P[n] * m[n], sIn = 0;
    for (let k = 1; k < n; k++) sIn += P[k] * m[k];
    const f = (RTP - sEdge) / sIn;
    for (let k = 1; k < n; k++) m[k] *= f;
    return (cache[key] = { mult: m, prob: P });
  }
  const multipliers = (n, risk) => build(n, risk).mult;
  const rtp = (n, risk) => { const t = build(n, risk); return t.mult.reduce((a, x, k) => a + x * t.prob[k], 0); };
  const fmt = x => x >= 1000 ? Math.round(x).toLocaleString('fr-FR') : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1).replace('.0', '') : x.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
  return { RTP, MIN_ROWS, MAX_ROWS, RISKS, multipliers, probs, rtp, fmt };
});
