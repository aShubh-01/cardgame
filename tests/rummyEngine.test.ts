import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRummyDeal,
  RUMMY_DROPS,
  RUMMY_PRESETS,
  formatConfigSummary,
  getTotalMeldCards,
  calculatePlayerPenaltyWithBreakdown,
  type RummyConfig,
} from '../lib/rummyEngine.ts';

test('Indian Rummy: Standard 4-player deal at ₹10/point', () => {
  const players = [
    { id: 'P1', name: 'Aman', sit: false },
    { id: 'P2', name: 'Shubham', sit: false },
    { id: 'P3', name: 'Jatin', sit: false },
    { id: 'P4', name: 'Rohit', sit: false },
  ];

  const res = calculateRummyDeal({
    pointValue: 10,
    winnerId: 'P1',
    playerPoints: {
      P2: RUMMY_DROPS.FIRST_DROP,
      P3: RUMMY_DROPS.MIDDLE_DROP,
      P4: RUMMY_DROPS.FULL_COUNT,
    },
    players,
    balanceMode: false,
  });

  assert.strictEqual(res.totalPointsLost, 140); // 20 + 40 + 80
  assert.strictEqual(res.totalWinnings, 1400); // 140 * 10
  assert.strictEqual(res.playerOutcomes['P1'].amount, 1400);
  assert.strictEqual(res.playerOutcomes['P2'].amount, -200);
  assert.strictEqual(res.playerOutcomes['P3'].amount, -400);
  assert.strictEqual(res.playerOutcomes['P4'].amount, -800);

  const sumAmounts = Object.values(res.playerOutcomes).reduce((s, o) => s + o.amount, 0);
  assert.strictEqual(sumAmounts, 0);
  assert.strictEqual(res.debtsDelta['P2|P1'], 200);
  assert.strictEqual(res.debtsDelta['P3|P1'], 400);
  assert.strictEqual(res.debtsDelta['P4|P1'], 800);
});

test('Indian Rummy: Max 80 points capping', () => {
  const players = [
    { id: 'W', name: 'Winner', sit: false },
    { id: 'L', name: 'Loser', sit: false },
  ];

  const res = calculateRummyDeal({
    pointValue: 5,
    winnerId: 'W',
    playerPoints: { L: 95 },
    players,
    balanceMode: false,
  });

  assert.strictEqual(res.playerOutcomes['L'].points, 80);
  assert.strictEqual(res.playerOutcomes['L'].capped, true);
  assert.strictEqual(res.playerOutcomes['L'].amount, -400); // 80 * 5
  assert.strictEqual(res.totalWinnings, 400);
});

test('Indian Rummy: Balance Mode and Short Stack', () => {
  const players = [
    { id: 'W', name: 'Winner', sit: false, balance: 500 },
    { id: 'L1', name: 'Loser 1', sit: false, balance: 1000 },
    { id: 'L2', name: 'Loser 2', sit: false, balance: 150 },
  ];

  const res = calculateRummyDeal({
    pointValue: 10,
    winnerId: 'W',
    playerPoints: { L1: 30, L2: 40 },
    players,
    balanceMode: true,
  });

  assert.strictEqual(res.totalWinnings, 450);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'W')?.balance, 950);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'L1')?.balance, 700);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'L2')?.balance, 0);

  const sumBalDelta = res.updatedPlayers.reduce((s, p) => s + (p.balance || 0), 0) -
                      players.reduce((s, p) => s + (p.balance || 0), 0);
  assert.strictEqual(sumBalDelta, 0);
});

test('Indian Rummy: 9-Card Configuration (Set of 3, Pure Seq of 3, Any Seq of 3)', () => {
  const config9 = RUMMY_PRESETS['9_cards'];
  assert.strictEqual(config9.totalCards, 9);
  assert.strictEqual(getTotalMeldCards(config9.requirements), 9);
  assert.strictEqual(formatConfigSummary(config9), '9 Cards: Pure Seq (3) + Seq (3) + Set (3)');

  const players = [
    { id: 'P1', name: 'Aman', sit: false },
    { id: 'P2', name: 'Shubham', sit: false },
    { id: 'P3', name: 'Jatin', sit: false },
  ];

  // At ₹5/pt, maxPoints 60:
  // Shubham lost 25 pts -> ₹125
  // Jatin lost 70 pts (capped to 60) -> ₹300
  // Aman gets 125 + 300 = 425
  const res = calculateRummyDeal({
    pointValue: 5,
    winnerId: 'P1',
    playerPoints: { P2: 25, P3: 70 },
    players,
    balanceMode: false,
    config: config9,
  });

  assert.strictEqual(res.playerOutcomes['P3'].points, 60);
  assert.strictEqual(res.playerOutcomes['P3'].capped, true);
  assert.strictEqual(res.playerOutcomes['P3'].amount, -300);
  assert.strictEqual(res.playerOutcomes['P2'].amount, -125);
  assert.strictEqual(res.totalWinnings, 425);
  assert.strictEqual(res.playerOutcomes['P1'].amount, 425);
});

test('Indian Rummy: 7-Card Configuration (Pure Seq of 4, Set of 3)', () => {
  const config7 = RUMMY_PRESETS['7_cards'];
  assert.strictEqual(config7.totalCards, 7);
  assert.strictEqual(getTotalMeldCards(config7.requirements), 7);
  assert.strictEqual(formatConfigSummary(config7), '7 Cards: Pure Seq (4) + Set (3)');

  // Breakdown test:
  // 1. Player without pure sequence gets full count (50 pts)
  const penaltyNoPure = calculatePlayerPenaltyWithBreakdown(
    { pureSeqCompleted: false, unmeldedCardPoints: 12 },
    config7
  );
  assert.strictEqual(penaltyNoPure.points, 50);

  // 2. Player with pure sequence only pays unmelded card points
  const penaltyWithPure = calculatePlayerPenaltyWithBreakdown(
    { pureSeqCompleted: true, unmeldedCardPoints: 14 },
    config7
  );
  assert.strictEqual(penaltyWithPure.points, 14);
});
