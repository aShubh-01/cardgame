'use client';

import React from 'react';
import { Player, Round, COL, esc, money } from '@/types/game';

interface TeenPattiTableProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  onPickWinner?: (id: string) => void;
  onOpenAddMoney: (id: string) => void;
}

export default function TeenPattiTable({
  players,
  round,
  balanceMode,
  onPickWinner,
  onOpenAddMoney,
}: TeenPattiTableProps) {
  const n = players.length;
  const isBalMode = !!balanceMode;

  const potTotal = round
    ? Object.values(round.contrib || {}).reduce((a, b) => a + b, 0)
    : 0;

  const activePlayers = round
    ? round.parts.filter(id => !round.folded[id])
    : [];

  const ch = '<b></b>'.repeat(Math.min(7, 1 + Math.floor(potTotal / 150)));

  return (
    <div id="table" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="rail">
        <div className="felt">
          <div className="center">
            {round && round.phase === 'bet' && round.stake > 0 && (
              <div className="last">
                LAST BET <b>{money(round.stake)}</b> <small>{round.lastBy}</small>
              </div>
            )}

            <div className="plabel">
              {round ? `POT · ${activePlayers.length} IN PLAY` : 'PLACE YOUR BETS'}
            </div>

            <div className="pot" id="potn">
              {money(potTotal)}
            </div>

            <div className="chips" dangerouslySetInnerHTML={{ __html: ch }} />

            {round && round.phase !== 'ante' && (
              <div className="cards deal">
                <i></i><i></i><i></i>
              </div>
            )}
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
        const win = round && round.phase === 'result' && round.winner === pl.id;
        const isPickable = round && round.phase === 'result' && inR && !f;
        const isBusted = isBalMode && (pl.balance || 0) <= 0;

        let sa = '';
        if (round) {
          sa = !inR ? (isBusted ? 'Busted · Paused' : 'Sat out') : f ? 'FOLDED' : money(round.contrib[pl.id] || 0);
        } else {
          sa = isBusted ? '💥 Busted (₹0) · Paused' : pl.sit ? 'Sitting out' : 'Ready';
        }

        const col = COL[i % COL.length];

        return (
          <div
            key={pl.id}
            className={`seat ${turn ? 'turn' : ''} ${f || (round && !inR) || (!round && pl.sit) || (isBusted && !inR) ? 'fold' : ''} ${isBusted && !inR ? 'busted' : ''} ${win ? 'win' : ''} ${isPickable ? 'pick' : ''}`}
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
                  background: (round.playerStatus?.[pl.id] || 'blind') === 'blind' ? '#0284c7' : '#d97706',
                  color: '#fff',
                  border: `1.5px solid ${(round.playerStatus?.[pl.id] || 'blind') === 'blind' ? '#38bdf8' : '#fcd34d'}`,
                  borderRadius: 10,
                  padding: '1px 5px',
                  fontSize: 9.5,
                  fontWeight: 900,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  zIndex: 6,
                }}
                title={(round.playerStatus?.[pl.id] || 'blind') === 'blind' ? 'Playing Blind' : 'Playing Seen'}
              >
                {(round.playerStatus?.[pl.id] || 'blind') === 'blind' ? '🙈 BLIND' : '👁 SEEN'}
              </span>
            )}

            {turn && <div className="tg">▼ PLAYING NOW</div>}
            {isBusted && !inR && (
              <div className="tg" style={{ background: '#ef4444', color: '#fff', borderColor: '#fca5a5' }}>
                💥 BUSTED
              </div>
            )}
            {win && <div className="crown">👑</div>}

            <div className="av" style={{ background: col }}>
              {esc((pl.name[0] || '?').toUpperCase())}
            </div>
            <div className="sn">{pl.name}</div>
            <div className={`sa ${isBusted ? 'neg' : ''}`}>{sa}</div>

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

