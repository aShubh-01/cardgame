'use client';

import React from 'react';
import { Player, Round, COL, STREETS, esc, money } from '@/types/game';
import { calculatePots } from '@/lib/pokerPot';

interface PokerTableProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  onPickWinner?: (id: string) => void;
  onOpenAddMoney: (id: string) => void;
}

export default function PokerTable({
  players,
  round,
  balanceMode,
  onPickWinner,
  onOpenAddMoney,
}: PokerTableProps) {
  const n = players.length;
  const isBalMode = !!balanceMode;

  const { pots, totalPot } = round
    ? calculatePots(round.contrib || {}, round.folded || {})
    : { pots: [], totalPot: 0 };

  const activePlayers = round
    ? round.parts.filter(id => !round.folded[id])
    : [];

  const communityCardsHTML = (rd: Round) => {
    const rev = rd.street !== undefined ? rd.street + 2 : 0;
    const labels = [
      'Pre-flop · 0 Open Cards',
      'Flop · 3 Open Cards (Loop 1)',
      'Turn · 4 Open Cards (Loop 2)',
      'River · 5 Open Cards (Loop 3)',
    ];

    return (
      <>
        <div className="cc">
          {[0, 1, 2, 3, 4].map(k => {
            const isUp = k < rev;
            return (
              <i
                key={k}
                className={isUp ? 'up' : 'down'}
                title={isUp ? `Card #${k + 1} is Open (played IRL)` : `Card #${k + 1} is Closed`}
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
        <div className="plabel">{labels[rd.street || 0]}</div>
      </>
    );
  };

  return (
    <div id="table" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Table Rail & Felt */}
      <div className="rail">
        <div className="felt">
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
        const a = Math.PI / 2 + (i * 2 * Math.PI) / (n || 1);
        const x = Math.cos(a).toFixed(3);
        const y = Math.sin(a).toFixed(3);

        const inR = round && round.parts.includes(pl.id);
        const f = inR && round.folded[pl.id];
        const turn = round && round.phase === 'bet' && round.turn === pl.id;
        const isAllIn = inR && round.allIn?.[pl.id];
        const win = round && round.phase === 'result' && (
          round.winner === pl.id || (round.winners || []).includes(pl.id)
        );
        const pkPickable = round && round.phase === 'result' && inR && !f;
        const isBusted = isBalMode && (pl.balance || 0) <= 0;

        let sa = '';
        if (round) {
          if (!inR) {
            sa = isBusted ? 'Busted · Paused' : 'Sat out';
          } else if (f) {
            sa = 'FOLDED';
          } else if (isAllIn) {
            sa = `ALL-IN (${money(round.contrib[pl.id] || 0)})`;
          } else {
            sa = money(round.contrib[pl.id] || 0);
          }
        } else {
          sa = isBusted ? '💥 Busted (₹0) · Paused' : pl.sit ? 'Sitting out' : 'Ready';
        }

        const col = COL[i % COL.length];

        return (
          <div
            key={pl.id}
            className={`seat ${turn ? 'turn' : ''} ${f || (round && !inR) || (!round && pl.sit) || (isBusted && !inR) ? 'fold' : ''} ${isAllIn ? 'allin' : ''} ${isBusted && !inR ? 'busted' : ''} ${win ? 'win' : ''} ${pkPickable ? 'pick' : ''}`}
            data-seat={pl.id}
            style={{
              left: `calc(50% + (50% - var(--sx)) * ${x})`,
              top: `calc(50% + (50% - var(--sy)) * ${y})`,
            }}
            onClick={() => {
              if (pkPickable && onPickWinner) onPickWinner(pl.id);
            }}
          >
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
            {round?.smallBlind?.playerId === pl.id && (
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  left: -8,
                  background: '#0284c7',
                  color: '#fff',
                  border: '1.5px solid #38bdf8',
                  borderRadius: 10,
                  padding: '1px 5px',
                  fontSize: 9.5,
                  fontWeight: 900,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  zIndex: 6,
                }}
                title={`Small Blind (${money(round.smallBlind.amt)})`}
              >
                SB
              </span>
            )}
            {round?.bigBlind?.playerId === pl.id && (
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  left: -8,
                  background: '#7c3aed',
                  color: '#fff',
                  border: '1.5px solid #a78bfa',
                  borderRadius: 10,
                  padding: '1px 5px',
                  fontSize: 9.5,
                  fontWeight: 900,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  zIndex: 6,
                }}
                title={`Big Blind (${money(round.bigBlind.amt)})`}
              >
                BB
              </span>
            )}

            {isAllIn ? (
              <div className="tg allin-tg">🚨 ALL-IN</div>
            ) : turn ? (
              <div className="tg">▼ PLAYING NOW</div>
            ) : isBusted && !inR ? (
              <div className="tg" style={{ background: '#ef4444', color: '#fff', borderColor: '#fca5a5' }}>
                💥 BUSTED
              </div>
            ) : null}

            {win && <div className="crown">👑</div>}

            <div className="av" style={{ background: col }}>
              {esc((pl.name[0] || '?').toUpperCase())}
            </div>
            <div className="sn">{pl.name}</div>
            <div className={`sa ${isBusted && !isAllIn ? 'neg' : ''}`}>{sa}</div>

            {isBalMode && (
              <div className={`bal ${isBusted ? 'neg' : ''}`}>
                💰 {money(pl.balance || 0)}
              </div>
            )}

            {isBalMode && (
              <button
                type="button"
                className="rebuy-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAddMoney(pl.id);
                }}
              >
                + Add ₹
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

