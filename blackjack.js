/* ============================================================
   blackjack.js — règles du blackjack, sans réseau ni horloge (testable seul).

   Règles appliquées (blackjack "européen/US" classique) :
   - 1 jeu de 52 cartes, mélangé à chaque main (provably fair, voir server.js).
   - Cartes : 2-10 = valeur faciale, V/D/R = 10, As = 11 ou 1 (le meilleur total qui ne saute pas).
   - Blackjack naturel (As + 10 sur les 2 premières cartes) : payé 3:2.
   - Le croupier tire jusqu'à 16 et RESTE SUR TOUS LES 17 (même "souple").
   - Le croupier regarde sa carte cachée quand il montre un As ou une carte de 10 :
     s'il a blackjack, la main s'arrête tout de suite (pas de doublage ni de split perdus).
   - Assurance quand le croupier montre un As : coûte la moitié de la mise, paie 2:1.
   - Doubler : sur les 2 premières cartes d'une main (aussi après un split), une seule carte ensuite.
   - Séparer (split) : 2 cartes de même valeur (10, V, D, R comptent pareil), un seul split par main.
     Après split, chaque main reçoit une carte ; un As séparé ne reçoit qu'une carte ;
     un 21 après split compte 21 (pas un blackjack, payé 1:1).
   - Égalité = mise rendue. Un joueur qui saute perd tout de suite.

   Codage des cartes : { r, s } avec r : 0 = As, 1..8 = 2..9, 9 = 10, 10 = Valet, 11 = Dame, 12 = Roi.
   ============================================================ */
'use strict';

const val = r => (r === 0 ? 11 : Math.min(r + 1, 10));      // valeur "haute" (l'As compte 11)
const pairVal = r => Math.min(r + 1, 10);                    // pour le split : As = 1, figures = 10

function score(cards) {
    let total = 0, aces = 0;
    for (const c of cards) { total += val(c.r); if (c.r === 0) aces++; }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, soft: aces > 0 }; // soft = un As est encore compté 11
}
const isBlackjack = (cards, split) => !split && cards.length === 2 && score(cards).total === 21;

const newHand = (cards, bet, split = false) => ({ cards, bet, doubled: false, done: false, split });

// Distribue : joueur, croupier (visible), joueur, croupier (cachée). `deck` est déjà mélangé (on pioche avec pop()).
function deal(deck, bet) {
    const p = [deck.pop()], d = [deck.pop()];
    p.push(deck.pop()); d.push(deck.pop());
    const r = { deck, bet, hands: [newHand(p, bet)], active: 0, dealer: d, insurance: 0, holeRevealed: false, phase: 'player', result: null };
    if (d[0].r === 0 && Math.floor(bet / 2) >= 1) { r.phase = 'insurance'; return r; } // le croupier montre un As : on propose l'assurance (si la moitié de la mise fait au moins 1 jeton)
    return resolveNaturals(r);
}

// Le croupier regarde sa carte cachée (As/10 visibles) et on règle les blackjacks naturels.
function resolveNaturals(r) {
    r.phase = 'player';
    const dBJ = isBlackjack(r.dealer), pBJ = isBlackjack(r.hands[0].cards);
    if (dBJ || pBJ) return finish(r, false);
    return r;
}

// Réponse à l'offre d'assurance. Renvoie le round ; le coût (moitié de la mise) est géré par l'appelant via insuranceCost().
const insuranceCost = r => Math.floor(r.hands[0].bet / 2);
function insure(r, take) {
    if (r.phase !== 'insurance') return r;
    if (take) { r.insurance = insuranceCost(r); r.bet += r.insurance; }
    return resolveNaturals(r);
}

const activeHand = r => r.hands[r.active];

function advance(r) {
    while (r.active < r.hands.length && r.hands[r.active].done) r.active++;
    if (r.active >= r.hands.length) return finish(r, true);
    return r;
}

function hit(r) {
    if (r.phase !== 'player') return r;
    const h = activeHand(r);
    h.cards.push(r.deck.pop());
    if (score(h.cards).total >= 21) h.done = true; // saute ou 21 : la main s'arrête
    return advance(r);
}
function stand(r) {
    if (r.phase !== 'player') return r;
    activeHand(r).done = true;
    return advance(r);
}
const canDouble = r => r.phase === 'player' && activeHand(r).cards.length === 2 && !activeHand(r).done;
function doubleDown(r) {
    if (!canDouble(r)) return r;
    const h = activeHand(r);
    r.bet += h.bet; h.bet *= 2; h.doubled = true;
    h.cards.push(r.deck.pop());
    h.done = true;
    return advance(r);
}
const canSplit = r => r.phase === 'player' && r.hands.length === 1 && activeHand(r).cards.length === 2
    && pairVal(activeHand(r).cards[0].r) === pairVal(activeHand(r).cards[1].r);
function split(r) {
    if (!canSplit(r)) return r;
    const h = r.hands[0], aces = h.cards[0].r === 0;
    const second = newHand([h.cards.pop()], h.bet, true);
    h.split = true;
    r.bet += h.bet;
    r.hands = [h, second];
    h.cards.push(r.deck.pop()); second.cards.push(r.deck.pop());
    for (const x of r.hands) if (aces || score(x.cards).total === 21) x.done = true; // As séparé : 1 carte, point final
    r.active = 0;
    return advance(r);
}

// Le croupier joue (une seule fois, quand toutes les mains du joueur sont terminées), puis on règle.
function finish(r, dealerPlays) {
    r.holeRevealed = true;
    if (dealerPlays && r.hands.some(h => score(h.cards).total <= 21)) {
        while (score(r.dealer).total < 17) r.dealer.push(r.deck.pop()); // reste sur tous les 17
    }
    r.phase = 'done';
    r.result = settle(r);
    return r;
}

// Résultat de chaque main + assurance. `winnings` = ce qui est rendu au joueur (mise comprise), peut finir par .5 (blackjack sur mise impaire).
function settle(r) {
    const ds = score(r.dealer).total, dBJ = isBlackjack(r.dealer);
    const hands = r.hands.map(h => {
        const ps = score(h.cards).total, pBJ = isBlackjack(h.cards, h.split);
        const outcome = pBJ ? (dBJ ? 'push' : 'blackjack')
            : dBJ ? 'lose'
            : ps > 21 ? 'bust'
            : ds > 21 ? 'win'
            : ps > ds ? 'win' : ps === ds ? 'push' : 'lose';
        const winnings = outcome === 'blackjack' ? h.bet * 2.5 : outcome === 'win' ? h.bet * 2 : outcome === 'push' ? h.bet : 0;
        return { outcome, winnings, bet: h.bet };
    });
    const insuranceWin = dBJ ? r.insurance * 3 : 0; // assurance : mise rendue + 2:1
    const winnings = hands.reduce((a, h) => a + h.winnings, 0) + insuranceWin;
    return { hands, insuranceWin, insuranceStake: r.insurance, dealerBJ: dBJ, winnings, committed: r.bet };
}

// Vue publique d'une main (la carte cachée du croupier n'est jamais envoyée tant qu'elle n'est pas révélée).
function publicView(r, balance = 0) {
    const act = r.phase === 'player' ? activeHand(r) : null;
    const show = r.holeRevealed ? r.dealer : r.dealer.slice(0, 1);
    const ds = score(show);
    return {
        phase: r.phase === 'done' ? 'idle' : r.phase,
        bet: r.bet,
        active: r.active,
        hands: r.hands.map((h, i) => {
            const s = score(h.cards);
            return { cards: h.cards.slice(), bet: h.bet, doubled: h.doubled, done: h.done, total: s.total, soft: s.soft,
                bj: isBlackjack(h.cards, h.split), outcome: r.result ? r.result.hands[i].outcome : null };
        }),
        dealer: { cards: show.slice(), total: ds.total, soft: ds.soft, hidden: !r.holeRevealed, bj: r.holeRevealed && isBlackjack(r.dealer) },
        can: {
            double: !!act && canDouble(r) && balance >= act.bet,
            split: !!act && canSplit(r) && balance >= act.bet
        },
        insuranceOffer: r.phase === 'insurance' ? insuranceCost(r) : 0,
        insurance: r.insurance
    };
}

module.exports = { val, score, isBlackjack, deal, insure, insuranceCost, hit, stand, doubleDown, split, canDouble, canSplit, settle, publicView };
