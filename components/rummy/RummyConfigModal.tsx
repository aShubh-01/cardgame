'use client';

import React, { useState } from 'react';
import {
  RummyConfig,
  RummyMeldRequirement,
  RUMMY_PRESETS,
  getTotalMeldCards,
} from '@/lib/rummyEngine';

interface RummyConfigModalProps {
  currentConfig: RummyConfig;
  onSave: (config: RummyConfig) => void;
  onClose: () => void;
}

export default function RummyConfigModal({
  currentConfig,
  onSave,
  onClose,
}: RummyConfigModalProps) {
  const [totalCards, setTotalCards] = useState<number>(currentConfig.totalCards || 13);
  const [requirements, setRequirements] = useState<RummyMeldRequirement[]>(
    currentConfig.requirements?.length
      ? currentConfig.requirements.map(r => ({ ...r }))
      : RUMMY_PRESETS['13_cards'].requirements
  );
  const [firstDrop, setFirstDrop] = useState<number>(
    currentConfig.firstDropPoints !== undefined ? currentConfig.firstDropPoints : 20
  );
  const [middleDrop, setMiddleDrop] = useState<number>(
    currentConfig.middleDropPoints !== undefined ? currentConfig.middleDropPoints : 40
  );
  const [maxPoints, setMaxPoints] = useState<number>(
    currentConfig.maxPoints !== undefined ? currentConfig.maxPoints : 80
  );

  const meldSum = getTotalMeldCards(requirements);

  const applyPreset = (presetKey: string) => {
    const preset = RUMMY_PRESETS[presetKey];
    if (!preset) return;
    setTotalCards(preset.totalCards);
    setRequirements(preset.requirements.map(r => ({ ...r })));
    setFirstDrop(preset.firstDropPoints || 20);
    setMiddleDrop(preset.middleDropPoints || 40);
    setMaxPoints(preset.maxPoints || 80);
  };

  const handleAddRequirement = () => {
    const newId = 'req_' + Date.now();
    setRequirements(prev => [
      ...prev,
      {
        id: newId,
        type: 'set',
        cardsCount: 3,
        label: 'Set of 3',
      },
    ]);
  };

  const handleUpdateRequirement = (
    index: number,
    field: keyof RummyMeldRequirement,
    value: any
  ) => {
    setRequirements(prev => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      if (field === 'type' || field === 'cardsCount') {
        const typeStr =
          item.type === 'pure_seq'
            ? 'Pure sequence'
            : item.type === 'any_seq'
            ? 'Any sequence'
            : 'Set';
        item.label = `${typeStr} of ${item.cardsCount}`;
      }
      next[index] = item;
      return next;
    });
  };

  const handleRemoveRequirement = (index: number) => {
    setRequirements(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({
      totalCards: Math.max(3, totalCards),
      requirements,
      firstDropPoints: firstDrop,
      middleDropPoints: middleDrop,
      maxPoints: maxPoints,
    });
    onClose();
  };

  return (
    <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="session-modal-box" style={{ maxWidth: 520, padding: '22px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: '#34d399', fontWeight: 800 }}>
              🎴 Rummy Hand &amp; Melds
            </h2>
            <div className="mut" style={{ fontSize: 12, marginTop: 2 }}>
              Choose preset variation or configure custom requirements.
            </div>
          </div>
          <button className="sm" onClick={onClose} style={{ padding: '3px 8px' }}>✕</button>
        </div>

        {/* Clean Segmented Presets */}
        <div className="seg" style={{ margin: '0 0 16px', width: '100%' }}>
          <button
            type="button"
            style={{ flex: 1, padding: '6px 4px', fontSize: 12 }}
            className={totalCards === 7 ? 'on' : ''}
            onClick={() => applyPreset('7_cards')}
          >
            7 Cards
          </button>
          <button
            type="button"
            style={{ flex: 1, padding: '6px 4px', fontSize: 12 }}
            className={totalCards === 9 ? 'on' : ''}
            onClick={() => applyPreset('9_cards')}
          >
            9 Cards
          </button>
          <button
            type="button"
            style={{ flex: 1, padding: '6px 4px', fontSize: 12 }}
            className={totalCards === 10 ? 'on' : ''}
            onClick={() => applyPreset('10_cards')}
          >
            10 Cards
          </button>
          <button
            type="button"
            style={{ flex: 1, padding: '6px 4px', fontSize: 12 }}
            className={totalCards === 13 ? 'on' : ''}
            onClick={() => applyPreset('13_cards')}
          >
            13 Cards
          </button>
          <button
            type="button"
            style={{ flex: 1, padding: '6px 4px', fontSize: 12 }}
            className={totalCards === 21 ? 'on' : ''}
            onClick={() => applyPreset('21_cards')}
          >
            21 Cards
          </button>
        </div>

        {/* Total Cards & Balance Status Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Hand Size:</span>
            <input
              type="number"
              min="3"
              max="27"
              value={totalCards}
              onChange={(e) => setTotalCards(Math.max(3, +e.target.value || 3))}
              style={{ width: 55, textAlign: 'center', fontSize: 14, fontWeight: 800, padding: '3px 6px' }}
            />
            <span className="mut" style={{ fontSize: 12 }}>cards</span>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700 }}>
            {meldSum === totalCards ? (
              <span style={{ color: '#34d399' }}>● {meldSum} / {totalCards} cards melded</span>
            ) : meldSum < totalCards ? (
              <span style={{ color: '#60a5fa' }}>● {meldSum}/{totalCards} ({totalCards - meldSum} loose)</span>
            ) : (
              <span style={{ color: '#f87171' }}>⚠️ {meldSum} exceeds {totalCards} cards</span>
            )}
          </div>
        </div>

        {/* Meld Requirements (Clean Flat List) */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="mut" style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Required Melds
            </span>
            <button
              type="button"
              className="sm"
              style={{ fontSize: 11, padding: '2px 8px', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)', background: 'transparent' }}
              onClick={handleAddRequirement}
            >
              + Add Meld
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 190, overflowY: 'auto' }}>
            {requirements.map((req, idx) => (
              <div
                key={req.id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span className="mut" style={{ fontSize: 11, width: 18, textAlign: 'center' }}>
                  {idx + 1}
                </span>

                <select
                  value={req.type}
                  onChange={(e) => handleUpdateRequirement(idx, 'type', e.target.value)}
                  style={{
                    flex: 1,
                    background: '#0d1117',
                    color: 'var(--ink)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <option value="pure_seq">Pure Sequence (No Joker)</option>
                  <option value="any_seq">Any Sequence (Pure/Impure)</option>
                  <option value="set">Set / Triplet</option>
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min="3"
                    max="10"
                    value={req.cardsCount}
                    onChange={(e) =>
                      handleUpdateRequirement(idx, 'cardsCount', Math.max(3, +e.target.value || 3))
                    }
                    style={{ width: 44, textAlign: 'center', fontSize: 12, padding: '3px' }}
                  />
                  <span className="mut" style={{ fontSize: 11 }}>cards</span>
                </div>

                <button
                  type="button"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--mut)',
                    fontSize: 14,
                    cursor: 'pointer',
                    padding: '2px 6px',
                    opacity: 0.7,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mut)')}
                  onClick={() => handleRemoveRequirement(idx)}
                  title="Remove meld"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Compact Drops & Max Cap */}
        <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <span className="mut" style={{ fontSize: 11 }}>1st Drop:</span>
              <input
                type="number"
                min="0"
                value={firstDrop}
                onChange={(e) => setFirstDrop(+e.target.value || 0)}
                style={{ width: 44, textAlign: 'center', fontSize: 12, padding: '3px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <span className="mut" style={{ fontSize: 11 }}>Mid Drop:</span>
              <input
                type="number"
                min="0"
                value={middleDrop}
                onChange={(e) => setMiddleDrop(+e.target.value || 0)}
                style={{ width: 44, textAlign: 'center', fontSize: 12, padding: '3px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <span className="mut" style={{ fontSize: 11 }}>Max Cap:</span>
              <input
                type="number"
                min="10"
                value={maxPoints}
                onChange={(e) => setMaxPoints(+e.target.value || 80)}
                style={{ width: 46, textAlign: 'center', fontSize: 12, padding: '3px' }}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="sm" onClick={onClose} style={{ padding: '6px 14px' }}>
            Cancel
          </button>
          <button
            type="button"
            className="sm pri"
            style={{ fontWeight: 800, padding: '6px 18px', background: 'linear-gradient(#34d399, #059669)', borderColor: '#6ee7b7', color: '#022c22' }}
            onClick={handleSave}
          >
            Save Rules
          </button>
        </div>
      </div>
    </div>
  );
}
