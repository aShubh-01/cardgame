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
  assert.strictEqual(blindBets.minRaise, 21); // chaalCost + 1
  assert.strictEqual(blindBets.showCost, 20); // 1x

  // Seen player vs Seen player
  const seenBetsVsSeen = getTeenPattiBetAmounts(baseStake, false, false);
  assert.strictEqual(seenBetsVsSeen.chaalCost, 40); // 2x
  assert.strictEqual(seenBetsVsSeen.minRaise, 41); // chaalCost + 1
  assert.strictEqual(seenBetsVsSeen.showCost, 40); // 2x

  // Initial pot of 5 per player (baseStake = 5)
  const blind5 = getTeenPattiBetAmounts(5, true);
  assert.strictEqual(blind5.chaalCost, 5, 'Blind chaal must be 5 when ante is 5');
  assert.strictEqual(blind5.minRaise, 6, 'Blind min raise must be 6');

  const seen5 = getTeenPattiBetAmounts(5, false);
  assert.strictEqual(seen5.chaalCost, 10, 'Seen chaal must be 10 (2x blind) when ante is 5');
  assert.strictEqual(seen5.minRaise, 11, 'Seen min raise must be 11');

  // Seen player vs Blind player
  const seenBetsVsBlind = getTeenPattiBetAmounts(baseStake, false, true);
  assert.strictEqual(seenBetsVsBlind.chaalCost, 40); // 2x
  assert.strictEqual(seenBetsVsBlind.showCost, 40); // falls back to chaalCost when pot not provided

  // When pot is provided, showCost is the total current pot
  const seenBetsVsBlindWithPot = getTeenPattiBetAmounts(baseStake, false, true, null, 120);
  assert.strictEqual(seenBetsVsBlindWithPot.showCost, 120);

  // Odd Seen Bet: Previous bet was 15 by Seen player
  // Next Seen player should match 15 exactly (chaalCost = 15, minRaise = 16)
  const seenAfterSeen15 = getTeenPattiBetAmounts(baseStake, false, false, { amount: 15, isBlind: false });
  assert.strictEqual(seenAfterSeen15.chaalCost, 15);
  assert.strictEqual(seenAfterSeen15.minRaise, 16);

  // Next Blind player should bet floor(15 / 2) = 7 (chaalCost = 7, minRaise = 8)
  const blindAfterSeen15 = getTeenPattiBetAmounts(baseStake, true, false, { amount: 15, isBlind: false });
  assert.strictEqual(blindAfterSeen15.chaalCost, 7);
  assert.strictEqual(blindAfterSeen15.minRaise, 8);

  // Previous bet was 10 by Blind player
  // Next Blind player calls with 10
  const blindAfterBlind10 = getTeenPattiBetAmounts(baseStake, true, false, { amount: 10, isBlind: true });
  assert.strictEqual(blindAfterBlind10.chaalCost, 10);
  assert.strictEqual(blindAfterBlind10.minRaise, 11);

  // Next Seen player calls with 20
  const seenAfterBlind10 = getTeenPattiBetAmounts(baseStake, false, false, { amount: 10, isBlind: true });
  assert.strictEqual(seenAfterBlind10.chaalCost, 20);
  assert.strictEqual(seenAfterBlind10.minRaise, 21);
});

test('Teen Patti New Base Stake on Raise', () => {
  // Blind player raises to 50 -> new base unit is 50
  assert.strictEqual(calcTeenPattiNewBaseStake(50, true), 50);

  // Seen player raises to 100 -> new base unit is 50
  assert.strictEqual(calcTeenPattiNewBaseStake(100, false), 50);

  // Seen player raises to 150 -> new base unit is 75
  assert.strictEqual(calcTeenPattiNewBaseStake(150, false), 75);
});

test('Teen Patti IRL Initial Pot of 5: Min chaal is 5 for blind, 10 for seen', () => {
  const anteBoot = 5;
  const baseStake = anteBoot; // 5

  // 1. Initial turn (no prior bets):
  // Blind player acts
  const initialBlind = getTeenPattiBetAmounts(baseStake, true, false, null);
  assert.strictEqual(initialBlind.chaalCost, 5, 'Blind player initial chaal must be 5');
  assert.strictEqual(initialBlind.minRaise, 6, 'Blind player min raise must be 6');

  // Seen player acts (flipped cards)
  const initialSeen = getTeenPattiBetAmounts(baseStake, false, false, null);
  assert.strictEqual(initialSeen.chaalCost, 10, 'Seen player initial chaal must be 10 (2x blind)');
  assert.strictEqual(initialSeen.minRaise, 11, 'Seen player min raise must be 11');

  // 2. Player A (Seen) plays 10
  const afterSeen10Blind = getTeenPattiBetAmounts(baseStake, true, false, { amount: 10, isBlind: false });
  assert.strictEqual(afterSeen10Blind.chaalCost, 5, 'Next blind player calls with floor(10/2) = 5');
  assert.strictEqual(afterSeen10Blind.minRaise, 6);

  const afterSeen10Seen = getTeenPattiBetAmounts(baseStake, false, false, { amount: 10, isBlind: false });
  assert.strictEqual(afterSeen10Seen.chaalCost, 10, 'Next seen player calls with 10');
  assert.strictEqual(afterSeen10Seen.minRaise, 11);

  // 3. Player B (Seen) raises to 20
  const afterSeen20Blind = getTeenPattiBetAmounts(baseStake, true, false, { amount: 20, isBlind: false });
  assert.strictEqual(afterSeen20Blind.chaalCost, 10, 'Next blind player calls with floor(20/2) = 10');
  assert.strictEqual(afterSeen20Blind.minRaise, 11);

  const afterSeen20Seen = getTeenPattiBetAmounts(baseStake, false, false, { amount: 20, isBlind: false });
  assert.strictEqual(afterSeen20Seen.chaalCost, 20, 'Next seen player calls with 20');
  assert.strictEqual(afterSeen20Seen.minRaise, 21);

  // 4. Force Show: Must cost total current pot
  const pot50 = 50;
  const showWithPot = getTeenPattiBetAmounts(baseStake, false, false, { amount: 20, isBlind: false }, pot50);
  assert.strictEqual(showWithPot.showCost, 50, 'Force show must cost total current pot (50)');
});


