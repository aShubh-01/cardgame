'use client';

import React, { useState } from 'react';
import { Player, Round, COL, esc, money } from '@/types/game';
import { calculatePots } from '@/lib/pokerPot';
import { evaluatePokerHand } from '@/lib/cardGamesEngine';
import PlayingCard from '@/components/common/PlayingCard';
import TableChipTransfers from '@/components/common/TableChipTransfers';

interface PokerTableProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  sessionMode?: 'tracker' | 'online';
  myPlayerId?: string | null;
  isHost?: boolean;
  onPickWinner?: (id: string) => void;
  onOpenAddMoney: (id: string) => void;
}

export default function PokerTable({
  players,
  round,
  balanceMode,
  sessionMode = 'tracker',
  myPlayerId,
  isHost = true,
  onPickWinner,
  onOpenAddMoney,
}: PokerTableProps) {
  const n = players.length;
  const isBalMode = !!balanceMode;
  const isOnline = sessionMode === 'online';
  const myIdx = myPlayerId ? players.findIndex(p => p.id === myPlayerId) : -1;
  const [spinSteps, setSpinSteps] = useState(0);

  const { pots, totalPot } = round
    ? calculatePots(round.contrib || {}, round.folded || {}, round.allIn || {})
    : { pots: [], totalPot: 0 };

  const activePlayers = round
    ? round.parts.filter(id => !round.folded[id])
    : [];

  const spinRad = (spinSteps * Math.PI) / 2;
  const seatMap: Record<string, { x: number; y: number }> = {};
  players.forEach((pl, i) => {
    const relativeIdx = myIdx !== -1 ? (i - myIdx + n) % n : i;
    const a = Math.PI / 2 + (relativeIdx * 2 * Math.PI) / (n || 1) + spinRad;
    seatMap[pl.id] = { x: Math.cos(a), y: Math.sin(a) };
  });

  const turnIdx = round?.turn ? players.findIndex(p => p.id === round.turn) : 0;
  const wheelAngleDeg = spinSteps * 90 + (turnIdx >= 0 ? (turnIdx * 360) / Math.max(1, n) : 0);

  const communityCardsHTML = (rd: Round) => {
    const street = rd.street || 0;
    const rev = rd.phase === 'result' && (rd.board?.length || 0) === 5
      ? 5
      : street === 0
      ? 0
      : street + 2;

    const labels = [
      'Pre-flop · 0 Open Cards',
      'Flop · 3 Open Cards',
      'Turn · 4 Open Cards',
      'River · 5 Open Cards',
    ];

    return (
      <>
        <div className="cc" style={{ gap: 8, marginTop: 8 }}>
          {[0, 1, 2, 3, 4].map(k => {
            const isUp = k < rev;
            const virtualCard = rd.board?.[k];
            if (isOnline || (rd.board && rd.board.length > 0)) {
              return (
                <PlayingCard
                  key={k}
                  card={isUp ? virtualCard : null}
                  faceDown={!isUp || !virtualCard}
                  size="sm"
                  backTheme="blue"
                  title={isUp && virtualCard ? `Board Card #${k + 1}: ${virtualCard.rank}${virtualCard.suit}` : `Board Card #${k + 1} (Face-down)`}
                />
              );
            }
            return (
              <i
                key={k}
                className={isUp ? 'up' : 'down'}
                title={isUp ? `Card #${k + 1} is Open` : `Card #${k + 1} is Closed`}
              >
                {isUp && (
                  <>
                    <span className="cc-tag">OPEN</span>
                    <span className="cc-icon">🎴</span>
                    <span className="cc-num">#{k + 1}</span>
                  </>
                )}
              </i>
            );
          })}
        </div>
        <div className="plabel" style={{ marginTop: 6 }}>{labels[street] || labels[3]}</div>
      </>
    );
  };

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
      <div className="rail">
        <div className="felt">
          <div
            className="felt-spin-wheel"
            style={{ transform: `rotate(${wheelAngleDeg}deg)` }}
            aria-hidden="true"
          />
          <div className="center">
            {round && round.phase === 'bet' && round.stake > 0 && (
              <div className="last">
                LAST BET <b>{money(round.stake)}</b> <small>{round.lastBy}</small>
              </div>
            )}

            <div className="plabel">
              {round
                ? `${pots.length > 1 ? `TOTAL POT (${pots.length} POTS)` : 'POT'} · ${activePlayers.length} IN PLAY`
                : 'PLACE YOUR BETS'}
            </div>

            <div className="pot" id="potn">
              {money(totalPot)}
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

            {round && communityCardsHTML(round)}
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
        const turn = round && round.phase === 'bet' && round.turn === pl.id;
        const isAllIn = inR && round.allIn?.[pl.id];
        const win = round && round.phase === 'result' && (
          round.winner === pl.id || (round.winners || []).includes(pl.id)
        );
        const pkPickable = !isOnline && round && round.phase === 'result' && inR && !f;
        const isBusted = isBalMode && (pl.balance || 0) <= 0;
        const isSpectator = round && !inR && !pl.sit && !isBusted;
        const isDisconnected = isOnline && pl.isConnected === false;

        let sa = '';
        if (round) {
          if (isDisconnected) {
            sa = '🔌 Offline';
          } else if (isSpectator) {
            sa = '⏳ Next hand';
          } else if (!inR) {
            sa = isBusted ? 'Busted · Paused' : 'Sat out';
          } else if (f) {
            sa = 'FOLDED';
          } else if (isAllIn) {
            sa = `ALL-IN (${money(round.contrib[pl.id] || 0)})`;
          } else {
            sa = money(round.contrib[pl.id] || 0);
          }
        } else {
          sa = isDisconnected ? '🔌 Disconnected' : isBusted ? '💥 Busted (₹0) · Paused' : pl.sit ? 'Sitting out' : 'Ready';
        }

        const col = COL[i % COL.length];
        const handData = round?.hands?.[pl.id];
        const isVisibleHand = Array.isArray(handData);
        const liveEval = isVisibleHand && handData.length > 0
          ? round?.handEvaluations?.[pl.id]?.rankName || evaluatePokerHand([...handData, ...(round?.board || [])]).rankName
          : null;

        const isRoundActive = Boolean(round && !round.settled && round.phase !== 'result');
        const canShowChipBtn = !isRoundActive && isBalMode && (!isOnline || isHost || pl.id === myPlayerId);

        return (
          <div
            key={pl.id}
            className={`seat ${turn ? 'turn' : ''} ${isSpectator ? 'spectating' : ''} ${f || (round && !inR && !isSpectator) || (!round && pl.sit) || (isBusted && !inR) ? 'fold' : ''} ${isAllIn ? 'allin' : ''} ${isBusted && !inR ? 'busted' : ''} ${isDisconnected ? 'offline' : ''} ${win ? 'win' : ''} ${pkPickable ? 'pick' : ''}`}
            data-seat={pl.id}
            style={{
              left: `calc(50% + (50% - var(--sx)) * ${x})`,
              top: `calc(50% + (50% - var(--sy)) * ${y})`,
            }}
            onClick={() => {
              if (pkPickable && onPickWinner) onPickWinner(pl.id);
            }}
          >
            {isDisconnected && (
              <div className="tg" style={{ background: '#4b5563', color: '#fff', borderColor: '#9ca3af' }}>
                🔌 OFFLINE
              </div>
            )}
            {round?.dealer === pl.id && (
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  background: '#fff',
                  color: '#000',
                  border: '2px solid #5eead4',
                  borderRadius: '50%',
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 900,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
                  zIndex: 6,
                }}
                title="Dealer Button [D]"
              >
                D
              </span>
            )}

            {isAllIn ? (
              <div className="tg allin-tg">🚨 ALL-IN</div>
            ) : turn ? (
              <div className="tg">▼ PLAYING NOW</div>
            ) : isSpectator ? (
              <div className="tg" style={{ background: 'rgba(56, 189, 248, 0.9)', color: '#0f172a', borderColor: '#38bdf8', fontWeight: 800 }}>
                ⏳ SPECTATING
              </div>
            ) : isBusted && !inR ? (
              <div className="tg" style={{ background: '#ef4444', color: '#fff', borderColor: '#fca5a5' }}>
                💥 BUSTED
              </div>
            ) : null}

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
            <div className={`sa ${isBusted && !isAllIn ? 'neg' : ''}`}>{sa}</div>

            {/* Virtual Hole Cards */}
            {handData && inR && (!f || pl.id === myPlayerId) && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginTop: 4,
                  gap: 2,
                  opacity: f ? 0.65 : 1,
                  filter: f ? 'grayscale(40%)' : 'none',
                }}
              >
                {f && (
                  <span
                    style={{
                      fontSize: 8.5,
                      fontWeight: 800,
                      color: '#f87171',
                      background: 'rgba(239, 68, 68, 0.22)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      padding: '1px 6px',
                      borderRadius: 4,
                      letterSpacing: 0.5,
                    }}
                  >
                    FOLDED
                  </span>
                )}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
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
                    Array.from({ length: (handData as any).count || 2 }).map((_, ci) => (
                      <PlayingCard
                        key={ci}
                        faceDown
                        size="xs"
                        backTheme="blue"
                        dealDelay={i * 0.14 + ci * 0.11}
                        dealFrom={dealFromShoe}
                      />
                    ))
                  )}
                </div>
                {liveEval && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: '#5eead4',
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(94, 234, 212, 0.35)',
                      borderRadius: 4,
                      padding: '1px 5px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {liveEval}
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
