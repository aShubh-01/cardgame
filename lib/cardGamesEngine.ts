import type { PokerCard, Player, Round } from '../types/game.ts';
import { dealCards } from './virtualDeck.ts';

const RANK_VAL: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14,
};

export function cardRankVal(rank: string): number {
  return RANK_VAL[rank] || 0;
}

/* ══════════════════════════════════════════════════════════════════
   1. TEXAS HOLD'EM 5-TO-7 CARD HAND EVALUATOR
   ══════════════════════════════════════════════════════════════════ */

function evaluate5CardPoker(cards: PokerCard[]): { score: number; rankName: string } {
  const vals = cards.map(c => cardRankVal(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  // Check straight (including A-2-3-4-5 wheel)
  let isStraight = false;
  let straightHigh = vals[0];
  const uniqueVals = Array.from(new Set(vals));
  if (uniqueVals.length === 5) {
    if (vals[0] - vals[4] === 4) {
      isStraight = true;
      straightHigh = vals[0];
    } else if (vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  const counts: Record<number, number> = {};
  vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  const groups = Object.entries(counts)
    .map(([val, cnt]) => ({ val: Number(val), cnt }))
    .sort((a, b) => b.cnt - a.cnt || b.val - a.val);

  const encodeKickers = (arr: number[]) =>
    arr.reduce((acc, v, i) => acc + v * Math.pow(15, 4 - i), 0);

  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return { score: 9 * 1e7 + 14, rankName: 'Royal Flush' };
    }
    return { score: 8 * 1e7 + straightHigh, rankName: 'Straight Flush' };
  }

  if (groups[0].cnt === 4) {
    return {
      score: 7 * 1e7 + groups[0].val * 100 + groups[1].val,
      rankName: 'Four of a Kind',
    };
  }

  if (groups[0].cnt === 3 && groups[1].cnt === 2) {
    return {
      score: 6 * 1e7 + groups[0].val * 100 + groups[1].val,
      rankName: 'Full House',
    };
  }

  if (isFlush) {
    return {
      score: 5 * 1e7 + encodeKickers(vals),
      rankName: 'Flush',
    };
  }

  if (isStraight) {
    return {
      score: 4 * 1e7 + straightHigh,
      rankName: 'Straight',
    };
  }

  if (groups[0].cnt === 3) {
    return {
      score: 3 * 1e7 + groups[0].val * 10000 + groups[1].val * 100 + groups[2].val,
      rankName: 'Three of a Kind',
    };
  }

  if (groups[0].cnt === 2 && groups[1].cnt === 2) {
    const highPair = Math.max(groups[0].val, groups[1].val);
    const lowPair = Math.min(groups[0].val, groups[1].val);
    return {
      score: 2 * 1e7 + highPair * 10000 + lowPair * 100 + groups[2].val,
      rankName: 'Two Pair',
    };
  }

  if (groups[0].cnt === 2) {
    return {
      score: 1 * 1e7 + groups[0].val * 100000 + groups[1].val * 1000 + groups[2].val * 50 + groups[3].val,
      rankName: 'One Pair',
    };
  }

  return {
    score: encodeKickers(vals),
    rankName: 'High Card',
  };
}

export function evaluatePokerHand(cards: PokerCard[]): { score: number; rankName: string } {
  if (!Array.isArray(cards) || cards.length === 0) {
    return { score: 0, rankName: '' };
  }
  if (cards.length < 5) {
    const sorted = [...cards].sort((a, b) => cardRankVal(b.rank) - cardRankVal(a.rank));
    if (sorted.length >= 2 && sorted[0].rank === sorted[1].rank) {
      return { score: 1e7 + cardRankVal(sorted[0].rank), rankName: `Pair of ${sorted[0].rank}s` };
    }
    return { score: cardRankVal(sorted[0].rank), rankName: `${sorted[0].rank} High` };
  }

  let best = { score: -1, rankName: 'High Card' };
  const n = cards.length;
  for (let i = 0; i < n - 4; i++) {
    for (let j = i + 1; j < n - 3; j++) {
      for (let k = j + 1; k < n - 2; k++) {
        for (let l = k + 1; l < n - 1; l++) {
          for (let m = l + 1; m < n; m++) {
            const res = evaluate5CardPoker([cards[i], cards[j], cards[k], cards[l], cards[m]]);
            if (res.score > best.score) {
              best = res;
            }
          }
        }
      }
    }
  }
  return best;
}

export function evaluateAllPokerHands(
  hands: Record<string, PokerCard[]>,
  board: PokerCard[],
  activeIds: string[]
): {
  evaluations: Record<string, { rankName: string; score: number }>;
  bestPlayerIds: string[];
} {
  const evaluations: Record<string, { rankName: string; score: number }> = {};
  let maxScore = -1;
  let bestPlayerIds: string[] = [];

  for (const id of activeIds) {
    const hole = hands?.[id];
    if (!Array.isArray(hole) || hole.length === 0) continue;
    const ev = evaluatePokerHand([...hole, ...(board || [])]);
    evaluations[id] = ev;
    if (ev.score > maxScore) {
      maxScore = ev.score;
      bestPlayerIds = [id];
    } else if (ev.score === maxScore) {
      bestPlayerIds.push(id);
    }
  }

  return { evaluations, bestPlayerIds };
}

/* ══════════════════════════════════════════════════════════════════
   2. TEEN PATTI 3-CARD HAND EVALUATOR
   ══════════════════════════════════════════════════════════════════ */

export function evaluateTeenPattiHand(cards: PokerCard[]): { score: number; rankName: string } {
  if (!Array.isArray(cards) || cards.length < 3) {
    return { score: 0, rankName: '' };
  }

  const vals = cards.map(c => cardRankVal(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits[0] === suits[1] && suits[1] === suits[2];

  const isTrail = vals[0] === vals[1] && vals[1] === vals[2];
  // In Teen Patti: A-K-Q is highest sequence, A-2-3 is 2nd highest sequence!
  const isAKQ = vals[0] === 14 && vals[1] === 13 && vals[2] === 12;
  const isA23 = vals[0] === 14 && vals[1] === 3 && vals[2] === 2;
  const isNormalSeq = vals[0] - vals[1] === 1 && vals[1] - vals[2] === 1;
  const isSeq = isAKQ || isA23 || isNormalSeq;

  const seqRankScore = isAKQ ? 15 : isA23 ? 14 : vals[0];
  const kickerScore = vals[0] * 225 + vals[1] * 15 + vals[2];

  if (isTrail) {
    return {
      score: 6 * 1e5 + vals[0] * 1000,
      rankName: `Trail of ${cards[0].rank}s`,
    };
  }

  if (isFlush && isSeq) {
    return {
      score: 5 * 1e5 + seqRankScore * 1000,
      rankName: 'Pure Sequence',
    };
  }

  if (isSeq) {
    return {
      score: 4 * 1e5 + seqRankScore * 1000,
      rankName: 'Sequence',
    };
  }

  if (isFlush) {
    return {
      score: 3 * 1e5 + kickerScore,
      rankName: 'Color (Flush)',
    };
  }

  if (vals[0] === vals[1] || vals[1] === vals[2]) {
    const pairVal = vals[1];
    const kicker = vals[0] === vals[1] ? vals[2] : vals[0];
    const pairCard = cards.find(c => cardRankVal(c.rank) === pairVal);
    return {
      score: 2 * 1e5 + pairVal * 500 + kicker,
      rankName: `Pair of ${pairCard?.rank || pairVal}s`,
    };
  }

  const highCard = cards.find(c => cardRankVal(c.rank) === vals[0]);
  return {
    score: 1 * 1e5 + kickerScore,
    rankName: `${highCard?.rank || ''} High Card`,
  };
}

export function evaluateAllTeenPattiHands(
  hands: Record<string, PokerCard[]>,
  activeIds: string[],
  challengerId?: string
): {
  evaluations: Record<string, { rankName: string; score: number }>;
  bestWinnerId: string | null;
} {
  const evaluations: Record<string, { rankName: string; score: number }> = {};
  let maxScore = -1;
  let bestWinnerId: string | null = null;

  // Put non-challenger first so that in case of an exact tie during a Show,
  // the defender (non-challenger) wins per official Teen Patti rules.
  const orderedIds = challengerId
    ? [...activeIds.filter(id => id !== challengerId), ...activeIds.filter(id => id === challengerId)]
    : activeIds;

  for (const id of orderedIds) {
    const hand = hands?.[id];
    if (!Array.isArray(hand) || hand.length < 3) continue;
    const ev = evaluateTeenPattiHand(hand);
    evaluations[id] = ev;
    if (ev.score > maxScore) {
      maxScore = ev.score;
      bestWinnerId = id;
    }
  }

  return { evaluations, bestWinnerId };
}

/* ══════════════════════════════════════════════════════════════════
   3. BLACKJACK 21 HAND EVALUATOR & DEALER ENGINE
   ══════════════════════════════════════════════════════════════════ */

export function evaluateBlackjackHand(cards: PokerCard[]): {
  total: number;
  soft: boolean;
  isBlackjack: boolean;
  isBusted: boolean;
  label: string;
} {
  if (!Array.isArray(cards) || cards.length === 0) {
    return { total: 0, soft: false, isBlackjack: false, isBusted: false, label: '0' };
  }

  let total = 0;
  let aces = 0;

  for (const c of cards) {
    if (!c || (c as any).hidden || c.rank === '?') continue;
    if (c.rank === 'A') {
      aces += 1;
      total += 11;
    } else if (['K', 'Q', 'J', '10'].includes(c.rank)) {
      total += 10;
    } else {
      total += Number(c.rank) || 0;
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  const visibleCards = cards.filter(c => c && !(c as any).hidden && c.rank !== '?');
  const isBlackjack = visibleCards.length === 2 && total === 21;
  const isBusted = total > 21;
  const soft = aces > 0 && total <= 21;

  let label = String(total);
  if (isBlackjack) label = '21 · BLACKJACK!';
  else if (isBusted) label = `${total} · BUST`;
  else if (soft && total < 21) label = `Soft ${total}`;

  return { total, soft, isBlackjack, isBusted, label };
}

export function advanceBlackjackTurnOrSettle(
  round: Round,
  players: Player[],
  balanceMode: boolean
): Round {
  const parts = round.parts || [];
  const statusMap = { ...(round.bjStatus || {}) };

  // Find next player who is still 'playing'
  const currentIdx = parts.indexOf(round.turn);
  let nextPlayerId: string | null = null;
  for (let i = 1; i <= parts.length; i++) {
    const candidate = parts[(currentIdx + i) % parts.length];
    if (statusMap[candidate] === 'playing') {
      nextPlayerId = candidate;
      break;
    }
  }

  if (nextPlayerId) {
    return {
      ...round,
      turn: nextPlayerId,
      bjStatus: statusMap,
    };
  }

  // All players have completed their actions! Reveal dealer hole card & run dealer to 17
  let deck = [...(round.deck || [])];
  let dealerHand: PokerCard[] = Array.isArray(round.dealerHand) ? [...round.dealerHand] : [];
  const log = [...(round.log || [])];

  let dealerEval = evaluateBlackjackHand(dealerHand);
  log.push(`🏦 Dealer reveals hole card: ${dealerHand.map(c => `${c.rank}${c.suit}`).join(' ')} (${dealerEval.label})`);

  // Dealer draws on 16 or less, stands on all 17s
  const allPlayersBusted = parts.every(id => statusMap[id] === 'busted');
  while (!allPlayersBusted && dealerEval.total < 17 && deck.length > 0) {
    const drawn = dealCards(deck, 1);
    const card = drawn.dealt[0];
    deck = drawn.remaining;
    dealerHand.push(card);
    dealerEval = evaluateBlackjackHand(dealerHand);
    log.push(`🏦 Dealer hits ${card.rank}${card.suit} → ${dealerEval.label}`);
  }

  if (!allPlayersBusted && !dealerEval.isBusted) {
    log.push(`🏦 Dealer stands at ${dealerEval.total}`);
  }

  // Compute outcomes for each player
  const bjOutcomes: Record<string, { outcome: string; net: number; total: number }> = {};
  for (const pid of parts) {
    const pHand: PokerCard[] = round.hands?.[pid] || [];
    const pEval = evaluateBlackjackHand(pHand);
    const bet = round.contrib?.[pid] || round.stake || 100;
    const pName = players.find(p => p.id === pid)?.name || pid;

    let outcome: 'blackjack' | 'win' | 'loss' | 'push' = 'loss';
    let net = -bet;

    if (pEval.isBusted) {
      outcome = 'loss';
      net = -bet;
    } else if (pEval.isBlackjack && !dealerEval.isBlackjack) {
      outcome = 'blackjack';
      net = Math.round(bet * 1.5);
    } else if (dealerEval.isBlackjack && !pEval.isBlackjack) {
      outcome = 'loss';
      net = -bet;
    } else if (dealerEval.isBusted) {
      outcome = 'win';
      net = bet;
    } else if (pEval.total > dealerEval.total) {
      outcome = 'win';
      net = bet;
    } else if (pEval.total < dealerEval.total) {
      outcome = 'loss';
      net = -bet;
    } else {
      outcome = 'push';
      net = 0;
    }

    bjOutcomes[pid] = { outcome, net, total: pEval.total };
    log.push(
      `${pName} (${pEval.total}): ${outcome.toUpperCase()} ${net >= 0 ? `+₹${net}` : `-₹${Math.abs(net)}`}`
    );
  }

  return {
    ...round,
    phase: 'result',
    dealerHand,
    dealerHoleRevealed: true,
    deck,
    bjStatus: statusMap,
    bjOutcomes,
    log,
  };
}

/* ══════════════════════════════════════════════════════════════════
   4. INDIAN RUMMY CARD POINTS & SORT HELPERS
   ══════════════════════════════════════════════════════════════════ */

export function rummyCardPoints(card: PokerCard, jokerRank?: string): number {
  if (!card) return 0;
  if (jokerRank && card.rank === jokerRank) return 0;
  if (['A', 'K', 'Q', 'J', '10'].includes(card.rank)) return 10;
  return Number(card.rank) || 0;
}

/**
 * Automatically evaluates a player's Rummy hand to find optimal melds (sequences & sets)
 * and returns the minimum deadwood penalty points (capped at maxCap, minimum 2 for losers).
 */
export function calculateRummyOptimalDeadwood(
  cards: PokerCard[],
  jokerRank?: string,
  maxCap: number = 80
): number {
  if (!Array.isArray(cards) || cards.length === 0) return 0;

  const isWild = (c: PokerCard) => Boolean(jokerRank && c.rank === jokerRank);
  const nonWild = cards.filter(c => !isWild(c));
  const wildCount = cards.length - nonWild.length;

  // Generate all valid candidate melds of size 3 or 4 from nonWild indices using up to w wilds
  interface CandidateMeld {
    mask: number; // bitmask of nonWild indices used
    wildsUsed: number;
    isPureSeq: boolean;
    isSeq: boolean;
  }

  const candidates: CandidateMeld[] = [];
  const m = nonWild.length;

  // Check if a subset of nonWild cards + w wilds forms a valid sequence or set
  const checkSubset = (indices: number[], w: number) => {
    const totalLen = indices.length + w;
    if (totalLen < 3 || totalLen > 4) return;
    const sub = indices.map(i => nonWild[i]);
    const mask = indices.reduce((acc, i) => acc | (1 << i), 0);

    // 1. Check Set: all same rank, all distinct suits
    const sameRank = sub.every(c => c.rank === sub[0].rank);
    if (sameRank) {
      const suits = new Set(sub.map(c => c.suit));
      if (suits.size === sub.length) {
        candidates.push({ mask, wildsUsed: w, isPureSeq: false, isSeq: false });
      }
    }

    // 2. Check Sequence: all same suit, consecutive ranks (A can be high 14 or low 1)
    const sameSuit = sub.every(c => c.suit === sub[0].suit);
    if (sameSuit) {
      const ranksHigh = sub.map(c => cardRankVal(c.rank)).sort((a, b) => a - b);
      const ranksLow = sub.map(c => (c.rank === 'A' ? 1 : cardRankVal(c.rank))).sort((a, b) => a - b);

      const canSpan = (vals: number[]) => {
        for (let i = 1; i < vals.length; i++) {
          if (vals[i] === vals[i - 1]) return false; // duplicate rank in same suit
        }
        const span = vals[vals.length - 1] - vals[0] + 1;
        return span <= totalLen;
      };

      if (canSpan(ranksHigh) || canSpan(ranksLow)) {
        candidates.push({
          mask,
          wildsUsed: w,
          isPureSeq: w === 0,
          isSeq: true,
        });
      }
    }
  };

  // Subsets of size 1..4 of nonWild
  for (let i = 0; i < m; i++) {
    for (let w = 2; w <= Math.min(2, wildCount); w++) checkSubset([i], w);
    for (let j = i + 1; j < m; j++) {
      for (let w = 1; w <= Math.min(2, wildCount); w++) checkSubset([i, j], w);
      for (let k = j + 1; k < m; k++) {
        for (let w = 0; w <= Math.min(1, wildCount); w++) checkSubset([i, j, k], w);
        for (let l = k + 1; l < m; l++) {
          checkSubset([i, j, k, l], 0);
        }
      }
    }
  }

  const totalRawPts = nonWild.reduce((sum, c) => sum + rummyCardPoints(c, jokerRank), 0);
  let bestDeadwood = Math.min(maxCap, totalRawPts);

  // DFS to find disjoint melds maximizing melded points (requiring at least 1 pure sequence to meld sets)
  const dfs = (idx: number, usedMask: number, usedWilds: number, hasPure: boolean, seqCount: number) => {
    // Calculate deadwood of unused nonWild cards
    let unmeldedPts = 0;
    for (let i = 0; i < m; i++) {
      if (!(usedMask & (1 << i))) {
        unmeldedPts += rummyCardPoints(nonWild[i], jokerRank);
      }
    }
    if (hasPure && unmeldedPts < bestDeadwood) {
      bestDeadwood = unmeldedPts;
    }

    for (let c = idx; c < candidates.length; c++) {
      const cand = candidates[c];
      if ((cand.mask & usedMask) !== 0) continue;
      if (usedWilds + cand.wildsUsed > wildCount) continue;
      dfs(
        c + 1,
        usedMask | cand.mask,
        usedWilds + cand.wildsUsed,
        hasPure || cand.isPureSeq,
        seqCount + (cand.isSeq ? 1 : 0)
      );
    }
  };

  dfs(0, 0, 0, false, 0);
  return Math.min(maxCap, Math.max(2, bestDeadwood));
}

export function sortRummyHand(cards: PokerCard[], mode: 'suit' | 'rank' = 'suit'): PokerCard[] {
  const suitOrder: Record<string, number> = { '♠': 1, '♥': 2, '♣': 3, '♦': 4 };
  return [...cards].sort((a, b) => {
    if (mode === 'suit') {
      const sDiff = (suitOrder[a.suit] || 9) - (suitOrder[b.suit] || 9);
      if (sDiff !== 0) return sDiff;
      return cardRankVal(a.rank) - cardRankVal(b.rank);
    }
    const rDiff = cardRankVal(a.rank) - cardRankVal(b.rank);
    if (rDiff !== 0) return rDiff;
    return (suitOrder[a.suit] || 9) - (suitOrder[b.suit] || 9);
  });
}

