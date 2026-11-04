import type { Player } from '../types/game.ts';

export type MeldRequirementType = 'pure_seq' | 'any_seq' | 'set';

export interface RummyMeldRequirement {
  id: string;
  type: MeldRequirementType; // 'pure_seq' = Pure Sequence (No Joker), 'any_seq' = Any Sequence (Pure/Impure), 'set' = Set / Book
  cardsCount: number; // e.g. 3, 4, 5
  label?: string; // e.g. "Pure sequence of 3"
}

export interface RummyConfig {
  totalCards: number; // e.g. 7, 9, 10, 13, 21
  requirements: RummyMeldRequirement[];
  firstDropPoints?: number;
  middleDropPoints?: number;
  maxPoints?: number;
}

export interface RummyDealParams {
  pointValue: number; // ₹ per point (min 0.1, typically 1, 2, 5, 10, etc.)
  winnerId: string;
  playerPoints: Record<string, number>; // playerId -> penalty points
  players: Player[];
  balanceMode: boolean;
  config?: RummyConfig;
}

export interface RummyPlayerOutcome {
  playerId: string;
  points: number;
  amount: number; // positive for winner, negative for losers
  capped: boolean;
}

export interface RummyDealResult {
  winnerId: string;
  pointValue: number;
  totalPointsLost: number;
  totalWinnings: number;
  playerOutcomes: Record<string, RummyPlayerOutcome>;
  updatedPlayers: Player[];
  debtsDelta: Record<string, number>; // "loserId|winnerId" -> amount
  dealLog: string[];
}

export const RUMMY_DROPS = {
  FIRST_DROP: 20,
  MIDDLE_DROP: 40,
  FULL_COUNT: 80,
  MAX_POINTS: 80,
} as const;

/**
 * Standard Rummy Presets
 */
export const RUMMY_PRESETS: Record<string, RummyConfig> = {
  '9_cards': {
    totalCards: 9,
    firstDropPoints: 15,
    middleDropPoints: 30,
    maxPoints: 60,
    requirements: [
      { id: 'pure_3', type: 'pure_seq', cardsCount: 3, label: 'Pure sequence of 3' },
      { id: 'seq_3', type: 'any_seq', cardsCount: 3, label: 'Any sequence of 3 (pure/impure)' },
      { id: 'set_3', type: 'set', cardsCount: 3, label: 'Set of 3' },
    ],
  },
  '7_cards': {
    totalCards: 7,
    firstDropPoints: 10,
    middleDropPoints: 25,
    maxPoints: 50,
    requirements: [
      { id: 'pure_4', type: 'pure_seq', cardsCount: 4, label: 'Pure sequence of 4' },
      { id: 'set_3', type: 'set', cardsCount: 3, label: 'Set of 3' },
    ],
  },
  '13_cards': {
    totalCards: 13,
    firstDropPoints: 20,
    middleDropPoints: 40,
    maxPoints: 80,
    requirements: [
      { id: 'pure_1', type: 'pure_seq', cardsCount: 3, label: 'Pure sequence of 3' },
      { id: 'seq_2', type: 'any_seq', cardsCount: 3, label: 'Second sequence of 3 (pure/impure)' },
      { id: 'set_1', type: 'set', cardsCount: 3, label: 'Set of 3' },
      { id: 'set_2', type: 'set', cardsCount: 4, label: 'Set / sequence of 4' },
    ],
  },
  '10_cards': {
    totalCards: 10,
    firstDropPoints: 15,
    middleDropPoints: 30,
    maxPoints: 60,
    requirements: [
      { id: 'pure_4', type: 'pure_seq', cardsCount: 4, label: 'Pure sequence of 4' },
      { id: 'seq_3', type: 'any_seq', cardsCount: 3, label: 'Any sequence of 3' },
      { id: 'set_3', type: 'set', cardsCount: 3, label: 'Set of 3' },
    ],
  },
  '21_cards': {
    totalCards: 21,
    firstDropPoints: 30,
    middleDropPoints: 60,
    maxPoints: 120,
    requirements: [
      { id: 'pure_1', type: 'pure_seq', cardsCount: 3, label: 'Pure sequence 1 (3)' },
      { id: 'pure_2', type: 'pure_seq', cardsCount: 3, label: 'Pure sequence 2 (3)' },
      { id: 'pure_3', type: 'pure_seq', cardsCount: 3, label: 'Pure sequence 3 (3)' },
      { id: 'seq_4', type: 'any_seq', cardsCount: 3, label: 'Sequence 4 (3)' },
      { id: 'set_1', type: 'set', cardsCount: 3, label: 'Set 1 (3)' },
      { id: 'set_2', type: 'set', cardsCount: 3, label: 'Set 2 (3)' },
      { id: 'set_3', type: 'set', cardsCount: 3, label: 'Set 3 (3)' },
    ],
  },
};

export const DEFAULT_RUMMY_CONFIG: RummyConfig = RUMMY_PRESETS['13_cards'];

/**
 * Summarizes the meld requirements in human-readable text
 */
export function formatConfigSummary(config: RummyConfig): string {
  if (!config.requirements?.length) {
    return `${config.totalCards} Cards`;
  }
  const parts = config.requirements.map(r => {
    const typeLabel =
      r.type === 'pure_seq' ? 'Pure Seq' : r.type === 'any_seq' ? 'Seq' : 'Set';
    return `${typeLabel} (${r.cardsCount})`;
  });
  return `${config.totalCards} Cards: ${parts.join(' + ')}`;
}

/**
 * Calculates sum of cards accounted for in requirements
 */
export function getTotalMeldCards(requirements: RummyMeldRequirement[]): number {
  return requirements.reduce((sum, r) => sum + (Number(r.cardsCount) || 0), 0);
}

export interface RummyPlayerHandBreakdown {
  pureSeqCompleted: boolean;
  unmeldedCardPoints?: number;
}

/**
 * Calculates penalty points from a player's meld completion
 */
export function calculatePlayerPenaltyWithBreakdown(
  breakdown: RummyPlayerHandBreakdown,
  config: RummyConfig
): { points: number; explanation: string; capped: boolean } {
  const maxPts = config.maxPoints || RUMMY_DROPS.MAX_POINTS;

  if (!breakdown.pureSeqCompleted) {
    return {
      points: maxPts,
      explanation: `No Pure Sequence completed -> Full penalty (${maxPts} pts)`,
      capped: false,
    };
  }

  const rawPts = Math.max(0, Number(breakdown.unmeldedCardPoints) || 0);
  const capped = rawPts > maxPts;
  const finalPts = Math.min(maxPts, rawPts);

  return {
    points: finalPts,
    explanation: `Pure Sequence made · Unmelded penalty: ${finalPts} pts${capped ? ' (capped)' : ''}`,
    capped,
  };
}

/**
 * Calculates financial outcomes for an Indian Points Rummy deal.
 * Rules:
 * - Winner scores 0 points.
 * - Other active players score penalty points (0 - maxPoints).
 * - Loss = points * pointValue.
 * - Winner receives the sum of losses from all losing players.
 * - Zero-sum financial invariant: sum(all player amounts) == 0.
 */
export function calculateRummyDeal({
  pointValue,
  winnerId,
  playerPoints,
  players,
  balanceMode,
  config,
}: RummyDealParams): RummyDealResult {
  const rate = Math.max(0.1, Number(pointValue) || 10);
  const maxAllowedPoints = config?.maxPoints || RUMMY_DROPS.MAX_POINTS;

  const updatedPlayers = players.map(p => ({ ...p }));
  const playerOutcomes: Record<string, RummyPlayerOutcome> = {};
  const debtsDelta: Record<string, number> = {};
  const dealLog: string[] = [];

  let totalPointsLost = 0;
  let totalWinnings = 0;

  const winner = updatedPlayers.find(p => p.id === winnerId);
  const winnerName = winner?.name || winnerId;

  // 1. Calculate each losing player's penalty & loss
  updatedPlayers.forEach(player => {
    if (player.id === winnerId) return;

    const rawPoints = Math.max(0, Number(playerPoints[player.id]) || 0);
    const capped = rawPoints > maxAllowedPoints;
    const finalPoints = Math.min(maxAllowedPoints, rawPoints);
    totalPointsLost += finalPoints;

    let lossAmount = Math.round(finalPoints * rate);

    if (balanceMode) {
      const currentBal = player.balance || 0;
      if (currentBal < lossAmount) {
        lossAmount = currentBal;
        player.balance = 0;
      } else {
        player.balance = currentBal - lossAmount;
      }
    }

    totalWinnings += lossAmount;

    playerOutcomes[player.id] = {
      playerId: player.id,
      points: finalPoints,
      amount: -lossAmount,
      capped,
    };

    if (lossAmount > 0) {
      const debtKey = `${player.id}|${winnerId}`;
      debtsDelta[debtKey] = lossAmount;
    }

    dealLog.push(
      `${player.name}: ${finalPoints} pts (-₹${lossAmount})`
    );
  });

  // 2. Award total winnings to the winner
  if (winner) {
    if (balanceMode) {
      winner.balance = (winner.balance || 0) + totalWinnings;
    }

    playerOutcomes[winnerId] = {
      playerId: winnerId,
      points: 0,
      amount: totalWinnings,
      capped: false,
    };

    const rulesTag = config ? ` [${formatConfigSummary(config)}]` : '';
    dealLog.unshift(
      `🏆 ${winnerName} WON the deal! Total winnings: +₹${totalWinnings} (${totalPointsLost} total penalty pts @ ₹${rate}/pt)${rulesTag}`
    );
  }

  return {
    winnerId,
    pointValue: rate,
    totalPointsLost,
    totalWinnings,
    playerOutcomes,
    updatedPlayers,
    debtsDelta,
    dealLog,
  };
}
