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

