import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPokerBlindPositions,
  postPokerBlinds,
  getTeenPattiBetAmounts,
  calcTeenPattiNewBaseStake,
} from '../lib/blindRules.ts';

test('Poker Blind Positions: 4 players', () => {
  const players = ['P1', 'P2', 'P3', 'P4'];
  // dealerIdx = 0 -> Dealer: P1, SB: P2, BB: P3, UTG: P4
  const pos0 = getPokerBlindPositions(players, 0);
  assert.strictEqual(pos0.dealerId, 'P1');
  assert.strictEqual(pos0.sbId, 'P2');
  assert.strictEqual(pos0.bbId, 'P3');
  assert.strictEqual(pos0.firstToActPreFlopId, 'P4');
  assert.strictEqual(pos0.firstToActPostFlopId, 'P2');

  // Next hand: dealerIdx = 1 -> Dealer: P2, SB: P3, BB: P4, UTG: P1
  const pos1 = getPokerBlindPositions(players, 1);
  assert.strictEqual(pos1.dealerId, 'P2');
  assert.strictEqual(pos1.sbId, 'P3');
  assert.strictEqual(pos1.bbId, 'P4');
  assert.strictEqual(pos1.firstToActPreFlopId, 'P1');
  assert.strictEqual(pos1.firstToActPostFlopId, 'P3');
});

test('Poker Blind Positions: Heads-Up (2 players)', () => {
  const players = ['A', 'B'];
  // In Heads-up: Dealer is SB, acts first pre-flop, second post-flop
  const pos = getPokerBlindPositions(players, 0);
  assert.strictEqual(pos.dealerId, 'A');
  assert.strictEqual(pos.sbId, 'A');
  assert.strictEqual(pos.bbId, 'B');
  assert.strictEqual(pos.firstToActPreFlopId, 'A');
  assert.strictEqual(pos.firstToActPostFlopId, 'B');
});

test('Poker Automatic Blind Deduction with Normal Stacks', () => {
  const players = [
    { id: 'A', name: 'A', sit: false, balance: 100 },
    { id: 'B', name: 'B', sit: false, balance: 200 },
    { id: 'C', name: 'C', sit: false, balance: 300 },
  ];

  const res = postPokerBlinds({
    players,
    activePlayerIds: ['A', 'B', 'C'],
    sbId: 'B',
    bbId: 'C',
    sbAmt: 10,
    bbAmt: 20,
    balanceMode: true,
  });

  assert.strictEqual(res.sbPosted, 10);
  assert.strictEqual(res.bbPosted, 20);
  assert.strictEqual(res.isSbAllIn, false);
  assert.strictEqual(res.isBbAllIn, false);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'B')?.balance, 190);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'C')?.balance, 280);
});

test('Poker Forced All-In on Blind when Short Stacked', () => {
  const players = [
    { id: 'A', name: 'A', sit: false, balance: 100 },
    { id: 'B', name: 'B', sit: false, balance: 5 }, // Only ₹5, SB is ₹10
    { id: 'C', name: 'C', sit: false, balance: 12 }, // Only ₹12, BB is ₹20
  ];

  const res = postPokerBlinds({
    players,
    activePlayerIds: ['A', 'B', 'C'],
    sbId: 'B',
    bbId: 'C',
    sbAmt: 10,
    bbAmt: 20,
    balanceMode: true,
  });

  assert.strictEqual(res.sbPosted, 5);
  assert.strictEqual(res.isSbAllIn, true);
  assert.strictEqual(res.bbPosted, 12);
  assert.strictEqual(res.isBbAllIn, true);
  assert.strictEqual(res.allInMap['B'], true);
  assert.strictEqual(res.allInMap['C'], true);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'B')?.balance, 0);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'C')?.balance, 0);
});

test('Teen Patti Blind vs Seen Bet Rules', () => {
  const baseStake = 20;

  // Blind player
  const blindBets = getTeenPattiBetAmounts(baseStake, true);
  assert.strictEqual(blindBets.chaalCost, 20); // 1x
  assert.strictEqual(blindBets.minRaise, 40); // 2x
  assert.strictEqual(blindBets.showCost, 20); // 1x

  // Seen player vs Seen player
  const seenBetsVsSeen = getTeenPattiBetAmounts(baseStake, false, false);
  assert.strictEqual(seenBetsVsSeen.chaalCost, 40); // 2x
  assert.strictEqual(seenBetsVsSeen.minRaise, 80); // 4x
  assert.strictEqual(seenBetsVsSeen.showCost, 40); // 2x

  // Seen player vs Blind player
  const seenBetsVsBlind = getTeenPattiBetAmounts(baseStake, false, true);
  assert.strictEqual(seenBetsVsBlind.chaalCost, 40); // 2x
  assert.strictEqual(seenBetsVsBlind.showCost, 80); // 4x
});

test('Teen Patti New Base Stake on Raise', () => {
  // Blind player raises to 50 -> new base unit is 50
  assert.strictEqual(calcTeenPattiNewBaseStake(50, true), 50);

  // Seen player raises to 100 -> new base unit is 50
  assert.strictEqual(calcTeenPattiNewBaseStake(100, false), 50);

  // Seen player raises to 150 -> new base unit is 75
  assert.strictEqual(calcTeenPattiNewBaseStake(150, false), 75);
});

