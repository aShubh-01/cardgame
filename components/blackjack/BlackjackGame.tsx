'use client';

import React, { useState } from 'react';
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
import RoomCodeBanner from '@/components/common/RoomCodeBanner';
import BlackjackTable from '@/components/blackjack/BlackjackTable';
import BlackjackControls from '@/components/blackjack/BlackjackControls';
import { useGameEngine } from '@/hooks/useGameEngine';
import { calculateBlackjackRound, BlackjackPlayerInput } from '@/lib/blackjackEngine';

export default function BlackjackGame() {
  React.useEffect(() => {
    document.body.dataset.v = 'bj';
    return () => {
      delete document.body.dataset.v;
    };
  }, []);

  const engine = useGameEngine('bj');
  const { gameState, updateState } = engine;
  const rd = gameState.round;
  const sessionMode = engine.currentSessionDoc?.sessionMode || 'tracker';
  const isOnline = sessionMode === 'online';

  const myEmail = engine.authSession?.user?.email;
  const myPlayer = gameState.players.find(
    p => p.userId && p.userId.toLowerCase() === myEmail?.toLowerCase()
  );
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

  const seatedPlayers = gameState.players.filter(p => !p.sit && !p.isGameOperator);
  const dealerPlayerId: string | 'house' =
    (rd?.dealer as string) ||
    gameState.bjDealerId ||
    (seatedPlayers.length >= 2 ? seatedPlayers[0].id : 'house');
  const bjDealerRotation = Boolean(gameState.bjDealerRotation);

  const handleSetDealerPlayerId = (id: string | 'house') => {
    engine.setBjDealer(id, undefined);
  };

  const handleSetDealerRotation = (rot: boolean) => {
    engine.setBjDealer(undefined, rot);
  };

  const handleStartHand = (defaultBet = 100) => {
    if (isOnline && engine.sessionId) {
      engine.sendMultiplayerAction('START_ROUND', { defaultBet });
      return;
    }

    updateState(prev => {
      const allSeated = prev.players.filter(p => !p.sit);
      const effDealer =
        prev.bjDealerId || (allSeated.length >= 2 ? allSeated[0].id : 'house');
      const activePlayers =
        effDealer !== 'house' && allSeated.length >= 2
          ? allSeated.filter(p => p.id !== effDealer)
          : allSeated;
      if (activePlayers.length < 1) return prev;

      const rno = prev.rno + 1;
      return {
        ...prev,
        bjDealerId: effDealer,
        rno,
        round: {
          no: rno,
          phase: 'hand',
          dealer: effDealer,
          parts: activePlayers.map(p => p.id),
          contrib: Object.fromEntries(activePlayers.map(p => [p.id, defaultBet])),
          folded: {},
          turn: activePlayers[0].id,
          stake: defaultBet,
          stack: [],
          log: [`Hand #${rno} dealing commenced`],
          lastBy: '',
          winner: null,
          allIn: {},
          potWinners: {},
        },
      };
    });
  };

  const handleBjAction = (subAction: 'hit' | 'stand' | 'double') => {
    if (isOnline && engine.sessionId) {
      engine.sendMultiplayerAction('BJ_ACTION', { subAction });
    }
  };

  const handleAbortHand = () => {
    if (isOnline && engine.sessionId) {
      engine.abortRound();
      return;
    }
    updateState(prev => ({
      ...prev,
      round: null,
      rno: Math.max(0, prev.rno - 1),
    }));
  };

  const handleSettleHand = (
    dealerHasBlackjack: boolean,
    playersInput: BlackjackPlayerInput[]
  ) => {
    if (!rd) return;

    const res = calculateBlackjackRound({
      dealerPlayerId,
      dealerHasBlackjack,
      blackjackPayoutRatio: 1.5,
      playersInput,
      players: gameState.players,
      balanceMode: !!gameState.balanceMode,
    });

    const pays: { name: string; amt: number }[] = [];

    updateState(prev => {
      const debts = { ...prev.debts };
      const wins = { ...prev.wins };

      // Update debts
      Object.entries(res.debtsDelta).forEach(([k, amt]) => {
        const [d, c] = k.split('|');
        const rev = `${c}|${d}`;
        if (debts[rev] && debts[rev] >= amt) {
          debts[rev] -= amt;
          if (!debts[rev]) delete debts[rev];
        } else {
          const rem = amt - (debts[rev] || 0);
          delete debts[rev];
          debts[k] = (debts[k] || 0) + rem;
        }

        const dName = prev.players.find(p => p.id === d)?.name || d;
        pays.push({ name: dName, amt });
      });

      // Track total player profit
      const winningPlayers = Object.entries(res.playerResults).filter(([, r]) => r.totalNet > 0);
      winningPlayers.forEach(([pId, r]) => {
        wins[pId] = (wins[pId] || 0) + r.totalNet;
      });
      if (dealerPlayerId !== 'house' && res.dealerNet > 0) {
        wins[dealerPlayerId] = (wins[dealerPlayerId] || 0) + res.dealerNet;
      }

      const dealerName = dealerPlayerId === 'house'
        ? 'Casino House'
        : prev.players.find(p => p.id === dealerPlayerId)?.name || 'Dealer';

      const winnerSummary = winningPlayers.length
        ? winningPlayers.map(([id]) => prev.players.find(p => p.id === id)?.name || id).join(', ')
        : (dealerNetWinner(res.dealerNet, dealerName));

      const tot = {
        rounds: (prev.tot?.rounds || 0) + 1,
        total: (prev.tot?.total || 0) + Math.abs(res.dealerNet),
        big: Math.max(prev.tot?.big || 0, Math.abs(res.dealerNet)),
      };

      const hist = [
        {
          no: rd.no,
          winner: winnerSummary,
          pot: Math.abs(res.dealerNet),
          got: Math.abs(res.dealerNet),
          pays,
        },
        ...prev.hist,
      ].slice(0, 30);

      let nextDealerId = prev.bjDealerId || dealerPlayerId;
      if (prev.bjDealerRotation) {
        const eligible = res.updatedPlayers.filter(p => !p.sit && !p.isGameOperator);
        if (eligible.length >= 2) {
          const curIdx = eligible.findIndex(p => p.id === dealerPlayerId);
          nextDealerId = eligible[(curIdx + 1) % eligible.length].id;
        }
      }

      return {
        ...prev,
        players: res.updatedPlayers,
        bjDealerId: nextDealerId,
        debts,
        wins,
        tot,
        hist,
        round: null,
      };
    });
  };

  const dealerNetWinner = (dNet: number, dName: string) => {
    if (dNet > 0) return `${dName} (Dealer)`;
    if (dNet < 0) return 'Players Won';
    return 'Push / Break-even';
  };

  const roundTag = rd ? `Hand #${rd.no}` : '';

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
        title="BLACKJACK"
        roundTag={roundTag}
        currentGame="bj"
        sessionName={engine.sessionName}
        sessionDoc={engine.currentSessionDoc}
        onOpenSessions={() => engine.setShowSessionModal(true)}
        onOpenJoinRoom={() => engine.setShowJoinRoomModal(true)}
        onGoogleSignIn={engine.handleGoogleSignIn}
        onResetGame={engine.resetGame}
      />

      <OperatorModals
        gameState={gameState}
        isOnlineMode={isOnline}
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

      <main id="app">
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
          <BlackjackTable
            players={gameState.players}
            round={rd}
            balanceMode={gameState.balanceMode}
            dealerPlayerId={dealerPlayerId}
            myPlayerId={myPlayer?.id || null}
            sessionMode={sessionMode}
            isHost={isHost}
            onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
          />
          <div className="mut" style={{ textAlign: 'center', marginTop: 6 }} id="hint">
            {isOnline
              ? 'Online Virtual Blackjack 21 · Dealer draws to 16 & stands on 17 · Hit, Stand or Double Down on your turn.'
              : 'Offline Blackjack 21 · Record player bets, wins, losses, splits, doubles & insurance.'}
          </div>
        </section>

        <BlackjackControls
          players={gameState.players}
          round={rd}
          balanceMode={gameState.balanceMode}
          defaultBuyIn={gameState.defaultBuyIn}
          dealerPlayerId={dealerPlayerId}
          nextDealerPlayerId={gameState.bjDealerId || dealerPlayerId}
          bjDealerRotation={bjDealerRotation}
          dealerRequests={gameState.dealerRequests || []}
          sessionMode={sessionMode}
          isHost={isHost}
          myPlayerId={myPlayer?.id || null}
          readyPlayers={gameState.readyPlayers}
          onToggleReady={engine.toggleReady}
          onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
          onSetDealerPlayerId={handleSetDealerPlayerId}
          onSetDealerRotation={handleSetDealerRotation}
          onRequestDealer={engine.requestBjDealer}
          onResolveDealerRequest={engine.resolveBjDealerRequest}
          onSetDefaultBuyIn={engine.setDefaultBuyIn}
          onResetAllBalances={engine.resetAllBalances}
          onStartHand={handleStartHand}
          onBjAction={handleBjAction}
          onSettleHand={handleSettleHand}
          onAbortHand={handleAbortHand}
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

      {engine.showSessionModal && (
        <SessionsModal
          sessions={engine.sessionsList}
          currentSessionId={engine.sessionId}
          initialGameFilter="bj"
          onClose={() => engine.setShowSessionModal(false)}
          onSwitchSession={engine.switchSession}
          onCreateSession={engine.createSession}
        />
      )}

      {/* Join Online Room Modal */}
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
            <div style={{ fontSize: 44, marginBottom: 12 }}>♦</div>
            <h2 style={{ fontSize: 20, color: '#818cf8', margin: '0 0 8px' }}>
              No Active Blackjack Session
            </h2>
            <p className="mut" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 20px' }}>
              To start recording Blackjack hands, dealer outcomes, and player bets, please select or create a Blackjack session.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <a href="/" className="sm" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                ← Card Room
              </a>
              <button
                className="sm pri"
                style={{ fontWeight: 800, padding: '8px 20px', background: 'linear-gradient(#818cf8, #4f46e5)', borderColor: '#a5b4fc', color: '#fff' }}
                onClick={() => engine.setShowSessionModal(true)}
              >
                🎲 Select or Create Session
              </button>
            </div>
          </div>
        </div>
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
    </>
  );
}
