import type { PokerCard } from '../types/game.ts';

export const SUITS: Array<{ suit: string; red: boolean }> = [
  { suit: '♠', red: false },
  { suit: '♥', red: true },
  { suit: '♦', red: true },
  { suit: '♣', red: false },
];

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function createStandardDeck(decksCount: number = 1): PokerCard[] {
  const deck: PokerCard[] = [];
  for (let d = 0; d < decksCount; d++) {
    for (const s of SUITS) {
      for (const r of RANKS) {
        deck.push({
          rank: r,
          suit: s.suit,
          red: s.red,
        });
      }
    }
  }
  return deck;
}

/**
 * Fisher-Yates cryptographically secure shuffle (or fallback to Math.random)
 */
export function shuffleDeck(deck: PokerCard[]): PokerCard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

/**
 * Deals cards from the top of the deck
 */
export function dealCards(deck: PokerCard[], count: number): { dealt: PokerCard[]; remaining: PokerCard[] } {
  const dealt = deck.slice(0, count);
  const remaining = deck.slice(count);
  return { dealt, remaining };
}

/**
 * Sanitizes game state before returning to an authenticated client.
 * Strictly guarantees that private cards of OTHER players are never sent over the network.
 */
export function sanitizeStateForClient(
  gameState: any,
  requestingUserEmail?: string | null
): any {
  if (!gameState) return gameState;
  const sanitized = JSON.parse(JSON.stringify(gameState));

  const reqEmail = (requestingUserEmail || '').toLowerCase().trim();
  const ownerEmail = (sanitized.hostUserId || sanitized.userId || sanitized.userEmail || '').toLowerCase().trim();
  const goEmail = (sanitized.gameOperatorUserId || ownerEmail).toLowerCase().trim();
  const nextGoEmail = (sanitized.nextGameOperatorUserId || '').toLowerCase().trim();

  const isSessionOwner = Boolean(reqEmail && ownerEmail && reqEmail === ownerEmail);
  const isGameOperator = Boolean(reqEmail && goEmail && reqEmail === goEmail);
  const isQueuedGameOperator = Boolean(reqEmail && nextGoEmail && reqEmail === nextGoEmail);

  sanitized.isSessionOwner = isSessionOwner;
  sanitized.isGameOperator = isGameOperator;
  sanitized.isQueuedGameOperator = isQueuedGameOperator;
  sanitized.myRole = isGameOperator
    ? isSessionOwner
      ? 'owner_go'
      : 'go'
    : isSessionOwner
    ? 'owner_player'
    : 'player';

  // In online mode, the Game Operator cannot participate as a player and is hidden from players
  if (sanitized.sessionMode === 'online' && Array.isArray(sanitized.players) && goEmail) {
    const goProfile = sanitized.players.find(
      (p: any) => p.isGameOperator || (p.userId && p.userId.toLowerCase() === goEmail)
    );
    sanitized.players = sanitized.players.filter(
      (p: any) => !p.isGameOperator && (!p.userId || p.userId.toLowerCase() !== goEmail)
    );
    if (isGameOperator) {
      sanitized.operatorProfile = goProfile || null;
    } else {
      // Players must never see who the Game Operator is or the full operator audit log
      delete sanitized.gameOperatorUserId;
      delete sanitized.hostUserId;
      delete sanitized.userId;
      delete sanitized.userEmail;
      delete sanitized.operatorProfile;
      delete sanitized.activityLog;
      if (sanitized.goDisconnectEvent) {
        delete sanitized.goDisconnectEvent.volunteerUserId;
      }
    }
  }

  // Remove full deck and unrevealed board pool from client payload
  if (sanitized.round?.deck) {
    sanitized.round.deckRemaining = sanitized.round.deck.length;
    delete sanitized.round.deck;
  }
  if (sanitized.round?.boardCards) {
    delete sanitized.round.boardCards;
  }

  // Find requesting player's ID if authenticated
  let requestingPlayerId: string | null = null;
  if (reqEmail && sanitized.players && Array.isArray(sanitized.players)) {
    const found = sanitized.players.find(
      (p: any) => p.userId && p.userId.toLowerCase() === reqEmail
    );
    if (found) {
      requestingPlayerId = found.id;
    }
  }

  const isShowdown = sanitized.round?.phase === 'result' || sanitized.round?.phase === 'ended' || sanitized.round?.phase === 'showdown';
  const isTeenPatti = sanitized.gameType === 'tp';
  const isBlackjack = sanitized.gameType === 'bj';

  // Sanitize Blackjack dealer hole card until dealer turn / result (Game Operator sees everything)
  if (isBlackjack && Array.isArray(sanitized.round?.dealerHand) && sanitized.round.dealerHand.length >= 2) {
    if (!isGameOperator && !sanitized.round.dealerHoleRevealed && !isShowdown) {
      sanitized.round.dealerHand = [
        sanitized.round.dealerHand[0],
        { rank: '?', suit: '🎴', red: false, hidden: true, masked: true },
      ];
    }
  }

  // Sanitize player hands (Game Operator observes all hands unmasked)
  if (sanitized.round?.hands) {
    const clientHands: Record<string, any> = {};
    const revealedHands = sanitized.round.revealedHands || {};
    const folded = sanitized.round.folded || {};
    const playerStatus = sanitized.round.playerStatus || {};

    for (const [playerId, cards] of Object.entries(sanitized.round.hands as Record<string, PokerCard[]>)) {
      const isPubliclyRevealed = Boolean(revealedHands[playerId]) || (isShowdown && !folded[playerId]);
      const isOwnHand = playerId === requestingPlayerId;
      const isBlindInTP = isTeenPatti && (playerStatus[playerId] || 'blind') === 'blind' && !isPubliclyRevealed;

      // Game Operator sees all hands; in Blackjack all player hands are face-up
      if (isGameOperator || isBlackjack || isPubliclyRevealed || (isOwnHand && !isBlindInTP)) {
        clientHands[playerId] = cards;
      } else {
        clientHands[playerId] = {
          count: Array.isArray(cards) ? cards.length : 0,
          masked: true,
          ...(isBlindInTP ? { blind: true } : {}),
        };
      }
    }
    sanitized.round.hands = clientHands;
  }

  return sanitized;
}
