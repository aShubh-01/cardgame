import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePots, distributePots } from '../lib/pokerPot.ts';

test('Poker Pot Calculation: User Example 1', () => {
  // Player A: ₹300, Player B: ₹700, Player C: ₹700
  const contributions = { A: 300, B: 700, C: 700 };
  const result = calculatePots(contributions);

  assert.strictEqual(result.totalPot, 1700);
  assert.strictEqual(result.pots.length, 2);

  // Main Pot: ₹900 (₹300 × 3), Eligible: A, B, C
  assert.strictEqual(result.pots[0].name, 'Main Pot');
  assert.strictEqual(result.pots[0].amount, 900);
  assert.deepStrictEqual(result.pots[0].eligiblePlayerIds.sort(), ['A', 'B', 'C'].sort());

  // Side Pot 1: ₹800 (₹400 × 2), Eligible: B, C
  assert.strictEqual(result.pots[1].name, 'Side Pot 1');
  assert.strictEqual(result.pots[1].amount, 800);
  assert.deepStrictEqual(result.pots[1].eligiblePlayerIds.sort(), ['B', 'C'].sort());

  // Invariant
  const sumOfPots = result.pots.reduce((s, p) => s + p.amount, 0);
  assert.strictEqual(sumOfPots, result.totalPot);
});

test('Poker Pot Calculation: User Example 2', () => {
  // Player A: ₹200, Player B: ₹500, Player C: ₹800, Player D: ₹800
  const contributions = { A: 200, B: 500, C: 800, D: 800 };
  const result = calculatePots(contributions);

  assert.strictEqual(result.totalPot, 2300);
  assert.strictEqual(result.pots.length, 3);

  // Main Pot: ₹800 (₹200 × 4), Eligible: A, B, C, D
  assert.strictEqual(result.pots[0].name, 'Main Pot');
  assert.strictEqual(result.pots[0].amount, 800);
  assert.deepStrictEqual(result.pots[0].eligiblePlayerIds.sort(), ['A', 'B', 'C', 'D'].sort());

  // Side Pot 1: ₹900 (₹300 × 3), Eligible: B, C, D
  assert.strictEqual(result.pots[1].name, 'Side Pot 1');
  assert.strictEqual(result.pots[1].amount, 900);
  assert.deepStrictEqual(result.pots[1].eligiblePlayerIds.sort(), ['B', 'C', 'D'].sort());

  // Side Pot 2: ₹600 (₹300 × 2), Eligible: C, D
  assert.strictEqual(result.pots[2].name, 'Side Pot 2');
  assert.strictEqual(result.pots[2].amount, 600);
  assert.deepStrictEqual(result.pots[2].eligiblePlayerIds.sort(), ['C', 'D'].sort());

  // Invariant
  const sumOfPots = result.pots.reduce((s, p) => s + p.amount, 0);
  assert.strictEqual(sumOfPots, result.totalPot);
});

test('Scenario 1: Two players go all-in with different chip amounts', () => {
  // A is all-in with 150, B is all-in with 400, C has chips and matches 400
  const contributions = { A: 150, B: 400, C: 400 };
  const result = calculatePots(contributions);

  assert.strictEqual(result.totalPot, 950);
  assert.strictEqual(result.pots.length, 2);

  // Main pot: 150 * 3 = 450, eligible: A, B, C
  assert.strictEqual(result.pots[0].amount, 450);
  assert.deepStrictEqual(result.pots[0].eligiblePlayerIds.sort(), ['A', 'B', 'C'].sort());

  // Side pot 1: 250 * 2 = 500, eligible: B, C
  assert.strictEqual(result.pots[1].amount, 500);
  assert.deepStrictEqual(result.pots[1].eligiblePlayerIds.sort(), ['B', 'C'].sort());
});

test('Scenario 2 & 8: Three or more players go all-in with different amounts (multiple side pots)', () => {
  // A: 100 (all in), B: 250 (all in), C: 600 (all in), D: 1000
  const contributions = { A: 100, B: 250, C: 600, D: 1000 };
  const result = calculatePots(contributions);

  assert.strictEqual(result.totalPot, 1950);
  assert.strictEqual(result.pots.length, 4);

  // Main Pot: 100 * 4 = 400 (A, B, C, D)
  assert.strictEqual(result.pots[0].amount, 400);
  assert.deepStrictEqual(result.pots[0].eligiblePlayerIds.sort(), ['A', 'B', 'C', 'D'].sort());

  // Side Pot 1: (250-100)*3 = 450 (B, C, D)
  assert.strictEqual(result.pots[1].amount, 450);
  assert.deepStrictEqual(result.pots[1].eligiblePlayerIds.sort(), ['B', 'C', 'D'].sort());

  // Side Pot 2: (600-250)*2 = 700 (C, D)
  assert.strictEqual(result.pots[2].amount, 700);
  assert.deepStrictEqual(result.pots[2].eligiblePlayerIds.sort(), ['C', 'D'].sort());

  // Side Pot 3: (1000-600)*1 = 400 (D - uncalled excess)
  assert.strictEqual(result.pots[3].amount, 400);
  assert.deepStrictEqual(result.pots[3].eligiblePlayerIds.sort(), ['D'].sort());
});

test('Scenario 3: A player folds after contributing to the pot', () => {
  // A is all-in for 200.
  // F puts in 500, then folds!
  // B puts in 800, C puts in 800.
  const contributions = { A: 200, F: 500, B: 800, C: 800 };
  const folded = { F: 1 };
  const result = calculatePots(contributions, folded);

  assert.strictEqual(result.totalPot, 2300);

  // Main pot: 200 * 4 = 800 (A, B, C eligible; F excluded!)
  assert.strictEqual(result.pots[0].amount, 800);
  assert.strictEqual(result.pots[0].eligiblePlayerIds.includes('F'), false);
  assert.deepStrictEqual(result.pots[0].eligiblePlayerIds.sort(), ['A', 'B', 'C'].sort());

  // Side pot: F's dead money (300) + B's 600 + C's 600 = 1500 (eligible: B, C)
  assert.strictEqual(result.pots[1].amount, 1500);
  assert.strictEqual(result.pots[1].eligiblePlayerIds.includes('F'), false);
  assert.deepStrictEqual(result.pots[1].eligiblePlayerIds.sort(), ['B', 'C'].sort());

  const sumOfPots = result.pots.reduce((s, p) => s + p.amount, 0);
  assert.strictEqual(sumOfPots, 2300);
});

test('Scenario 4: A player goes all-in while other players continue betting', () => {
  // Round 1: Preflop A goes all-in with 50, B & C call 50.
  // Round 2: On Flop, B bets 100, C calls 100.
  // Total contributions: A: 50, B: 150, C: 150.
  const contributions = { A: 50, B: 150, C: 150 };
  const result = calculatePots(contributions);

  assert.strictEqual(result.totalPot, 350);
  // Main pot: 50 * 3 = 150 (A, B, C)
  assert.strictEqual(result.pots[0].amount, 150);
  assert.deepStrictEqual(result.pots[0].eligiblePlayerIds.sort(), ['A', 'B', 'C'].sort());

  // Side pot 1: 100 * 2 = 200 (B, C)
  assert.strictEqual(result.pots[1].amount, 200);
  assert.deepStrictEqual(result.pots[1].eligiblePlayerIds.sort(), ['B', 'C'].sort());
});

test('Scenario 5: Multiple players tie at showdown (Split Pot with remainder)', () => {
  const pots = [
    { id: 'main', name: 'Main Pot', amount: 901, eligiblePlayerIds: ['A', 'B'], contributorIds: ['A', 'B'], tierCap: 450 },
  ];
  // A and B tie for Main Pot
  const winners = { main: ['A', 'B'] };
  const payout = distributePots(pots, winners);

  // 901 split 2 ways: 451 to A, 450 to B (1 odd chip given to first player)
  assert.strictEqual(payout.totalPlayerWins['A'], 451);
  assert.strictEqual(payout.totalPlayerWins['B'], 450);
  assert.strictEqual(payout.totalPlayerWins['A'] + payout.totalPlayerWins['B'], 901);
});

test('Scenario 6: Player with best hand overall is ineligible for side pot', () => {
  // A: 200 (all in), B: 800, C: 800
  const contributions = { A: 200, B: 800, C: 800 };
  const potResult = calculatePots(contributions);

  // Main Pot: 600 (A, B, C)
  // Side Pot 1: 1200 (B, C)
  assert.strictEqual(potResult.pots[0].amount, 600);
  assert.strictEqual(potResult.pots[1].amount, 1200);

  // Player A has Royal Flush (best hand), wins Main Pot.
  // Player A is ineligible for Side Pot 1.
  // Player B beats Player C for Side Pot 1.
  const winners = {
    main: ['A'],
    'side-1': ['B'],
  };

  const payout = distributePots(potResult.pots, winners);

  assert.strictEqual(payout.totalPlayerWins['A'], 600);
  assert.strictEqual(payout.totalPlayerWins['B'], 1200);
  assert.strictEqual(payout.totalPlayerWins['C'] || 0, 0);

  // Sum equals total pot
  assert.strictEqual(payout.totalPlayerWins['A'] + payout.totalPlayerWins['B'], 1800);
});

test('Scenario 7: All players except one fold', () => {
  // A: 200 (folded), B: 300 (folded), C: 500 (active)
  const contributions = { A: 200, B: 300, C: 500 };
  const folded = { A: 1, B: 1 };
  const result = calculatePots(contributions, folded);

  assert.strictEqual(result.totalPot, 1000);
  // Since everyone else folded, C is the sole eligible player
  assert.strictEqual(result.pots.length, 1);
  assert.strictEqual(result.pots[0].amount, 1000);
  assert.deepStrictEqual(result.pots[0].eligiblePlayerIds, ['C']);

  // Distribute to C
  const payout = distributePots(result.pots, { main: ['C'] });
  assert.strictEqual(payout.totalPlayerWins['C'], 1000);
});

test('Edge Case: Zero / Empty contributions', () => {
  const result = calculatePots({});
  assert.strictEqual(result.totalPot, 0);
  assert.strictEqual(result.pots.length, 1);
  assert.strictEqual(result.pots[0].amount, 0);
});

