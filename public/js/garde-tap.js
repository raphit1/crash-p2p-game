/* =====================================================================
   GARDE ANTI « APPUI FANTÔME »
   Quand un bouton d'action apparaît ou change de rôle sous le doigt du joueur
   (Avancer → Lancer après une défaite, Parier → Encaisser au départ du Crash,
   Encaisser → Lancer aux Mines / Icefield / Hi-Lo, Distribuer → Rester…),
   les appuis sur ce bouton sont ignorés tant que le joueur continue de spammer :
   l'action ne part qu'après une vraie pause (GARDE ms sans appui).
   Sans ça, spammer « Avancer » au Chicken Road relançait une partie (nouvelle
   mise débitée) dès que le poulet mourait.
   Les boutons qui ne changent pas de rôle (Lancer les dés, Tourner…) et ceux marqués
   data-garde="non" (Avancer au Chicken Road) ne sont jamais bloqués : on peut les spammer.
   ===================================================================== */
(() => {
  const SEL = '.cz-cta button, #betPanels button.act, #hlBtns button';
  const GARDE = 600; // ms

  // visible = pas caché par la classe .hidden / l'attribut hidden / un display:none en ligne (sans forcer de calcul de mise en page)
  const visible = b => !b.disabled && !b.closest('.hidden,[hidden],[style*="display: none"],[style*="display:none"]');
  // rôle = couleur du bouton (or = lancer/parier, vert = encaisser, rubis…) ; un simple changement de texte (montant) ne compte pas
  const role = b => (b.className.match(/cz-btn--(gold|green|ruby)|ja-(gold|green|set|next|wait)/g) || []).join(',');
  const sig = b => (visible(b) ? 'v' : 'h') + '|' + role(b);

  const scan = () => {
    const now = performance.now();
    document.querySelectorAll(SEL).forEach(b => {
      const s = sig(b);
      if (b._czSig !== undefined && b._czSig !== s && s[0] === 'v') b._czArm = now; // vient d'apparaître ou de changer de rôle
      b._czSig = s;
    });
  };
  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; scan(); }); } };
  new MutationObserver(later).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'disabled'] });

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest(SEL);
    if (!b || b.dataset.garde === 'non') return; // data-garde="non" : bouton qu'on a le droit de spammer (ex. Avancer au Chicken Road)
    scan(); // le changement a pu arriver dans la même image que l'appui
    const now = performance.now();
    if (b._czArm && now - b._czArm < GARDE) {
      b._czArm = now; // chaque appui pendant la garde la prolonge : un spam continu ne déclenche jamais l'action
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);

  scan();
})();
