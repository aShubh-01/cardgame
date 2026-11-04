'use client';

import React, { useState } from 'react';
import { Player, Round, COL, esc, money } from '@/types/game';
import { calculatePots } from '@/lib/pokerPot';
import { evaluateTeenPattiHand } from '@/lib/cardGamesEngine';
import PlayingCard from '@/components/common/PlayingCard';
import TableChipTransfers from '@/components/common/TableChipTransfers';

interface TeenPattiTableProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  sessionMode?: 'tracker' | 'online';
  myPlayerId?: string | null;
  isHost?: boolean;
  onSeeCards?: (id: string) => void;
  onPickWinner?: (id: string) => void;
  onOpenAddMoney: (id: string) => void;
}

export default function TeenPattiTable({
  players,
  round,
  balanceMode,
  sessionMode = 'tracker',
  myPlayerId,
  isHost = true,
  onSeeCards,
  onPickWinner,
  onOpenAddMoney,
}: TeenPattiTableProps) {
  const n = players.length;
  const isBalMode = !!balanceMode;
  const isOnline = sessionMode === 'online';
  const myIdx = myPlayerId ? players.findIndex(p => p.id === myPlayerId) : -1;
  const [spinSteps, setSpinSteps] = useState(0);

  const { pots, totalPot: potTotal } = round
    ? calculatePots(round.contrib || {}, round.folded || {})
    : { pots: [], totalPot: 0 };

  const activePlayers = round
    ? round.parts.filter(id => !round.folded[id])
    : [];

  const ch = '<b></b>'.repeat(Math.min(7, 1 + Math.floor(potTotal / 150)));

  // Compute 2D seat coordinates (including 2D table spin offset)
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
      <div className="rail">
        <div className="felt">
          {/* 2D Spinning Casino Rosette Ring */}
          <div
            className="felt-spin-wheel"
            style={{ transform: `rotate(${wheelAngleDeg}deg)` }}
            aria-hidden="true"
          />
          <div className="center">
            {round && round.phase === 'bet' && round.stake > 0 && (
              <div className="last">
                STAKE <b>{money(round.stake)}</b> {round.lastBy && <small>last by {round.lastBy}</small>}
              </div>
            )}

            <div className="plabel">
              {round
                ? `${pots.length > 1 ? `TOTAL POT (${pots.length} POTS)` : 'POT'} · ${activePlayers.length} IN PLAY`
                : 'PLACE YOUR BETS'}
            </div>

            <div className="pot" id="potn">
              {money(potTotal)}
            </div>

            {round && pots.length > 1 && (
              <div className="pot-badges-bar">
                {pots.map((pot, idx) => (
                  <span
                    key={pot.id}
                    className={`pot-badge ${idx === 0 ? 'main' : 'side'}`}
                    title={`${pot.name}: ${money(pot.amount)} · Eligible: ${pot.eligiblePlayerIds.map(id => players.find(p => p.id === id)?.name || id).join(', ')}`}
                  >
                    {pot.name}: <b>{money(pot.amount)}</b>
                  </span>
                ))}
              </div>
            )}

            <div className="chips" dangerouslySetInnerHTML={{ __html: ch }} />

            {round && round.phase !== 'ante' && !isOnline && !round.hands && (
              <div className="cards deal">
                <i></i><i></i><i></i>
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
        const dealFromShoe = {
          dx: `${Math.round(-coords.x * 165)}px`,
          dy: `${Math.round(-coords.y * 125)}px`,
        };

        const inR = round && round.parts.includes(pl.id);
        const f = inR && round.folded[pl.id];
        const isAllIn = inR && !f && round.allIn?.[pl.id];
        const turn = round && round.phase === 'bet' && round.turn === pl.id;
        const win = round && round.phase === 'result' && (
          round.winner === pl.id || (round.winners || []).includes(pl.id)
        );
        const isPickable = !isOnline && round && round.phase === 'result' && inR && !f && isHost;
        const isBusted = isBalMode && (pl.balance || 0) <= 0;
        const isSpectator = round && !inR && !pl.sit && !isBusted;

        let sa = '';
        if (round) {
          sa = isSpectator
            ? '⏳ Next hand'
            : !inR
            ? isBusted
              ? 'Busted · Paused'
              : 'Sat out'
            : f
            ? 'PACKED'
            : isAllIn
            ? `ALL-IN (${money(round.contrib[pl.id] || 0)})`
            : money(round.contrib[pl.id] || 0);
        } else {
          sa = isBusted ? '💥 Busted (₹0) · Paused' : pl.sit ? 'Sitting out' : 'Ready';
        }

        const col = COL[i % COL.length];
        const status = round?.playerStatus?.[pl.id] || 'blind';
        const handData = round?.hands?.[pl.id];
        const isVisibleHand = Array.isArray(handData);
        const handEval = isVisibleHand && handData.length === 3
          ? round?.handEvaluations?.[pl.id]?.rankName || evaluateTeenPattiHand(handData).rankName
          : null;
        const isRoundActive = Boolean(round && !round.settled && round.phase !== 'result');
        const canShowChipBtn = !isRoundActive && isBalMode && (!isOnline || isHost || pl.id === myPlayerId);

        return (
          <div
            key={pl.id}
            className={`seat ${turn ? 'turn' : ''} ${isSpectator ? 'spectating' : ''} ${f || (round && !inR && !isSpectator) || (!round && pl.sit) || (isBusted && !inR) ? 'fold' : ''} ${isAllIn ? 'allin' : ''} ${isBusted && !inR ? 'busted' : ''} ${win ? 'win' : ''} ${isPickable ? 'pick' : ''}`}
            data-seat={pl.id}
            style={{
              left: `calc(50% + (50% - var(--sx)) * ${x})`,
              top: `calc(50% + (50% - var(--sy)) * ${y})`,
            }}
            onClick={() => {
              if (isPickable && onPickWinner) onPickWinner(pl.id);
            }}
          >
            {inR && !f && round.phase === 'bet' && (
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  background: status === 'blind' ? '#0284c7' : '#d97706',
                  color: '#fff',
                  border: `1.5px solid ${status === 'blind' ? '#38bdf8' : '#fcd34d'}`,
                  borderRadius: 10,
                  padding: '1px 5px',
                  fontSize: 9.5,
                  fontWeight: 900,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  zIndex: 6,
                }}
                title={status === 'blind' ? 'Playing Blind' : 'Playing Seen'}
              >
                {status === 'blind' ? '🙈 BLIND' : '👁 SEEN'}
              </span>
            )}

            {isAllIn ? (
              <div className="tg allin-tg">🚨 ALL-IN</div>
            ) : turn ? (
              <div className="tg">▼ PLAYING NOW</div>
            ) : null}
            {isSpectator && (
              <div className="tg" style={{ background: 'rgba(56, 189, 248, 0.9)', color: '#0f172a', borderColor: '#38bdf8', fontWeight: 800 }}>
                ⏳ SPECTATING
              </div>
            )}
            {isBusted && !inR && (
              <div className="tg" style={{ background: '#ef4444', color: '#fff', borderColor: '#fca5a5' }}>
                💥 BUSTED
              </div>
            )}
            {win && <div className="crown">👑</div>}

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
            <div className={`sa ${isBusted ? 'neg' : ''}`}>{sa}</div>

            {/* Virtual 3-Card Hand */}
            {handData && inR && !f && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4, gap: 3 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 3,
                    justifyContent: 'center',
                    cursor: pl.id === myPlayerId && status === 'blind' && round?.phase === 'bet' && onSeeCards ? 'pointer' : 'default',
                  }}
                  title={pl.id === myPlayerId && status === 'blind' && round?.phase === 'bet' ? 'Click to flip & see your 3 cards!' : undefined}
                  onClick={(e) => {
                    if (pl.id === myPlayerId && status === 'blind' && round?.phase === 'bet' && onSeeCards) {
                      e.stopPropagation();
                      onSeeCards(pl.id);
                    }
                  }}
                >
                  {isVisibleHand ? (
                    handData.map((c: any, ci: number) => (
                      <PlayingCard
                        key={ci}
                        card={c}
                        size="xs"
                        dealDelay={i * 0.14 + ci * 0.11}
                        dealFrom={dealFromShoe}
                      />
                    ))
                  ) : (
                    Array.from({ length: (handData as any).count || 3 }).map((_, ci) => (
                      <PlayingCard
                        key={ci}
                        faceDown
                        size="xs"
                        backTheme="red"
                        dealDelay={i * 0.14 + ci * 0.11}
                        dealFrom={dealFromShoe}
                      />
                    ))
                  )}
                </div>
                {handEval && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: 'var(--gold)',
                      background: 'rgba(18, 6, 10, 0.9)',
                      border: '1px solid rgba(244, 195, 79, 0.4)',
                      borderRadius: 4,
                      padding: '1px 5px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {handEval}
                  </span>
                )}
                {pl.id === myPlayerId && status === 'blind' && round?.phase === 'bet' && onSeeCards && (
                  <button
                    type="button"
                    className="sm see-cards-cta"
                    style={{
                      fontSize: 10.5,
                      padding: '3px 9px',
                      marginTop: 2,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeeCards(pl.id);
                    }}
                  >
                    👁 SEE CARDS
                  </button>
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
