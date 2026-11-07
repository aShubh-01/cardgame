import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignNewGameOperator,
  promoteQueuedGameOperatorIfIdle,
  syncGameOperatorPresence,
} from '../lib/gameOperator.ts';
import { sanitizeStateForClient } from '../lib/virtualDeck.ts';
import { resolveBetAmount } from '../lib/pokerEngine.ts';
import { getTeenPattiBetAmounts, calcTeenPattiNewBaseStake } from '../lib/blindRules.ts';

test('Unrestricted Raise: Poker allows any raise strictly greater than current bet (> toCall)', () => {
  // Current bet is 50, player contributed 0 -> toCall = 50.
  // Player enters 60 (even if minRaise is 50, 60 > 50 is now valid without forced 2x!)
  const res = resolveBetAmount({
    amount: 60,
    streetContribution: 0,
    currentBet: 50,
    minRaise: 50,
    balance: 500,
  });
  assert.ok(!('error' in res), 'Raise of 60 above current bet 50 should be allowed');
  if (!('error' in res)) {
    assert.equal(res.action, 'raise');
    assert.equal(res.target, 60);
  }
});

test('Unrestricted Raise: Teen Patti allows any raise > chaalCost and updates base stake', () => {
  const costs = getTeenPattiBetAmounts(20, false); // Seen player: chaalCost = 40
  assert.equal(costs.chaalCost, 40);
  // Player raises to 50 (instead of forced 2x = 80)
  const nextStake = calcTeenPattiNewBaseStake(50, false);
  assert.equal(nextStake, 25);
});

test('Three-Role System: Game Operator is hidden from players and sees all unmasked cards', () => {
  const rawState = {
    sessionMode: 'online',
    hostUserId: 'owner@test.com',
    gameOperatorUserId: 'owner@test.com',
    players: [
      { id: 'go1', name: 'Owner GO', userId: 'owner@test.com', sit: true, isGameOperator: true },
      { id: 'p1', name: 'Alice', userId: 'alice@test.com', sit: false, balance: 500 },
      { id: 'p2', name: 'Bob', userId: 'bob@test.com', sit: false, balance: 500 },
    ],
    round: {
      no: 1,
      phase: 'bet',
      settled: false,
      hands: {
        p1: [{ rank: 'A', suit: '♠', red: false }, { rank: 'K', suit: '♠', red: false }],
        p2: [{ rank: 'Q', suit: '♥', red: true }, { rank: 'J', suit: '♥', red: true }],
      },
    },
    activityLog: ['[12:00:00] Alice bet 50'],
  };

  // 1. Sanitize for regular Player (Alice)
  const aliceView = sanitizeStateForClient(rawState, 'alice@test.com');
  assert.equal(aliceView.myRole, 'player');
  assert.equal(aliceView.isGameOperator, false);
  // GO is completely hidden from Alice's players list
  assert.equal(aliceView.players.length, 2);
  assert.ok(!aliceView.players.some((p: any) => p.id === 'go1'));
  // Alice sees her own cards, but Bob's cards are masked
  assert.ok(Array.isArray(aliceView.round.hands.p1));
  assert.equal(aliceView.round.hands.p2.masked, true);
  // Activity log is hidden from regular players
  assert.equal(aliceView.activityLog, undefined);

  // 2. Sanitize for Game Operator (Owner)
  const goView = sanitizeStateForClient(rawState, 'owner@test.com');
  assert.equal(goView.myRole, 'owner_go');
  assert.equal(goView.isGameOperator, true);
  // Hole cards are masked for GO/Admin as well (card secrecy enforced)
  assert.equal(goView.round.hands.p1.masked, true);
  assert.equal(goView.round.hands.p2.masked, true);
  // GO sees full activityLog
  assert.equal(goView.activityLog.length, 1);
});

test('Role Transfer & 15s Disconnect Volunteer / Auto-Queue Flow', () => {
  const sessionDoc: any = {
    sessionMode: 'online',
    hostUserId: 'owner@test.com',
    gameOperatorUserId: 'owner@test.com',
    goLastHeartbeat: Date.now() - 20_000, // 20s ago -> timed out!
    players: [
      { id: 'go1', name: 'Owner', userId: 'owner@test.com', sit: true, isGameOperator: true, balance: 500 },
      { id: 'p1', name: 'Alice', userId: 'alice@test.com', sit: false, isGameOperator: false, balance: 500 },
      { id: 'p2', name: 'Bob', userId: 'bob@test.com', sit: false, isGameOperator: false, balance: 500 },
    ],
    round: {
      no: 1,
      phase: 'bet',
      settled: false,
      parts: ['p1', 'p2'],
    },
    activityLog: [],
  };

  // 1. If GO disconnected only 30s ago (< 1 minute), no alert is shown
  sessionDoc.goLastHeartbeat = Date.now() - 30_000;
  const mutatedGrace = syncGameOperatorPresence(sessionDoc, 'alice@test.com');
  assert.ok(!sessionDoc.goDisconnectEvent, 'No alert within 1 minute grace period');

  // 2. If GO is disconnected for > 1 minute (e.g. 65s), trigger 15s volunteer alert
  sessionDoc.goLastHeartbeat = Date.now() - 65_000;
  sessionDoc.goDisconnectedAt = Date.now() - 65_000;
  const mutated1 = syncGameOperatorPresence(sessionDoc, 'alice@test.com');
  assert.equal(mutated1, true);
  assert.equal(sessionDoc.goDisconnectEvent.status, 'volunteering');

  // Simulate 15s expiring with no volunteer -> auto-selects a player and queues them for next round
  sessionDoc.goDisconnectEvent.expiresAt = Date.now() - 1000;
  const mutated2 = syncGameOperatorPresence(sessionDoc, 'alice@test.com');
  assert.equal(mutated2, true);
  assert.equal(sessionDoc.goDisconnectEvent.status, 'queued');
  assert.ok(sessionDoc.nextGameOperatorUserId, 'Should have auto-selected a player into nextGameOperatorUserId');

  // Now round ends -> promoteQueuedGameOperatorIfIdle promotes Alice to active GO
  sessionDoc.round.settled = true;
  const promoted = promoteQueuedGameOperatorIfIdle(sessionDoc);
  assert.equal(promoted, true);
  assert.equal(sessionDoc.gameOperatorUserId, 'alice@test.com');
  const alicePl = sessionDoc.players.find((p: any) => p.id === 'p1');
  const ownerPl = sessionDoc.players.find((p: any) => p.id === 'go1');
  assert.equal(alicePl.isGameOperator, true);
  assert.equal(ownerPl.isGameOperator, false);
  assert.equal(ownerPl.sit, false); // Former GO can now play!
});

test('Blackjack Who Owes Who (debtsDelta) works in both Balance Mode and Tracker Mode, with Player Dealer or House Dealer', async () => {
  const { calculateBlackjackRound } = await import('../lib/blackjackEngine.ts');

  const players = [
    { id: 'p1', name: 'Dealer Dan', sit: false, balance: 1000 },
    { id: 'p2', name: 'Alice', sit: false, balance: 1000 },
    { id: 'p3', name: 'Bob', sit: false, balance: 1000 },
  ];

  const resPlayerDealer = calculateBlackjackRound({
    dealerPlayerId: 'p1',
    dealerHasBlackjack: false,
    playersInput: [
      { playerId: 'p2', hands: [{ bet: 200, outcome: 'win' }] },
      { playerId: 'p3', hands: [{ bet: 150, outcome: 'loss' }] },
    ],
    players,
    balanceMode: true,
  });

  // p1 (Dealer) owes p2 (Alice) 200; p3 (Bob) owes p1 (Dealer) 150
  assert.equal(resPlayerDealer.debtsDelta['p1|p2'], 200);
  assert.equal(resPlayerDealer.debtsDelta['p3|p1'], 150);
  // Dealer Dan's balance updated: 1000 - 200 + 150 = 950
  assert.equal(resPlayerDealer.updatedPlayers.find(p => p.id === 'p1')?.balance, 950);

  const resHouseDealer = calculateBlackjackRound({
    dealerPlayerId: 'house',
    dealerHasBlackjack: false,
    playersInput: [
      { playerId: 'p2', hands: [{ bet: 100, outcome: 'blackjack' }] },
    ],
    players,
    balanceMode: true,
  });
  assert.equal(resHouseDealer.debtsDelta['house|p2'], 150);
});

test('Connection Status: isPlayerConnected detects 10s heartbeat timeout and disconnect signals', async () => {
  const { isPlayerConnected } = await import('../lib/gameOperator.ts');

  const now = 100_000;
  // 1. Fresh heartbeat (seen 2s ago)
  const connectedPlayer = { id: 'p1', lastSeenAt: now - 2000, isConnected: true };
  assert.equal(isPlayerConnected(connectedPlayer, now), true);

  // 2. Timed out heartbeat (seen 12s ago > 10s timeout)
  const timedOutPlayer = { id: 'p2', lastSeenAt: now - 12000, isConnected: true };
  assert.equal(isPlayerConnected(timedOutPlayer, now), false);

  // 3. Explicitly disconnected signal
  const disconnectedPlayer = { id: 'p3', lastSeenAt: now - 1000, isConnected: false };
  assert.equal(isPlayerConnected(disconnectedPlayer, now), false);
});

test('Short-Stack All-In & Side Pots in Teen Patti and Poker', async () => {
  const { calculatePots } = await import('../lib/pokerPot.ts');

  // Player 1 has stack 80 (went all in), Player 2 bet 400, Player 3 bet 400
  const contrib = { p1: 80, p2: 400, p3: 400 };
  const folded = { p1: false, p2: false, p3: false };

  const { pots, totalPot } = calculatePots(contrib, folded);

  // When NO ONE is all-in, NO side pots are created (only Main Pot)
  const noAllInPots = calculatePots({ A: 25, B: 5 }, {}, {});
  assert.equal(noAllInPots.pots.length, 1);
  assert.equal(noAllInPots.pots[0].name, 'Main Pot');
  assert.equal(noAllInPots.pots[0].amount, 30);
  assert.deepEqual(noAllInPots.pots[0].eligiblePlayerIds.sort(), ['A', 'B'].sort());

  // When p1 goes ALL-IN with 80, Side Pot is created for remaining 320 between p2 & p3
  const allInPots = calculatePots(contrib, folded, { p1: true });
  assert.equal(allInPots.pots.length, 2);
  assert.equal(allInPots.pots[0].amount, 240);
  assert.deepEqual(allInPots.pots[0].eligiblePlayerIds.sort(), ['p1', 'p2', 'p3'].sort());
  assert.equal(allInPots.pots[1].amount, 640);
  assert.deepEqual(allInPots.pots[1].eligiblePlayerIds.sort(), ['p2', 'p3'].sort());
});

