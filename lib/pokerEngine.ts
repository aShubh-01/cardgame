/**
 * Pure Texas Hold'em betting engine.
 *
 * Shared by the client (Mode 1 · IRL Tracker, applied locally by the host) and the
 * server (Mode 2 · Online Multiplayer, applied authoritatively in the action API).
 * Every function is side-effect free: it receives a state snapshot and returns a new one.
 */
import type { Player, Round, HistEntry } from '../types/game.ts';
import { calculatePots, distributePots } from './pokerPot.ts';
import { evaluateAllPokerHands } from './cardGamesEngine.ts';

const money = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');

export type PokerActionType = 'check' | 'call' | 'raise' | 'fold' | 'allin';

export interface PokerActState {
  players: Player[];
  round: Round;
  anteAmt: number;
  balanceMode: boolean;
}

/**
 * Applies one betting action for the player whose turn it is (round.turn).
 * Returns the next { players, round } or null when the action is invalid.
 */
export function applyPokerAction(
  state: PokerActState,
  t: PokerActionType,
  a?: number
): { players: Player[]; round: Round } | null {
  const currentRd = state.round;
  if (!currentRd || currentRd.phase !== 'bet') return null;

  const id = currentRd.turn;
  const me = state.players.find(p => p.id === id)?.name || id;
  const sc = currentRd.st?.[id] || 0;
  const toCall = Math.max(0, (currentRd.cur || 0) - sc);

  let players = [...state.players];
  const acted = { ...(currentRd.acted || {}) };
  const st = { ...(currentRd.st || {}) };
  const contrib = { ...(currentRd.contrib || {}) };
  const folded = { ...(currentRd.folded || {}) };
  const allIn = { ...(currentRd.allIn || {}) };
  const log = [...(currentRd.log || [])];
  let cur = currentRd.cur || 0;
  let stake = currentRd.stake || 0;
  let lastBy = currentRd.lastBy;
  let lastRaiser = currentRd.lastRaiser;
  let minRaise = currentRd.minRaise || state.anteAmt || 5;
  let street = currentRd.street || 0;
  let phase = currentRd.phase;
  let winners = currentRd.winners || [];

  if (t === 'check') {
    if (toCall > 0) return null;
    acted[id] = 1;
    lastBy = `${me} checked`;
    log.push(`${me} checks`);
  } else if (t === 'fold') {
    folded[id] = 1;
    delete acted[id];
    lastBy = `${me} folded`;
    const myContrib = contrib[id] || 0;
    log.push(myContrib > 0 ? `${me} folded (forfeited ${money(myContrib)} to pot)` : `${me} folded`);

    const remaining = currentRd.parts.filter(pId => !folded[pId]);
    if (remaining.length === 1) {
      log.push(`🏆 Everyone folded! ${players.find(p => p.id === remaining[0])?.name || remaining[0]} wins the pot!`);
      return {
        players,
        round: {
          ...currentRd,
          folded,
          acted,
          lastBy,
          log,
          phase: 'result',
          winners: [remaining[0]],
        },
      };
    }
  } else if (t === 'call') {
    if (toCall <= 0) {
      acted[id] = 1;
      lastBy = `${me} checked`;
      log.push(`${me} checks`);
    } else {
      let actualCall = toCall;
      let isAllIn = false;
      if (state.balanceMode) {
        const pIdx = players.findIndex(p => p.id === id);
        if (pIdx < 0) return null;
        const p = players[pIdx];
        const bal = p.balance || 0;
        if (bal <= 0) return null;

        if (bal < toCall) {
          actualCall = bal;
          players[pIdx] = { ...p, balance: 0 };
          isAllIn = true;
        } else {
          actualCall = toCall;
          const nextBal = bal - actualCall;
          players[pIdx] = { ...p, balance: nextBal };
          if (nextBal === 0) isAllIn = true;
        }
      }

      contrib[id] = (contrib[id] || 0) + actualCall;
      st[id] = sc + actualCall;
      acted[id] = 1;
      if (isAllIn) allIn[id] = true;

      const callBet = sc + actualCall;
      const msg = isAllIn ? `${me} called ALL-IN for ${money(callBet)}! 🚨` : `${me} called ${money(callBet)}`;
      lastBy = msg;
      log.push(msg);
    }
  } else if (t === 'raise') {
    const targetBet = a || 0;
    const toAdd = targetBet - sc;
    if (toAdd <= 0 || targetBet <= cur) return null;

    let actualAdd = toAdd;
    let isAllIn = false;
    if (state.balanceMode) {
      const pIdx = players.findIndex(p => p.id === id);
      if (pIdx < 0) return null;
      const p = players[pIdx];
      const bal = p.balance || 0;
      if (bal < toAdd) return null;

      actualAdd = toAdd;
      const nextBal = Math.max(0, bal - actualAdd);
      players[pIdx] = { ...p, balance: nextBal };
      if (nextBal === 0) isAllIn = true;
    }

    if (isAllIn) allIn[id] = true;
    const isFirstBet = cur === 0;
    const newStreetBet = sc + actualAdd;
    const raiseSize = newStreetBet - cur;

    contrib[id] = (contrib[id] || 0) + actualAdd;
    st[id] = newStreetBet;
    cur = newStreetBet;
    stake = newStreetBet;
    lastRaiser = id;
    if (raiseSize > 0) minRaise = Math.max(minRaise, raiseSize);

    // Reset acted for other players so they must respond to raise
    Object.keys(acted).forEach(k => delete acted[k]);
    acted[id] = 1;

    const actionTxt = isAllIn
      ? (isFirstBet ? ' bet ALL-IN ' : ' raised ALL-IN to ')
      : (isFirstBet ? ' bet ' : ' raised to ');
    lastBy = me + actionTxt + money(newStreetBet);
    log.push(me + actionTxt + money(newStreetBet) + (isAllIn ? ' 🚨' : ''));
  } else if (t === 'allin') {
    const pIdx = players.findIndex(p => p.id === id);
    if (pIdx < 0) return null;
    const p = players[pIdx];
    const bal = p.balance || 0;
    if (bal <= 0) return null;

    const actualAdd = bal;
    players[pIdx] = { ...p, balance: 0 };
    allIn[id] = true;
    const newStreetBet = sc + actualAdd;

    contrib[id] = (contrib[id] || 0) + actualAdd;
    st[id] = newStreetBet;

    if (newStreetBet > cur) {
      const raiseSize = newStreetBet - cur;
      cur = newStreetBet;
      stake = newStreetBet;
      lastRaiser = id;
      if (raiseSize > 0) minRaise = Math.max(minRaise, raiseSize);
      Object.keys(acted).forEach(k => delete acted[k]);
      acted[id] = 1;
    } else {
      acted[id] = 1;
    }

    const msg = `${me} went ALL-IN for ${money(newStreetBet)}! 🚨`;
    lastBy = msg;
    log.push(msg);
  } else {
    return null;
  }

  // Check loop completion
  const currentActive = currentRd.parts.filter(pId => !folded[pId]);
  const canActPlayers = currentActive.filter(pId => !allIn[pId]);
  const allActed = canActPlayers.every(pId => acted[pId]);
  const allMatched = canActPlayers.every(pId => (st[pId] || 0) === cur);
  const noMoreBetting = canActPlayers.length === 0 || (canActPlayers.length === 1 && allActed && allMatched);

  let nextTurn = currentRd.turn;
  const order = state.players.map(p => p.id).filter(pId => currentRd.parts.includes(pId));

  if ((allActed && allMatched) || noMoreBetting) {
    const activeNames = currentActive.map(pId => players.find(p => p.id === pId)?.name || pId);
    const namesStr = activeNames.length === 2 ? `${activeNames[0]} and ${activeNames[1]}` : activeNames.join(', ');

    if (noMoreBetting && street !== 3) {
      street = 3;
      phase = 'result';
      winners = [];
      if (canActPlayers.length === 0) {
        log.push(`— ${namesStr} are All-In! Remaining community cards dealt to River · Showdown —`);
      } else {
        log.push(`— All-In showdown between ${namesStr}! Remaining community cards dealt to River —`);
      }
    } else if (street === 3) {
      phase = 'result';
      winners = [];
      log.push(`— Betting complete · Showdown between ${namesStr} —`);
    } else {
      street = street + 1;
      Object.keys(st).forEach(k => delete st[k]);
      Object.keys(acted).forEach(k => delete acted[k]);
      cur = 0;
      stake = 0;
      lastRaiser = null;
      minRaise = state.anteAmt || 10;
      const streetLabels = ['Pre-flop', 'Flop', 'Turn', 'River'];
      const desc = street === 1 ? 'Flop revealed (3 cards open)' : street === 2 ? 'Turn revealed (4th card open)' : 'River revealed (5th card open)';
      lastBy = `${streetLabels[street]} dealt`;
      log.push(`— Bets matched · ${desc} —`);

      // Post-flop action starts clockwise from Dealer (usually SB or next active player)
      const dealerId = currentRd.dealer || order[0];
      let dIdx = order.indexOf(dealerId);
      if (dIdx < 0) dIdx = 0;
      let nextP: string | null = null;
      for (let k = 1; k <= order.length; k++) {
        const cand = order[(dIdx + k) % order.length];
        if (!folded[cand] && !allIn[cand]) {
          nextP = cand;
          break;
        }
      }

      if (nextP) {
        nextTurn = nextP;
      } else {
        phase = 'result';
        winners = [];
      }
    }
  } else {
    // Advance turn
    let idx = order.indexOf(currentRd.turn);
    for (let k = 0; k < order.length; k++) {
      idx = (idx + 1) % order.length;
      if (!folded[order[idx]] && !allIn[order[idx]]) {
        nextTurn = order[idx];
        break;
      }
    }
  }

  let board = currentRd.board;
  if (currentRd.boardCards && Array.isArray(currentRd.boardCards)) {
    const boardCount = phase === 'result' ? 5 : (street === 1 ? 3 : street === 2 ? 4 : street >= 3 ? 5 : 0);
    board = currentRd.boardCards.slice(0, boardCount);
  }

  let revealedHands = currentRd.revealedHands || {};
  let handEvaluations = currentRd.handEvaluations || {};
  let potWinners = currentRd.potWinners || {};

  if (phase === 'result' && currentRd.hands) {
    const activeIds = currentRd.parts.filter(pId => !folded[pId]);
    revealedHands = { ...revealedHands };
    activeIds.forEach(pId => {
      if (currentRd.hands?.[pId]) {
        revealedHands[pId] = currentRd.hands[pId];
      }
    });
    const evalRes = evaluateAllPokerHands(currentRd.hands, board || [], activeIds);
    handEvaluations = evalRes.evaluations;
    if (evalRes.bestPlayerIds.length > 0 && winners.length === 0) {
      winners = evalRes.bestPlayerIds;
    }
    const { pots } = calculatePots(contrib, folded, allIn);
    const autoPotWinners: Record<string, string[]> = {};
    pots.forEach(pot => {
      const eligEval = evaluateAllPokerHands(currentRd.hands!, board || [], pot.eligiblePlayerIds);
      if (eligEval.bestPlayerIds.length > 0) {
        autoPotWinners[pot.id] = eligEval.bestPlayerIds;
      }
    });
    potWinners = autoPotWinners;
  }

  return {
    players,
    round: {
      ...currentRd,
      contrib,
      folded,
      turn: nextTurn,
      stake,
      log,
      lastBy,
      street,
      cur,
      st,
      acted,
      winners,
      lastRaiser,
      minRaise,
      allIn,
      phase,
      board,
      revealedHands,
      handEvaluations,
      potWinners,
    },
  };
}

export interface PokerSettleState {
  players: Player[];
  round: Round;
  debts: Record<string, number>;
  wins: Record<string, number>;
  hist: HistEntry[];
  tot: { rounds: number; total: number; big: number };
  balanceMode: boolean;
  dealerIdx?: number;
}

/**
 * Settles all pots of a finished hand using the chosen winner(s) per pot.
 * Returns the state fields to merge (round is cleared and the dealer button moves).
 */
export function settlePokerShowdown(
  state: PokerSettleState,
  potWinners: Record<string, string[]>
): Omit<PokerSettleState, 'round' | 'balanceMode'> & { round: null } {
  const rd = state.round;
  const { pots, totalPot } = calculatePots(rd.contrib || {}, rd.folded || {}, rd.allIn || {});
  if (!pots.length || totalPot <= 0) {
    return {
      players: state.players,
      debts: state.debts,
      wins: state.wins,
      hist: state.hist,
      tot: state.tot,
      dealerIdx: state.dealerIdx,
      round: null,
    };
  }

  const playerMap: Record<string, { name: string }> = {};
  state.players.forEach(p => { playerMap[p.id] = { name: p.name }; });
  const summary = distributePots(pots, potWinners, playerMap);
  const pays: { name: string; amt: number }[] = [];

  let players = [...state.players];
  const debts = { ...state.debts };
  const wins = { ...state.wins };

  if (state.balanceMode) {
    players = players.map(p => {
      if (p.isGameOperator) return p;
      const won = summary.totalPlayerWins[p.id] || 0;
      const nextBal = (p.balance || 0) + won;
      return {
        ...p,
        balance: nextBal,
        sit: nextBal <= 0 ? true : p.sit,
      };
    });
  }

  const nets: Record<string, number> = {};
  rd.parts.forEach(id => {
    nets[id] = (summary.totalPlayerWins[id] || 0) - (rd.contrib[id] || 0);
  });
  const cr = Object.entries(nets).filter(e => e[1] > 0);
  const tc = cr.reduce((acc, e) => acc + e[1], 0);

  Object.entries(nets).filter(e => e[1] < 0).forEach(([d, v]) => {
    let left = -v;
    cr.forEach(([c, cv], i) => {
      if (tc <= 0) return;
      const x = i === cr.length - 1 ? left : Math.round(-v * cv / tc);
      left -= x;
      if (x <= 0) return;
      const k = `${d}|${c}`;
      const rk = `${c}|${d}`;
      const rev = debts[rk] || 0;
      if (rev >= x) {
        debts[rk] = rev - x;
        if (!debts[rk]) delete debts[rk];
      } else {
        const rem = x - rev;
        delete debts[rk];
        debts[k] = (debts[k] || 0) + rem;
      }
    });
    pays.push({ name: players.find(p => p.id === d)?.name || d, amt: -v });
  });

  Object.entries(summary.totalPlayerWins).forEach(([wId, amt]) => {
    wins[wId] = (wins[wId] || 0) + amt;
  });

  const winningNames = Object.entries(summary.totalPlayerWins)
    .filter(([, amt]) => amt > 0)
    .map(([wid]) => players.find(p => p.id === wid)?.name || wid)
    .join(' & ');

  const tot = {
    rounds: (state.tot?.rounds || 0) + 1,
    total: (state.tot?.total || 0) + totalPot,
    big: Math.max(state.tot?.big || 0, totalPot),
  };

  const hist = [
    { no: rd.no, winner: winningNames || 'Split', pot: totalPot, got: totalPot, pays },
    ...(state.hist || []),
  ].slice(0, 30);

  const activePlayers = players.filter(p => !p.sit && !p.isGameOperator);
  const currentDIdx = state.dealerIdx ?? 0;
  const nextDIdx = activePlayers.length > 0 ? (currentDIdx + 1) % activePlayers.length : 0;

  return { players, debts, wins, tot, hist, round: null, dealerIdx: nextDIdx };
}

/**
 * Starts an online hand: no blinds / antes. Every player simply enters how much they
 * want to put in when it is their turn. Cards are supplied by the caller (server deck).
 */
export function startOnlinePokerRound(params: {
  players: Player[];
  rno: number;
  dealerIdx: number;
  balanceMode: boolean;
  hands: Record<string, any[]>;
  boardCards: any[];
  deck: any[];
  minBet?: number;
  ante?: { mode: string; amt: number };
  adminPlayerId?: string;
}): { players: Player[]; round: Round } | null {
  let players = params.players.map(p => ({
    ...p,
    sit: p.isGameOperator ? false : (params.balanceMode && (p.balance || 0) <= 0 ? true : p.sit),
  }));
  const active = players.filter(p => !p.sit && !p.isGameOperator && p.isConnected !== false);
  if (active.length < 2) return null;

  const activeIds = active.map(p => p.id);
  const dIdx = ((params.dealerIdx % activeIds.length) + activeIds.length) % activeIds.length;
  const dealerId = activeIds[dIdx];
  const dealerName = active[dIdx].name;

  const bootAmt = Math.max(0, Math.floor(Number(params.ante?.amt || 0)));
  const bootMode = params.ante?.mode === 'admin' ? 'admin' : 'each';
  const antePerPlayer = bootMode === 'admin' && bootAmt > 0
    ? Math.max(1, Math.floor(bootAmt / activeIds.length) || 1)
    : Math.max(1, bootAmt || 5);
  const minBet = params.minBet !== undefined ? Math.max(1, params.minBet) : antePerPlayer;

  const contrib: Record<string, number> = {};
  const allIn: Record<string, boolean> = {};
  activeIds.forEach(id => { contrib[id] = 0; });

  const log: string[] = [`Hand #${params.rno} dealt · Dealer button is ${dealerName} [D]`];

  if (bootAmt > 0) {
    if (bootMode === 'admin') {
      const adminId = params.adminPlayerId || activeIds[0];
      let actualSeed = bootAmt;
      if (params.balanceMode) {
        const aIdx = players.findIndex(p => p.id === adminId);
        if (aIdx >= 0) {
          const bal = players[aIdx].balance || 0;
          actualSeed = Math.min(bal, bootAmt);
          const nextBal = Math.max(0, bal - actualSeed);
          players[aIdx] = { ...players[aIdx], balance: nextBal };
          if (nextBal === 0 && actualSeed > 0) {
            allIn[adminId] = true;
          }
        }
      }
      if (actualSeed > 0) {
        contrib['__pot_seed__'] = actualSeed;
        const adminName = players.find(p => p.id === adminId)?.name || 'Admin';
        log.push(`👑 Initial pot ${money(actualSeed)} funded from ${adminName}'s wallet`);
      }
    } else {
      players = players.map(p => {
        if (p.sit || !activeIds.includes(p.id)) return p;
        let actualBoot = bootAmt;
        let nextBal = p.balance;
        if (params.balanceMode) {
          actualBoot = Math.min(p.balance || 0, bootAmt);
          nextBal = Math.max(0, (p.balance || 0) - actualBoot);
          if (nextBal === 0 && actualBoot > 0) {
            allIn[p.id] = true;
          }
        }
        contrib[p.id] = actualBoot;
        return { ...p, balance: nextBal };
      });
      log.push(`🪙 Initial pot ${money(bootAmt)} collected from each player`);
    }
  } else {
    log.push('Enter how much you want to bet on your turn');
  }

  let firstTurn = activeIds[(dIdx + 1) % activeIds.length];
  for (let k = 1; k <= activeIds.length; k++) {
    const cand = activeIds[(dIdx + k) % activeIds.length];
    if (!allIn[cand]) {
      firstTurn = cand;
      break;
    }
  }

  return {
    players,
    round: {
      no: params.rno,
      phase: 'bet',
      parts: activeIds,
      contrib,
      folded: {},
      turn: firstTurn,
      stake: 0,
      stack: [],
      log,
      lastBy: '',
      winner: null,
      street: 0,
      cur: 0,
      st: {},
      acted: {},
      locked: false,
      winners: [],
      lastRaiser: null,
      minRaise: minBet,
      allIn,
      potWinners: {},
      dealer: dealerId,
      hands: params.hands,
      boardCards: params.boardCards,
      board: [],
      deck: params.deck,
      revealedHands: {},
    },
  };
}

/**
 * Translates a free-form "amount to put in from my stack" into a concrete poker action.
 * Returns an error string when the amount is not allowed.
 */
export function resolveBetAmount(params: {
  amount: number;
  streetContribution: number; // what the player already put in this street
  currentBet: number; // highest street bet to match
  minRaise: number;
  balance: number | null; // null = debt mode (no stack limit)
}): { action: PokerActionType; target?: number } | { error: string } {
  const amount = Math.floor(Number(params.amount) || 0);
  const sc = params.streetContribution;
  const cur = params.currentBet;
  const toCall = Math.max(0, cur - sc);
  const bal = params.balance;

  if (amount < 0) return { error: 'Amount cannot be negative' };
  if (bal !== null && amount > bal) return { error: `Insufficient chips · your balance is ${money(bal)}` };

  // All-in (exactly the whole stack) is always allowed
  if (bal !== null && bal > 0 && amount === bal) return { action: 'allin' };

  if (amount === 0) {
    return toCall === 0 ? { action: 'check' } : { error: `Put in at least ${money(toCall)} to call, or fold` };
  }
  if (amount < toCall) return { error: `Put in at least ${money(toCall)} to call` };
  if (amount === toCall) return { action: 'call' };

  const target = sc + amount;
  const raiseBy = target - cur;
  if (raiseBy < 1) {
    return { error: cur === 0 ? `Bet must be greater than ₹0` : `Raise must be greater than current bet (${money(toCall)})` };
  }
  return { action: 'raise', target };
}

