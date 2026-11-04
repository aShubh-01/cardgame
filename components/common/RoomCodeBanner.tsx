'use client';

import React, { useState } from 'react';

interface RoomCodeBannerProps {
  roomCode?: string | null;
  sessionMode?: 'tracker' | 'online';
}

export default function RoomCodeBanner({ roomCode, sessionMode }: RoomCodeBannerProps) {
  const [copied, setCopied] = useState(false);

  if (sessionMode !== 'online' || !roomCode) {
    return null;
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = typeof window !== 'undefined' ? `${window.location.origin}/?join=${roomCode}` : roomCode;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }).catch(() => {
        prompt('Copy room code or invite link:', url);
      });
    } else {
      prompt('Copy room code or invite link:', url);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        background: 'linear-gradient(90deg, rgba(15, 23, 42, 0.95), rgba(30, 58, 138, 0.5), rgba(15, 23, 42, 0.95))',
        border: '1.5px solid rgba(56, 189, 248, 0.45)',
        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.6), inset 0 0 12px rgba(56, 189, 248, 0.1)',
        borderRadius: 10,
        padding: '6px 14px',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          🌐 Online Room Code
        </span>
        <span
          onClick={handleCopy}
          title="Click to copy code"
          style={{
            fontFamily: 'Courier New, monospace',
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: '0.22em',
            color: '#fff',
            background: 'rgba(56, 189, 248, 0.2)',
            border: '1px solid #38bdf8',
            padding: '2px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            userSelect: 'all',
          }}
        >
          {roomCode}
        </span>
        <span className="mut" style={{ fontSize: 11 }}>
          Players can join by entering this code in the Lobby
        </span>
      </div>

      <button
        type="button"
        className="sm"
        onClick={handleCopy}
        style={{
          background: copied ? 'rgba(34, 197, 94, 0.25)' : 'rgba(56, 189, 248, 0.2)',
          border: `1.5px solid ${copied ? '#4ade80' : '#38bdf8'}`,
          color: copied ? '#4ade80' : '#38bdf8',
          fontWeight: 800,
          fontSize: 11,
          padding: '4px 12px',
          borderRadius: 6,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <span>{copied ? '✓ Link Copied!' : '📋 Copy Invite Link'}</span>
      </button>
    </div>
  );
}

