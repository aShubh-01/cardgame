'use client';

import React from 'react';
import { Player, Round, COL, esc, money } from '@/types/game';

interface BlackjackTableProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  dealerPlayerId: string | 'house';
  onOpenAddMoney: (id: string) => void;
}

export default function BlackjackTable({
  players,
  round,
  balanceMode,
  dealerPlayerId,
  onOpenAddMoney,
}: BlackjackTableProps) {
  const isBalMode = !!balanceMode;
  const dealerPlayer = players.find(p => p.id === dealerPlayerId);

  // Non-dealer players around the table
  const tablePlayers = players.filter(p => p.id !== dealerPlayerId);
  const n = tablePlayers.length;

  return (
    <div id="table" style={{ position: 'relative', width: '100%', height: '100%' }}>
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
        </div>

        <div
          className="felt"
          style={{
            background: 'repeating-radial-gradient(rgba(255,255,255,0.03) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 25%, #312e81, #1e1b4b 60%, #0f172a 100%)',
          }}
        >
          {/* Table Center Inscription */}
          <div className="center" style={{ top: '56%' }}>
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
        // Position along the bottom semicircle arc
        const a = Math.PI / 6 + (i * (2 * Math.PI / 3)) / (n > 1 ? n - 1 : 1);
        const x = Math.cos(a).toFixed(3);
        const y = Math.sin(a).toFixed(3);

        const inR = round && round.parts.includes(pl.id);
        const isBusted = isBalMode && (pl.balance || 0) <= 0;
        const col = COL[players.findIndex(p => p.id === pl.id) % COL.length];

        return (
          <div
            key={pl.id}
            className={`seat ${!inR && round ? 'fold' : ''} ${isBusted && !inR ? 'busted' : ''}`}
            data-seat={pl.id}
            style={{
              left: `calc(50% + (50% - var(--sx)) * ${x})`,
              top: `calc(52% + (48% - var(--sy)) * ${y})`,
            }}
          >
            <div className="av" style={{ background: col }}>
              {esc((pl.name[0] || '?').toUpperCase())}
            </div>
            <div className="sn">{pl.name}</div>
            <div className="sa" style={{ fontSize: 11, color: 'var(--mut)' }}>
              {round ? (inR ? 'In Hand' : 'Sitting out') : pl.sit ? 'Sitting out' : 'Betting Box'}
            </div>

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

