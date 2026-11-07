'use client';

import React, { useEffect, useState } from 'react';
import { GameState, money } from '@/types/game';
import PlayingCard from '@/components/common/PlayingCard';

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
  onKickPlayer?: (playerId: string) => void;
}

type TabType = 'surveillance' | 'transfer' | 'ledger' | 'debts';

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
  onKickPlayer,
}: OperatorSystemProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [secondsLeft, setSecondsLeft] = useState<number>(15);
  const [activeTab, setActiveTab] = useState<TabType>('surveillance');
  const [confirmKickId, setConfirmKickId] = useState<string | null>(null);

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

  const activePlayers = gameState.players.filter(p => !p.sit && !p.isGameOperator && p.isConnected !== false);
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

      {/* Top Section Game Operator Executive Console */}
      {isOnlineMode && gameState.isGameOperator && (
        <div className="go-top-container">
          {/* Executive Top Bar */}
          <div className="go-top-bar">
            <div className="go-top-bar-left">
              <span className="go-badge">
                👑 {gameState.isSessionOwner ? 'Owner & Operator' : 'Game Operator'}
              </span>
              <span
                style={{
                  fontSize: 11.5,
                  color: '#4ade80',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                Stealth Mode (Hidden Observer)
              </span>
              {!isRoundActive && (
                <span
                  style={{
                    padding: '3px 10px',
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
                  👍 Ready: {readyCount}/{activePlayers.length}
                </span>
              )}
            </div>

            <div className="go-top-bar-right">
              {/* Section Tabs */}
              <button
                type="button"
                className={`go-tab-btn ${showOperatorModal && activeTab === 'surveillance' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('surveillance');
                  setShowOperatorModal(true);
                }}
              >
                👥 Players & Table ({activePlayers.length})
              </button>

              <button
                type="button"
                className={`go-tab-btn ${showOperatorModal && activeTab === 'transfer' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('transfer');
                  setShowOperatorModal(true);
                }}
              >
                🔁 Transfer Role
              </button>

              <button
                type="button"
                className={`go-tab-btn ${showOperatorModal && activeTab === 'debts' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('debts');
                  setShowOperatorModal(true);
                }}
              >
                📊 Debts Matrix
              </button>

              <button
                type="button"
                className={`go-tab-btn ${showOperatorModal && activeTab === 'ledger' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('ledger');
                  setShowOperatorModal(true);
                }}
              >
                📜 Audit Log ({(gameState.activityLog || []).length})
              </button>

              {/* Expand / Collapse Console Toggle */}
              <button
                type="button"
                className="go-tab-btn"
                style={{
                  background: showOperatorModal ? 'rgba(244, 195, 79, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  borderColor: 'var(--gold)',
                  color: 'var(--gold)',
                  fontWeight: 900,
                }}
                onClick={() => setShowOperatorModal(!showOperatorModal)}
              >
                {showOperatorModal ? '▲ Close Console' : '▼ Expand Console'}
              </button>
            </div>
          </div>

          {/* Expanded Proper Top Sections Console */}
          {showOperatorModal && (
            <div className="go-panel-body">
              {/* Tab 1: 👥 Live Player Surveillance & Table Status */}
              {activeTab === 'surveillance' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, color: 'var(--gold)', fontSize: 16 }}>
                        👥 Players &amp; Live Table Surveillance
                      </h3>
                      <div className="sub" style={{ fontSize: 12, marginTop: 2 }}>
                        As Game Operator, monitor player stacks, ready states, connection status, and moderate table access. Hole cards remain secret.
                      </div>
                    </div>
                  </div>

                  {gameState.players.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--mut)', fontSize: 13 }}>
                      No players have joined this room yet. Share the Room Code to invite players.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {gameState.players.map(p => {
                        const isReady = Boolean(readyPlayersMap[p.id]);
                        const pHand = gameState.round?.hands?.[p.id];
                        const isDisconnected = p.isConnected === false;
                        const isTurn = gameState.round && gameState.round.turn === p.id;
                        const evalRank = gameState.round?.handEvaluations?.[p.id]?.rankName;

                        return (
                          <div
                            key={p.id}
                            className="go-player-surveillance-card"
                            style={{
                              borderColor: isTurn ? 'var(--gold)' : undefined,
                              background: isTurn ? 'linear-gradient(145deg, rgba(244, 195, 79, 0.12), rgba(0,0,0,0.5))' : undefined,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ position: 'relative' }}>
                                  <div
                                    className="av"
                                    style={{
                                      width: 32,
                                      height: 32,
                                      fontSize: 13,
                                      background: p.sit ? '#334155' : undefined,
                                    }}
                                  >
                                    {(p.name[0] || '?').toUpperCase()}
                                  </div>
                                  <span
                                    className={`presence-dot ${isDisconnected ? 'off' : 'on'}`}
                                    style={{ width: 10, height: 10 }}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>
                                    {p.name}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--mut)' }}>
                                    {gameState.balanceMode ? `Chips: ${money(p.balance || 0)}` : 'Debt mode'}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 7px',
                                    borderRadius: 999,
                                    fontWeight: 900,
                                    background: isDisconnected
                                      ? 'rgba(239, 68, 68, 0.2)'
                                      : isTurn
                                        ? 'rgba(244, 195, 79, 0.25)'
                                        : isReady
                                          ? 'rgba(46, 204, 113, 0.2)'
                                          : 'rgba(255, 255, 255, 0.08)',
                                    color: isDisconnected
                                      ? '#fca5a5'
                                      : isTurn
                                        ? 'var(--gold)'
                                        : isReady
                                          ? '#2ecc71'
                                          : '#94a3b8',
                                    border: `1px solid ${isDisconnected
                                        ? 'rgba(239, 68, 68, 0.4)'
                                        : isTurn
                                          ? 'var(--gold)'
                                          : isReady
                                            ? 'rgba(46, 204, 113, 0.4)'
                                            : 'rgba(255, 255, 255, 0.15)'
                                      }`,
                                  }}
                                >
                                  {isDisconnected ? '🔌 OFFLINE' : isTurn ? '⚡ TURN' : isReady ? '👍 READY' : '⏳ WAITING'}
                                </span>

                                {/* Kick Button in GO Surveillance */}
                                {onKickPlayer && (
                                  confirmKickId === p.id ? (
                                    <button
                                      type="button"
                                      className="kick-btn"
                                      style={{ padding: '3px 8px', fontSize: 10.5, background: '#dc2626', color: '#fff' }}
                                      onClick={() => {
                                        onKickPlayer(p.id);
                                        setConfirmKickId(null);
                                      }}
                                    >
                                      ⚠️ Confirm Kick?
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="kick-btn"
                                      style={{ padding: '3px 8px', fontSize: 11 }}
                                      title={`Kick ${p.name} from room`}
                                      onClick={() => {
                                        setConfirmKickId(p.id);
                                        setTimeout(() => setConfirmKickId(curr => (curr === p.id ? null : curr)), 4000);
                                      }}
                                    >
                                      👢 Kick
                                    </button>
                                  )
                                )}
                              </div>
                            </div>

                            {/* Render Player Cards (Face-up for Showdown / BJ, or Face-down masked cards for secrecy) */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                background: 'rgba(0,0,0,0.3)',
                                padding: '6px 8px',
                                borderRadius: 8,
                                minHeight: 46,
                              }}
                            >
                              {Array.isArray(pHand) && pHand.length > 0 ? (
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {pHand.map((c: any, ci: number) => (
                                    <PlayingCard key={ci} card={c} size="xs" />
                                  ))}
                                  {evalRank && (
                                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)', marginLeft: 6 }}>
                                      · {evalRank}
                                    </span>
                                  )}
                                </div>
                              ) : pHand && ((pHand as any).masked || typeof (pHand as any).count === 'number') && (pHand as any).count > 0 ? (
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {Array.from({ length: (pHand as any).count }).map((_, ci) => (
                                    <PlayingCard key={ci} faceDown size="xs" backTheme="red" />
                                  ))}
                                  <span style={{ fontSize: 11, color: 'var(--mut)', marginLeft: 4, fontWeight: 700 }}>
                                    {(pHand as any).count} Cards (Secret)
                                  </span>
                                  {gameState.round?.playerStatus?.[p.id] && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 800,
                                        padding: '1px 6px',
                                        borderRadius: 8,
                                        background: gameState.round.playerStatus[p.id] === 'blind' ? 'rgba(56,189,248,0.2)' : 'rgba(244,195,79,0.2)',
                                        color: gameState.round.playerStatus[p.id] === 'blind' ? '#38bdf8' : 'var(--gold)',
                                        border: `1px solid ${gameState.round.playerStatus[p.id] === 'blind' ? '#38bdf8' : 'var(--gold)'}`,
                                        marginLeft: 4,
                                      }}
                                    >
                                      {gameState.round.playerStatus[p.id].toUpperCase()}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--mut)', fontStyle: 'italic' }}>
                                  No cards dealt this hand
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: 🔁 Role Transfer Section */}
              {activeTab === 'transfer' && (
                <div style={{ maxWidth: 640 }}>
                  <h3 style={{ margin: '0 0 4px', color: 'var(--gold)', fontSize: 16 }}>
                    🔁 Transfer Game Operator Role (Join Table as a Player)
                  </h3>
                  <p className="sub" style={{ margin: '0 0 14px', fontSize: 12.5, lineHeight: 1.45 }}>
                    Want to play in the next hand? Transfer the Game Operator role to another seated player. That player will become the hidden Game Operator (and cannot play), while you take a seat at the table as an active Player.
                  </p>

                  {isRoundActive ? (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        background: 'rgba(239, 68, 68, 0.16)',
                        border: '1.5px solid #ef4444',
                        color: '#fca5a5',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      🔒 <b>Round In Progress:</b> Role transfer is locked during an active hand to preserve game integrity. Settle or abort the current round first.
                    </div>
                  ) : gameState.players.length === 0 ? (
                    <div style={{ padding: 16, background: 'rgba(0,0,0,0.3)', borderRadius: 12, color: 'var(--mut)', fontSize: 13 }}>
                      Wait for at least one player to join the room before transferring the Game Operator role.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        className="go-select-box"
                        value={selectedTargetId}
                        onChange={e => setSelectedTargetId(e.target.value)}
                        style={{ flex: 1, minWidth: 220 }}
                      >
                        {gameState.players.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {gameState.balanceMode ? `· Stack: ${money(p.balance || 0)}` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="pri"
                        disabled={!selectedTargetId}
                        style={{ padding: '12px 20px', fontSize: 14, fontWeight: 900 }}
                        onClick={() => selectedTargetId && onTransferGo(selectedTargetId)}
                      >
                        👑 Make Operator &amp; Join as Player
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: 📊 Debts & Financial Matrix */}
              {activeTab === 'debts' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, color: 'var(--gold)', fontSize: 16 }}>
                        📊 Financial Ledger &amp; Who-Owes-Who Matrix
                      </h3>
                      <div className="sub" style={{ fontSize: 12, marginTop: 2 }}>
                        Inspect table chip tallies, net transfers, and who pays whom upon session wrap-up.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="good"
                      style={{ padding: '8px 16px', fontSize: 13 }}
                      onClick={onOpenDebtModal}
                    >
                      Open Full Matrix Dialog
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                    {gameState.players.map(p => (
                      <div
                        key={p.id}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(244, 195, 79, 0.25)',
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: 13, color: '#fff' }}>{p.name}</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--gold)', marginTop: 4 }}>
                          {gameState.balanceMode ? money(p.balance || 0) : 'Active in Session'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 4: 📜 Complete Activity Audit Log */}
              {activeTab === 'ledger' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h3 style={{ margin: 0, color: 'var(--gold)', fontSize: 16 }}>
                      📜 Complete Session Audit Ledger ({(gameState.activityLog || []).length} events)
                    </h3>
                  </div>
                  <div
                    style={{
                      maxHeight: 260,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      background: 'rgba(0,0,0,0.5)',
                      padding: 10,
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {(gameState.activityLog || []).length === 0 ? (
                      <div style={{ color: 'var(--mut)', fontSize: 12, textAlign: 'center', padding: 20 }}>
                        No audit events recorded yet.
                      </div>
                    ) : (
                      [...(gameState.activityLog || [])].reverse().map((entry, idx) => (
                        <div
                          key={idx}
                          style={{
                            fontSize: 12,
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: 'rgba(255,255,255,0.025)',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            fontFamily: 'monospace',
                            color: entry.includes('kicked') || entry.includes('disconnected') ? '#fca5a5' : '#e2e8f0',
                          }}
                        >
                          {entry}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 15-Second Volunteer Popup when Game Operator Disconnects */}
      {isVolunteering && (
        <div className="mdl" style={{ zIndex: 9999 }}>
          <div
            className="mb"
            style={{
              maxWidth: 440,
              width: '100%',
              background: 'linear-gradient(160deg, #2c121a, #15080c)',
              border: '2px solid var(--gold)',
              borderRadius: 20,
              boxShadow: '0 24px 64px rgba(0,0,0,0.95), 0 0 40px rgba(212, 175, 55, 0.35)',
              padding: '24px 20px',
              textAlign: 'center',
            }}
          >
            <div>
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: '50%',
                  margin: '0 auto 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  fontWeight: 900,
                  background: 'radial-gradient(circle, rgba(242,201,76,0.3), rgba(242,201,76,0.08))',
                  border: '2px solid var(--gold)',
                  color: 'var(--gold)',
                }}
              >
                {secondsLeft}s
              </div>
              <h3 style={{ margin: '0 0 8px', color: '#f7d97e', fontSize: 18, fontWeight: 900 }}>
                ⚠️ Game Operator Offline &gt; 1 Minute!
              </h3>
              <p className="sub" style={{ margin: '0 0 14px', lineHeight: 1.5, fontSize: 13, color: '#e2e8f0' }}>
                The Game Operator has been disconnected for more than 1 minute. Volunteer now to take over the <b>Game Operator</b> role!
                {isRoundActive
                  ? ' Since a round is currently active, whoever accepts first will become Game Operator starting next round.'
                  : ' Whoever accepts first will immediately become the Game Operator.'}
              </p>
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: 11.5,
                  color: 'var(--mut)',
                  marginBottom: 16,
                }}
              >
                ⏱ If no one volunteers within <b>{secondsLeft}s</b>, the system will automatically select a player and put them in the Game Operator queue.
              </div>

              {!gameState.isGameOperator ? (
                <button
                  type="button"
                  className="pri"
                  onClick={onVolunteerGo}
                  style={{ width: '100%', padding: '12px 18px', fontSize: 14, fontWeight: 900 }}
                >
                  🙋 Volunteer to Become Game Operator
                </button>
              ) : (
                <button
                  type="button"
                  className="gold"
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
    </>
  );
}


