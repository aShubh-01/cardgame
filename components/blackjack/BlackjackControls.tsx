'use client';

import React, { useState, useEffect } from 'react';
import { Player, Round, DealerRequest, money } from '@/types/game';
import { BlackjackHandOutcome, BlackjackPlayerInput } from '@/lib/blackjackEngine';
import PlayingCard from '@/components/common/PlayingCard';
import { evaluateBlackjackHand } from '@/lib/cardGamesEngine';

interface BlackjackControlsProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  defaultBuyIn?: number;
  dealerPlayerId: string | 'house';
  nextDealerPlayerId?: string | 'house';
  bjDealerRotation?: boolean;
  dealerRequests?: DealerRequest[];
  sessionMode?: 'tracker' | 'online';
  isHost?: boolean;
  myPlayerId?: string | null;
  readyPlayers?: Record<string, boolean>;
  playerBets?: Record<string, number>;
  onSetPlayerBet?: (betAmount: number, targetPlayerId?: string) => void;
  onToggleReady?: (betAmount?: number) => void;
  onSitToggle?: (id: string) => void;
  onOpenAddMoney?: (id: string) => void;
  onSetDealerPlayerId: (id: string | 'house') => void;
  onSetDealerRotation?: (rotation: boolean) => void;
  onRequestDealer?: () => void;
  onResolveDealerRequest?: (requestId: string, decision: 'approved' | 'rejected') => void;
  onSetDefaultBuyIn: (amt: number) => void;
  onResetAllBalances: () => void;
  onStartHand: (defaultBet: number) => void;
  onBjAction?: (subAction: 'hit' | 'stand' | 'double') => void;
  onSettleHand: (
    dealerHasBlackjack: boolean,
    playersInput: BlackjackPlayerInput[]
  ) => void;
  onAbortHand: () => void;
}

export default function BlackjackControls({
  players,
  round,
  balanceMode,
  defaultBuyIn = 1000,
  dealerPlayerId,
  nextDealerPlayerId,
  bjDealerRotation = false,
  dealerRequests = [],
  sessionMode = 'tracker',
  isHost = true,
  myPlayerId,
  readyPlayers = {},
  playerBets = {},
  onSetPlayerBet,
  onToggleReady,
  onSitToggle,
  onOpenAddMoney,
  onSetDealerPlayerId,
  onSetDealerRotation,
  onRequestDealer,
  onResolveDealerRequest,
  onSetDefaultBuyIn,
  onResetAllBalances,
  onStartHand,
  onBjAction,
  onSettleHand,
  onAbortHand,
}: BlackjackControlsProps) {
  const isBalMode = !!balanceMode;
  const isOnline = sessionMode === 'online';
  const seated = players.filter(p => !p.sit && !p.isGameOperator && (!isOnline || p.isConnected !== false));
  const effectiveNextDealer = nextDealerPlayerId || dealerPlayerId;

  const [dealerHasBj, setDealerHasBj] = useState<boolean>(false);
  const [defaultBetStr, setDefaultBetStr] = useState<string>('50');
  const defaultBet = Math.max(0, Number(defaultBetStr) || 0);
  const [buyInStr, setBuyInStr] = useState<string>(String(defaultBuyIn));

  const myPlayer = players.find(p => p.id === myPlayerId);
  const myChosenWager = (myPlayerId && playerBets?.[myPlayerId]) || 50;
  const [myWagerStr, setMyWagerStr] = useState<string>(String(myChosenWager));

  useEffect(() => {
    if (myPlayerId && playerBets?.[myPlayerId]) {
      setMyWagerStr(String(playerBets[myPlayerId]));
    }
  }, [myPlayerId, playerBets]);

  const handleUpdateWager = (amt: number) => {
    let finalAmt = Math.max(1, Math.floor(amt));
    if (isBalMode && myPlayer && typeof myPlayer.balance === 'number') {
      finalAmt = Math.min(myPlayer.balance, finalAmt);
    }
    setMyWagerStr(String(finalAmt));
    if (onSetPlayerBet && myPlayerId) {
      onSetPlayerBet(finalAmt, myPlayerId);
    }
  };

  useEffect(() => {
    setBuyInStr(String(defaultBuyIn));
  }, [defaultBuyIn]);

  const myReady = myPlayerId ? Boolean(readyPlayers[myPlayerId]) : false;
  const readyCount = seated.filter(p => readyPlayers[p.id]).length;
  const allSeatedReady = !isOnline || seated.length === 0 || seated.every(p => readyPlayers[p.id]);
  const pendingDealerRequests = dealerRequests.filter(r => r.status === 'pending');
  const myPendingDealerReq = myPlayerId
    ? pendingDealerRequests.find(r => r.playerId === myPlayerId)
    : undefined;

  const renderDealerAndRotationControls = () => {
    const nextDealerName =
      effectiveNextDealer === 'house'
        ? '🏛 Casino House'
        : players.find(p => p.id === effectiveNextDealer)?.name || 'Dealer';

    return (
      <div
        style={{
          marginBottom: 12,
          padding: '12px',
          borderRadius: 12,
          background: 'rgba(30, 27, 75, 0.45)',
          border: '1px solid rgba(129, 140, 248, 0.38)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, fontWeight: 900, color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            🏦 Next Hand Dealer: <span style={{ color: 'var(--gold)' }}>{nextDealerName}</span>
          </div>
          <span
            className="pill"
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: bjDealerRotation ? '#4ade80' : '#facc15',
              borderColor: bjDealerRotation ? 'rgba(74,222,128,0.45)' : 'rgba(250,204,21,0.45)',
            }}
          >
            {bjDealerRotation ? '🔁 Rotational Dealer ON' : '📌 Continue Existing Dealer'}
          </span>
        </div>

        {/* GO Controls: Toggle Rotation Mode OR Pick Any Player as Dealer */}
        {(!isOnline || isHost) && (
          <>
            {onSetDealerRotation && (
              <div style={{ marginBottom: 10 }}>
                <div className="mut" style={{ fontSize: 11.5, marginBottom: 5 }}>
                  Dealer Mode after each hand:
                </div>
                <div className="seg" style={{ margin: 0, width: '100%' }}>
                  <button
                    type="button"
                    className={!bjDealerRotation ? 'on' : ''}
                    onClick={() => onSetDealerRotation(false)}
                  >
                    📌 Continue Current Dealer
                  </button>
                  <button
                    type="button"
                    className={bjDealerRotation ? 'on' : ''}
                    onClick={() => onSetDealerRotation(true)}
                  >
                    🔁 Rotate Every Hand
                  </button>
                </div>
              </div>
            )}

            <div>
              <div className="mut" style={{ fontSize: 11.5, marginBottom: 5 }}>
                Assign Dealer for Next Hand:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  className={`sm ${effectiveNextDealer === 'house' ? 'pri' : ''}`}
                  onClick={() => onSetDealerPlayerId('house')}
                >
                  🏛 Casino House
                </button>
                {seated.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`sm ${effectiveNextDealer === p.id ? 'pri' : ''}`}
                    onClick={() => onSetDealerPlayerId(p.id)}
                  >
                    🎩 {p.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Pending Player Dealer Requests (Visible to GO with Approve/Decline) */}
        {isOnline && isHost && pendingDealerRequests.length > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 10,
              background: 'rgba(244, 195, 79, 0.1)',
              border: '1px solid rgba(244, 195, 79, 0.4)',
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--gold)', marginBottom: 6 }}>
              🎩 Player Dealer Requests ({pendingDealerRequests.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendingDealerRequests.map(req => (
                <div
                  key={req.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    background: 'rgba(0,0,0,0.35)',
                    padding: '6px 10px',
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 800 }}>
                    🎩 <b>{req.playerName}</b> wants to be Dealer
                  </span>
                  {onResolveDealerRequest && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="sm good"
                        style={{ padding: '4px 10px', fontSize: 11.5 }}
                        onClick={() => onResolveDealerRequest(req.id, 'approved')}
                      >
                        ✓ Make Dealer
                      </button>
                      <button
                        type="button"
                        className="sm bad"
                        style={{ padding: '4px 10px', fontSize: 11.5 }}
                        onClick={() => onResolveDealerRequest(req.id, 'rejected')}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOnlineReadyAndRequests = () => {
    if (!isOnline) return null;
    const isMeNextDealer = Boolean(myPlayerId && effectiveNextDealer === myPlayerId);
    const allTablePlayers = players.filter(p => !p.isGameOperator);
    const mePlayer = players.find(p => p.id === myPlayerId);
    const isMeSitting = Boolean(mePlayer?.sit);

    return (
      <div
        style={{
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 12,
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(244, 195, 79, 0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            👍 Players Ready ({readyCount}/{seated.length})
          </span>
          <span style={{ fontSize: 11.5, color: allSeatedReady ? '#4ade80' : '#fde68a', fontWeight: 800 }}>
            {allSeatedReady ? '✓ All Ready to Deal' : '⏳ Waiting for Thumbs Up'}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {allTablePlayers.map(p => {
            const isDisconnected = p.isConnected === false;
            const isSitting = Boolean(p.sit);
            const rdy = Boolean(readyPlayers[p.id]);
            const isDlr = p.id === effectiveNextDealer;

            let statusLabel = '⏳ ';
            let statusText = p.name;
            let bg = 'rgba(255,255,255,0.06)';
            let border = 'rgba(255,255,255,0.15)';
            let color = 'var(--mut)';

            if (isDisconnected) {
              statusLabel = '🔌 ';
              statusText = `${p.name} (Offline · Auto-skipped)`;
              border = 'rgba(239, 68, 68, 0.45)';
              color = '#fca5a5';
            } else if (isSitting) {
              statusLabel = '⏸ ';
              statusText = `${p.name} (Skipping / Sitting)`;
              border = 'rgba(251, 191, 36, 0.45)';
              color = '#fde68a';
            } else if (rdy) {
              statusLabel = '👍 ';
              statusText = `${p.name} (Ready)`;
              bg = 'rgba(34, 197, 94, 0.18)';
              border = 'rgba(74, 222, 128, 0.5)';
              color = '#4ade80';
            }

            return (
              <span
                key={p.id}
                style={{
                  fontSize: 11.5,
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontWeight: 800,
                  background: bg,
                  border: `1px solid ${border}`,
                  color,
                }}
              >
                {statusLabel}{statusText}{isDlr ? ' (🏦 Dealer)' : ''}
              </span>
            );
          })}
        </div>

        {/* Player Wagers Overview for Game Operator, Dealer or Spectator */}
        {(isHost || isMeNextDealer || !myPlayerId) && (
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 10,
              padding: '8px 10px',
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 5 }}>
              🪙 Player Wagers for Next Hand
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {players.filter(p => !p.sit && !p.isGameOperator && p.id !== effectiveNextDealer).map(p => {
                const wager = playerBets?.[p.id] || 50;
                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--mut)' }}>{p.name}:</span>
                    <span style={{ fontWeight: 800, color: '#38bdf8' }}>₹{wager}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Individual Player Wager Selector (Before Hand) */}
        {myPlayerId && !isMeSitting && !isMeNextDealer && (
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(244, 195, 79, 0.35)',
              borderRadius: 12,
              padding: '10px 12px',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                🪙 Your Wager for Next Hand
              </span>
              {isBalMode && myPlayer && typeof myPlayer.balance === 'number' && (
                <span style={{ fontSize: 11, color: 'var(--mut)' }}>
                  Stack: <b style={{ color: '#4ade80' }}>₹{myPlayer.balance}</b>
                </span>
              )}
            </div>

            {/* Quick Casino Chips */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              {[20, 50, 100, 250, 500].map(val => {
                const isSelected = Number(myWagerStr) === val;
                const canAfford = !isBalMode || !myPlayer || (myPlayer.balance ?? 0) >= val;
                return (
                  <button
                    key={val}
                    type="button"
                    disabled={!canAfford}
                    onClick={() => handleUpdateWager(val)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: canAfford ? 'pointer' : 'not-allowed',
                      opacity: canAfford ? 1 : 0.4,
                      background: isSelected ? 'var(--gold)' : 'rgba(255,255,255,0.08)',
                      color: isSelected ? '#0f172a' : '#fff',
                      border: isSelected ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.15)',
                      boxShadow: isSelected ? '0 0 8px rgba(245, 158, 11, 0.4)' : 'none',
                    }}
                  >
                    ₹{val}
                  </button>
                );
              })}
              {isBalMode && myPlayer && typeof myPlayer.balance === 'number' && myPlayer.balance > 0 && (
                <button
                  type="button"
                  onClick={() => handleUpdateWager(myPlayer.balance!)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 800,
                    background: Number(myWagerStr) === myPlayer.balance ? '#ef4444' : 'rgba(239, 68, 68, 0.2)',
                    color: '#fff',
                    border: '1px solid #ef4444',
                  }}
                >
                  Max (₹{myPlayer.balance})
                </button>
              )}
            </div>

            {/* Custom Bet Input */}
            <div className="row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: 0 }}>
              <span className="mut" style={{ fontSize: 12 }}>Custom Wager:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>₹</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="50"
                  value={myWagerStr}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9]/g, '');
                    setMyWagerStr(cleaned);
                    const num = Number(cleaned);
                    if (num > 0) {
                      handleUpdateWager(num);
                    }
                  }}
                  style={{ width: 80, textAlign: 'center', fontSize: 14, fontWeight: 800, padding: '4px 6px' }}
                />
              </div>
            </div>
          </div>
        )}

        {myPlayerId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isMeSitting ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#fde68a', textAlign: 'center', background: 'rgba(251, 191, 36, 0.12)', padding: '6px 10px', borderRadius: 8 }}>
                  ⏸ You are skipping the next hand (sitting out).
                </div>
                {onSitToggle && (
                  <button
                    type="button"
                    className="pri"
                    style={{ width: '100%', padding: '9px 12px', fontWeight: 900, fontSize: 13 }}
                    onClick={() => onSitToggle(myPlayerId)}
                  >
                    ▶️ Rejoin Next Hand
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {onToggleReady && (
                    <button
                      type="button"
                      className={myReady ? 'good' : 'gold'}
                      style={{ flex: 1, padding: '10px 12px', fontWeight: 900, fontSize: 13.5 }}
                      onClick={() => onToggleReady(!myReady ? Math.max(10, Number(myWagerStr) || 50) : undefined)}
                    >
                      {myReady ? '👍 Ready! (Click to Unready)' : '👍 Ready for Next Hand'}
                    </button>
                  )}
                  {!myReady && isBalMode && onOpenAddMoney && (
                    <button
                      type="button"
                      className="sm"
                      style={{ padding: '10px 12px', fontWeight: 800, fontSize: 12.5 }}
                      onClick={() => onOpenAddMoney(myPlayerId)}
                    >
                      🪙 Request Chips
                    </button>
                  )}
                </div>
                {onSitToggle && (
                  <button
                    type="button"
                    className="sm mut"
                    style={{
                      width: '100%',
                      padding: '7px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px dashed rgba(255,255,255,0.2)',
                      color: '#cbd5e1',
                    }}
                    onClick={() => onSitToggle(myPlayerId)}
                  >
                    ⏸ Skip Next Hand / Sit Out
                  </button>
                )}
              </div>
            )}

            {/* Between rounds, when NOT ready, player can request GO to make them the Dealer */}
            {isMeNextDealer ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'var(--gold)',
                  textAlign: 'center',
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'rgba(244, 195, 79, 0.12)',
                  border: '1px solid rgba(244, 195, 79, 0.35)',
                }}
              >
                🏦 You are assigned as the Dealer for the next hand!
              </div>
            ) : !myReady && onRequestDealer ? (
              <button
                type="button"
                className="sm"
                disabled={Boolean(myPendingDealerReq)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontWeight: 800,
                  fontSize: 12.5,
                  background: myPendingDealerReq ? 'rgba(129, 140, 248, 0.15)' : 'rgba(129, 140, 248, 0.22)',
                  borderColor: 'rgba(129, 140, 248, 0.5)',
                  color: '#c7d2fe',
                }}
                onClick={onRequestDealer}
              >
                {myPendingDealerReq
                  ? '⏳ Dealer Request Sent to Game Operator...'
                  : '🎩 Request Game Operator to Make Me Dealer'}
              </button>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  // Per-player betting state for active hand
  const [playerInputs, setPlayerInputs] = useState<Record<string, {
    bet1: number;
    outcome1: BlackjackHandOutcome;
    double1: boolean;
    isSplit: boolean;
    bet2: number;
    outcome2: BlackjackHandOutcome;
    double2: boolean;
    insurance: number;
  }>>({});

  const activePlayers = round
    ? players.filter(p => round.parts.includes(p.id) && p.id !== dealerPlayerId)
    : seated.filter(p => p.id !== dealerPlayerId);

  // Sync online auto-outcomes into settlement inputs when round reaches result
  useEffect(() => {
    if (round && isOnline && round.bjOutcomes) {
      const dealerEval = Array.isArray(round.dealerHand)
        ? evaluateBlackjackHand(round.dealerHand.filter((c: any) => !c.masked))
        : null;
      if (dealerEval?.isBlackjack) {
        setDealerHasBj(true);
      }
      const nextInputs: typeof playerInputs = {};
      activePlayers.forEach(p => {
        const autoOutcome = (round.bjOutcomes?.[p.id]?.outcome || 'loss') as BlackjackHandOutcome;
        const isDbl = round.bjStatus?.[p.id] === 'doubled';
        const baseBet = isDbl
          ? Math.round((round.contrib?.[p.id] || round.stake || defaultBet) / 2)
          : (round.contrib?.[p.id] || round.stake || defaultBet);
        nextInputs[p.id] = {
          bet1: baseBet,
          outcome1: autoOutcome,
          double1: isDbl,
          isSplit: false,
          bet2: baseBet,
          outcome2: 'loss',
          double2: false,
          insurance: 0,
        };
      });
      setPlayerInputs(nextInputs);
    }
  }, [round?.no, round?.phase, round?.bjOutcomes, isOnline]);

  const getPlayerState = (id: string) => {
    return playerInputs[id] || {
      bet1: round?.contrib?.[id] || round?.stake || defaultBet,
      outcome1: (round?.bjOutcomes?.[id]?.outcome || 'win') as BlackjackHandOutcome,
      double1: round?.bjStatus?.[id] === 'doubled',
      isSplit: false,
      bet2: defaultBet,
      outcome2: 'loss' as BlackjackHandOutcome,
      double2: false,
      insurance: 0,
    };
  };

  const updatePlayerState = (id: string, patch: Partial<ReturnType<typeof getPlayerState>>) => {
    setPlayerInputs(prev => ({
      ...prev,
      [id]: { ...getPlayerState(id), ...patch },
    }));
  };

  // Live total calculations
  let totalPlayerNet = 0;
  activePlayers.forEach(p => {
    const s = getPlayerState(p.id);
    const eff1 = s.double1 ? s.bet1 * 2 : s.bet1;
    let net1 = 0;
    if (s.outcome1 === 'win') net1 = eff1;
    else if (s.outcome1 === 'loss') net1 = -eff1;
    else if (s.outcome1 === 'blackjack') net1 = Math.round(eff1 * 1.5);
    else if (s.outcome1 === 'surrender') net1 = -Math.round(eff1 / 2);

    let net2 = 0;
    if (s.isSplit) {
      const eff2 = s.double2 ? s.bet2 * 2 : s.bet2;
      if (s.outcome2 === 'win') net2 = eff2;
      else if (s.outcome2 === 'loss') net2 = -eff2;
      else if (s.outcome2 === 'blackjack') net2 = Math.round(eff2 * 1.5);
      else if (s.outcome2 === 'surrender') net2 = -Math.round(eff2 / 2);
    }

    const insNet = s.insurance > 0 ? (dealerHasBj ? s.insurance * 2 : -s.insurance) : 0;
    totalPlayerNet += net1 + net2 + insNet;
  });

  const dealerNet = -totalPlayerNet === 0 ? 0 : -totalPlayerNet;

  const handleConfirmSettle = () => {
    const inputs: BlackjackPlayerInput[] = activePlayers.map(p => {
      const s = getPlayerState(p.id);
      const hands = [{ bet: s.bet1, outcome: s.outcome1, doubleDown: s.double1 }];
      if (s.isSplit) {
        hands.push({ bet: s.bet2, outcome: s.outcome2, doubleDown: s.double2 });
      }
      return {
        playerId: p.id,
        hands,
        insuranceBet: s.insurance,
      };
    });

    onSettleHand(dealerHasBj, inputs);
    setDealerHasBj(false);
  };

  /* ───────── Case 1: Pre-hand Setup ───────── */
  if (!round) {
    return (
      <aside id="right">
        <div className="card slide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Session Bankroll Mode</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: isBalMode ? 'var(--gold)' : '#38bdf8', marginTop: 1 }}>
                {isBalMode ? `🪙 With Balance (Chips · ₹${defaultBuyIn})` : '📜 No Balance (Debt Settlement)'}
              </div>
            </div>
            <span className="pill" style={{ fontSize: 10.5, opacity: 0.75 }}>Session Locked</span>
          </div>

          {isBalMode && (!isOnline || isHost) && (
            <div style={{ marginBottom: 12 }}>
              <div className="row" style={{ margin: '6px 0 8px', alignItems: 'center', justifyContent: 'space-between', display: 'flex' }}>
                <span className="mut" style={{ fontSize: 12 }}>Chips per player:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="1000"
                  value={buyInStr}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9]/g, '');
                    setBuyInStr(cleaned);
                    if (Number(cleaned) >= 10) onSetDefaultBuyIn(Number(cleaned));
                  }}
                  style={{ width: 105, textAlign: 'center' }}
                />
              </div>
              <button
                className="sm"
                disabled={(Number(buyInStr) || 0) < 10}
                style={{
                  width: '100%',
                  background: 'rgba(217,119,6,0.15)',
                  border: '1px solid rgba(217,119,6,0.35)',
                  color: 'var(--gold)',
                  fontWeight: 600,
                }}
                onClick={onResetAllBalances}
              >
                🔄 Reset stacks to ₹{Number(buyInStr) || defaultBuyIn}
              </button>
            </div>
          )}

          <h2>🏦 Table &amp; Dealer Setup</h2>
          {renderDealerAndRotationControls()}

          {(!isOnline || isHost) && (
            <div className="row" style={{ margin: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="mut">{isOnline ? 'Default / Fallback Bet:' : 'Default Bet:'}</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="50"
                value={defaultBetStr}
                onChange={(e) => setDefaultBetStr(e.target.value.replace(/[^0-9]/g, ''))}
                style={{ width: 95, textAlign: 'center', fontSize: 15, fontWeight: 800 }}
              />
            </div>
          )}

          <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 11.5, margin: '12px 0' }}>
            <div>• <b>Win:</b> 1:1 payout · <b>Loss:</b> -1×</div>
            <div>• <b>Blackjack:</b> 3:2 payout (+1.5×) · <b>Push:</b> 0 net</div>
            <div>• <b>Double Down:</b> 2× bet · <b>Insurance:</b> 2:1 payout</div>
          </div>

          {renderOnlineReadyAndRequests()}

          {(!isOnline || isHost) ? (
            <button
              className="pri big"
              disabled={seated.length < 1 || defaultBet < 1 || !allSeatedReady}
              onClick={() => onStartHand(defaultBet)}
            >
              🃏 {isOnline
                ? (!allSeatedReady ? `Waiting for Players to Ready (${readyCount}/${seated.length})` : 'Deal Virtual Blackjack Hand')
                : 'Place Bets & Deal Hand'}
            </button>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(56,189,248,0.08)', border: '1px dashed rgba(56,189,248,0.35)', borderRadius: 10, fontSize: 12.5, color: '#38bdf8', fontWeight: 700 }}>
              ⏳ {myReady ? 'Ready! Waiting for Game Operator to deal Blackjack hand...' : 'Press 👍 Ready above when you are ready for the next hand.'}
            </div>
          )}
        </div>
      </aside>
    );
  }

  /* ───────── Case 2: Online Active Virtual Hand (Hit / Stand / Double) ───────── */
  if (isOnline && round.phase === 'hand') {
    const turnPlayer = players.find(p => p.id === round.turn);
    const isMyTurn = isOnline ? Boolean(myPlayerId && round.turn === myPlayerId) : true;
    const myHand = myPlayerId && Array.isArray(round.hands?.[myPlayerId])
      ? (round.hands[myPlayerId] as any[])
      : [];
    const myEval = myHand.length > 0 ? evaluateBlackjackHand(myHand) : null;

    return (
      <aside id="right">
        <div className="card slide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>🃏 Blackjack Hand #{round.no}</h2>
            <span className="pill" style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8' }}>
              Turn: {turnPlayer?.name || 'Dealer'}
            </span>
          </div>

          {/* Active Player's Cards & Action Dock */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 12,
              padding: '14px',
              marginBottom: 14,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 8 }}>
              {isMyTurn ? (
                <b style={{ color: '#4ade80' }}>🎯 Your Turn to Act ({turnPlayer?.name})</b>
              ) : myPlayerId ? (
                <span>⏳ Waiting for <b>{turnPlayer?.name}</b> to Hit or Stand...</span>
              ) : (
                <span style={{ color: 'var(--gold)', fontWeight: 800 }}>
                  👁 Game Operator / Observer View · Turn: <b>{turnPlayer?.name}</b>
                </span>
              )}
            </div>

            {myHand.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 4 }}>
                  {isMyTurn ? 'Your Cards:' : 'Your Cards (Waiting):'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '6px 0' }}>
                  {myHand.map((c: any, idx: number) => (
                    <PlayingCard key={idx} card={c} size="md" />
                  ))}
                </div>
              </div>
            )}

            {myEval && (
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--gold)', marginBottom: 12 }}>
                Hand Value: {myEval.label}
              </div>
            )}

            {isMyTurn && onBjAction && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="pri"
                  style={{ flex: 1, minWidth: 110, fontWeight: 800 }}
                  onClick={() => onBjAction('hit')}
                >
                  🃏 Hit (Draw Card)
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    minWidth: 110,
                    background: 'linear-gradient(#f59e0b, #d97706)',
                    borderColor: '#fbbf24',
                    color: '#0f172a',
                    fontWeight: 900,
                  }}
                  onClick={() => onBjAction('stand')}
                >
                  ✋ Stand (Hold)
                </button>
                {myHand.length === 2 && (
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      minWidth: 110,
                      background: 'rgba(56,189,248,0.18)',
                      borderColor: '#38bdf8',
                      color: '#38bdf8',
                      fontWeight: 800,
                    }}
                    onClick={() => onBjAction('double')}
                  >
                    2× Double Down
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Round Control & Action Ledger Card */}
        <div className="card">
          <h2>{isHost ? '⚙ Round Control & Ledger' : '📜 Round Action Ledger'}</h2>
          {isHost && (
            <div className="row" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button type="button" className="grow bad" style={{ flex: 1 }} onClick={onAbortHand}>
                Abort Hand
              </button>
            </div>
          )}
          {(round.log || [])
            .slice()
            .reverse()
            .slice(0, 6)
            .map((entry, idx) => (
              <div className="li mut" key={idx} style={{ fontSize: 12 }}>
                {entry}
              </div>
            ))}
        </div>
      </aside>
    );
  }

  /* ───────── Case 3: Settle Hand (Offline or Online Result Phase) ───────── */
  if (isOnline || round.settled) {
    const dealerCards = Array.isArray(round.dealerHand) ? round.dealerHand.filter((c: any) => !c.masked) : [];
    const dealerEv = dealerCards.length > 0 ? evaluateBlackjackHand(dealerCards) : null;

    return (
      <aside id="right">
        <div className="card slide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>🏆 Hand #{round.no} Results</h2>
            <span className="pill" style={{ fontSize: 11, fontWeight: 900, color: '#4ade80' }}>
              ✓ System Settled
            </span>
          </div>

          {dealerEv && (
            <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800 }}>🏦 Dealer Hand:</span>
              <b style={{ color: 'var(--gold)', fontSize: 13.5 }}>{dealerEv.label}</b>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {activePlayers.map(p => {
              const out = round.bjOutcomes?.[p.id];
              const pCards = Array.isArray(round.hands?.[p.id]) ? (round.hands![p.id] as any[]) : [];
              const pEval = pCards.length > 0 ? evaluateBlackjackHand(pCards) : null;
              const net = out?.net ?? 0;

              return (
                <div
                  key={p.id}
                  style={{
                    background: 'rgba(0,0,0,0.35)',
                    border: `1px solid ${net > 0 ? 'rgba(74,222,128,0.45)' : net < 0 ? 'rgba(239,68,68,0.35)' : 'var(--line)'}`,
                    borderRadius: 10,
                    padding: '9px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <b>{p.name}</b>
                    <div className="mut" style={{ fontSize: 11 }}>
                      {pEval ? pEval.label : ''} · {(out?.outcome || 'settled').toUpperCase()}
                    </div>
                  </div>
                  <b className={net > 0 ? 'pos' : net < 0 ? 'neg' : ''} style={{ fontSize: 15 }}>
                    {net > 0 ? `+${money(net)}` : net < 0 ? `-${money(Math.abs(net))}` : 'PUSH (₹0)'}
                  </b>
                </div>
              );
            })}
          </div>

          {renderDealerAndRotationControls()}
          {renderOnlineReadyAndRequests()}

          {isHost ? (
            <button
              className="pri big"
              disabled={!allSeatedReady || defaultBet < 1}
              onClick={() => onStartHand(defaultBet || 100)}
            >
              🃏 {isOnline && !allSeatedReady ? `Waiting for Players to Ready (${readyCount}/${seated.length})` : 'Deal Next Hand'}
            </button>
          ) : (
            <div style={{ textAlign: 'center', padding: '10px', color: '#38bdf8', fontSize: 12.5, fontWeight: 700 }}>
              ⏳ {myReady ? 'Ready! Waiting for Game Operator to deal next hand...' : 'Press 👍 Ready above so Game Operator can deal the next hand.'}
            </div>
          )}
        </div>

        {/* Round Action Ledger */}
        <div className="card">
          <h2>📜 Round Action Ledger</h2>
          {(round.log || [])
            .slice()
            .reverse()
            .slice(0, 6)
            .map((entry, idx) => (
              <div className="li mut" key={idx} style={{ fontSize: 12 }}>
                {entry}
              </div>
            ))}
        </div>
      </aside>
    );
  }

  return (
    <aside id="right">
      <div className="card slide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Hand #{round.no} Results</h2>
          <span className="pill" style={{ fontSize: 11, fontWeight: 800 }}>
            Dealer: {dealerPlayerId === 'house' ? '🏛 House' : players.find(p => p.id === dealerPlayerId)?.name || dealerPlayerId}
          </span>
        </div>

        {/* Dealer Blackjack Toggle */}
        <div
          style={{
            background: dealerHasBj ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.3)',
            border: `1.5px solid ${dealerHasBj ? '#ef4444' : 'var(--line)'}`,
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>
            🚨 Dealer has Natural Blackjack (21)?
          </span>
          <button
            type="button"
            className={dealerHasBj ? 'bad sm' : 'sm'}
            style={{ fontWeight: 800, padding: '4px 12px' }}
            disabled={isOnline && !isHost}
            onClick={() => setDealerHasBj(prev => !prev)}
          >
            {dealerHasBj ? 'YES' : 'NO'}
          </button>
        </div>

        {/* Player Outcomes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {activePlayers.map(p => {
            const s = getPlayerState(p.id);
            const pCards = Array.isArray(round.hands?.[p.id]) ? (round.hands![p.id] as any[]) : [];
            const pEval = pCards.length > 0 ? evaluateBlackjackHand(pCards) : null;

            return (
              <div
                key={p.id}
                style={{
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <b>{p.name}</b>
                    {pEval && (
                      <span className="pill" style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--gold)' }}>
                        {pEval.label}
                      </span>
                    )}
                  </div>
                  {(!isOnline || isHost) && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="sm"
                        style={{ fontSize: 10, padding: '2px 6px', background: s.isSplit ? 'rgba(94,234,212,0.2)' : undefined }}
                        onClick={() => updatePlayerState(p.id, { isSplit: !s.isSplit })}
                      >
                        {s.isSplit ? '✂ Split (2 Hands)' : '+ Split'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Hand 1 */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, minWidth: 46 }}>{s.isSplit ? 'Hand 1:' : 'Bet:'}</span>
                  <input
                    type="number"
                    min="10"
                    step="50"
                    value={s.bet1}
                    disabled={isOnline && !isHost}
                    onChange={(e) => updatePlayerState(p.id, { bet1: Math.max(0, +e.target.value || 0) })}
                    style={{ width: 65, textAlign: 'center', fontSize: 13 }}
                  />

                  <select
                    value={s.outcome1}
                    disabled={isOnline && !isHost}
                    onChange={(e) => updatePlayerState(p.id, { outcome1: e.target.value as BlackjackHandOutcome })}
                    style={{ flex: 1, padding: '4px 6px', fontSize: 12, borderRadius: 6, background: '#07141c', color: '#fff', border: '1px solid var(--line)' }}
                  >
                    <option value="win">Win (1:1)</option>
                    <option value="loss">Loss</option>
                    <option value="push">Push (0)</option>
                    <option value="blackjack">Blackjack (3:2)</option>
                    <option value="surrender">Surrender (-½)</option>
                  </select>

                  <button
                    type="button"
                    className="sm"
                    disabled={isOnline && !isHost}
                    style={{ fontSize: 10.5, padding: '3px 6px', background: s.double1 ? 'rgba(244,195,79,0.25)' : undefined, color: s.double1 ? 'var(--gold)' : undefined }}
                    onClick={() => updatePlayerState(p.id, { double1: !s.double1 })}
                  >
                    2× Dbl
                  </button>
                </div>

                {/* Hand 2 (if split) */}
                {s.isSplit && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, minWidth: 46 }}>Hand 2:</span>
                    <input
                      type="number"
                      min="10"
                      step="50"
                      value={s.bet2}
                      disabled={isOnline && !isHost}
                      onChange={(e) => updatePlayerState(p.id, { bet2: Math.max(0, +e.target.value || 0) })}
                      style={{ width: 65, textAlign: 'center', fontSize: 13 }}
                    />

                    <select
                      value={s.outcome2}
                      disabled={isOnline && !isHost}
                      onChange={(e) => updatePlayerState(p.id, { outcome2: e.target.value as BlackjackHandOutcome })}
                      style={{ flex: 1, padding: '4px 6px', fontSize: 12, borderRadius: 6, background: '#07141c', color: '#fff', border: '1px solid var(--line)' }}
                    >
                      <option value="win">Win (1:1)</option>
                      <option value="loss">Loss</option>
                      <option value="push">Push (0)</option>
                      <option value="blackjack">Blackjack (3:2)</option>
                      <option value="surrender">Surrender (-½)</option>
                    </select>

                    <button
                      type="button"
                      className="sm"
                      disabled={isOnline && !isHost}
                      style={{ fontSize: 10.5, padding: '3px 6px', background: s.double2 ? 'rgba(244,195,79,0.25)' : undefined, color: s.double2 ? 'var(--gold)' : undefined }}
                      onClick={() => updatePlayerState(p.id, { double2: !s.double2 })}
                    >
                      2× Dbl
                    </button>
                  </div>
                )}

                {/* Insurance Option */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11 }}>
                  <span className="mut">Insurance bet:</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={s.insurance}
                    disabled={isOnline && !isHost}
                    onChange={(e) => updatePlayerState(p.id, { insurance: Math.max(0, +e.target.value || 0) })}
                    placeholder="₹0"
                    style={{ width: 65, textAlign: 'center', fontSize: 12 }}
                  />
                  {s.insurance > 0 && (
                    <span style={{ color: dealerHasBj ? '#4ade80' : '#ef4444', fontWeight: 700 }}>
                      {dealerHasBj ? `+${money(s.insurance * 2)} (Won)` : `-${money(s.insurance)} (Lost)`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Dealer Outcome Banner */}
        <div
          style={{
            background: dealerNet >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1.5px solid ${dealerNet >= 0 ? '#22c55e' : '#ef4444'}`,
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <b>🏦 Dealer Net Outcome:</b>
            <div className="mut" style={{ fontSize: 11 }}>
              {dealerPlayerId === 'house' ? 'Casino House balance' : `Player: ${players.find(p => p.id === dealerPlayerId)?.name}`}
            </div>
          </div>
          <b style={{ fontSize: 20, color: dealerNet >= 0 ? '#22c55e' : '#ef4444' }}>
            {dealerNet >= 0 ? '+' : ''}{money(dealerNet)}
          </b>
        </div>

        {(!isOnline || isHost) ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="pri grow"
              style={{ flex: 2 }}
              onClick={handleConfirmSettle}
            >
              💰 Settle Hand #{round.no}
            </button>
            <button className="bad" style={{ flex: 1 }} onClick={onAbortHand}>
              Abort
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '10px', color: '#38bdf8', fontSize: 12, fontWeight: 700 }}>
            ⏳ Waiting for Host to confirm &amp; settle Hand #{round.no}...
          </div>
        )}

        {/* Action Ledger */}
        {round.log && round.log.length > 0 && (
          <div className="log" style={{ marginTop: 12, maxHeight: 110, overflowY: 'auto' }}>
            {round.log.map((entry, idx) => (
              <div key={idx}>{entry}</div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
