'use client';

import React, { useState } from 'react';
import { Player, Round, COL, esc, money } from '@/types/game';
import PlayingCard from '@/components/common/PlayingCard';
import TableChipTransfers from '@/components/common/TableChipTransfers';
import { evaluateBlackjackHand } from '@/lib/cardGamesEngine';

interface BlackjackTableProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  dealerPlayerId: string | 'house';
  myPlayerId?: string | null;
  sessionMode?: 'tracker' | 'online';
  isHost?: boolean;
  onOpenAddMoney: (id: string) => void;
}

export default function BlackjackTable({
  players,
  round,
  balanceMode,
  dealerPlayerId,
  myPlayerId,
  sessionMode = 'tracker',
  isHost = true,
  onOpenAddMoney,
}: BlackjackTableProps) {
  const isBalMode = !!balanceMode;
  const isOnline = sessionMode === 'online';
  const dealerPlayer = players.find(p => p.id === dealerPlayerId);

  // Non-dealer players around the table
  const tablePlayers = players.filter(p => p.id !== dealerPlayerId && !p.isGameOperator);
  const n = tablePlayers.length;
  const [spinSteps, setSpinSteps] = useState(0);

  const dealerVisibleCards = Array.isArray(round?.dealerHand)
    ? round.dealerHand.filter((c: any) => !c.masked)
    : [];
  const dealerEval = dealerVisibleCards.length > 0 ? evaluateBlackjackHand(dealerVisibleCards) : null;

  const spinRad = (spinSteps * Math.PI) / 6;
  const seatMap: Record<string, { x: number; y: number }> = {};
  tablePlayers.forEach((pl, i) => {
    const a = Math.PI / 6 + (i * (2 * Math.PI / 3)) / (n > 1 ? n - 1 : 1) + spinRad;
    seatMap[pl.id] = { x: Math.cos(a), y: Math.sin(a) };
  });

  const turnIdx = round?.turn ? tablePlayers.findIndex(p => p.id === round.turn) : 0;
  const wheelAngleDeg = spinSteps * 60 + (turnIdx >= 0 ? (turnIdx * 360) / Math.max(1, n) : 0);

  return (
    <div id="table" className="camera-hover-stage">
      <TableChipTransfers
        round={round}
        players={players}
        seatMap={seatMap}
        tableRotationDeg={spinSteps * 60}
        onSpinTable={() => setSpinSteps(s => s + 1)}
      />
      {/* Table Rail & Felt */}
      <div className="rail" style={{ background: 'linear-gradient(150deg, #1e1b4b, #0f172a 50%, #312e81)' }}>
        {/* Dealer Position Top of Board */}
        <div
          style={{
            position: 'absolute',
            top: '-16px',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(15,23,42,0.95)',
              border: '2px solid var(--gold)',
              borderRadius: 24,
              padding: '4px 16px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.85)',
            }}
          >
            <span style={{ fontSize: 16 }}>🏦</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Dealer
              </div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                {dealerPlayer ? dealerPlayer.name : 'Casino House'}
              </div>
            </div>
            {dealerPlayer && isBalMode && (
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6ee7b7', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: 8 }}>
                {money(dealerPlayer.balance || 0)}
              </div>
            )}
          </div>

          {/* Dealer Virtual Cards */}
          {Array.isArray(round?.dealerHand) && round.dealerHand.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                {round.dealerHand.map((c: any, idx: number) => (
                  <PlayingCard
                    key={idx}
                    card={c.masked ? null : c}
                    faceDown={!!c.masked}
                    size="sm"
                  />
                ))}
              </div>
              {dealerEval && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    background: dealerEval.isBusted
                      ? 'rgba(239,68,68,0.9)'
                      : dealerEval.isBlackjack
                      ? 'rgba(244,195,79,0.95)'
                      : 'rgba(15,23,42,0.9)',
                    color: dealerEval.isBlackjack ? '#0f172a' : '#fff',
                    border: '1px solid rgba(255,255,255,0.25)',
                    borderRadius: 10,
                    padding: '2px 8px',
                  }}
                >
                  {round?.dealerHoleRevealed || round?.phase === 'result'
                    ? `Dealer: ${dealerEval.label}`
                    : `Showing: ${dealerEval.total}`}
                </span>
              )}
            </div>
          )}
        </div>

        <div
          className="felt"
          style={{
            background: 'repeating-radial-gradient(rgba(255,255,255,0.03) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 25%, #312e81, #1e1b4b 60%, #0f172a 100%)',
          }}
        >
          <div
            className="felt-spin-wheel"
            style={{ transform: `rotate(${wheelAngleDeg}deg)` }}
            aria-hidden="true"
          />
          {/* Table Center Inscription */}
          <div className="center" style={{ top: '58%' }}>
            <div className="plabel">
              {round ? `HAND #${round.no} IN PROGRESS` : 'BLACKJACK · 21'}
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)', letterSpacing: 1, margin: '6px 0 2px', textTransform: 'uppercase' }}>
              BLACKJACK PAYS 3 TO 2
            </div>

            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 }}>
              Dealer must draw to 16 and stand on all 17s · Insurance pays 2 to 1
            </div>
          </div>
        </div>
      </div>

      {/* Player Seats Semicircle */}
      {tablePlayers.map((pl, i) => {
        const coords = seatMap[pl.id] || { x: 0, y: 1 };
        const x = coords.x.toFixed(3);
        const y = coords.y.toFixed(3);
        const dealFromShoe = {
          dx: `${Math.round(-coords.x * 165)}px`,
          dy: `${Math.round(-coords.y * 155)}px`,
        };

        const inR = round && round.parts.includes(pl.id);
        const isTurn = round && round.phase === 'hand' && round.turn === pl.id;
        const isBusted = isBalMode && (pl.balance || 0) <= 0;
        const isSpectator = round && !inR && !pl.sit && !isBusted;
        const col = COL[players.findIndex(p => p.id === pl.id) % COL.length];
        const isRoundActive = Boolean(round && !round.settled && round.phase !== 'result');
        const canModifyChips = !isRoundActive && (!isOnline || isHost || pl.id === myPlayerId);

        const pHand = round?.hands?.[pl.id];
        const pEval = Array.isArray(pHand) && pHand.length > 0 ? evaluateBlackjackHand(pHand) : null;
        const pStatus = round?.bjStatus?.[pl.id];
        const pOutcome = round?.bjOutcomes?.[pl.id];

        return (
          <div
            key={pl.id}
            className={`seat ${isTurn ? 'turn' : ''} ${isSpectator ? 'spectating' : ''} ${!inR && round && !isSpectator ? 'fold' : ''} ${isBusted && !inR ? 'busted' : ''}`}
            data-seat={pl.id}
            style={{
              left: `calc(50% + (50% - var(--sx)) * ${x})`,
              top: `calc(52% + (48% - var(--sy)) * ${y})`,
            }}
          >
            {isTurn && <div className="tg">▼ YOUR TURN</div>}
            {isSpectator && (
              <div className="tg" style={{ background: 'rgba(56, 189, 248, 0.9)', color: '#0f172a', borderColor: '#38bdf8', fontWeight: 800 }}>
                ⏳ SPECTATING
              </div>
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
              {round
                ? inR
                  ? round.contrib?.[pl.id]
                    ? `Bet: ${money(round.contrib[pl.id])}`
                    : 'In Hand'
                  : 'Sitting out'
                : pl.sit
                ? 'Sitting out'
                : 'Betting Box'}
            </div>

            {/* Virtual Blackjack Cards */}
            {pHand && inR && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: 4 }}>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                  {Array.isArray(pHand) ? (
                    pHand.map((c: any, ci: number) => (
                      <PlayingCard
                        key={ci}
                        card={c}
                        size="sm"
                        dealDelay={i * 0.15 + ci * 0.12}
                        dealFrom={dealFromShoe}
                      />
                    ))
                  ) : (
                    Array.from({ length: (pHand as any).count || 2 }).map((_, ci) => (
                      <PlayingCard
                        key={ci}
                        faceDown
                        size="sm"
                        dealDelay={i * 0.15 + ci * 0.12}
                        dealFrom={dealFromShoe}
                      />
                    ))
                  )}
                </div>
                {pEval && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      color: pEval.isBusted
                        ? '#fca5a5'
                        : pEval.isBlackjack
                        ? 'var(--gold)'
                        : '#6ee7b7',
                      background: 'rgba(15,23,42,0.9)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 6,
                      padding: '1px 6px',
                    }}
                  >
                    {pEval.label}
                    {pStatus === 'stood' && !pEval.isBlackjack ? ' · STAND' : ''}
                    {pStatus === 'doubled' ? ' · 2× DBL' : ''}
                    {pOutcome?.outcome ? ` · ${pOutcome.outcome.toUpperCase()}` : ''}
                  </span>
                )}
              </div>
            )}

            {isBalMode && (
              <div className="bal-row">
                <span className={`bal ${isBusted ? 'neg' : ''}`}>
                  💰 {money(pl.balance || 0)}
                </span>
                {canModifyChips && (
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
