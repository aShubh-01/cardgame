'use client';

import React from 'react';
import { PokerCard } from '@/types/game';

interface PlayingCardProps {
  card?: PokerCard | null;
  faceDown?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  isJoker?: boolean;
  backTheme?: 'blue' | 'red' | 'emerald' | 'indigo';
  dealDelay?: number;
  dealFrom?: { dx: string; dy: string };
  onClick?: () => void;
  title?: string;
}

export default function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  selected = false,
  isJoker = false,
  backTheme = 'blue',
  dealDelay = 0,
  dealFrom,
  onClick,
  title,
}: PlayingCardProps) {
  const dims = {
    xs: { w: 38, h: 54, rankFs: 12, suitFs: 16, pad: '3px 4px', br: 6 },
    sm: { w: 48, h: 68, rankFs: 14, suitFs: 20, pad: '4px 5px', br: 7 },
    md: { w: 62, h: 88, rankFs: 17, suitFs: 26, pad: '5px 7px', br: 9 },
    lg: { w: 74, h: 104, rankFs: 20, suitFs: 32, pad: '6px 8px', br: 11 },
  }[size];

  const backGradients = {
    blue: 'repeating-linear-gradient(45deg, #1e3a8a 0 4px, #172554 4px 8px)',
    red: 'repeating-linear-gradient(45deg, #991b1b 0 4px, #450a0a 4px 8px)',
    emerald: 'repeating-linear-gradient(45deg, #065f46 0 4px, #022c22 4px 8px)',
    indigo: 'repeating-linear-gradient(45deg, #3730a3 0 4px, #1e1b4b 4px 8px)',
  };

  const isHidden = faceDown || !card || (card as any).hidden || card.rank === '?';
  const animVars = {
    '--deal-dx': dealFrom?.dx || '0px',
    '--deal-dy': dealFrom?.dy || '-90px',
    animationDelay: `${dealDelay.toFixed(2)}s`,
  } as React.CSSProperties;

  if (isHidden) {
    return (
      <div
        onClick={onClick}
        title={title || 'Face-down Card'}
        className="player-card-anim"
        style={{
          ...animVars,
          width: dims.w,
          height: dims.h,
          borderRadius: dims.br,
          background: backGradients[backTheme],
          border: '2px solid rgba(255, 255, 255, 0.9)',
          boxShadow: '0 6px 14px rgba(0, 0, 0, 0.72), inset 0 0 8px rgba(255, 255, 255, 0.25)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          cursor: onClick ? 'pointer' : 'default',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '78%',
            height: '82%',
            border: '1.5px dashed rgba(244, 195, 79, 0.55)',
            borderRadius: Math.max(3, dims.br - 2),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: dims.rankFs + 2,
            color: 'rgba(255, 243, 176, 0.85)',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}
        >
          ♠
        </div>
      </div>
    );
  }

  const isRed = card.red || card.suit === '♥' || card.suit === '♦';
  const inkColor = isRed ? '#dc2626' : '#0f172a';

  return (
    <div
      onClick={onClick}
      title={title || `${card.rank}${card.suit}${isJoker ? ' (Wild Joker)' : ''}`}
      className="card-flip-anim"
      style={{
        ...animVars,
        width: dims.w,
        height: dims.h,
        borderRadius: dims.br,
        background: isJoker
          ? 'linear-gradient(155deg, #fef9c3, #fde047)'
          : 'linear-gradient(160deg, #ffffff, #f8fafc 65%, #e2e8f0)',
        border: selected
          ? '2.5px solid #38bdf8'
          : isJoker
          ? '2px solid #eab308'
          : '1.5px solid #cbd5e1',
        boxShadow: selected
          ? '0 10px 22px rgba(56, 189, 248, 0.6), 0 0 0 2px rgba(56, 189, 248, 0.4)'
          : '0 6px 14px rgba(0, 0, 0, 0.65), inset 0 1px 0 #ffffff',
        transform: selected ? 'translateY(-9px) scale(1.06)' : 'none',
        transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease',
        padding: dims.pad,
        display: 'inline-flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        color: inkColor,
        flexShrink: 0,
      }}
    >
      {/* Top-left rank & suit */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 0.95 }}>
        <span style={{ fontSize: dims.rankFs, fontWeight: 900, letterSpacing: -0.5 }}>{card.rank}</span>
        <span style={{ fontSize: Math.max(9, dims.rankFs - 3), fontWeight: 800 }}>{card.suit}</span>
      </div>

      {/* Center pip */}
      <div
        style={{
          position: 'absolute',
          top: '54%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: dims.suitFs,
          lineHeight: 1,
          opacity: 0.94,
          filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))',
        }}
      >
        {card.suit}
      </div>

      {/* Bottom-right inverted rank */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          lineHeight: 0.95,
          transform: 'rotate(180deg)',
        }}
      >
        <span style={{ fontSize: Math.max(10, dims.rankFs - 2), fontWeight: 900 }}>{card.rank}</span>
      </div>

      {isJoker && (
        <span
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            background: '#ca8a04',
            color: '#fff',
            fontSize: 9,
            fontWeight: 900,
            padding: '1px 5px',
            borderRadius: 5,
            boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
          }}
        >
          ★
        </span>
      )}
    </div>
  );
}
