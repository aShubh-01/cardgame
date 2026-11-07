'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Player, Round, money } from '@/types/game';

interface FlyingChip {
  id: string;
  fromX: number; // -1 to 1
  fromY: number; // -1 to 1
  toX: number;   // -1 to 1
  toY: number;   // -1 to 1
  amount: number;
  color: string;
  label: string;
}

interface TableChipTransfersProps {
  round: Round | null;
  players: Player[];
  seatMap: Record<string, { x: number; y: number }>;
  tableRotationDeg?: number;
  onSpinTable?: () => void;
}

const CHIP_PALETTE = [
  '#dc2626', // Crimson Red
  '#2563eb', // Royal Blue
  '#059669', // Emerald Green
  '#d97706', // Casino Gold
  '#7c3aed', // Imperial Purple
];

export default function TableChipTransfers({
  round,
  players,
  seatMap,
  tableRotationDeg = 0,
  onSpinTable,
}: TableChipTransfersProps) {
  const [flyingChips, setFlyingChips] = useState<FlyingChip[]>([]);
  const prevContribRef = useRef<Record<string, number>>({});
  const prevRoundNoRef = useRef<number | null>(null);
  const prevWinnerKeyRef = useRef<string>('');

  // Detect real-time bet/ante increases per player -> animate chip flying from seat to center pot
  useEffect(() => {
    if (!round) {
      prevContribRef.current = {};
      prevRoundNoRef.current = null;
      prevWinnerKeyRef.current = '';
      return;
    }

    const isNewRound = prevRoundNoRef.current !== round.no;
    prevRoundNoRef.current = round.no;

    const currentContrib = round.contrib || {};
    const prevContrib = isNewRound ? {} : prevContribRef.current;
    const newChips: FlyingChip[] = [];

    Object.entries(currentContrib).forEach(([pid, amt], idx) => {
      if (pid === '__pot_seed__') return;
      const prevAmt = prevContrib[pid] || 0;
      const delta = (amt || 0) - prevAmt;
      const coords = seatMap[pid];
      if (delta > 0 && coords) {
        const pName = players.find(p => p.id === pid)?.name || '';
        newChips.push({
          id: `bet_${round.no}_${pid}_${amt}_${Date.now()}_${idx}`,
          fromX: coords.x,
          fromY: coords.y,
          toX: 0,
          toY: 0,
          amount: delta,
          color: CHIP_PALETTE[idx % CHIP_PALETTE.length],
          label: `${pName ? pName.split(' ')[0] + ' ' : ''}+${money(delta)}`,
        });
      }
    });

    prevContribRef.current = { ...currentContrib };

    if (newChips.length > 0) {
      setFlyingChips(prev => [...prev, ...newChips]);
      const timer = setTimeout(() => {
        setFlyingChips(prev => prev.filter(c => !newChips.some(nc => nc.id === c.id)));
      }, 1150);
      return () => clearTimeout(timer);
    }
  }, [round?.no, JSON.stringify(round?.contrib), JSON.stringify(seatMap)]);

  // Detect winner settlement -> animate pot chips flying from center pot to winner seat(s)
  useEffect(() => {
    if (!round || round.phase !== 'result') return;
    const winnerIds =
      round.winners && round.winners.length > 0
        ? round.winners
        : round.winner
          ? [round.winner]
          : [];
    const winKey = `${round.no}_${winnerIds.join(',')}`;
    if (!winnerIds.length || prevWinnerKeyRef.current === winKey) return;
    prevWinnerKeyRef.current = winKey;

    const totalPot = Object.values(round.contrib || {}).reduce((a, b) => a + (b || 0), 0);
    const winChips: FlyingChip[] = [];

    winnerIds.forEach((wid, idx) => {
      const coords = seatMap[wid];
      if (!coords) return;
      const share = Math.max(10, Math.round(totalPot / winnerIds.length));
      winChips.push({
        id: `win_${round.no}_${wid}_${Date.now()}_${idx}`,
        fromX: 0,
        fromY: 0,
        toX: coords.x,
        toY: coords.y,
        amount: share,
        color: '#f59e0b',
        label: `🏆 +${money(share)}`,
      });
    });

    if (winChips.length > 0) {
      setFlyingChips(prev => [...prev, ...winChips]);
      const timer = setTimeout(() => {
        setFlyingChips(prev => prev.filter(c => !winChips.some(wc => wc.id === c.id)));
      }, 1350);
      return () => clearTimeout(timer);
    }
  }, [round?.no, round?.phase, round?.winner, JSON.stringify(round?.winners), JSON.stringify(seatMap)]);

  return (
    <>

      {/* Flying Chips Layer */}
      {flyingChips.map((chip, i) => {
        const startLeft = `calc(50% + (50% - var(--sx)) * ${chip.fromX.toFixed(3)})`;
        const startTop = `calc(50% + (50% - var(--sy)) * ${chip.fromY.toFixed(3)})`;
        const endLeft = `calc(50% + (50% - var(--sx)) * ${chip.toX.toFixed(3)})`;
        const endTop = `calc(50% + (50% - var(--sy)) * ${chip.toY.toFixed(3)})`;

        return (
          <div
            key={chip.id}
            className="flying-chip-transfer"
            style={
              {
                '--start-left': startLeft,
                '--start-top': startTop,
                '--end-left': endLeft,
                '--end-top': endTop,
                '--chip-color': chip.color,
                animationDelay: `${i * 0.09}s`,
              } as React.CSSProperties
            }
          >
            <div className="flying-chip-disc">
              <span>₹</span>
            </div>
            <span className="flying-chip-lbl">{chip.label}</span>
          </div>
        );
      })}
    </>
  );
}
