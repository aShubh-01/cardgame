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
import JoinRoomModal from '@/components/common/JoinRoomModal';
import OperatorModals from '@/components/common/OperatorModals';
import TeenPattiTable from '@/components/teen-patti/TeenPattiTable';
import TeenPattiControls from '@/components/teen-patti/TeenPattiControls';
import { useGameEngine } from '@/hooks/useGameEngine';
import { money } from '@/types/game';
import { calcTeenPattiNewBaseStake } from '@/lib/blindRules';
import { sounds } from '@/lib/soundEffects';

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

  const myEmail = engine.authSession?.user?.email;
  const myPlayer = gameState.players.find(
    p => p.userId && p.userId.toLowerCase() === myEmail?.toLowerCase()
  );
  const sessionMode = engine.currentSessionDoc?.sessionMode || 'tracker';
  const isHost =
    sessionMode !== 'online'
      ? true
      : gameState.isGameOperator !== undefined
      ? Boolean(gameState.isGameOperator)
      : Boolean(
          myEmail &&
            (engine.currentSessionDoc?.gameOperatorUserId || engine.currentSessionDoc?.hostUserId)?.toLowerCase() ===
              myEmail.toLowerCase()
        );

  const potTotal = rd
    ? Object.values(rd.contrib || {}).reduce((a, b) => a + b, 0)
    : 0;

  const nextTurn = (
    currentTurn: string,
    parts: string[],
    folded: Record<string, number>,
    allInMap: Record<string, boolean> = {}
  ) => {
    const o = gameState.players.map(p => p.id).filter(id => parts.includes(id));
    let idx = o.indexOf(currentTurn);
    for (let k = 0; k < o.length; k++) {
      idx = (idx + 1) % o.length;
      if (!folded[o[idx]] && !allInMap[o[idx]]) return o[idx];
    }
    return currentTurn;
  };

  /* ───────── Teen Patti Act ───────── */
  const handleAct = (t: string, a?: number) => {
    if (!rd) return;
    if (sessionMode === 'online') {
      engine.sendMultiplayerAction('TP_ACT', { subAction: t, amount: a });
      return;
    }

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
      const allIn = { ...(currentRd.allIn || {}) };
      const log = [...currentRd.log];
      let stake = currentRd.stake || 0;
      let lastBy = currentRd.lastBy;
      let turn = currentRd.turn;
      let phase = currentRd.phase;
      let winner = currentRd.winner;

      if (t === 'bet' || t === 'raise' || t === 'allin') {
        let actual = amt;
        let isAllIn = false;
        if (prev.balanceMode) {
          const pIdx = players.findIndex(p => p.id === id);
          if (pIdx < 0) return prev;
          const p = players[pIdx];
          const bal = p.balance || 0;
          if (bal <= 0) return prev;
          actual = t === 'allin' ? bal : Math.min(bal, amt);
          if (actual <= 0) return prev;
          const nextBal = Math.max(0, bal - actual);
          players[pIdx] = { ...p, balance: nextBal };
          if (nextBal === 0) {
            isAllIn = true;
            allIn[id] = true;
          }
        } else {
          if (!actual) return prev;
        }

        const isBlind = (currentRd.playerStatus?.[id] || 'blind') === 'blind';
        if (t === 'raise') {
          stake = Math.max(stake, calcTeenPattiNewBaseStake(actual, isBlind));
        }

        contrib[id] = (contrib[id] || 0) + actual;
        lastBy = me;
        const actionTxt = isAllIn
          ? ` went ALL-IN with ${money(actual)} (${isBlind ? 'Blind' : 'Seen'}) 🚨`
          : t === 'raise'
          ? ` raised to ${money(actual)} (${isBlind ? 'Blind' : 'Seen'})`
          : ` called chaal ${money(actual)} (${isBlind ? 'Blind' : 'Seen'})`;
        log.push(me + actionTxt);

        const activeIds = currentRd.parts.filter(pId => !folded[pId]);
        const canActIds = activeIds.filter(pId => !allIn[pId]);
        const maxContrib = Math.max(0, ...activeIds.map(pId => contrib[pId] || 0));
        if (canActIds.length === 0 || (canActIds.length === 1 && (contrib[canActIds[0]] || 0) >= maxContrib)) {
          phase = 'result';
          winner = null;
          log.push('— All active stacks committed (All-In) · Showdown! —');
        } else {
          turn = nextTurn(turn, currentRd.parts, folded, allIn);
        }
      } else if (t === 'check') {
        log.push(`${me} checked`);
        turn = nextTurn(turn, currentRd.parts, folded, allIn);
      } else if (t === 'fold') {
        folded[id] = 1;
        log.push(`${me} folded`);
        const remaining = currentRd.parts.filter(pId => !folded[pId]);
        if (remaining.length === 1) {
          phase = 'result';
          winner = remaining[0];
          log.push(`🏆 Everyone folded! ${players.find(p => p.id === remaining[0])?.name || remaining[0]} wins!`);
        } else {
          const canActIds = remaining.filter(pId => !allIn[pId]);
          const maxContrib = Math.max(0, ...remaining.map(pId => contrib[pId] || 0));
          if (canActIds.length === 0 || (canActIds.length === 1 && (contrib[canActIds[0]] || 0) >= maxContrib)) {
            phase = 'result';
            winner = null;
          } else {
            turn = nextTurn(turn, currentRd.parts, folded, allIn);
          }
        }
      } else if (t === 'show') {
        let actual = amt;
        if (prev.balanceMode) {
          const pIdx = players.findIndex(p => p.id === id);
          if (pIdx < 0) return prev;
          const p = players[pIdx];
          const bal = p.balance || 0;
          if (bal <= 0) return prev;
          actual = amt > 0 ? Math.min(bal, amt) : bal;
          const nextBal = Math.max(0, bal - actual);
          players[pIdx] = { ...p, balance: nextBal };
          if (nextBal === 0) allIn[id] = true;
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
          allIn,
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

  /* ───────── Mutual Card Show Request & Response ───────── */
  const handleRequestMutualShow = () => {
    if (!rd || rd.phase !== 'bet') return;
    if (sessionMode === 'online') {
      engine.sendMultiplayerAction('REQUEST_MUTUAL_SHOW');
      return;
    }
    handleAct('mutual');
  };

  const handleRespondMutualShow = (decision: 'accepted' | 'rejected') => {
    if (!rd || rd.phase !== 'bet') return;
    if (sessionMode === 'online') {
      engine.sendMultiplayerAction('RESPOND_MUTUAL_SHOW', { decision });
      return;
    }
    if (decision === 'accepted') {
      handleAct('mutual');
    }
  };

  /* ───────── Pick Winner at Showdown ───────── */
  const handlePickWinner = (id: string) => {
    if (!isHost) return;
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
    sounds.playWinSound();
    if (sessionMode === 'online') {
      engine.sendMultiplayerAction('TP_SETTLE', { winnerId: rd.winner });
      return;
    }

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
        sessionDoc={engine.currentSessionDoc}
        onOpenSessions={() => engine.setShowSessionModal(true)}
        onOpenJoinRoom={() => engine.setShowJoinRoomModal(true)}
        onResetGame={engine.resetGame}
        onGoogleSignIn={engine.handleGoogleSignIn}
      />

      <OperatorModals
        gameState={gameState}
        isOnlineMode={sessionMode === 'online'}
        actionError={engine.actionError}
        onClearError={() => engine.setActionError(null)}
        showOperatorModal={engine.showOperatorModal}
        setShowOperatorModal={engine.setShowOperatorModal}
        onTransferGo={engine.transferGameOperator}
        onVolunteerGo={engine.volunteerGameOperator}
        onTriggerDisconnect={engine.triggerGoDisconnect}
        onCheckTimeout={engine.checkGoTimeout}
        onOpenDebtModal={() => engine.setShowDebtModal(true)}
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
          sessionMode={sessionMode}
          roomCode={engine.currentSessionDoc?.roomCode}
          myPlayerId={myPlayer?.id}
          isHost={isHost}
          readyPlayers={gameState.readyPlayers}
          chipRequests={gameState.chipRequests}
          onResolveChipRequest={engine.resolveChipRequest}
          onAddPlayer={engine.addPlayer}
          onRemovePlayer={engine.removePlayer}
          onRenamePlayer={engine.renamePlayer}
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
            sessionMode={sessionMode}
            myPlayerId={myPlayer?.id || null}
            isHost={isHost}
            onSeeCards={engine.seeCards}
            onPickWinner={handlePickWinner}
            onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
          />
          <div className="mut" style={{ textAlign: 'center', marginTop: 6 }} id="hint">
            {sessionMode === 'online'
              ? 'Online Teen Patti · All players start Blind 🙈 · Click "See Cards" to flip your 3 cards!'
              : 'Playing in real life. Track boot, chaal, raises, stacks & who owes who.'}
          </div>
        </section>

        <TeenPattiControls
          players={gameState.players}
          round={rd}
          balanceMode={gameState.balanceMode}
          defaultBuyIn={gameState.defaultBuyIn}
          ante={gameState.ante}
          readyPlayers={gameState.readyPlayers}
          onToggleReady={engine.toggleReady}
          onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
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
          onRequestMutualShow={handleRequestMutualShow}
          onRespondMutualShow={handleRespondMutualShow}
          onPickWinner={handlePickWinner}
          onConfirmWin={handleConfirmWin}
          sessionMode={sessionMode}
          myPlayerId={myPlayer?.id || null}
          isHost={isHost}
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
          myPlayerId={myPlayer?.id || null}
          isHost={isHost}
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
            sessionMode={sessionMode}
            isHost={isHost}
            chipRequests={gameState.chipRequests}
            onClose={() => engine.setAddMoneyTarget(null)}
            onAdjustMoney={engine.adjustMoney}
            onSetExactStack={engine.setPlayerBalance}
            onRequestChips={engine.requestChips}
            onResolveChipRequest={engine.resolveChipRequest}
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

      {engine.showJoinRoomModal && (
        <JoinRoomModal
          onClose={() => engine.setShowJoinRoomModal(false)}
          onJoinSuccess={(sess) => {
            engine.switchSession(sess._id);
          }}
        />
      )}

      {engine.sessionsLoaded && !engine.sessionId && !engine.showSessionModal && !(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('session')) && (
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
