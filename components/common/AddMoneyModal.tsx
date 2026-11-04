'use client';

import React, { useState } from 'react';
import { Player, money } from '@/types/game';

interface AddMoneyModalProps {
  player: Player;
  defaultBuyIn?: number;
  onClose: () => void;
  onAdjustMoney: (playerId: string, amt: number, mode: 'credit' | 'debit') => void;
  onSetExactStack: (playerId: string, exact: number) => void;
}

export default function AddMoneyModal({
  player,
  defaultBuyIn = 1000,
  onClose,
  onAdjustMoney,
  onSetExactStack,
}: AddMoneyModalProps) {
  const [stackMode, setStackMode] = useState<'credit' | 'debit'>('credit');
  const [customAmt, setCustomAmt] = useState<number>(defaultBuyIn);
  const [exactAmt, setExactAmt] = useState<number>(player.balance || 0);

  const currentBal = player.balance || 0;
  const isBusted = currentBal <= 0;

  return (
    <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="add-money-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>💰 Manage Chips · {player.name}</h2>
          <button className="sm" onClick={onClose}>✕</button>
        </div>

        {/* Debit / Credit Switcher */}
        <div className="seg" style={{ width: '100%', marginBottom: 12, display: 'flex' }}>
          <button
            type="button"
            style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 800 }}
            className={stackMode === 'credit' ? 'on' : ''}
            onClick={() => setStackMode('credit')}
          >
            ➕ Credit (+ Add)
          </button>
          <button
            type="button"
            style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 800 }}
            className={stackMode === 'debit' ? 'on' : ''}
            onClick={() => setStackMode('debit')}
          >
            ➖ Debit (− Deduct)
          </button>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.9 }}>
          Current balance: <b className={isBusted ? 'neg' : 'pos'}>{money(currentBal)}</b>
          {isBusted && (
            <span style={{ display: 'block', color: '#ef4444', fontWeight: 700, marginTop: 4 }}>
              💥 Player is BUSTED &amp; paused. Crediting chips will unpause them automatically!
            </span>
          )}
        </p>

        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, marginBottom: 6 }}>
          {stackMode === 'credit' ? 'Quick Credit Presets:' : 'Quick Debit Presets:'}
        </div>
        <div className="preset-grid">
          {[100, 500, 1000, 2000].map(amt => (
            <button
              key={amt}
              type="button"
              className={`preset-btn ${stackMode === 'debit' ? 'bad' : ''}`}
              onClick={() => onAdjustMoney(player.id, amt, stackMode)}
            >
              {stackMode === 'credit' ? `+${money(amt)}` : `−${money(amt)}`}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, opacity: 0.8, display: 'block', marginBottom: 4 }}>
            {stackMode === 'credit' ? 'Custom Amount to Credit:' : 'Custom Amount to Debit:'}
          </label>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8, display: 'flex' }}>
            <input
              type="number"
              min="1"
              value={customAmt}
              onChange={(e) => setCustomAmt(+e.target.value || 0)}
              style={{ flex: 1, fontSize: 18, textAlign: 'center' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customAmt > 0) {
                  onAdjustMoney(player.id, customAmt, stackMode);
                }
              }}
            />
            <button
              type="button"
              className={stackMode === 'credit' ? 'good' : 'bad'}
              style={{ padding: '8px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}
              onClick={() => {
                if (customAmt > 0) onAdjustMoney(player.id, customAmt, stackMode);
              }}
            >
              {stackMode === 'credit' ? 'Credit' : 'Debit'}
            </button>
          </div>
        </div>

        {/* Set Exact Stack row */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <label style={{ fontSize: 12, opacity: 0.8, display: 'block', marginBottom: 4 }}>
            Or Set Exact Chip Stack To:
          </label>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8, display: 'flex' }}>
            <input
              type="number"
              min="0"
              value={exactAmt}
              onChange={(e) => setExactAmt(+e.target.value || 0)}
              style={{ flex: 1, fontSize: 16, textAlign: 'center' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSetExactStack(player.id, exactAmt);
              }}
            />
            <button
              type="button"
              className="gold"
              style={{ padding: '8px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}
              onClick={() => onSetExactStack(player.id, exactAmt)}
            >
              Set Exact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

