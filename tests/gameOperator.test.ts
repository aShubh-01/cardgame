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
  // GO sees both Alice's and Bob's unmasked hole cards
  assert.ok(Array.isArray(goView.round.hands.p1));
  assert.ok(Array.isArray(goView.round.hands.p2));
  assert.equal(goView.round.hands.p2[0].rank, 'Q');
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

  // Detect GO disconnect during active round -> opens 15s volunteer window
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
