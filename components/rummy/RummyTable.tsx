'use client';

import React from 'react';
import { Player, Round, COL, esc, money } from '@/types/game';
import { RummyConfig, DEFAULT_RUMMY_CONFIG } from '@/lib/rummyEngine';

interface RummyTableProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  pointValue: number;
  rummyConfig?: RummyConfig;
  cumulativePoints: Record<string, number>;
  onOpenAddMoney: (id: string) => void;
  onOpenConfigModal?: () => void;
}

export default function RummyTable({
  players,
  round,
  balanceMode,
  pointValue,
  rummyConfig = DEFAULT_RUMMY_CONFIG,
  cumulativePoints,
  onOpenAddMoney,
  onOpenConfigModal,
}: RummyTableProps) {
  const n = players.length;
  const isBalMode = !!balanceMode;

  return (
    <div id="table" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Table Rail & Felt */}
      <div className="rail" style={{ background: 'linear-gradient(150deg, #1b4332, #081c15 50%, #2d6a4f)' }}>
        <div
          className="felt"
          style={{
            background: 'repeating-radial-gradient(rgba(255,255,255,0.03) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 35%, #2d6a4f, #1b4332 55%, #081c15 100%)',
          }}
        >
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
                  cursor: onOpenConfigModal ? 'pointer' : 'default',
                }}
                onClick={onOpenConfigModal}
                title="Click to view or edit hand size & meld rules"
              >
                🎴 {rummyConfig.totalCards} Cards Hand
              </span>
            </div>

            <div className="pot" style={{ fontSize: 'clamp(28px, 4.5cqw, 42px)', color: 'var(--gold)' }}>
              ₹{pointValue} <span style={{ fontSize: 16, opacity: 0.8 }}>/ point</span>
            </div>

            {/* Meld Rules Pills on Table Felt */}
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

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
              Cards played in real life · Enter penalty points on deal finish
            </div>
          </div>
        </div>
      </div>

      {/* Seats */}
      {players.map((pl, i) => {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / (n || 1);
        const x = Math.cos(a).toFixed(3);
        const y = Math.sin(a).toFixed(3);

        const inR = round && round.parts.includes(pl.id);
        const isBusted = isBalMode && (pl.balance || 0) <= 0;
        const totalPts = cumulativePoints[pl.id] || 0;

        const col = COL[i % COL.length];

        return (
          <div
            key={pl.id}
            className={`seat ${!inR && round ? 'fold' : ''} ${isBusted && !inR ? 'busted' : ''}`}
            data-seat={pl.id}
            style={{
              left: `calc(50% + (50% - var(--sx)) * ${x})`,
              top: `calc(50% + (50% - var(--sy)) * ${y})`,
            }}
          >
            {/* Cumulative Penalty Points Badge */}
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

            <div className="av" style={{ background: col }}>
              {esc((pl.name[0] || '?').toUpperCase())}
            </div>
            <div className="sn">{pl.name}</div>
            <div className="sa" style={{ fontSize: 11, color: 'var(--mut)' }}>
              {round ? (inR ? 'Playing' : 'Sitting out') : pl.sit ? 'Sitting out' : 'Ready'}
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
