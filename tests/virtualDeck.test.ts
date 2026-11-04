import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStandardDeck,
  shuffleDeck,
  dealCards,
  sanitizeStateForClient,
} from '../lib/virtualDeck.ts';

test('Virtual Deck: Standard 52-card creation and shuffle', () => {
  const deck = createStandardDeck(1);
  assert.equal(deck.length, 52);

  // Check counts of suits and ranks
  const suits = deck.map(c => c.suit);
  const hearts = suits.filter(s => s === '♥').length;
  const spades = suits.filter(s => s === '♠').length;
  assert.equal(hearts, 13);
  assert.equal(spades, 13);

  // Test shuffle returns 52 cards
  const shuffled = shuffleDeck(deck);
  assert.equal(shuffled.length, 52);
  // Verify all cards are preserved
  const originalIds = deck.map(c => `${c.rank}${c.suit}`).sort();
  const shuffledIds = shuffled.map(c => `${c.rank}${c.suit}`).sort();
  assert.deepEqual(originalIds, shuffledIds);
});

test('Virtual Deck: Deal cards correctly splits top cards and remaining', () => {
  const deck = createStandardDeck(1);
  const { dealt, remaining } = dealCards(deck, 5);

  assert.equal(dealt.length, 5);
  assert.equal(remaining.length, 47);
  assert.deepEqual(dealt, deck.slice(0, 5));
});

test('Card Secrecy: State sanitization prevents hole card leakage', () => {
  const mockServerState = {
    players: [
      { id: 'p1', name: 'Alice', userId: 'alice@example.com' },
      { id: 'p2', name: 'Bob', userId: 'bob@example.com' },
    ],
    round: {
      no: 1,
      phase: 'betting',
      deck: [
        { rank: 'A', suit: '♠', red: false },
        { rank: 'K', suit: '♦', red: true },
      ],
      hands: {
        p1: [
          { rank: 'A', suit: '♥', red: true },
          { rank: 'A', suit: '♦', red: true },
        ],
        p2: [
          { rank: 'K', suit: '♠', red: false },
          { rank: 'K', suit: '♣', red: false },
        ],
      },
      revealedHands: {},
    },
  };

  // 1. Sanitization for Alice:
  // Alice sees her own cards, but Bob's cards are masked. Deck is hidden.
  const aliceView = sanitizeStateForClient(mockServerState, 'alice@example.com');
  assert.equal(aliceView.round.deckRemaining, 2);
  assert.equal(aliceView.round.deck, undefined, 'Raw deck must never leak');
  assert.deepEqual(aliceView.round.hands.p1, [
    { rank: 'A', suit: '♥', red: true },
    { rank: 'A', suit: '♦', red: true },
  ]);
  assert.deepEqual(aliceView.round.hands.p2, { count: 2, masked: true });

  // 2. Sanitization for Bob:
  const bobView = sanitizeStateForClient(mockServerState, 'bob@example.com');
  assert.deepEqual(bobView.round.hands.p1, { count: 2, masked: true });
  assert.deepEqual(bobView.round.hands.p2, [
    { rank: 'K', suit: '♠', red: false },
    { rank: 'K', suit: '♣', red: false },
  ]);

  // 3. Sanitization for Spectator / Unseated user:
  const spectatorView = sanitizeStateForClient(mockServerState, 'charlie@example.com');
  assert.deepEqual(spectatorView.round.hands.p1, { count: 2, masked: true });
  assert.deepEqual(spectatorView.round.hands.p2, { count: 2, masked: true });

  // 4. Revealed hand at showdown is visible to all:
  mockServerState.round.revealedHands = {
    p2: true,
  };
  const aliceViewShowdown = sanitizeStateForClient(mockServerState, 'alice@example.com');
  assert.deepEqual(aliceViewShowdown.round.hands.p2, [
    { rank: 'K', suit: '♠', red: false },
    { rank: 'K', suit: '♣', red: false },
  ]);
});

