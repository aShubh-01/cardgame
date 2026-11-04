'use client';

import React, { useEffect, useState } from 'react';
import { GameState, money } from '@/types/game';

interface OperatorSystemProps {
  gameState: GameState;
  isOnlineMode?: boolean;
  actionError?: string | null;
  onClearError?: () => void;
  showOperatorModal: boolean;
  setShowOperatorModal: (v: boolean) => void;
  onTransferGo: (targetPlayerId: string) => void;
  onVolunteerGo: () => void;
  onTriggerDisconnect: () => void;
  onCheckTimeout: () => void;
  onOpenDebtModal: () => void;
}

export default function OperatorModals({
  gameState,
  isOnlineMode,
  actionError,
  onClearError,
  showOperatorModal,
  setShowOperatorModal,
  onTransferGo,
  onVolunteerGo,
  onTriggerDisconnect,
  onCheckTimeout,
  onOpenDebtModal,
}: OperatorSystemProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [secondsLeft, setSecondsLeft] = useState<number>(15);

  const disconnectEvt = gameState.goDisconnectEvent;
  const isVolunteering = Boolean(isOnlineMode && disconnectEvt && disconnectEvt.status === 'volunteering');
  const isRoundActive = Boolean(
    gameState.round && !gameState.round.settled && gameState.round.phase !== 'result'
  );

  // Live 15s countdown for GO disconnect volunteer popup
  useEffect(() => {
    if (!isVolunteering || !disconnectEvt?.expiresAt) return;

    let firedTimeout = false;
    const updateTimer = () => {
      const remMs = disconnectEvt.expiresAt - Date.now();
      const remSec = Math.max(0, Math.ceil(remMs / 1000));
      setSecondsLeft(remSec);
      if (remMs <= 0 && !firedTimeout) {
        firedTimeout = true;
        onCheckTimeout();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 250);
    return () => clearInterval(interval);
  }, [isVolunteering, disconnectEvt?.expiresAt, onCheckTimeout]);

  useEffect(() => {
    if (!selectedTargetId && gameState.players.length > 0) {
      setSelectedTargetId(gameState.players[0].id);
    }
  }, [gameState.players, selectedTargetId]);

  if (!isOnlineMode && !actionError) return null;

  const activePlayers = gameState.players.filter(p => !p.sit && !p.isGameOperator);
  const readyPlayersMap = gameState.readyPlayers || {};
  const readyCount = activePlayers.filter(p => readyPlayersMap[p.id]).length;

  return (
    <>
      {/* Action Error Toast Banner */}
      {actionError && (
        <div
          style={{
            margin: '8px 14px 0',
            padding: '10px 16px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(224, 79, 95, 0.22), rgba(90, 18, 28, 0.92))',
            border: '1px solid rgba(224, 79, 95, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            color: '#ffd6db',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            zIndex: 60,
          }}
        >
          <span>⚠️ {actionError}</span>
          {onClearError && (
            <button
              className="btn xs ghost"
              onClick={onClearError}
              style={{ padding: '2px 8px', fontSize: 11 }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Queued Game Operator Banner */}
      {isOnlineMode && gameState.isQueuedGameOperator && !gameState.isGameOperator && (
        <div
          style={{
            margin: '8px 14px 0',
            padding: '10px 16px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(242, 201, 76, 0.2), rgba(35, 24, 10, 0.92))',
            border: '1px solid rgba(242, 201, 76, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            fontSize: 12,
            color: '#f7d97e',
          }}
        >
          <span>
            ⏳ <b>Queued as Next Game Operator:</b> Current round is finishing without an operator. You will automatically become the <b>Game Operator</b> as soon as this round ends!
          </span>
        </div>
      )}

      {/* Active Game Operator Control Strip (Hidden from regular players) */}
      {isOnlineMode && gameState.isGameOperator && (
        <div
          style={{
            margin: '8px 14px 0',
            padding: '10px 16px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.16), rgba(19, 13, 24, 0.95))',
            border: '1px solid rgba(212, 175, 55, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            boxShadow: '0 8px 26px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #f7d97e, #c9962c)',
                color: '#1a0f02',
                fontWeight: 900,
                fontSize: 11,
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
              }}
            >
              👁 Game Operator {gameState.isSessionOwner ? '· Session Owner' : ''}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Stealth Observer Mode (Players cannot see your identity or seat) · Full Cards, Logs &amp; Debt Matrix unlocked
            </span>
            {!isRoundActive && (
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  background:
                    activePlayers.length > 0 && readyCount === activePlayers.length
                      ? 'rgba(46, 204, 113, 0.18)'
                      : 'rgba(242, 201, 76, 0.15)',
                  border:
                    activePlayers.length > 0 && readyCount === activePlayers.length
                      ? '1px solid rgba(46, 204, 113, 0.5)'
                      : '1px solid rgba(242, 201, 76, 0.4)',
                  color:
                    activePlayers.length > 0 && readyCount === activePlayers.length
                      ? '#2ecc71'
                      : '#f2c94c',
                }}
              >
                👍 Players Ready: {readyCount}/{activePlayers.length}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn sm"
              onClick={() => setShowOperatorModal(true)}
              style={{
                borderColor: 'rgba(242, 201, 76, 0.55)',
                color: '#f7d97e',
                fontWeight: 800,
              }}
            >
              🕵️ Operator Logs &amp; Transfer Role
            </button>
            <button
              className="btn sm"
              onClick={onOpenDebtModal}
              style={{
                borderColor: 'rgba(56, 189, 248, 0.45)',
                color: '#7dd3fc',
                fontWeight: 700,
              }}
            >
              📊 Full Who-Owes-Who Matrix
            </button>
            {gameState.players.length > 0 && (
              <button
                className="btn sm ghost"
                onClick={onTriggerDisconnect}
                title="Trigger the 15s volunteer popup for all players"
                style={{ fontSize: 11, color: '#fca5a5' }}
              >
                ⚡ Step Away (15s Volunteer)
              </button>
            )}
          </div>
        </div>
      )}

      {/* 15-Second Volunteer Popup when Game Operator Disconnects */}
      {isVolunteering && (
        <div className="modal show" style={{ zIndex: 9999 }}>
          <div
            className="dialog"
            style={{
              maxWidth: 460,
              border: '1px solid rgba(242, 201, 76, 0.65)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 0 40px rgba(212, 175, 55, 0.2)',
            }}
          >
            <div style={{ textAlign: 'center', padding: '6px 0 12px' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  margin: '0 auto 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  fontWeight: 900,
                  background: 'radial-gradient(circle, rgba(242,201,76,0.28), rgba(242,201,76,0.06))',
                  border: '2px solid var(--gold)',
                  color: 'var(--gold)',
                }}
              >
                {secondsLeft}s
              </div>
              <h3 style={{ margin: '0 0 6px', color: '#f7d97e', fontSize: 18 }}>
                ⚠️ Game Operator Disconnected!
              </h3>
              <p className="sub" style={{ margin: '0 0 14px', lineHeight: 1.5, fontSize: 13 }}>
                The Game Operator has disconnected. Volunteer now to take over the <b>Game Operator</b> role!
                {isRoundActive
                  ? ' Since a round is currently active, whoever accepts first will be queued as Game Operator starting from the next round (operator controls are paused for the rest of this round).'
                  : ' Whoever accepts first will immediately become the Game Operator for the next round.'}
              </p>
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--line)',
                  fontSize: 11,
                  color: 'var(--muted)',
                  marginBottom: 16,
                }}
              >
                ⏱ If no one volunteers within <b>{secondsLeft}s</b>, the system will automatically select a player and put them in the Game Operator queue.
              </div>

              {!gameState.isGameOperator ? (
                <button
                  className="btn gold"
                  onClick={onVolunteerGo}
                  style={{ width: '100%', padding: '12px 18px', fontSize: 14, fontWeight: 900 }}
                >
                  🙋 Volunteer to Become Game Operator
                </button>
              ) : (
                <button
                  className="btn primary"
                  onClick={onCheckTimeout}
                  style={{ width: '100%', padding: '11px 16px', fontSize: 13, fontWeight: 800 }}
                >
                  🔄 Resume as Game Operator
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Game Operator Console & Role Transfer Modal */}
      {showOperatorModal && (
        <div
          className="modal show"
          onClick={e => {
            if (e.target === e.currentTarget) setShowOperatorModal(false);
          }}
        >
          <div className="dialog" style={{ maxWidth: 680 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, color: '#f7d97e' }}>
                  👁 Game Operator Control &amp; Audit Console
                </h3>
                <div className="sub" style={{ marginTop: 2 }}>
                  Role: <b>{gameState.isSessionOwner ? 'Session Owner & Game Operator' : 'Game Operator'}</b> · Non-playing observer &amp; table controller
                </div>
              </div>
              <button className="btn xs ghost" onClick={() => setShowOperatorModal(false)}>
                ✕ Close
              </button>
            </div>

            {/* 1. Role Transfer Section */}
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: 'rgba(212, 175, 55, 0.08)',
                border: '1px solid rgba(212, 175, 55, 0.35)',
                marginBottom: 14,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13, color: '#f7d97e', marginBottom: 4 }}>
                🔄 Transfer Game Operator Role (Join Table as a Player)
              </div>
              <div className="sub" style={{ fontSize: 12, marginBottom: 10 }}>
                Want to play in the next hand? Transfer the Game Operator role to another player. That player will become the hidden Game Operator (and cannot play), while you take a seat at the table as a Player.
              </div>

              {isRoundActive ? (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(224, 79, 95, 0.14)',
                    border: '1px solid rgba(224, 79, 95, 0.4)',
                    color: '#fca5a5',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  🔒 Role transfer can only be done before a round starts or after a round ends. Finish or abort the current round first.
                </div>
              ) : gameState.players.length === 0 ? (
                <div className="sub">Wait for at least one player to join the room before transferring the Game Operator role.</div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={selectedTargetId}
                    onChange={e => setSelectedTargetId(e.target.value)}
                    style={{ flex: 1, minWidth: 180 }}
                  >
                    {gameState.players.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {gameState.balanceMode ? `(${money(p.balance || 0)})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn gold"
                    disabled={!selectedTargetId}
                    onClick={() => selectedTargetId && onTransferGo(selectedTargetId)}
                  >
                    👑 Make Game Operator &amp; Join as Player
                  </button>
                </div>
              )}
            </div>

            {/* 2. Live Player Ready Status & Unmasked Cards Inspection */}
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--line)',
                marginBottom: 14,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--gold)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                👥 All Players · Live Cards &amp; Ready State
              </div>
              {gameState.players.length === 0 ? (
                <div className="sub">No players seated yet.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                  {gameState.players.map(p => {
                    const isReady = Boolean(readyPlayersMap[p.id]);
                    const pHand = gameState.round?.hands?.[p.id];
                    const cardsText = Array.isArray(pHand)
                      ? pHand.map((c: any) => `${c.rank}${c.suit}`).join(' ')
                      : 'No cards dealt';
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 10,
                          background: 'rgba(0,0,0,0.35)',
                          border: '1px solid var(--line)',
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                          <span>{p.name}</span>
                          <span style={{ color: isReady ? '#2ecc71' : '#f2c94c', fontSize: 11 }}>
                            {isRoundActive ? '🃏 In Round' : isReady ? '👍 READY' : '⏳ Waiting'}
                          </span>
                        </div>
                        <div className="sub" style={{ fontSize: 11, marginTop: 3 }}>
                          {gameState.balanceMode ? `Wallet: ${money(p.balance || 0)} · ` : ''}
                          Hand: <b style={{ color: '#fff' }}>{cardsText}</b>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Full Activity Log */}
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: 'rgba(0,0,0,0.38)',
                border: '1px solid var(--line)',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--gold)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                📜 Complete Player Activity &amp; Audit Log ({(gameState.activityLog || []).length} events)
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(gameState.activityLog || []).length === 0 ? (
                  <div className="sub">No activity recorded yet.</div>
                ) : (
                  [...(gameState.activityLog || [])].reverse().map((entry, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: 11.5,
                        padding: '5px 8px',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.025)',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        fontFamily: 'var(--font-jetbrains), monospace',
                      }}
                    >
                      {entry}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

