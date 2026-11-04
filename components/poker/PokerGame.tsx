'use client';

import React from 'react';
import Header from '@/components/common/Header';
import SeatsList from '@/components/common/SeatsList';
import RoundHistory from '@/components/common/RoundHistory';
import DebtModal from '@/components/common/DebtModal';
import SessionsModal from '@/components/common/SessionsModal';
import AddMoneyModal from '@/components/common/AddMoneyModal';
import GoogleConfigModal from '@/components/common/GoogleConfigModal';
import ConfirmModal from '@/components/common/ConfirmModal';
import PokerTable from '@/components/poker/PokerTable';
import PokerControls from '@/components/poker/PokerControls';
import { useGameEngine } from '@/hooks/useGameEngine';
import { calculatePots, distributePots } from '@/lib/pokerPot';
import { money } from '@/types/game';

export default function PokerGame() {
  React.useEffect(() => {
    document.body.dataset.v = 'pk';
    return () => {
      delete document.body.dataset.v;
    };
  }, []);

  const engine = useGameEngine('pk');
  const { gameState, updateState } = engine;
  const rd = gameState.round;

  /* ───────── Poker Act ───────── */
  const handlePokerAct = (t: string, a?: number) => {
    if (!rd) return;
    if (t === 'showdown') {
      updateState(prev => {
        if (!prev.round) return prev;
        engine.takeSnapshot(prev.round, prev.players);
        return {
          ...prev,
          round: {
            ...prev.round,
            phase: 'result',
            winners: [],
          },
        };
      });
      return;
    }

    const id = rd.turn;
    const me = gameState.players.find(p => p.id === id)?.name || id;
    const sc = (rd.st?.[id]) || 0;
    const toCall = Math.max(0, (rd.cur || 0) - sc);

    updateState(prev => {
      const currentRd = prev.round;
      if (!currentRd) return prev;
      engine.takeSnapshot(currentRd, prev.players);

      let players = [...prev.players];
      const acted = { ...(currentRd.acted || {}) };
      const st = { ...(currentRd.st || {}) };
      const contrib = { ...(currentRd.contrib || {}) };
      const folded = { ...(currentRd.folded || {}) };
      const allIn = { ...(currentRd.allIn || {}) };
      const log = [...currentRd.log];
      let cur = currentRd.cur || 0;
      let stake = currentRd.stake || 0;
      let lastBy = currentRd.lastBy;
      let lastRaiser = currentRd.lastRaiser;
      let minRaise = currentRd.minRaise || 10;
      let street = currentRd.street || 0;
      let phase = currentRd.phase;
      let winners = currentRd.winners || [];

      if (t === 'check') {
        if (toCall > 0) return prev;
        acted[id] = 1;
        lastBy = `${me} checked`;
        log.push(`${me} checks`);
      } else if (t === 'fold') {
        folded[id] = 1;
        delete acted[id];
        lastBy = `${me} folded`;
        log.push(`${me} folded`);

        const remaining = currentRd.parts.filter(pId => !folded[pId]);
        if (remaining.length === 1) {
          log.push(`🏆 Everyone folded! ${players.find(p => p.id === remaining[0])?.name || remaining[0]} wins the pot!`);
          return {
            ...prev,
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
          if (prev.balanceMode) {
            const pIdx = players.findIndex(p => p.id === id);
            if (pIdx < 0) return prev;
            const p = players[pIdx];
            const bal = p.balance || 0;
            if (bal <= 0) return prev;

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
        if (toAdd <= 0 || targetBet <= cur) return prev;

        let actualAdd = toAdd;
        let isAllIn = false;
        if (prev.balanceMode) {
          const pIdx = players.findIndex(p => p.id === id);
          if (pIdx < 0) return prev;
          const p = players[pIdx];
          const bal = p.balance || 0;
          if (bal < toAdd) return prev;

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
        if (pIdx < 0) return prev;
        const p = players[pIdx];
        const bal = p.balance || 0;
        if (bal <= 0) return prev;

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
      }

      // Check loop completion
      const currentActive = currentRd.parts.filter(pId => !folded[pId]);
      const canActPlayers = currentActive.filter(pId => !allIn[pId]);
      const allActed = canActPlayers.every(pId => acted[pId]);
      const allMatched = canActPlayers.every(pId => (st[pId] || 0) === cur);
      const noMoreBetting = canActPlayers.length === 0 || (canActPlayers.length === 1 && allActed && allMatched);

      let nextTurn = currentRd.turn;

      if ((allActed && allMatched) || noMoreBetting) {
        if (noMoreBetting && street !== 3) {
          street = 3;
          phase = 'result';
          winners = [];
          log.push('— All players All-In! Board dealt to River · Showdown —');
        } else if (street === 3) {
          phase = 'result';
          winners = [];
          log.push('— Showdown: Tap the winner(s) of each pot —');
        } else {
          street = street + 1;
          Object.keys(st).forEach(k => delete st[k]);
          Object.keys(acted).forEach(k => delete acted[k]);
          cur = 0;
          stake = 0;
          lastRaiser = null;
          minRaise = prev.ante.amt || 10;
          const streetLabels = ['Pre-flop', 'Flop', 'Turn', 'River'];
          const desc = street === 1 ? 'Loop 1: Flop revealed (3 cards open)' : street === 2 ? 'Loop 2: Turn revealed (4th card open)' : 'Loop 3: River revealed (5th card open)';
          lastBy = `${streetLabels[street]} dealt`;
          log.push(`— ${desc} —`);

          // Post-flop action starts clockwise from Dealer (usually SB or next active player)
          const o = prev.players.map(p => p.id).filter(pId => currentRd.parts.includes(pId));
          const dealerId = currentRd.dealer || o[0];
          let dIdx = o.indexOf(dealerId);
          if (dIdx < 0) dIdx = 0;
          let nextP: string | null = null;
          for (let k = 1; k <= o.length; k++) {
            const cand = o[(dIdx + k) % o.length];
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
        const o = prev.players.map(p => p.id).filter(pId => currentRd.parts.includes(pId));
        let idx = o.indexOf(currentRd.turn);
        for (let k = 0; k < o.length; k++) {
          idx = (idx + 1) % o.length;
          if (!folded[o[idx]] && !allIn[o[idx]]) {
            nextTurn = o[idx];
            break;
          }
        }
      }

      return {
        ...prev,
        players,
        round: {
          ...currentRd,
          parts: currentRd.parts,
          contrib,
          folded,
          turn: nextTurn,
          stake,
          stack: currentRd.stack,
          log,
          lastBy,
          winner: currentRd.winner,
          street,
          cur,
          st,
          acted,
          winners,
          lastRaiser,
          minRaise,
          allIn,
          phase,
        },
      };
    });
  };

  /* ───────── Showdown Settle ───────── */
  const handleConfirmShowdown = (potWinners: Record<string, string[]>) => {
    if (!rd) return;
    const { pots, totalPot } = calculatePots(rd.contrib || {}, rd.folded || {});
    if (!pots.length || totalPot <= 0) {
      updateState(prev => ({ ...prev, round: null }));
      return;
    }

    const playerMap: Record<string, { name: string }> = {};
    gameState.players.forEach(p => { playerMap[p.id] = { name: p.name }; });
    const summary = distributePots(pots, potWinners, playerMap);
    const pays: { name: string; amt: number }[] = [];

    updateState(prev => {
      let players = [...prev.players];
      const debts = { ...prev.debts };
      const wins = { ...prev.wins };

      if (prev.balanceMode) {
        players = players.map(p => {
          const won = summary.totalPlayerWins[p.id] || 0;
          const nextBal = (p.balance || 0) + won;
          return {
            ...p,
            balance: nextBal,
            sit: nextBal <= 0 ? true : p.sit,
          };
        });

        rd.parts.forEach(id => {
          const won = summary.totalPlayerWins[id] || 0;
          const netAmt = won - (rd.contrib[id] || 0);
          if (netAmt < 0) {
            pays.push({ name: players.find(p => p.id === id)?.name || id, amt: -netAmt });
          }
        });
      } else {
        const nets: Record<string, number> = {};
        rd.parts.forEach(id => {
          nets[id] = (summary.totalPlayerWins[id] || 0) - (rd.contrib[id] || 0);
        });
        const cr = Object.entries(nets).filter(e => e[1] > 0);
        const tc = cr.reduce((a, e) => a + e[1], 0);

        Object.entries(nets).filter(e => e[1] < 0).forEach(([d, v]) => {
          let left = -v;
          cr.forEach(([c, cv], i) => {
            const x = i === cr.length - 1 ? left : Math.round(-v * cv / tc);
            left -= x;
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
      }

      Object.entries(summary.totalPlayerWins).forEach(([wId, amt]) => {
        wins[wId] = (wins[wId] || 0) + amt;
      });

      const winningNames = Object.entries(summary.totalPlayerWins)
        .filter(([, amt]) => amt > 0)
        .map(([id]) => players.find(p => p.id === id)?.name || id)
        .join(' & ');

      const tot = {
        rounds: (prev.tot?.rounds || 0) + 1,
        total: (prev.tot?.total || 0) + totalPot,
        big: Math.max(prev.tot?.big || 0, totalPot),
      };

      const hist = [
        { no: rd.no, winner: winningNames || 'Split', pot: totalPot, got: totalPot, pays },
        ...prev.hist,
      ].slice(0, 30);

      const activePlayers = players.filter(p => !p.sit);
      const currentDIdx = prev.dealerIdx ?? 0;
      const nextDIdx = activePlayers.length > 0 ? (currentDIdx + 1) % activePlayers.length : 0;

      return {
        ...prev,
        players,
        debts,
        wins,
        tot,
        hist,
        round: null,
        dealerIdx: nextDIdx,
      };
    });
  };

  const streetNames = ['Pre-flop', 'Flop', 'Turn', 'River'];
  const roundTag = rd
    ? `Round ${rd.no} · ${rd.phase === 'bet' ? streetNames[rd.street || 0] : 'Showdown'}`
    : '';

  return (
    <>
      <div className="bgs">
        <i style={{ left: '6%', top: '15%' }}>♠</i>
        <i style={{ left: '88%', top: '25%', animationDelay: '2s' }}>♥</i>
        <i style={{ left: '14%', top: '70%', animationDelay: '4s' }}>♦</i>
        <i style={{ left: '80%', top: '78%', animationDelay: '1s' }}>♣</i>
        <i style={{ left: '50%', top: '5%', animationDelay: '3s' }}>♠</i>
      </div>

      <Header
        title="♠ TEXAS HOLD'EM POKER"
        roundTag={roundTag}
        sessionName={engine.sessionName}
        currentGame="pk"
        onOpenSessions={() => engine.setShowSessionModal(true)}
        onResetGame={engine.resetGame}
        onGoogleSignIn={engine.handleGoogleSignIn}
      />

      <main>
        <SeatsList
          players={gameState.players}
          round={rd}
          balanceMode={gameState.balanceMode}
          defaultBuyIn={gameState.defaultBuyIn}
          totalStats={gameState.tot}
          playerWins={gameState.wins}
          debts={gameState.debts}
          onAddPlayer={engine.addPlayer}
          onRemovePlayer={engine.removePlayer}
          onSitToggle={engine.toggleSit}
          onShuffle={engine.shufflePlayers}
          onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
          onOpenDebtModal={() => engine.setShowDebtModal(true)}
          onReorderPlayers={engine.reorderPlayers}
        />

        <section id="mid">
          <PokerTable
            players={gameState.players}
            round={rd}
            balanceMode={gameState.balanceMode}
            onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
          />
          <div className="mut" style={{ textAlign: 'center', marginTop: 6 }} id="hint">
            Cards are dealt and played in real life. Track community cards, bets, chip stacks &amp; side pots.
          </div>
        </section>

        <PokerControls
          players={gameState.players}
          round={rd}
          balanceMode={gameState.balanceMode}
          defaultBuyIn={gameState.defaultBuyIn}
          ante={gameState.ante}
          blinds={gameState.blinds}
          dealerIdx={gameState.dealerIdx ?? 0}
          onSetBlinds={engine.setBlinds}
          onStartRound={engine.startRound}
          onAbortRound={engine.abortRound}
          onUndo={engine.undoAction}
          onSetBalanceMode={engine.setBalanceMode}
          onSetDefaultBuyIn={engine.setDefaultBuyIn}
          onResetAllBalances={engine.resetAllBalances}
          onSetAnteMode={engine.setAnteMode}
          onSetAnteAmt={engine.setAnteAmt}
          onAct={handlePokerAct}
          onConfirmShowdown={handleConfirmShowdown}
        />
      </main>

      <RoundHistory history={gameState.hist} />

      {/* Modals */}
      {engine.confirmModal && (
        <ConfirmModal
          message={engine.confirmModal.msg}
          onCancel={() => engine.setConfirmModal(null)}
          onConfirm={() => {
            const fn = engine.confirmModal!.fn;
            engine.setConfirmModal(null);
            fn();
          }}
        />
      )}

      {engine.showDebtModal && (
        <DebtModal
          players={gameState.players}
          debts={gameState.debts}
          onClose={() => engine.setShowDebtModal(false)}
          onSettle={engine.settleDebt}
          onSettleAll={engine.settleAllDebts}
        />
      )}

      {engine.addMoneyTarget && (() => {
        const p = gameState.players.find(x => x.id === engine.addMoneyTarget);
        if (!p) return null;
        return (
          <AddMoneyModal
            player={p}
            defaultBuyIn={gameState.defaultBuyIn}
            onClose={() => engine.setAddMoneyTarget(null)}
            onAdjustMoney={engine.adjustMoney}
            onSetExactStack={engine.setPlayerBalance}
          />
        );
      })()}

      {engine.showGoogleConfigModal && (
        <GoogleConfigModal onClose={() => engine.setShowGoogleConfigModal(false)} />
      )}

      {engine.showSessionModal && (
        <SessionsModal
          sessions={engine.sessionsList}
          currentSessionId={engine.sessionId}
          initialGameFilter="pk"
          onClose={() => engine.setShowSessionModal(false)}
          onSwitchSession={engine.switchSession}
          onCreateSession={engine.createSession}
        />
      )}

      {engine.sessionsLoaded && !engine.sessionId && !engine.showSessionModal && (
        <div className="mdl">
          <div className="session-modal-box" style={{ maxWidth: 460, textAlign: 'center', padding: '36px 24px' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>♠</div>
            <h2 style={{ fontSize: 20, color: '#5eead4', margin: '0 0 8px' }}>
              No Active Poker Session
            </h2>
            <p className="mut" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 20px' }}>
              To start tracking chip stacks, bets, main &amp; side pots, please select or create a Texas Hold&apos;em session.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <a href="/" className="sm" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                ← Card Room
              </a>
              <button
                className="sm pri"
                style={{ fontWeight: 800, padding: '8px 20px' }}
                onClick={() => engine.setShowSessionModal(true)}
              >
                🎲 Select or Create Session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
