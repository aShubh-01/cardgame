'use client';

import React, { useState } from 'react';
import Header from '@/components/common/Header';
import SessionsModal from '@/components/common/SessionsModal';
import GoogleConfigModal from '@/components/common/GoogleConfigModal';
import { useGameEngine } from '@/hooks/useGameEngine';

export default function Lobby() {
  React.useEffect(() => {
    document.body.dataset.v = 'lobby';
    return () => {
      delete document.body.dataset.v;
    };
  }, []);

  const engine = useGameEngine(null);
  const [modalGameFilter, setModalGameFilter] = useState<'all' | 'tp' | 'pk' | 'rummy' | 'bj'>('all');

  const openSessionsForGame = (g: 'all' | 'tp' | 'pk' | 'rummy' | 'bj') => {
    setModalGameFilter(g);
    engine.setShowSessionModal(true);
  };

  const tpSessions = engine.sessionsList.filter(s => s.gameType === 'tp');
  const pkSessions = engine.sessionsList.filter(s => s.gameType === 'pk');
  const rummySessions = engine.sessionsList.filter(s => s.gameType === 'rummy');
  const bjSessions = engine.sessionsList.filter(s => s.gameType === 'bj');

  const tpSess = tpSessions.find(s => s.status === 'active') || tpSessions[0];
  const pkSess = pkSessions.find(s => s.status === 'active') || pkSessions[0];
  const rummySess = rummySessions.find(s => s.status === 'active') || rummySessions[0];
  const bjSess = bjSessions.find(s => s.status === 'active') || bjSessions[0];

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
        title="♠ CARD ROOM ♥ PICK YOUR GAME"
        currentGame={null}
        onOpenSessions={() => openSessionsForGame('all')}
        onGoogleSignIn={engine.handleGoogleSignIn}
      />

      <div id="lobby">
        <div className="lt">CHOOSE YOUR TABLE</div>

        <div className="gg">
          {/* Teen Patti Card */}
          <div
            className="gc gtp"
            onClick={() => openSessionsForGame('tp')}
            style={{ cursor: 'pointer' }}
          >
            <div className="ge" style={{ marginBottom: 12 }}>🃏</div>
            <h3>Teen Patti</h3>
            <p>Classic Indian 3-card poker. Track boot, chaal, blinds, shows, and who owes whom.</p>

            <div className="mut" style={{ fontSize: 12, marginBottom: 8 }}>
              {tpSessions.length > 0 ? (
                <>🎲 {tpSess?.name || `${tpSessions.length} sessions available`}</>
              ) : (
                <span style={{ color: 'var(--gold)', opacity: 0.9 }}>🎲 No sessions yet • Click to create</span>
              )}
            </div>

            <div className="gs">
              {tpSessions.length > 0 ? (
                <>
                  <span>{tpSess?.players?.length ?? 0} players</span>
                  <span>{tpSess?.tot?.rounds ?? 0} rounds</span>
                  <span className="live">● {tpSessions.length} session{tpSessions.length > 1 ? 's' : ''}</span>
                </>
              ) : (
                <span>Ready to start</span>
              )}
            </div>

            <button
              className="pri big"
              style={{ width: '100%', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                openSessionsForGame('tp');
              }}
            >
              Play Teen Patti
            </button>
          </div>

          {/* Poker Card */}
          <div
            className="gc gpk"
            onClick={() => openSessionsForGame('pk')}
            style={{ cursor: 'pointer' }}
          >
            <div className="ge" style={{ marginBottom: 12 }}>♠</div>
            <h3>Poker</h3>
            <p>Real-world poker with streets, check, call, dynamic Main &amp; Side Pots, and all-ins.</p>

            <div className="mut" style={{ fontSize: 12, marginBottom: 8 }}>
              {pkSessions.length > 0 ? (
                <>🎲 {pkSess?.name || `${pkSessions.length} sessions available`}</>
              ) : (
                <span style={{ color: '#5eead4', opacity: 0.9 }}>🎲 No sessions yet • Click to create</span>
              )}
            </div>

            <div className="gs">
              {pkSessions.length > 0 ? (
                <>
                  <span>{pkSess?.players?.length ?? 0} players</span>
                  <span>{pkSess?.tot?.rounds ?? 0} rounds</span>
                  <span className="live" style={{ color: '#5eead4' }}>● {pkSessions.length} session{pkSessions.length > 1 ? 's' : ''}</span>
                </>
              ) : (
                <span>Ready to start</span>
              )}
            </div>

            <button
              className="pri big"
              style={{ width: '100%', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                openSessionsForGame('pk');
              }}
            >
              Play Texas Hold&apos;em
            </button>
          </div>

          {/* Indian Rummy Card */}
          <div
            className="gc grummy"
            onClick={() => openSessionsForGame('rummy')}
            style={{ cursor: 'pointer' }}
          >
            <div className="ge" style={{ marginBottom: 12 }}>🎴</div>
            <h3>Indian Rummy</h3>
            <p>Points Rummy. Configurable card sets, point value, penalties, drops &amp; winner calculations.</p>

            <div className="mut" style={{ fontSize: 12, marginBottom: 8 }}>
              {rummySessions.length > 0 ? (
                <>🎲 {rummySess?.name || `${rummySessions.length} sessions available`}</>
              ) : (
                <span style={{ color: '#34d399', opacity: 0.9 }}>🎲 No sessions yet • Click to create</span>
              )}
            </div>

            <div className="gs">
              {rummySessions.length > 0 ? (
                <>
                  <span>{rummySess?.players?.length ?? 0} players</span>
                  <span>{rummySess?.tot?.rounds ?? 0} deals</span>
                  <span className="live" style={{ color: '#34d399' }}>● {rummySessions.length} session{rummySessions.length > 1 ? 's' : ''}</span>
                </>
              ) : (
                <span>Ready to start</span>
              )}
            </div>

            <button
              className="pri big"
              style={{
                width: '100%',
                cursor: 'pointer',
                background: 'linear-gradient(#34d399, #059669)',
                borderColor: '#6ee7b7',
                color: '#022c22',
              }}
              onClick={(e) => {
                e.stopPropagation();
                openSessionsForGame('rummy');
              }}
            >
              Play Indian Rummy
            </button>
          </div>

          {/* Blackjack Card */}
          <div
            className="gc gbj"
            onClick={() => openSessionsForGame('bj')}
            style={{ cursor: 'pointer' }}
          >
            <div className="ge" style={{ marginBottom: 12 }}>♦</div>
            <h3>Blackjack</h3>
            <p>Casino 21. Dealer/House banking, doubles, splits, pushes &amp; insurance payouts.</p>

            <div className="mut" style={{ fontSize: 12, marginBottom: 8 }}>
              {bjSessions.length > 0 ? (
                <>🎲 {bjSess?.name || `${bjSessions.length} sessions available`}</>
              ) : (
                <span style={{ color: '#818cf8', opacity: 0.9 }}>🎲 No sessions yet • Click to create</span>
              )}
            </div>

            <div className="gs">
              {bjSessions.length > 0 ? (
                <>
                  <span>{bjSess?.players?.length ?? 0} players</span>
                  <span>{bjSess?.tot?.rounds ?? 0} hands</span>
                  <span className="live" style={{ color: '#818cf8' }}>● {bjSessions.length} session{bjSessions.length > 1 ? 's' : ''}</span>
                </>
              ) : (
                <span>Ready to start</span>
              )}
            </div>

            <button
              className="pri big"
              style={{
                width: '100%',
                cursor: 'pointer',
                background: 'linear-gradient(#818cf8, #4f46e5)',
                borderColor: '#a5b4fc',
                color: '#fff',
              }}
              onClick={(e) => {
                e.stopPropagation();
                openSessionsForGame('bj');
              }}
            >
              Play Blackjack
            </button>
          </div>
        </div>
      </div>

      {/* Sessions Modal */}
      {engine.showSessionModal && (
        <SessionsModal
          sessions={engine.sessionsList}
          currentSessionId={engine.sessionId}
          initialGameFilter={modalGameFilter}
          onClose={() => engine.setShowSessionModal(false)}
          onSwitchSession={engine.switchSession}
          onCreateSession={engine.createSession}
        />
      )}

      {engine.showGoogleConfigModal && (
        <GoogleConfigModal onClose={() => engine.setShowGoogleConfigModal(false)} />
      )}
    </>
  );
}
