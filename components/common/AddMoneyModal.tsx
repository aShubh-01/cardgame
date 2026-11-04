'use client';

import React, { useState } from 'react';
import { Player, ChipRequest, money } from '@/types/game';

interface AddMoneyModalProps {
  player: Player;
  defaultBuyIn?: number;
  sessionMode?: 'tracker' | 'online';
  isHost?: boolean;
  chipRequests?: ChipRequest[];
  onClose: () => void;
  onAdjustMoney: (playerId: string, amt: number, mode: 'credit' | 'debit') => void;
  onSetExactStack: (playerId: string, exact: number) => void;
  onRequestChips?: (amt: number) => void;
  onResolveChipRequest?: (requestId: string, decision: 'approved' | 'rejected') => void;
}

export default function AddMoneyModal({
  player,
  defaultBuyIn = 1000,
  sessionMode = 'tracker',
  isHost = true,
  chipRequests = [],
  onClose,
  onAdjustMoney,
  onSetExactStack,
  onRequestChips,
  onResolveChipRequest,
}: AddMoneyModalProps) {
  const [stackMode, setStackMode] = useState<'credit' | 'debit'>('credit');
  const [customAmtStr, setCustomAmtStr] = useState<string>(String(defaultBuyIn));
  const [exactAmtStr, setExactAmtStr] = useState<string>(String(player.balance || 0));

  const customAmt = customAmtStr.trim() === '' ? 0 : Math.floor(Number(customAmtStr));
  const isCustomAmtValid = !isNaN(customAmt) && customAmt >= 1;
  const isRequestAmtValid = !isNaN(customAmt) && customAmt >= 10;
  const exactAmt = exactAmtStr.trim() === '' ? NaN : Math.floor(Number(exactAmtStr));
  const isExactAmtValid = !isNaN(exactAmt) && exactAmt >= 0;

  const currentBal = player.balance || 0;
  const isBusted = currentBal <= 0;
  const isOnlinePlayerRequest = sessionMode === 'online' && !isHost;
  const playerPendingReqs = (chipRequests || []).filter(
    r => r.playerId === player.id && r.status === 'pending'
  );

  if (isOnlinePlayerRequest) {
    return (
      <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="add-money-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>🪙 Request Chips · {player.name}</h2>
            <button className="sm" onClick={onClose}>✕</button>
          </div>

          <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.9, lineHeight: 1.45 }}>
            Current balance: <b className={isBusted ? 'neg' : 'pos'}>{money(currentBal)}</b>
            <span className="mut" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
              In online mode, chip additions are approved by the room admin. Choose or enter the amount you want to request:
            </span>
          </p>

          {playerPendingReqs.length > 0 && (
            <div
              style={{
                background: 'rgba(244, 195, 79, 0.12)',
                border: '1px solid rgba(244, 195, 79, 0.35)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 12,
                marginBottom: 12,
                color: 'var(--gold)',
              }}
            >
              ⏳ Pending request: <b>+{money(playerPendingReqs[0].amount)}</b> (waiting for admin approval)
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, marginBottom: 6 }}>
            Quick Request Presets:
          </div>
          <div className="preset-grid">
            {[100, 500, 1000, 2000].map(amt => (
              <button
                key={amt}
                type="button"
                className="preset-btn"
                onClick={() => onRequestChips?.(amt)}
              >
                +{money(amt)}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, opacity: 0.8, display: 'block', marginBottom: 4 }}>
              Custom Chip Amount to Request (Min ₹10):
            </label>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 8, display: 'flex' }}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 500"
                value={customAmtStr}
                onChange={(e) => setCustomAmtStr(e.target.value.replace(/[^0-9]/g, ''))}
                style={{ flex: 1, fontSize: 18, textAlign: 'center' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isRequestAmtValid) {
                    onRequestChips?.(customAmt);
                  }
                }}
              />
              <button
                type="button"
                className="pri"
                style={{ padding: '8px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}
                disabled={!isRequestAmtValid}
                onClick={() => {
                  if (isRequestAmtValid) onRequestChips?.(customAmt);
                }}
              >
                📤 Request Chips
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="add-money-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>💰 Manage Chips · {player.name}</h2>
          <button className="sm" onClick={onClose}>✕</button>
        </div>

        {/* Pending requests for this player */}
        {playerPendingReqs.length > 0 && (
          <div
            style={{
              background: 'rgba(244, 195, 79, 0.14)',
              border: '1px solid var(--gold)',
              borderRadius: 10,
              padding: '8px 12px',
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)', marginBottom: 6, textTransform: 'uppercase' }}>
              🪙 Pending Request from {player.name}
            </div>
            {playerPendingReqs.map(req => (
              <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <b style={{ fontSize: 14 }}>+{money(req.amount)}</b>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="sm good"
                    onClick={() => {
                      onResolveChipRequest?.(req.id, 'approved');
                      onClose();
                    }}
                  >
                    ✓ Accept
                  </button>
                  <button
                    type="button"
                    className="sm bad"
                    onClick={() => onResolveChipRequest?.(req.id, 'rejected')}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

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
              type="text"
              inputMode="numeric"
              placeholder="Enter amount..."
              value={customAmtStr}
              onChange={(e) => setCustomAmtStr(e.target.value.replace(/[^0-9]/g, ''))}
              style={{ flex: 1, fontSize: 18, textAlign: 'center' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isCustomAmtValid) {
                  onAdjustMoney(player.id, customAmt, stackMode);
                }
              }}
            />
            <button
              type="button"
              className={stackMode === 'credit' ? 'good' : 'bad'}
              style={{ padding: '8px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}
              disabled={!isCustomAmtValid}
              onClick={() => {
                if (isCustomAmtValid) onAdjustMoney(player.id, customAmt, stackMode);
              }}
            >
              {stackMode === 'credit' ? 'Credit' : 'Debit'}
            </button>
          </div>
        </div>

        {/* Overwrite Exact Stack row */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <label style={{ fontSize: 12, opacity: 0.8, display: 'block', marginBottom: 4 }}>
            Or Overwrite Exact Chip Stack To:
          </label>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8, display: 'flex' }}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={exactAmtStr}
              onChange={(e) => setExactAmtStr(e.target.value.replace(/[^0-9]/g, ''))}
              style={{ flex: 1, fontSize: 16, textAlign: 'center' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isExactAmtValid) onSetExactStack(player.id, exactAmt);
              }}
            />
            <button
              type="button"
              className="gold"
              style={{ padding: '8px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}
              disabled={!isExactAmtValid}
              onClick={() => {
                if (isExactAmtValid) onSetExactStack(player.id, exactAmt);
              }}
            >
              Overwrite
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
