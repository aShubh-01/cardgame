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
import LiveChat from '@/components/common/LiveChat';
import PokerTable from '@/components/poker/PokerTable';
import PokerControls from '@/components/poker/PokerControls';
import { useGameEngine } from '@/hooks/useGameEngine';
import { applyPokerAction, settlePokerShowdown, PokerActionType } from '@/lib/pokerEngine';
import { sounds } from '@/lib/soundEffects';

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

  /* ───────── Poker Act ───────── */
  const handlePokerAct = (t: string, a?: number) => {
    if (!rd) return;
    if (sessionMode === 'online') {
      engine.sendMultiplayerAction('POKER_ACT', { subAction: t, amount: a });
      return;
    }

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

    updateState(prev => {
      const currentRd = prev.round;
      if (!currentRd) return prev;
      engine.takeSnapshot(currentRd, prev.players);

      const next = applyPokerAction(
        {
          players: prev.players,
          round: currentRd,
          anteAmt: prev.ante.amt || 10,
          balanceMode: !!prev.balanceMode,
        },
        t as PokerActionType,
        a
      );
      if (!next) return prev;
      return {
        ...prev,
        players: next.players,
        round: next.round,
      };
    });
  };

  /* ───────── Mutual Showdown Request & Response ───────── */
  const handleRequestMutualShow = () => {
    if (!rd || rd.phase !== 'bet') return;
    if (sessionMode === 'online') {
      engine.sendMultiplayerAction('REQUEST_MUTUAL_SHOW');
      return;
    }
    handlePokerAct('showdown');
  };

  const handleRespondMutualShow = (decision: 'accepted' | 'rejected') => {
    if (!rd || rd.phase !== 'bet') return;
    if (sessionMode === 'online') {
      engine.sendMultiplayerAction('RESPOND_MUTUAL_SHOW', { decision });
      return;
    }
    if (decision === 'accepted') {
      handlePokerAct('showdown');
    }
  };

  /* ───────── Showdown Settle ───────── */
  const handleConfirmShowdown = (potWinners: Record<string, string[]>) => {
    if (!rd) return;
    sounds.playWinSound();
    if (sessionMode === 'online') {
      engine.sendMultiplayerAction('POKER_SETTLE', { potWinners });
      return;
    }

    updateState(prev => {
      if (!prev.round) return prev;
      const settled = settlePokerShowdown(
        {
          players: prev.players,
          round: prev.round,
          debts: prev.debts,
          wins: prev.wins,
          hist: prev.hist,
          tot: prev.tot,
          balanceMode: !!prev.balanceMode,
          dealerIdx: prev.dealerIdx ?? 0,
        },
        potWinners
      );
      return {
        ...prev,
        ...settled,
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
        onKickPlayer={engine.removePlayer}
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
          <PokerTable
            players={gameState.players}
            round={rd}
            balanceMode={gameState.balanceMode}
            sessionMode={sessionMode}
            myPlayerId={myPlayer?.id || null}
            isHost={isHost}
            onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
          />
          <div className="mut" style={{ textAlign: 'center', marginTop: 6 }} id="hint">
            {sessionMode === 'online'
              ? 'Online Multiplayer · Virtual cards dealt securely · Enter your bet on your turn.'
              : 'Cards are dealt and played in real life. Track community cards, bets, chip stacks & side pots.'}
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
          readyPlayers={gameState.readyPlayers}
          onToggleReady={engine.toggleReady}
          onSitToggle={engine.toggleSit}
          onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
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
          onRequestMutualShow={handleRequestMutualShow}
          onRespondMutualShow={handleRespondMutualShow}
          onConfirmShowdown={handleConfirmShowdown}
          sessionMode={sessionMode}
          myPlayerId={myPlayer?.id || null}
          isHost={isHost}
        />
      </main>

      <RoundHistory history={gameState.hist} />

      {sessionMode === 'online' && engine.sessionId && (
        <LiveChat
          messages={gameState.chatMessages || []}
          myPlayerId={myPlayer?.id || null}
          isGameOperator={Boolean(gameState.isGameOperator)}
          onSend={engine.sendChatMessage}
        />
      )}

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
          sessionMode={sessionMode}
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
          initialGameFilter="pk"
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
