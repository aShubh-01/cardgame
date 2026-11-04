import type { Player } from '../types/game.ts';

export type BlackjackHandOutcome = 'win' | 'loss' | 'push' | 'blackjack' | 'surrender';

export interface BlackjackHandInput {
  bet: number;
  outcome: BlackjackHandOutcome;
  doubleDown?: boolean;
}

export interface BlackjackPlayerInput {
  playerId: string;
  hands: BlackjackHandInput[]; // 1 hand, or 2 hands if split
  insuranceBet?: number; // optional insurance bet placed
}

export interface BlackjackRoundParams {
  dealerPlayerId: string | 'house'; // Player ID of banker or 'house'
  dealerHasBlackjack?: boolean;
  blackjackPayoutRatio?: number; // default 1.5 (3:2), can be 1.2 (6:5) or 2.0
  playersInput: BlackjackPlayerInput[];
  players: Player[];
  balanceMode: boolean;
}

export interface BlackjackHandResult {
  effectiveBet: number;
  outcome: BlackjackHandOutcome;
  doubleDown: boolean;
  netPayout: number; // positive for player profit, negative for loss
}

export interface BlackjackPlayerResult {
  playerId: string;
  hands: BlackjackHandResult[];
  insuranceBet: number;
  insuranceNet: number;
  totalNet: number; // sum of hand nets + insurance net
}

export interface BlackjackRoundResult {
  dealerPlayerId: string | 'house';
  dealerHasBlackjack: boolean;
  blackjackPayoutRatio: number;
  playerResults: Record<string, BlackjackPlayerResult>;
  dealerNet: number;
  updatedPlayers: Player[];
  debtsDelta: Record<string, number>;
  roundLog: string[];
}

/**
 * Calculates outcomes and payouts for a round/hand of Blackjack.
 * Supports: Win (1:1), Loss, Push (0), Blackjack (default 3:2), Double Down, Split, Insurance (2:1).
 * Enforces zero-sum conservation when a player acts as Dealer/Banker.
 */
export function calculateBlackjackRound({
  dealerPlayerId,
  dealerHasBlackjack = false,
  blackjackPayoutRatio = 1.5,
  playersInput,
  players,
  balanceMode,
}: BlackjackRoundParams): BlackjackRoundResult {
  const updatedPlayers = players.map(p => ({ ...p }));
  const playerResults: Record<string, BlackjackPlayerResult> = {};
  const debtsDelta: Record<string, number> = {};
  const roundLog: string[] = [];

  let totalPlayerNet = 0;

  playersInput.forEach(pInput => {
    // If this player is the dealer/banker, they don't place standard player bets against themselves
    if (pInput.playerId === dealerPlayerId) return;

    const p = updatedPlayers.find(x => x.id === pInput.playerId);
    const pName = p?.name || pInput.playerId;

    const handResults: BlackjackHandResult[] = [];
    let playerHandTotal = 0;

    pInput.hands.forEach((h, hIdx) => {
      const baseBet = Math.max(0, h.bet);
      const isDouble = !!h.doubleDown;
      const effectiveBet = isDouble ? baseBet * 2 : baseBet;

      let net = 0;
      switch (h.outcome) {
        case 'win':
          net = effectiveBet; // 1:1 profit
          break;
        case 'loss':
          net = -effectiveBet;
          break;
        case 'push':
          net = 0; // return bet
          break;
        case 'blackjack':
          net = Math.round(effectiveBet * blackjackPayoutRatio);
          break;
        case 'surrender':
          net = -Math.round(effectiveBet / 2);
          break;
      }

      handResults.push({
        effectiveBet,
        outcome: h.outcome,
        doubleDown: isDouble,
        netPayout: net,
      });

      playerHandTotal += net;
      const handLabel = pInput.hands.length > 1 ? ` (Hand #${hIdx + 1})` : '';
      const doubleTxt = isDouble ? ' [Double Down]' : '';
      roundLog.push(
        `${pName}${handLabel}: ${h.outcome.toUpperCase()}${doubleTxt} ${net >= 0 ? '+' : ''}₹${net}`
      );
    });

    // Insurance resolution: 2:1 payout if dealer has blackjack, otherwise lost
    const insBet = Math.max(0, pInput.insuranceBet || 0);
    let insNet = 0;
    if (insBet > 0) {
      if (dealerHasBlackjack) {
        insNet = insBet * 2; // 2:1 payout
        roundLog.push(`${pName} Insurance WON: +₹${insNet}`);
      } else {
        insNet = -insBet;
        roundLog.push(`${pName} Insurance LOST: -₹${insBet}`);
      }
    }

    const totalNet = playerHandTotal + insNet;
    totalPlayerNet += totalNet;

    playerResults[pInput.playerId] = {
      playerId: pInput.playerId,
      hands: handResults,
      insuranceBet: insBet,
      insuranceNet: insNet,
      totalNet,
    };

    // Update player balance
    if (balanceMode && p) {
      p.balance = Math.max(0, (p.balance || 0) + totalNet);
    }

    // Debt management between player and dealer/banker (including 'house' if designated)
    const effectiveDealerId = dealerPlayerId || 'house';
    if (totalNet > 0) {
      // Dealer owes player
      const debtKey = `${effectiveDealerId}|${pInput.playerId}`;
      debtsDelta[debtKey] = (debtsDelta[debtKey] || 0) + totalNet;
    } else if (totalNet < 0) {
      // Player owes dealer
      const debtKey = `${pInput.playerId}|${effectiveDealerId}`;
      debtsDelta[debtKey] = (debtsDelta[debtKey] || 0) + -totalNet;
    }
  });

  // Calculate Dealer's net outcome (dealer takes the opposite of all player nets)
  const rawDealerNet = -totalPlayerNet;
  const dealerNet = Object.is(rawDealerNet, -0) ? 0 : rawDealerNet;

  if (dealerPlayerId !== 'house') {
    const dealerP = updatedPlayers.find(x => x.id === dealerPlayerId);
    if (dealerP) {
      if (balanceMode) {
        dealerP.balance = Math.max(0, (dealerP.balance || 0) + dealerNet);
      }
      roundLog.unshift(
        `🏦 Dealer (${dealerP.name}) Net: ${dealerNet >= 0 ? '+' : ''}₹${dealerNet}`
      );
    }
  } else {
    roundLog.unshift(
      `🏦 House Net: ${dealerNet >= 0 ? '+' : ''}₹${dealerNet}`
    );
  }

  return {
    dealerPlayerId,
    dealerHasBlackjack,
    blackjackPayoutRatio,
    playerResults,
    dealerNet,
    updatedPlayers,
    debtsDelta,
    roundLog,
  };
}
