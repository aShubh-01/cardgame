'use client';

import React, { useState, useEffect } from 'react';
import { Player, Round, PokerCard, money } from '@/types/game';
import {
  RummyConfig,
  RUMMY_PRESETS,
  DEFAULT_RUMMY_CONFIG,
  RUMMY_DROPS,
  formatConfigSummary,
} from '@/lib/rummyEngine';
import { sortRummyHand } from '@/lib/cardGamesEngine';
import PlayingCard from '@/components/common/PlayingCard';

interface RummyControlsProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  defaultBuyIn?: number;
  pointValue: number;
  rummyConfig: RummyConfig;
  cumulativePoints: Record<string, number>;
  sessionMode?: 'tracker' | 'online';
  myPlayerId?: string | null;
  isHost?: boolean;
  readyPlayers?: Record<string, boolean>;
  onToggleReady?: () => void;
  onSitToggle?: (id: string) => void;
  onOpenAddMoney?: (id: string) => void;
  onSetPointValue: (val: number) => void;
  onSetDefaultBuyIn: (amt: number) => void;
  onResetAllBalances: () => void;
  onUpdateConfig: (config: RummyConfig) => void;
  onOpenConfigModal: () => void;
  onStartDeal: () => void;
  onRummyDraw?: (source: 'closed' | 'open') => void;
  onRummyDiscard?: (cardIndex: number) => void;
  onRummyDeclare?: (cardIndex?: number) => void;
  onSettleDeal: (winnerId: string, playerPoints: Record<string, number>) => void;
  onAbortDeal: () => void;
}

export default function RummyControls({
  players,
  round,
  balanceMode,
  defaultBuyIn = 1000,
  pointValue,
  rummyConfig = DEFAULT_RUMMY_CONFIG,
  sessionMode = 'tracker',
  myPlayerId,
  isHost = true,
  readyPlayers = {},
  onToggleReady,
  onSitToggle,
  onOpenAddMoney,
  onSetPointValue,
  onSetDefaultBuyIn,
  onResetAllBalances,
  onUpdateConfig,
  onOpenConfigModal,
  onStartDeal,
  onRummyDraw,
  onRummyDiscard,
  onRummyDeclare,
  onSettleDeal,
  onAbortDeal,
}: RummyControlsProps) {
  const isBalMode = !!balanceMode;
  const isOnline = sessionMode === 'online';
  const seated = players.filter(p => !p.sit && !p.isGameOperator && (!isOnline || p.isConnected !== false));

  const [selectedWinnerId, setSelectedWinnerId] = useState<string>('');
  const [pointsInput, setPointsInput] = useState<Record<string, number>>({});
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);
  const [localSortedHand, setLocalSortedHand] = useState<PokerCard[] | null>(null);
  const [buyInStr, setBuyInStr] = useState<string>(String(defaultBuyIn));
  const [pointValueStr, setPointValueStr] = useState<string>(String(pointValue));

  useEffect(() => {
    setBuyInStr(String(defaultBuyIn));
  }, [defaultBuyIn]);

  useEffect(() => {
    setPointValueStr(String(pointValue));
  }, [pointValue]);

  const myReady = myPlayerId ? Boolean(readyPlayers[myPlayerId]) : false;
  const readyCount = seated.filter(p => readyPlayers[p.id]).length;
  const allSeatedReady = !isOnline || seated.length === 0 || seated.every(p => readyPlayers[p.id]);

  const renderOnlineReadyAndRequests = () => {
    if (!isOnline) return null;
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
          <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            👍 Players Ready ({readyCount}/{seated.length})
          </span>
          <span style={{ fontSize: 11, color: allSeatedReady ? '#4ade80' : '#fde68a', fontWeight: 800 }}>
            {allSeatedReady ? '✓ All Ready to Deal' : '⏳ Waiting for Thumbs Up'}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: myPlayerId ? 10 : 0 }}>
          {allTablePlayers.map(p => {
            const isDisconnected = p.isConnected === false;
            const isSitting = Boolean(p.sit);
            const rdy = Boolean(readyPlayers[p.id]);

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
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontWeight: 800,
                  background: bg,
                  border: `1px solid ${border}`,
                  color,
                }}
              >
                {statusLabel}{statusText}
              </span>
            );
          })}
        </div>

        {myPlayerId && !isHost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isMeSitting ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#fde68a', textAlign: 'center', background: 'rgba(251, 191, 36, 0.12)', padding: '6px 10px', borderRadius: 8 }}>
                  ⏸ You are skipping the next deal (sitting out).
                </div>
                {onSitToggle && (
                  <button
                    type="button"
                    className="pri"
                    style={{ width: '100%', padding: '9px 12px', fontWeight: 900, fontSize: 13 }}
                    onClick={() => onSitToggle(myPlayerId)}
                  >
                    ▶️ Rejoin Next Deal
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {onToggleReady && (
                    <button
                      type="button"
                      className={myReady ? 'good' : 'gold'}
                      style={{ flex: 1, padding: '9px 12px', fontWeight: 900, fontSize: 13 }}
                      onClick={() => onToggleReady()}
                    >
                      {myReady ? '👍 Ready! (Click to Unready)' : '👍 Ready for Next Deal'}
                    </button>
                  )}
                  {isBalMode && onOpenAddMoney && (
                    <button
                      type="button"
                      className="sm"
                      style={{ padding: '9px 12px', fontWeight: 800, fontSize: 12.5 }}
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
                    ⏸ Skip Next Deal / Sit Out
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const dealPlayers = round
    ? players.filter(p => round.parts.includes(p.id))
    : seated;

  const activeWinnerId = round?.winner || selectedWinnerId || (dealPlayers[0]?.id || '');

  const maxPts = rummyConfig.maxPoints || RUMMY_DROPS.MAX_POINTS;
  const firstDropPts = rummyConfig.firstDropPoints !== undefined ? rummyConfig.firstDropPoints : RUMMY_DROPS.FIRST_DROP;
  const midDropPts = rummyConfig.middleDropPoints !== undefined ? rummyConfig.middleDropPoints : RUMMY_DROPS.MIDDLE_DROP;

  // Reset local sort when server hand changes
  const rawMyHand: PokerCard[] | null =
    round && myPlayerId && Array.isArray(round.hands?.[myPlayerId])
      ? round.hands[myPlayerId]
      : null;

  useEffect(() => {
    setLocalSortedHand(null);
    setSelectedCardIdx(null);
  }, [rawMyHand?.length, round?.turn, round?.rummyStep]);

  const totalPenaltyPoints = dealPlayers.reduce((sum, p) => {
    if (p.id === activeWinnerId) return sum;
    const pts = Math.min(maxPts, Math.max(0, pointsInput[p.id] || 0));
    return sum + pts;
  }, 0);

  const totalPot = Math.round(totalPenaltyPoints * pointValue);

  const handleSetQuickDrop = (playerId: string, pts: number) => {
    setPointsInput(prev => ({ ...prev, [playerId]: pts }));
  };

  const handleConfirmSettle = () => {
    if (!activeWinnerId || !isHost) return;
    onSettleDeal(activeWinnerId, pointsInput);
    setPointsInput({});
    setSelectedWinnerId('');
  };

  /* ───────── Case 1: Pre-deal Setup ───────── */
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
            <span className="pill" style={{ fontSize: 10.5, opacity: 0.75 }}>{isOnline ? '🌐 Online' : '📋 Tracker'}</span>
          </div>

          {isHost && isBalMode && (
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

          {/* Cards & Melds Rules Configuration Card */}
          <div
            style={{
              background: 'linear-gradient(145deg, rgba(5,150,105,0.18), rgba(6,78,59,0.3))',
              border: '1.5px solid #10b981',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', color: '#6ee7b7', letterSpacing: 0.5 }}>
                  🎴 Hand Size &amp; Rules
                </span>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', marginTop: 1 }}>
                  {rummyConfig.totalCards} Cards Hand
                </div>
              </div>
              {isHost && (
                <button
                  type="button"
                  className="sm"
                  style={{
                    background: 'rgba(16,185,129,0.25)',
                    borderColor: '#10b981',
                    color: '#6ee7b7',
                    fontWeight: 800,
                    fontSize: 11,
                    padding: '3px 8px',
                  }}
                  onClick={onOpenConfigModal}
                >
                  ⚙️ Configure...
                </button>
              )}
            </div>

            {isHost && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                {(['9_cards', '7_cards', '13_cards', '10_cards'] as const).map(key => {
                  const preset = RUMMY_PRESETS[key];
                  const active = rummyConfig.totalCards === preset.totalCards;
                  return (
                    <button
                      key={key}
                      type="button"
                      className="sm"
                      style={{
                        fontSize: 10.5,
                        padding: '2px 7px',
                        fontWeight: active ? 800 : 500,
                        background: active ? '#10b981' : 'rgba(0,0,0,0.3)',
                        color: active ? '#022c22' : 'inherit',
                      }}
                      onClick={() => onUpdateConfig(preset)}
                    >
                      {preset.totalCards} Cards
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {renderOnlineReadyAndRequests()}

          {isHost ? (
            <>
              <h2>Deal Configuration</h2>
              <div className="row" style={{ margin: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="mut">Point Value:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="1"
                    value={pointValueStr}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                      setPointValueStr(cleaned);
                      const v = parseFloat(cleaned);
                      if (!isNaN(v) && v >= 0.1) onSetPointValue(v);
                    }}
                    style={{ width: 90, textAlign: 'center', fontSize: 16, fontWeight: 800 }}
                  />
                </div>
              </div>

              <div className="q" style={{ marginBottom: 14 }}>
                {[1, 2, 5, 10, 25].map(val => (
                  <button
                    key={val}
                    className="sm"
                    onClick={() => {
                      setPointValueStr(String(val));
                      onSetPointValue(val);
                    }}
                  >
                    ₹{val}/pt
                  </button>
                ))}
              </div>

              <button
                className="pri big"
                disabled={seated.length < 2 || !allSeatedReady || (parseFloat(pointValueStr) || 0) < 0.1}
                style={{
                  background: 'linear-gradient(#34d399, #059669)',
                  borderColor: '#6ee7b7',
                  color: '#022c22',
                  fontWeight: 800,
                }}
                onClick={() => {
                  setSelectedWinnerId(seated[0]?.id || '');
                  onStartDeal();
                }}
              >
                🎴 {isOnline && !allSeatedReady
                  ? `Waiting for Players to Ready (${readyCount}/${seated.length})`
                  : `Deal ${rummyConfig.totalCards} Cards (${seated.length} Players)`}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '14px 10px', background: 'rgba(52, 211, 153, 0.08)', border: '1px dashed rgba(52, 211, 153, 0.35)', borderRadius: 10, color: '#a7f3d0', fontSize: 13 }}>
              ⏳ {myReady ? 'Ready! Waiting for Game Operator to deal cards...' : `Press 👍 Ready above when ready for ${rummyConfig.totalCards}-card Rummy deal.`}
            </div>
          )}
        </div>
      </aside>
    );
  }

  /* ───────── Case 2: Active Online Virtual Card Hand Dock + Scoring ───────── */
  const turnPlayer = players.find(p => p.id === round.turn);
  const isMyTurn = Boolean(myPlayerId && round.turn === myPlayerId);
  const displayHand = localSortedHand || rawMyHand;
  const jokerRank = round.jokerCard?.rank;

  return (
    <aside id="right">
      {/* Virtual Hand Card Dock for Online Players */}
      {rawMyHand && (
        <div className="card slide" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div>
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
                🃏 Your Rummy Hand ({rawMyHand.length} Cards)
              </h2>
              <div className="mut" style={{ fontSize: 12, marginTop: 2 }}>
                {round.winner
                  ? `🏆 ${players.find(p => p.id === round.winner)?.name} declared Show!`
                  : isMyTurn
                  ? round.rummyStep === 'draw'
                    ? '🟢 Your Turn · Step 1: Draw a card from Closed Stock or Open Pile'
                    : '🟢 Your Turn · Step 2: Select a card below to Discard or Declare Show'
                  : `⏳ Waiting for ${turnPlayer?.name || 'Player'} (${round.rummyStep === 'draw' ? 'drawing' : 'discarding'})...`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="sm"
                onClick={() => setLocalSortedHand(sortRummyHand(rawMyHand, 'suit'))}
              >
                ♠♥ Sort by Suit
              </button>
              <button
                type="button"
                className="sm"
                onClick={() => setLocalSortedHand(sortRummyHand(rawMyHand, 'rank'))}
              >
                2-A Sort by Rank
              </button>
            </div>
          </div>

          {/* Cards Row */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              justifyContent: 'center',
              padding: '12px 10px',
              background: 'rgba(0, 0, 0, 0.35)',
              borderRadius: 12,
              border: '1px solid rgba(52, 211, 153, 0.25)',
            }}
          >
            {displayHand?.map((card, idx) => {
              // Map back to original index in rawMyHand for discarding
              const rawIdx = rawMyHand.findIndex(
                (rc, rci) => rc.rank === card.rank && rc.suit === card.suit && rci >= 0
              );
              const effectiveIdx = localSortedHand ? rawIdx : idx;
              const isSel = selectedCardIdx === effectiveIdx;
              const isJoker = Boolean(jokerRank && card.rank === jokerRank);

              return (
                <PlayingCard
                  key={`${card.rank}-${card.suit}-${idx}`}
                  card={card}
                  size="md"
                  selected={isSel}
                  isJoker={isJoker}
                  onClick={() => setSelectedCardIdx(isSel ? null : effectiveIdx)}
                />
              );
            })}
          </div>

          {/* Online Turn Actions */}
          {!round.winner && isMyTurn && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {round.rummyStep === 'draw' ? (
                <>
                  <button
                    type="button"
                    className="pri grow"
                    onClick={() => onRummyDraw?.('closed')}
                  >
                    📥 Draw from Closed Stock ({round.deckRemaining ?? 0})
                  </button>
                  <button
                    type="button"
                    className="grow"
                    disabled={!round.openCard}
                    onClick={() => onRummyDraw?.('open')}
                  >
                    🃏 Pick Open Card ({round.openCard ? `${round.openCard.rank}${round.openCard.suit}` : 'Empty'})
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="pri grow"
                    disabled={selectedCardIdx === null}
                    onClick={() => {
                      if (selectedCardIdx !== null && onRummyDiscard) {
                        onRummyDiscard(selectedCardIdx);
                        setSelectedCardIdx(null);
                      }
                    }}
                  >
                    {selectedCardIdx !== null && rawMyHand[selectedCardIdx]
                      ? `📤 Discard ${rawMyHand[selectedCardIdx].rank}${rawMyHand[selectedCardIdx].suit}`
                      : '👆 Tap a Card Above to Discard'}
                  </button>
                  <button
                    type="button"
                    className="gold"
                    disabled={selectedCardIdx === null}
                    onClick={() => {
                      if (selectedCardIdx !== null && onRummyDeclare) {
                        onRummyDeclare(selectedCardIdx);
                        setSelectedCardIdx(null);
                      }
                    }}
                  >
                    🏆 Declare Show!
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* System-Verified Online Rummy Results OR Offline Admin Deal Scoring */}
      {isOnline ? (
        round.settled || round.winner ? (
          <div className="card slide">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>🏆 Deal #{round.no} Results</h2>
              <span className="pill" style={{ fontSize: 11, fontWeight: 900, color: '#4ade80' }}>
                ✓ System Settled · ₹{pointValue}/pt
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {dealPlayers.map(p => {
                const isWinner = p.id === round.winner;
                const pts = isWinner ? 0 : (round.rummyScores?.[p.id] ?? 0);
                const amt = Math.round(pts * pointValue);
                const totalWon = Object.entries(round.rummyScores || {}).reduce(
                  (acc, [id, sc]) => (id === round.winner ? acc : acc + Math.round((sc || 0) * pointValue)),
                  0
                );

                return (
                  <div
                    key={p.id}
                    style={{
                      background: isWinner ? 'rgba(94, 234, 212, 0.12)' : 'rgba(0,0,0,0.35)',
                      border: `1.5px solid ${isWinner ? '#5eead4' : 'var(--line)'}`,
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <b style={{ color: isWinner ? '#5eead4' : undefined }}>
                        {isWinner ? '👑 ' : ''}{p.name}{isWinner ? ' (SHOW WINNER)' : ''}
                      </b>
                      <div className="mut" style={{ fontSize: 11 }}>
                        {isWinner ? '0 penalty points' : `${pts} deadwood points`}
                      </div>
                    </div>
                    <b className={isWinner ? 'pos' : 'neg'} style={{ fontSize: 15 }}>
                      {isWinner ? `+${money(totalWon)}` : `-${money(amt)}`}
                    </b>
                  </div>
                );
              })}
            </div>

            {renderOnlineReadyAndRequests()}

            {isHost ? (
              <button
                className="pri big"
                disabled={!allSeatedReady}
                style={{
                  background: 'linear-gradient(#34d399, #059669)',
                  borderColor: '#6ee7b7',
                  color: '#022c22',
                  fontWeight: 800,
                }}
                onClick={onStartDeal}
              >
                🎴 {isOnline && !allSeatedReady ? `Waiting for Players to Ready (${readyCount}/${seated.length})` : 'Deal Next Hand'}
              </button>
            ) : (
              <div style={{ textAlign: 'center', padding: '10px', color: '#6ee7b7', fontSize: 12.5 }}>
                ⏳ {myReady ? 'Ready! Waiting for Game Operator to deal next hand...' : 'Press 👍 Ready above so Game Operator can deal the next hand.'}
              </div>
            )}
          </div>
        ) : null
      ) : isHost ? (
        <div className="card slide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>Deal #{round.no} Scoring &amp; Control</h2>
            <span className="pill" style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)' }}>
              ₹{pointValue}/pt
            </span>
          </div>

          <p className="mut" style={{ fontSize: 12, margin: '0 0 10px' }}>
            Select the winner who declared show (0 pts), then enter penalty points (max {maxPts}) for other players.
          </p>

          <label style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--gold)', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
            👑 Winner (0 Pts):
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {dealPlayers.map(p => {
              const isWinner = p.id === activeWinnerId;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={isWinner ? 'pri' : ''}
                  style={{
                    fontSize: 12,
                    padding: '5px 10px',
                    borderRadius: 8,
                    fontWeight: 700,
                  }}
                  onClick={() => setSelectedWinnerId(p.id)}
                >
                  {isWinner ? '👑 ' : ''}{p.name}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {dealPlayers.map(p => {
              const isWinner = p.id === activeWinnerId;
              if (isWinner) {
                return (
                  <div
                    key={p.id}
                    style={{
                      background: 'rgba(94, 234, 212, 0.1)',
                      border: '1.5px solid #5eead4',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <b style={{ color: '#5eead4' }}>👑 {p.name} (WINNER)</b>
                      <div className="mut" style={{ fontSize: 11 }}>0 penalty points</div>
                    </div>
                    <b className="pos" style={{ fontSize: 16 }}>+{money(totalPot)}</b>
                  </div>
                );
              }

              const pts = pointsInput[p.id] !== undefined ? pointsInput[p.id] : 0;
              const lossAmt = Math.round(pts * pointValue);

              return (
                <div
                  key={p.id}
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    padding: '8px 12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <b>{p.name}</b>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        min="0"
                        max={maxPts}
                        value={pts}
                        onChange={(e) => {
                          const v = Math.min(maxPts, Math.max(0, +e.target.value || 0));
                          setPointsInput(prev => ({ ...prev, [p.id]: v }));
                        }}
                        style={{ width: 65, textAlign: 'center', fontSize: 15, fontWeight: 800 }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--mut)' }}>pts</span>
                      <b className="neg" style={{ fontSize: 14, minWidth: 60, textAlign: 'right' }}>
                        -{money(lossAmt)}
                      </b>
                    </div>
                  </div>

                  <div className="q" style={{ margin: 0 }}>
                    <button type="button" className="sm" style={{ fontSize: 10.5, padding: '2px 6px' }} onClick={() => handleSetQuickDrop(p.id, firstDropPts)}>
                      1st Drop ({firstDropPts})
                    </button>
                    <button type="button" className="sm" style={{ fontSize: 10.5, padding: '2px 6px' }} onClick={() => handleSetQuickDrop(p.id, midDropPts)}>
                      Mid Drop ({midDropPts})
                    </button>
                    <button type="button" className="sm" style={{ fontSize: 10.5, padding: '2px 6px' }} onClick={() => handleSetQuickDrop(p.id, maxPts)}>
                      Full ({maxPts})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="pri grow"
              style={{
                flex: 2,
                background: 'linear-gradient(#34d399, #059669)',
                borderColor: '#6ee7b7',
                color: '#022c22',
                fontWeight: 800,
              }}
              disabled={!activeWinnerId}
              onClick={handleConfirmSettle}
            >
              💰 Settle Deal #{round.no}
            </button>
            <button className="bad" style={{ flex: 1 }} onClick={onAbortDeal}>
              Abort
            </button>
          </div>
        </div>
      ) : null}

      {/* Round Action Ledger (Shown to everyone) */}
      <div className="card">
        <h2>{isHost ? '⚙ Deal Control & Ledger' : '📜 Deal Action Ledger'}</h2>
        {isOnline && isHost && !round.settled && (
          <div className="row" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button className="grow bad" style={{ flex: 1 }} onClick={onAbortDeal}>
              Abort deal
            </button>
          </div>
        )}
        {(round.log || [])
          .slice()
          .reverse()
          .slice(0, 6)
          .map((l, i) => (
            <div className="li mut" key={i} style={{ fontSize: 12 }}>
              {l}
            </div>
          ))}
      </div>
    </aside>
  );
}
