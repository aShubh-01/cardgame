'use client';

import React, { useState } from 'react';
import { Player, Round, COL, esc, money } from '@/types/game';
import { RummyConfig, DEFAULT_RUMMY_CONFIG } from '@/lib/rummyEngine';
import PlayingCard from '@/components/common/PlayingCard';
import TableChipTransfers from '@/components/common/TableChipTransfers';

interface RummyTableProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  sessionMode?: 'tracker' | 'online';
  pointValue: number;
  rummyConfig?: RummyConfig;
  cumulativePoints: Record<string, number>;
  myPlayerId?: string | null;
  isHost?: boolean;
  onRummyDraw?: (source: 'closed' | 'open') => void;
  onOpenAddMoney: (id: string) => void;
  onOpenConfigModal?: () => void;
}

export default function RummyTable({
  players,
  round,
  balanceMode,
  sessionMode = 'tracker',
  pointValue,
  rummyConfig = DEFAULT_RUMMY_CONFIG,
  cumulativePoints,
  myPlayerId,
  isHost = true,
  onRummyDraw,
  onOpenAddMoney,
  onOpenConfigModal,
}: RummyTableProps) {
  const n = players.length;
  const isBalMode = !!balanceMode;
  const isOnline = sessionMode === 'online';
  const myIdx = myPlayerId ? players.findIndex(p => p.id === myPlayerId) : -1;
  const [spinSteps, setSpinSteps] = useState(0);

  const isMyDrawTurn = Boolean(
    isOnline &&
    round &&
    !round.winner &&
    round.turn === myPlayerId &&
    round.rummyStep === 'draw'
  );

  const spinRad = (spinSteps * Math.PI) / 2;
  const seatMap: Record<string, { x: number; y: number }> = {};
  players.forEach((pl, i) => {
    const relativeIdx = myIdx !== -1 ? (i - myIdx + n) % n : i;
    const a = Math.PI / 2 + (relativeIdx * 2 * Math.PI) / (n || 1) + spinRad;
    seatMap[pl.id] = { x: Math.cos(a), y: Math.sin(a) };
  });

  const turnIdx = round?.turn ? players.findIndex(p => p.id === round.turn) : 0;
  const wheelAngleDeg = spinSteps * 90 + (turnIdx >= 0 ? (turnIdx * 360) / Math.max(1, n) : 0);

  return (
    <div id="table" className="camera-hover-stage">
      <TableChipTransfers
        round={round}
        players={players}
        seatMap={seatMap}
        tableRotationDeg={spinSteps * 90}
        onSpinTable={() => setSpinSteps(s => s + 1)}
      />
      {/* Table Rail & Felt */}
      <div className="rail" style={{ background: 'linear-gradient(150deg, #1b4332, #081c15 50%, #2d6a4f)' }}>
        <div
          className="felt"
          style={{
            background: 'repeating-radial-gradient(rgba(255,255,255,0.03) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 35%, #2d6a4f, #1b4332 55%, #081c15 100%)',
          }}
        >
          <div
            className="felt-spin-wheel"
            style={{ transform: `rotate(${wheelAngleDeg}deg)` }}
            aria-hidden="true"
          />
          <div className="center">
            <div className="plabel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>{round ? `DEAL #${round.no} IN PROGRESS` : 'INDIAN POINTS RUMMY'}</span>
              <span
                style={{
                  background: 'rgba(52,211,153,0.25)',
                  border: '1px solid #34d399',
                  color: '#6ee7b7',
                  borderRadius: 99,
                  padding: '1px 8px',
                  fontSize: 10,
                  fontWeight: 900,
                  cursor: onOpenConfigModal && isHost ? 'pointer' : 'default',
                }}
                onClick={isHost ? onOpenConfigModal : undefined}
                title="Hand size & meld rules"
              >
                🎴 {rummyConfig.totalCards} Cards Hand
              </span>
            </div>

            <div className="pot" style={{ fontSize: 'clamp(22px, 3.8cqw, 36px)', color: 'var(--gold)' }}>
              ₹{pointValue} <span style={{ fontSize: 14, opacity: 0.8 }}>/ point</span>
            </div>

            {/* Online Virtual Deck Zone: Closed Stock, Wild Joker, Open Discard Pile */}
            {round && (round.openCard || round.jokerCard || round.deckRemaining !== undefined) ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 18,
                  marginTop: 8,
                  padding: '8px 16px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  borderRadius: 14,
                  border: '1px solid rgba(110, 231, 183, 0.3)',
                }}
              >
                {/* Closed Stock Deck */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                  onClick={() => {
                    if (isMyDrawTurn && onRummyDraw) onRummyDraw('closed');
                  }}
                >
                  <PlayingCard
                    faceDown
                    size="sm"
                    backTheme="emerald"
                    title={isMyDrawTurn ? 'Click to Draw from Closed Stock' : 'Closed Stock Deck'}
                  />
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: isMyDrawTurn ? '#34d399' : '#a7f3d0' }}>
                    {isMyDrawTurn ? '⬇ Draw Stock' : `Stock (${round.deckRemaining ?? 0})`}
                  </span>
                </div>

                {/* Wild Joker */}
                {round.jokerCard && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <PlayingCard
                      card={round.jokerCard}
                      size="sm"
                      isJoker
                      title={`Wild Joker: All ${round.jokerCard.rank}s are Wild Jokers`}
                    />
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: '#fde047' }}>
                      ★ Joker ({round.jokerCard.rank})
                    </span>
                  </div>
                )}

                {/* Open Discard Pile */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                  onClick={() => {
                    if (isMyDrawTurn && round.openCard && onRummyDraw) onRummyDraw('open');
                  }}
                >
                  {round.openCard ? (
                    <PlayingCard
                      card={round.openCard}
                      size="sm"
                      title={isMyDrawTurn ? `Click to Pick ${round.openCard.rank}${round.openCard.suit} from Open Pile` : `Open Discard: ${round.openCard.rank}${round.openCard.suit}`}
                    />
                  ) : (
                    <div
                      style={{
                        width: 38,
                        height: 54,
                        borderRadius: 6,
                        border: '1.5px dashed rgba(255,255,255,0.3)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.5)',
                      }}
                    >
                      Empty
                    </div>
                  )}
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: isMyDrawTurn ? '#34d399' : '#a7f3d0' }}>
                    {isMyDrawTurn ? '⬇ Pick Open' : 'Open Pile'}
                  </span>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 5,
                  flexWrap: 'wrap',
                  maxWidth: 380,
                  margin: '6px auto 0',
                }}
              >
                {rummyConfig.requirements?.map((req, i) => (
                  <span
                    key={req.id || i}
                    style={{
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid rgba(110,231,183,0.35)',
                      borderRadius: 6,
                      padding: '2px 7px',
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: '#6ee7b7',
                    }}
                  >
                    {req.type === 'pure_seq' ? 'Pure Seq' : req.type === 'any_seq' ? 'Seq' : 'Set'} ({req.cardsCount})
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seats */}
      {players.map((pl, i) => {
        const coords = seatMap[pl.id] || { x: 0, y: 1 };
        const x = coords.x.toFixed(3);
        const y = coords.y.toFixed(3);

        const inR = round && round.parts.includes(pl.id);
        const turn = round && !round.winner && round.turn === pl.id;
        const win = round && round.winner === pl.id;
        const isBusted = isBalMode && (pl.balance || 0) <= 0;
        const totalPts = cumulativePoints[pl.id] || 0;
        const isSpectator = round && !inR && !pl.sit && !isBusted;
        const isRoundActive = Boolean(round && !round.settled && round.phase !== 'result');
        const canShowChipBtn = !isRoundActive && isBalMode && (!isOnline || isHost || pl.id === myPlayerId);

        const col = COL[i % COL.length];

        return (
          <div
            key={pl.id}
            className={`seat ${turn ? 'turn' : ''} ${win ? 'win' : ''} ${isSpectator ? 'spectating' : ''} ${!inR && round && !isSpectator ? 'fold' : ''} ${isBusted && !inR ? 'busted' : ''}`}
            data-seat={pl.id}
            style={{
              left: `calc(50% + (50% - var(--sx)) * ${x})`,
              top: `calc(50% + (50% - var(--sy)) * ${y})`,
            }}
          >
            {turn && <div className="tg">▼ PLAYING NOW</div>}
            {win && <div className="crown">👑</div>}

            {isSpectator ? (
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  background: 'rgba(56, 189, 248, 0.9)',
                  color: '#0f172a',
                  border: '1.5px solid #38bdf8',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: 9.5,
                  fontWeight: 900,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  zIndex: 6,
                }}
              >
                ⏳ SPECTATING
              </span>
            ) : (
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  background: '#064e3b',
                  color: '#6ee7b7',
                  border: '1.5px solid #10b981',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: 9.5,
                  fontWeight: 900,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  zIndex: 6,
                }}
                title={`Total Penalty Points: ${totalPts}`}
              >
                {totalPts} pts
              </span>
            )}

            <div className="av" style={{ background: col, position: 'relative' }}>
              {esc((pl.name[0] || '?').toUpperCase())}
              {pl.id === myPlayerId && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: -5,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#38bdf8',
                    color: '#0f172a',
                    borderRadius: 6,
                    padding: '0 4px',
                    fontSize: 8,
                    fontWeight: 900,
                    zIndex: 5,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  }}
                >
                  YOU
                </span>
              )}
            </div>
            <div className="sn">{pl.name}</div>
            <div className="sa" style={{ fontSize: 11, color: 'var(--mut)' }}>
              {round ? (win ? 'DECLARED SHOW!' : inR ? 'Playing' : 'Sitting out') : pl.sit ? 'Sitting out' : 'Ready'}
            </div>

            {/* Virtual Rummy Cards Count */}
            {round?.hands?.[pl.id] && inR && (
              <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 4 }}>
                {Array.isArray(round.hands[pl.id]) ? (
                  <span style={{ fontSize: 10, background: 'rgba(5, 150, 105, 0.25)', color: '#34d399', border: '1px solid #059669', borderRadius: 4, padding: '1px 5px', fontWeight: 800 }}>
                    🎴 {round.hands[pl.id].length} cards
                  </span>
                ) : (
                  <span style={{ fontSize: 10, background: 'rgba(15, 23, 42, 0.6)', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, padding: '1px 5px', fontWeight: 800 }}>
                    🎴 {(round.hands[pl.id] as any).count || rummyConfig.totalCards} cards
                  </span>
                )}
              </div>
            )}

            {isBalMode && (
              <div className="bal-row">
                <span className={`bal ${isBusted ? 'neg' : ''}`}>
                  💰 {money(pl.balance || 0)}
                </span>
                {canShowChipBtn && (
                  <button
                    type="button"
                    className="rebuy-btn"
                    title={isOnline && !isHost ? 'Request Chips' : 'Add / Adjust Chips'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAddMoney(pl.id);
                    }}
                  >
                    +₹
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
