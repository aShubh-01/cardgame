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
import TeenPattiTable from '@/components/teen-patti/TeenPattiTable';
import TeenPattiControls from '@/components/teen-patti/TeenPattiControls';
import { useGameEngine } from '@/hooks/useGameEngine';
import { money } from '@/types/game';
import { calcTeenPattiNewBaseStake } from '@/lib/blindRules';

export default function TeenPattiGame() {
  React.useEffect(() => {
    document.body.dataset.v = 'tp';
    return () => {
      delete document.body.dataset.v;
    };
  }, []);

  const engine = useGameEngine('tp');
  const { gameState, updateState } = engine;
  const rd = gameState.round;

  const potTotal = rd
    ? Object.values(rd.contrib || {}).reduce((a, b) => a + b, 0)
    : 0;

  const nextTurn = (currentTurn: string, parts: string[], folded: Record<string, number>) => {
    const o = gameState.players.map(p => p.id).filter(id => parts.includes(id));
    let idx = o.indexOf(currentTurn);
    for (let k = 0; k < o.length; k++) {
      idx = (idx + 1) % o.length;
      if (!folded[o[idx]]) return o[idx];
    }
    return currentTurn;
  };

  /* ───────── Teen Patti Act ───────── */
  const handleAct = (t: string, a?: number) => {
    if (!rd) return;
    const id = rd.turn;
    const me = gameState.players.find(p => p.id === id)?.name || id;
    const amt = a || 0;

    updateState(prev => {
      const currentRd = prev.round;
      if (!currentRd) return prev;
      engine.takeSnapshot(currentRd, prev.players);

      let players = [...prev.players];
      const contrib = { ...(currentRd.contrib || {}) };
      const folded = { ...(currentRd.folded || {}) };
      const log = [...currentRd.log];
      let stake = currentRd.stake || 0;
      let lastBy = currentRd.lastBy;
      let turn = currentRd.turn;
      let phase = currentRd.phase;
      let winner = currentRd.winner;

      if (t === 'bet' || t === 'raise') {
        if (!amt) return prev;
        let actual = amt;
        if (prev.balanceMode) {
          const pIdx = players.findIndex(p => p.id === id);
          if (pIdx < 0) return prev;
          const p = players[pIdx];
          const bal = p.balance || 0;
          if (bal < amt) return prev;
          actual = amt;
          players[pIdx] = { ...p, balance: Math.max(0, bal - actual) };
        }

        const isBlind = (currentRd.playerStatus?.[id] || 'blind') === 'blind';
        if (t === 'raise') {
          stake = calcTeenPattiNewBaseStake(actual, isBlind);
        }

        contrib[id] = (contrib[id] || 0) + actual;
        lastBy = me;
        const actionTxt = t === 'raise'
          ? ` raised to ${money(actual)} (${isBlind ? 'Blind' : 'Seen'})`
          : ` called chaal ${money(actual)} (${isBlind ? 'Blind' : 'Seen'})`;
        log.push(me + actionTxt);
        turn = nextTurn(turn, currentRd.parts, folded);
      } else if (t === 'check') {
        log.push(`${me} checked`);
        turn = nextTurn(turn, currentRd.parts, folded);
      } else if (t === 'fold') {
        folded[id] = 1;
        log.push(`${me} folded`);
        const remaining = currentRd.parts.filter(pId => !folded[pId]);
        if (remaining.length === 1) {
          phase = 'result';
          winner = remaining[0];
          log.push(`🏆 Everyone folded! ${players.find(p => p.id === remaining[0])?.name || remaining[0]} wins!`);
        } else {
          turn = nextTurn(turn, currentRd.parts, folded);
        }
      } else if (t === 'show') {
        let actual = amt;
        if (prev.balanceMode) {
          const pIdx = players.findIndex(p => p.id === id);
          if (pIdx < 0) return prev;
          const p = players[pIdx];
          const bal = p.balance || 0;
          if (bal < amt) return prev;
          actual = amt;
          players[pIdx] = { ...p, balance: Math.max(0, bal - actual) };
        }
        contrib[id] = (contrib[id] || 0) + actual;
        log.push(`${me} paid ${money(actual)} · show`);
        phase = 'result';
        winner = null;
      } else if (t === 'mutual') {
        log.push(`${me} → mutual show`);
        phase = 'result';
        winner = null;
      }

      return {
        ...prev,
        players,
        round: {
          ...currentRd,
          contrib,
          folded,
          turn,
          stake,
          log,
          lastBy,
          winner,
          phase,
        },
      };
    });
  };

  /* ───────── Pick Winner at Showdown ───────── */
  const handlePickWinner = (id: string) => {
    updateState(prev => {
      if (!prev.round) return prev;
      return {
        ...prev,
        round: {
          ...prev.round,
          winner: id,
        },
      };
    });
  };

  /* ───────── Confirm Showdown Win ───────── */
  const handleConfirmWin = () => {
    if (!rd || !rd.winner) return;
    const w = rd.winner;
    const total = potTotal;
    const pays: { name: string; amt: number }[] = [];

    updateState(prev => {
      let players = [...prev.players];
      const debts = { ...prev.debts };
      const wins = { ...prev.wins };

      if (prev.balanceMode) {
        players = players.map(p => {
          if (p.id === w) {
            return { ...p, balance: (p.balance || 0) + total };
          }
          return {
            ...p,
            sit: (p.balance || 0) <= 0 ? true : p.sit,
          };
        });

        rd.parts.forEach(id => {
          if (id !== w) {
            pays.push({ name: players.find(p => p.id === id)?.name || id, amt: rd.contrib[id] || 0 });
          }
        });
      } else {
        rd.parts.forEach(id => {
          if (id !== w) {
            const a = rd.contrib[id] || 0;
            const k = `${id}|${w}`;
            const rk = `${w}|${id}`;
            const rev = debts[rk] || 0;
            if (rev >= a) {
              debts[rk] = rev - a;
              if (!debts[rk]) delete debts[rk];
            } else {
              const rem = a - rev;
              delete debts[rk];
              debts[k] = (debts[k] || 0) + rem;
            }
            pays.push({ name: players.find(p => p.id === id)?.name || id, amt: a });
          }
        });
      }

      const got = total - (rd.contrib[w] || 0);
      wins[w] = (wins[w] || 0) + got;

      const tot = {
        rounds: (prev.tot?.rounds || 0) + 1,
        total: (prev.tot?.total || 0) + total,
        big: Math.max(prev.tot?.big || 0, total),
      };

      const winnerName = players.find(p => p.id === w)?.name || w;
      const hist = [
        { no: rd.no, winner: winnerName, pot: total, got, pays },
        ...prev.hist,
      ].slice(0, 30);

      return {
        ...prev,
        players,
        debts,
        wins,
        tot,
        hist,
        round: null,
      };
    });
  };

  const phaseMap: Record<string, string> = { ante: 'Boot', bet: 'Betting', result: 'Showdown' };
  const roundTag = rd
    ? `Round ${rd.no} · ${phaseMap[rd.phase] || rd.phase}`
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
        title="♥ TEEN PATTI HIGH ROLLERS"
        roundTag={roundTag}
        sessionName={engine.sessionName}
        currentGame="tp"
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
          <TeenPattiTable
            players={gameState.players}
            round={rd}
            balanceMode={gameState.balanceMode}
            onPickWinner={handlePickWinner}
            onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
          />
          <div className="mut" style={{ textAlign: 'center', marginTop: 6 }} id="hint">
            Playing in real life. Track boot, chaal, raises, stacks &amp; who owes who.
          </div>
        </section>

        <TeenPattiControls
          players={gameState.players}
          round={rd}
          balanceMode={gameState.balanceMode}
          defaultBuyIn={gameState.defaultBuyIn}
          ante={gameState.ante}
          onStartRound={engine.startRound}
          onAbortRound={engine.abortRound}
          onUndo={engine.undoAction}
          onSetBalanceMode={engine.setBalanceMode}
          onSetDefaultBuyIn={engine.setDefaultBuyIn}
          onResetAllBalances={engine.resetAllBalances}
          onSetAnteMode={engine.setAnteMode}
          onSetAnteAmt={engine.setAnteAmt}
          onSeeCards={engine.seeCards}
          onAct={handleAct}
          onPickWinner={handlePickWinner}
          onConfirmWin={handleConfirmWin}
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
          initialGameFilter="tp"
          onClose={() => engine.setShowSessionModal(false)}
          onSwitchSession={engine.switchSession}
          onCreateSession={engine.createSession}
        />
      )}

      {engine.sessionsLoaded && !engine.sessionId && !engine.showSessionModal && (
        <div className="mdl">
          <div className="session-modal-box" style={{ maxWidth: 460, textAlign: 'center', padding: '36px 24px' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🃏</div>
            <h2 style={{ fontSize: 20, color: 'var(--gold)', margin: '0 0 8px' }}>
              No Active Teen Patti Session
            </h2>
            <p className="mut" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 20px' }}>
              To start tracking boot, chaal, blinds, and who owes whom, please select or create a Teen Patti session.
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
