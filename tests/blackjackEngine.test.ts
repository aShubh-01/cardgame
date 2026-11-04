import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBlackjackRound } from '../lib/blackjackEngine.ts';

test('Blackjack: Standard Player vs Dealer Outcomes', () => {
  const players = [
    { id: 'D', name: 'Dealer', sit: false, balance: 5000 },
    { id: 'P1', name: 'Alice', sit: false, balance: 1000 },
    { id: 'P2', name: 'Bob', sit: false, balance: 1000 },
    { id: 'P3', name: 'Charlie', sit: false, balance: 1000 },
    { id: 'P4', name: 'David', sit: false, balance: 1000 },
  ];

  // P1: Win ₹200 (net +200)
  // P2: Loss ₹300 (net -300)
  // P3: Push ₹200 (net 0)
  // P4: Blackjack ₹200 with 3:2 payout (net +300)
  const res = calculateBlackjackRound({
    dealerPlayerId: 'D',
    dealerHasBlackjack: false,
    blackjackPayoutRatio: 1.5,
    players,
    balanceMode: true,
    playersInput: [
      { playerId: 'P1', hands: [{ bet: 200, outcome: 'win' }] },
      { playerId: 'P2', hands: [{ bet: 300, outcome: 'loss' }] },
      { playerId: 'P3', hands: [{ bet: 200, outcome: 'push' }] },
      { playerId: 'P4', hands: [{ bet: 200, outcome: 'blackjack' }] },
    ],
  });

  assert.strictEqual(res.playerResults['P1'].totalNet, 200);
  assert.strictEqual(res.playerResults['P2'].totalNet, -300);
  assert.strictEqual(res.playerResults['P3'].totalNet, 0);
  assert.strictEqual(res.playerResults['P4'].totalNet, 300);

  // Total player net = 200 - 300 + 0 + 300 = +200
  // Dealer net = -200
  assert.strictEqual(res.dealerNet, -200);

  // Zero-sum invariant
  const sumNet = res.dealerNet + Object.values(res.playerResults).reduce((s, r) => s + r.totalNet, 0);
  assert.strictEqual(sumNet, 0);

  // Balances
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'D')?.balance, 4800);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'P1')?.balance, 1200);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'P2')?.balance, 700);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'P3')?.balance, 1000);
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'P4')?.balance, 1300);
});

test('Blackjack: Double Down and Split Hands', () => {
  const players = [
    { id: 'D', name: 'Dealer', sit: false },
    { id: 'P1', name: 'DoublePlayer', sit: false },
    { id: 'P2', name: 'SplitPlayer', sit: false },
  ];

  // P1 doubles down on ₹200 bet and wins -> effective bet ₹400, net +₹400
  // P2 splits ₹100 bet into two hands:
  // Hand 1 wins (+₹100), Hand 2 loses (-₹100) -> net 0
  const res = calculateBlackjackRound({
    dealerPlayerId: 'D',
    players,
    balanceMode: false,
    playersInput: [
      {
        playerId: 'P1',
        hands: [{ bet: 200, outcome: 'win', doubleDown: true }],
      },
      {
        playerId: 'P2',
        hands: [
          { bet: 100, outcome: 'win' },
          { bet: 100, outcome: 'loss' },
        ],
      },
    ],
  });

  assert.strictEqual(res.playerResults['P1'].totalNet, 400);
  assert.strictEqual(res.playerResults['P2'].totalNet, 0);
  assert.strictEqual(res.dealerNet, -400);

  // Debts
  assert.strictEqual(res.debtsDelta['D|P1'], 400);
});

test('Blackjack: Insurance Resolution', () => {
  const players = [
    { id: 'D', name: 'Dealer', sit: false },
    { id: 'P1', name: 'Player1', sit: false },
  ];

  // Dealer has blackjack!
  // P1 has ₹200 main bet (loss) and ₹100 insurance bet.
  // Main bet: -₹200. Insurance bet pays 2:1 -> +₹200.
  // Net outcome = 0!
  const res = calculateBlackjackRound({
    dealerPlayerId: 'D',
    dealerHasBlackjack: true,
    players,
    balanceMode: false,
    playersInput: [
      {
        playerId: 'P1',
        insuranceBet: 100,
        hands: [{ bet: 200, outcome: 'loss' }],
      },
    ],
  });

  assert.strictEqual(res.playerResults['P1'].insuranceNet, 200);
  assert.strictEqual(res.playerResults['P1'].totalNet, 0);
  assert.strictEqual(res.dealerNet, 0);
});

