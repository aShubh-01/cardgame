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

  const [dealerPlayerId, setDealerPlayerId] = useState<string | 'house'>('house');

  const handleStartHand = () => {
    updateState(prev => {
      const activePlayers = prev.players.filter(p => !p.sit);
      if (activePlayers.length < 1) return prev;

      const rno = prev.rno + 1;
      return {
        ...prev,
        rno,
        round: {
          no: rno,
          phase: 'hand',
          parts: activePlayers.map(p => p.id),
          contrib: {},
          folded: {},
          turn: activePlayers[0].id,
          stake: 100,
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

  const handleAbortHand = () => {
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

      return {
        ...prev,
        players: res.updatedPlayers,
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
        onOpenSessions={() => engine.setShowSessionModal(true)}
        onGoogleSignIn={engine.handleGoogleSignIn}
        onResetGame={engine.resetGame}
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
          onAddPlayer={engine.addPlayer}
          onRemovePlayer={engine.removePlayer}
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
            onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
          />
          <div className="mut" style={{ textAlign: 'center', marginTop: 6 }} id="hint">
            Offline Blackjack 21 · Record player bets, wins, losses, splits, doubles &amp; insurance.
          </div>
        </section>

        <BlackjackControls
          players={gameState.players}
          round={rd}
          balanceMode={gameState.balanceMode}
          defaultBuyIn={gameState.defaultBuyIn}
          dealerPlayerId={dealerPlayerId}
          onSetDealerPlayerId={setDealerPlayerId}
          onSetDefaultBuyIn={engine.setDefaultBuyIn}
          onResetAllBalances={engine.resetAllBalances}
          onStartHand={handleStartHand}
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

      {engine.sessionsLoaded && !engine.sessionId && !engine.showSessionModal && (
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
            onClose={() => engine.setAddMoneyTarget(null)}
            onAdjustMoney={engine.adjustMoney}
            onSetExactStack={engine.setPlayerBalance}
          />
        );
      })()}

      {engine.showGoogleConfigModal && (
        <GoogleConfigModal onClose={() => engine.setShowGoogleConfigModal(false)} />
      )}
    </>
  );
}
