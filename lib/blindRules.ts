import type { Player } from '../types/game.ts';

export interface PokerPositions {
  dealerId: string;
  sbId: string;
  bbId: string;
  firstToActPreFlopId: string;
  firstToActPostFlopId: string;
}

/**
 * Calculates Poker positions (Dealer, SB, BB, UTG) based on active players and dealer index.
 * Standard Texas Hold'em Rules:
 * - Heads-Up (2 players):
 *   Dealer is Small Blind (acts first pre-flop, second post-flop).
 *   Non-Dealer is Big Blind (acts second pre-flop, first post-flop).
 * - 3+ players:
 *   Dealer = active[dealerIdx]
 *   SB = active[(dealerIdx + 1) % N]
 *   BB = active[(dealerIdx + 2) % N]
 *   UTG (first pre-flop) = active[(dealerIdx + 3) % N]
 *   First post-flop = SB (or next clockwise from Dealer)
 */
export function getPokerBlindPositions(
  activePlayerIds: string[],
  dealerIdx: number
): PokerPositions {
  const n = activePlayerIds.length;
  if (n < 2) {
    throw new Error('Poker requires at least 2 active players.');
  }

  const dIdx = ((dealerIdx % n) + n) % n;
  const dealerId = activePlayerIds[dIdx];

  if (n === 2) {
    const nonDealerId = activePlayerIds[(dIdx + 1) % 2];
    return {
      dealerId,
      sbId: dealerId,
      bbId: nonDealerId,
      firstToActPreFlopId: dealerId,
      firstToActPostFlopId: nonDealerId,
    };
  }

  const sbId = activePlayerIds[(dIdx + 1) % n];
  const bbId = activePlayerIds[(dIdx + 2) % n];
  const firstToActPreFlopId = activePlayerIds[(dIdx + 3) % n];
  const firstToActPostFlopId = sbId;

  return {
    dealerId,
    sbId,
    bbId,
    firstToActPreFlopId,
    firstToActPostFlopId,
  };
}

export interface PostPokerBlindsParams {
  players: Player[];
  activePlayerIds: string[];
  sbId: string;
  bbId: string;
  sbAmt: number;
  bbAmt: number;
  balanceMode: boolean;
}

export interface PostPokerBlindsResult {
  updatedPlayers: Player[];
  sbPosted: number;
  bbPosted: number;
  isSbAllIn: boolean;
  isBbAllIn: boolean;
  allInMap: Record<string, boolean>;
  contribMap: Record<string, number>;
  stMap: Record<string, number>;
}

/**
 * Automatically deducts Small Blind and Big Blind from respective players,
 * enforcing all-in if a player has insufficient chips.
 */
export function postPokerBlinds({
  players,
  activePlayerIds,
  sbId,
  bbId,
  sbAmt,
  bbAmt,
  balanceMode,
}: PostPokerBlindsParams): PostPokerBlindsResult {
  const updatedPlayers = players.map(p => ({ ...p }));
  const allInMap: Record<string, boolean> = {};
  const contribMap: Record<string, number> = {};
  const stMap: Record<string, number> = {};

  // Initialize for all active players
  activePlayerIds.forEach(id => {
    contribMap[id] = 0;
    stMap[id] = 0;
  });

  // Post SB
  let sbPosted = Math.max(0, sbAmt);
  let isSbAllIn = false;
  const sbP = updatedPlayers.find(p => p.id === sbId);
  if (sbP) {
    if (balanceMode) {
      const bal = sbP.balance || 0;
      if (bal <= sbAmt) {
        sbPosted = bal;
        sbP.balance = 0;
        isSbAllIn = true;
      } else {
        sbPosted = sbAmt;
        sbP.balance = bal - sbAmt;
      }
    }
    contribMap[sbId] = sbPosted;
    stMap[sbId] = sbPosted;
    if (isSbAllIn) allInMap[sbId] = true;
  }

  // Post BB
  let bbPosted = Math.max(0, bbAmt);
  let isBbAllIn = false;
  const bbP = updatedPlayers.find(p => p.id === bbId);
  if (bbP) {
    if (balanceMode) {
      const bal = bbP.balance || 0;
      if (bal <= bbAmt) {
        bbPosted = bal;
        bbP.balance = 0;
        isBbAllIn = true;
      } else {
        bbPosted = bbAmt;
        bbP.balance = bal - bbAmt;
      }
    }
    contribMap[bbId] = bbPosted;
    stMap[bbId] = bbPosted;
    if (isBbAllIn) allInMap[bbId] = true;
  }

  return {
    updatedPlayers,
    sbPosted,
    bbPosted,
    isSbAllIn,
    isBbAllIn,
    allInMap,
    contribMap,
    stMap,
  };
}

export interface LastBetInfo {
  amount: number;
  isBlind: boolean;
}

/**
 * Teen Patti Blind and Seen Betting Rules:
 * - baseStake: The current blind stake unit B (defaults to ante amount).
 * - A Blind player bets 1x B (or matches previous blind bet / half of previous seen bet).
 * - A Seen player bets 2x B (or matches previous seen bet / double of previous blind bet).
 * - A raise must be at least chaalCost + 1.
 * - Show cost (2 players remain):
 *   - Blind turn: chaalCost
 *   - Seen turn vs Seen: chaalCost
 *   - Seen turn vs Blind: 2 * chaalCost
 */
export function getTeenPattiBetAmounts(
  baseStake: number,
  isBlind: boolean,
  isOtherBlind: boolean = false,
  lastBet?: LastBetInfo | null,
  currentPot?: number
) {
  const B = Math.max(1, baseStake);
  let chaalCost: number;

  if (lastBet && typeof lastBet.amount === 'number' && lastBet.amount > 0) {
    if (lastBet.isBlind) {
      // Previous bet was Blind (amount L):
      // Next Blind player calls with L.
      // Next Seen player calls with 2 * L.
      chaalCost = isBlind ? lastBet.amount : 2 * lastBet.amount;
    } else {
      // Previous bet was Seen (amount L):
      // Next Seen player calls with L (e.g. 15 -> 15).
      // Next Blind player calls with floor(L / 2) (e.g. 15 -> 7).
      chaalCost = isBlind ? Math.max(1, Math.floor(lastBet.amount / 2)) : lastBet.amount;
    }
  } else {
    chaalCost = isBlind ? B : 2 * B;
  }

  const minRaise = chaalCost + 1;

  // Force show costs the total current pot (or chaalCost if pot is empty)
  const showCost = typeof currentPot === 'number' && currentPot > 0 ? currentPot : chaalCost;

  return {
    baseStake: B,
    chaalCost,
    minRaise,
    showCost,
  };
}

/**
 * Calculate the new base stake B after a raise in Teen Patti.
 */
export function calcTeenPattiNewBaseStake(raiseAmt: number, isBlind: boolean): number {
  if (isBlind) {
    return Math.max(1, raiseAmt);
  }
  return Math.max(1, Math.floor(raiseAmt / 2));
}
