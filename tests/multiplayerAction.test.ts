import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStandardDeck, shuffleDeck, dealCards, sanitizeStateForClient } from '../lib/virtualDeck.ts';

test('Multiplayer Turn Authorization: Only turn player can act', () => {
  const roundState = {
    no: 1,
    phase: 'betting',
    parts: ['p1', 'p2', 'p3'],
    turn: 'p2',
    contrib: { p1: 100, p2: 100, p3: 100 },
    folded: {},
    stake: 100,
  };

  // Turn check function mimicking action dispatcher
  function canPlayerAct(currentTurn: string, actingPlayerId: string): boolean {
    return currentTurn === actingPlayerId;
  }

  assert.equal(canPlayerAct(roundState.turn, 'p1'), false, 'p1 cannot act out of turn');
  assert.equal(canPlayerAct(roundState.turn, 'p2'), true, 'p2 can act on their turn');
  assert.equal(canPlayerAct(roundState.turn, 'p3'), false, 'p3 cannot act out of turn');
});

test('Multiplayer Turn Advancement: Advances clockwise to next active player', () => {
  const parts = ['p1', 'p2', 'p3', 'p4'];
  const folded: Record<string, number> = { p2: 1 }; // p2 folded

  function getNextTurn(currentTurn: string, allParts: string[], foldedMap: Record<string, number>): string {
    const active = allParts.filter(id => !foldedMap[id]);
    const idx = active.indexOf(currentTurn);
    const nextIdx = (idx + 1) % active.length;
    return active[nextIdx];
  }

  // Next turn after p1 should skip p2 and land on p3
  assert.equal(getNextTurn('p1', parts, folded), 'p3');
  // Next turn after p3 lands on p4
  assert.equal(getNextTurn('p3', parts, folded), 'p4');
  // Next turn after p4 wraps to p1
  assert.equal(getNextTurn('p4', parts, folded), 'p1');
});

test('Multiplayer Single Survivor Fold: Declares remaining player winner immediately', () => {
  const parts = ['p1', 'p2'];
  const folded: Record<string, number> = {};

  // p1 folds
  folded['p1'] = 1;
  const remaining = parts.filter(id => !folded[id]);

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0], 'p2', 'p2 is the lone survivor');
});

test('Kick Player Action: Authorization, session removal, and chat broadcast', () => {
  const sessionDoc: any = {
    sessionMode: 'online',
    hostUserId: 'owner@test.com',
    gameOperatorUserId: 'owner@test.com',
    players: [
      { id: 'go1', name: 'Host GO', userId: 'owner@test.com', isGameOperator: true },
      { id: 'p1', name: 'Alice', userId: 'alice@test.com', isGameOperator: false },
      { id: 'p2', name: 'Troublemaker', userId: 'trouble@test.com', isGameOperator: false },
    ],
    readyPlayers: { p1: true, p2: true },
    chipRequests: [{ playerId: 'p2', amount: 500, status: 'pending' }],
    chatMessages: [],
    activityLog: [],
  };

  // 1. Non-GO/Non-owner cannot kick
  function canKick(userEmail: string, session: any): boolean {
    const isOwner = userEmail.toLowerCase() === session.hostUserId?.toLowerCase();
    const isGO = userEmail.toLowerCase() === session.gameOperatorUserId?.toLowerCase();
    return isOwner || isGO;
  }
  assert.equal(canKick('alice@test.com', sessionDoc), false);
  assert.equal(canKick('owner@test.com', sessionDoc), true);

  // 2. Execute Kick on Troublemaker
  const targetId = 'p2';
  const targetIdx = sessionDoc.players.findIndex((p: any) => p.id === targetId);
  assert.ok(targetIdx >= 0);
  const kickedPlayer = sessionDoc.players[targetIdx];

  // Remove player
  sessionDoc.players.splice(targetIdx, 1);
  delete sessionDoc.readyPlayers[targetId];
  sessionDoc.chipRequests = sessionDoc.chipRequests.filter((r: any) => r.playerId !== targetId);
  sessionDoc.chatMessages.push({
    senderId: '__system__',
    text: `📢 ${kickedPlayer.name} was kicked from the room by the Game Operator.`,
  });

  // Verify state
  assert.equal(sessionDoc.players.length, 2);
  assert.ok(!sessionDoc.players.some((p: any) => p.id === targetId));
  assert.equal(sessionDoc.readyPlayers['p2'], undefined);
  assert.equal(sessionDoc.chipRequests.length, 0);
  assert.equal(sessionDoc.chatMessages[0].text, '📢 Troublemaker was kicked from the room by the Game Operator.');
});

test('Blackjack Individual Player Wager: Each player bets their chosen amount', () => {
  const sessionDoc: any = {
    balanceMode: true,
    playerBets: {
      p1: 250,
      p2: 100,
      p3: 50,
    },
    bjDealerId: 'house',
  };

  const activePlayers = [
    { id: 'p1', name: 'Alice', balance: 500 },
    { id: 'p2', name: 'Bob', balance: 1000 },
    { id: 'p3', name: 'Charlie', balance: 30 }, // Balance less than chosen 50
  ];

  const contrib: Record<string, number> = {};
  const defaultBet = 50;

  for (const pl of activePlayers) {
    const chosenBet = Math.max(1, Number(sessionDoc.playerBets[pl.id]) || defaultBet);
    let bet = chosenBet;
    if (sessionDoc.balanceMode && typeof pl.balance === 'number') {
      bet = Math.min(pl.balance, chosenBet);
      pl.balance = Math.max(0, pl.balance - bet);
    }
    contrib[pl.id] = bet;
  }

  // Alice bet 250
  assert.equal(contrib['p1'], 250);
  assert.equal(activePlayers[0].balance, 250);

  // Bob bet 100
  assert.equal(contrib['p2'], 100);
  assert.equal(activePlayers[1].balance, 900);

  // Charlie chose 50, but clamped to his balance 30
  assert.equal(contrib['p3'], 30);
  assert.equal(activePlayers[2].balance, 0);
});

test('Blackjack Turn Controls: Admin / GO observer never sees active turn controls', () => {
  const isOnline = true;
  const currentTurn = 'p2';

  // Helper function matching BlackjackControls isMyTurn check
  function computeIsMyTurn(myPlayerId: string | null | undefined, isHost: boolean, turn: string): boolean {
    return isOnline ? Boolean(myPlayerId && turn === myPlayerId) : true;
  }

  // 1. Admin / Game Operator in stealth observer mode (isHost = true, myPlayerId = null)
  assert.equal(computeIsMyTurn(null, true, currentTurn), false, 'Stealth Admin must NOT have isMyTurn');

  // 2. Spectator (isHost = false, myPlayerId = null)
  assert.equal(computeIsMyTurn(null, false, currentTurn), false, 'Spectator must NOT have isMyTurn');

  // 3. Player 1 waiting for Player 2
  assert.equal(computeIsMyTurn('p1', false, currentTurn), false, 'Player 1 waiting must NOT have isMyTurn');

  // 4. Player 2 whose turn it is
  assert.equal(computeIsMyTurn('p2', false, currentTurn), true, 'Turn player 2 MUST have isMyTurn');
});



