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
import RummyTable from '@/components/rummy/RummyTable';
import RummyControls from '@/components/rummy/RummyControls';
import RummyConfigModal from '@/components/rummy/RummyConfigModal';
import { useGameEngine } from '@/hooks/useGameEngine';
import {
  calculateRummyDeal,
  RummyConfig,
  DEFAULT_RUMMY_CONFIG,
  formatConfigSummary,
} from '@/lib/rummyEngine';

export default function RummyGame() {
  React.useEffect(() => {
    document.body.dataset.v = 'rummy';
    return () => {
      delete document.body.dataset.v;
    };
  }, []);

  const engine = useGameEngine('rummy');
  const { gameState, updateState } = engine;
  const rd = gameState.round;

  const [pointValue, setPointValue] = useState<number>(10);
  const [cumulativePoints, setCumulativePoints] = useState<Record<string, number>>({});
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);

  const rummyConfig: RummyConfig =
    (gameState as any).rummyConfig || DEFAULT_RUMMY_CONFIG;

  const handleStartDeal = () => {
    updateState(prev => {
      const activePlayers = prev.players.filter(p => !p.sit);
      if (activePlayers.length < 2) return prev;

      const rno = prev.rno + 1;
      return {
        ...prev,
        rno,
        round: {
          no: rno,
          phase: 'deal',
          parts: activePlayers.map(p => p.id),
          contrib: {},
          folded: {},
          turn: activePlayers[0].id,
          stake: pointValue,
          stack: [],
          log: [
            `Deal #${rno} (${rummyConfig.totalCards} cards: ${formatConfigSummary(rummyConfig)}) started at ₹${pointValue}/pt`,
          ],
          lastBy: '',
          winner: null,
          allIn: {},
          potWinners: {},
        },
      };
    });
  };

  const handleAbortDeal = () => {
    updateState(prev => ({
      ...prev,
      round: null,
      rno: Math.max(0, prev.rno - 1),
    }));
  };

  const handleSettleDeal = (winnerId: string, playerPoints: Record<string, number>) => {
    if (!rd) return;

    const res = calculateRummyDeal({
      pointValue,
      winnerId,
      playerPoints,
      players: gameState.players,
      balanceMode: !!gameState.balanceMode,
      config: rummyConfig,
    });

    const winnerName = gameState.players.find(p => p.id === winnerId)?.name || winnerId;
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

      wins[winnerId] = (wins[winnerId] || 0) + res.totalWinnings;

      // Update cumulative points
      setCumulativePoints(cp => {
        const next = { ...cp };
        Object.entries(res.playerOutcomes).forEach(([id, outcome]) => {
          next[id] = (next[id] || 0) + outcome.points;
        });
        return next;
      });

      const tot = {
        rounds: (prev.tot?.rounds || 0) + 1,
        total: (prev.tot?.total || 0) + res.totalWinnings,
        big: Math.max(prev.tot?.big || 0, res.totalWinnings),
      };

      const hist = [
        {
          no: rd.no,
          winner: `${winnerName} (${rummyConfig.totalCards} cards)`,
          pot: res.totalWinnings,
          got: res.totalWinnings,
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

  const roundTag = rd
    ? `Deal #${rd.no} · ${rummyConfig.totalCards} Cards · ₹${pointValue}/pt`
    : `${rummyConfig.totalCards} Cards`;

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
        title="INDIAN RUMMY"
        roundTag={roundTag}
        currentGame="rummy"
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
          <RummyTable
            players={gameState.players}
            round={rd}
            balanceMode={gameState.balanceMode}
            pointValue={pointValue}
            rummyConfig={rummyConfig}
            cumulativePoints={cumulativePoints}
            onOpenAddMoney={(id) => engine.setAddMoneyTarget(id)}
            onOpenConfigModal={() => setShowConfigModal(true)}
          />
          <div className="mut" style={{ textAlign: 'center', marginTop: 6 }} id="hint">
            Offline {rummyConfig.totalCards}-Card Points Rummy · {formatConfigSummary(rummyConfig)}
          </div>
        </section>

        <RummyControls
          players={gameState.players}
          round={rd}
          balanceMode={gameState.balanceMode}
          defaultBuyIn={gameState.defaultBuyIn}
          pointValue={pointValue}
          rummyConfig={rummyConfig}
          cumulativePoints={cumulativePoints}
          onSetPointValue={setPointValue}
          onSetDefaultBuyIn={engine.setDefaultBuyIn}
          onResetAllBalances={engine.resetAllBalances}
          onUpdateConfig={(cfg) => engine.setRummyConfig(cfg)}
          onOpenConfigModal={() => setShowConfigModal(true)}
          onStartDeal={handleStartDeal}
          onSettleDeal={handleSettleDeal}
          onAbortDeal={handleAbortDeal}
        />
      </main>

      <RoundHistory history={gameState.hist} />

      {/* Modals */}
      {showConfigModal && (
        <RummyConfigModal
          currentConfig={rummyConfig}
          onSave={(newCfg) => engine.setRummyConfig(newCfg)}
          onClose={() => setShowConfigModal(false)}
        />
      )}

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
          initialGameFilter="rummy"
          onClose={() => engine.setShowSessionModal(false)}
          onSwitchSession={engine.switchSession}
          onCreateSession={engine.createSession}
        />
      )}

      {engine.sessionsLoaded && !engine.sessionId && !engine.showSessionModal && (
        <div className="mdl">
          <div className="session-modal-box" style={{ maxWidth: 460, textAlign: 'center', padding: '36px 24px' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎴</div>
            <h2 style={{ fontSize: 20, color: '#34d399', margin: '0 0 8px' }}>
              No Active Rummy Session
            </h2>
            <p className="mut" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 20px' }}>
              To start recording Points Rummy deals, penalty points, and winnings, please select or create a Rummy session.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <a href="/" className="sm" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                ← Card Room
              </a>
              <button
                className="sm pri"
                style={{ fontWeight: 800, padding: '8px 20px', background: 'linear-gradient(#34d399, #059669)', borderColor: '#6ee7b7', color: '#022c22' }}
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
