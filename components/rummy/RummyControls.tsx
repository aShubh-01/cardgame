'use client';

import React, { useState } from 'react';
import { Player, Round, money } from '@/types/game';
import {
  RummyConfig,
  RUMMY_PRESETS,
  DEFAULT_RUMMY_CONFIG,
  RUMMY_DROPS,
  formatConfigSummary,
} from '@/lib/rummyEngine';

interface RummyControlsProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  defaultBuyIn?: number;
  pointValue: number;
  rummyConfig: RummyConfig;
  cumulativePoints: Record<string, number>;
  onSetPointValue: (val: number) => void;
  onSetDefaultBuyIn: (amt: number) => void;
  onResetAllBalances: () => void;
  onUpdateConfig: (config: RummyConfig) => void;
  onOpenConfigModal: () => void;
  onStartDeal: () => void;
  onSettleDeal: (winnerId: string, playerPoints: Record<string, number>) => void;
  onAbortDeal: () => void;
}

export default function RummyControls({
  players,
  round,
  balanceMode,
  defaultBuyIn = 1000,
  pointValue,
  rummyConfig = DEFAULT_RUMMY_CONFIG,
  cumulativePoints,
  onSetPointValue,
  onSetDefaultBuyIn,
  onResetAllBalances,
  onUpdateConfig,
  onOpenConfigModal,
  onStartDeal,
  onSettleDeal,
  onAbortDeal,
}: RummyControlsProps) {
  const isBalMode = !!balanceMode;
  const seated = players.filter(p => !p.sit);

  const [selectedWinnerId, setSelectedWinnerId] = useState<string>('');
  const [pointsInput, setPointsInput] = useState<Record<string, number>>({});
  const [breakdownOpen, setBreakdownOpen] = useState<Record<string, boolean>>({});
  const [pureSeqStatus, setPureSeqStatus] = useState<Record<string, boolean>>({});

  // Active deal participants
  const dealPlayers = round
    ? players.filter(p => round.parts.includes(p.id))
    : seated;

  // Set default winner if none selected
  const activeWinnerId = selectedWinnerId || (dealPlayers[0]?.id || '');

  const maxPts = rummyConfig.maxPoints || RUMMY_DROPS.MAX_POINTS;
  const firstDropPts = rummyConfig.firstDropPoints !== undefined ? rummyConfig.firstDropPoints : RUMMY_DROPS.FIRST_DROP;
  const midDropPts = rummyConfig.middleDropPoints !== undefined ? rummyConfig.middleDropPoints : RUMMY_DROPS.MIDDLE_DROP;

  // Calculate live deal totals
  const totalPenaltyPoints = dealPlayers.reduce((sum, p) => {
    if (p.id === activeWinnerId) return sum;
    const pts = Math.min(maxPts, Math.max(0, pointsInput[p.id] || 0));
    return sum + pts;
  }, 0);

  const totalPot = Math.round(totalPenaltyPoints * pointValue);

  const handleSetQuickDrop = (playerId: string, pts: number) => {
    setPointsInput(prev => ({ ...prev, [playerId]: pts }));
  };

  const handleToggleBreakdown = (playerId: string) => {
    setBreakdownOpen(prev => ({ ...prev, [playerId]: !prev[playerId] }));
    if (pureSeqStatus[playerId] === undefined) {
      setPureSeqStatus(prev => ({ ...prev, [playerId]: true }));
    }
  };

  const handlePureSeqToggle = (playerId: string, hasPure: boolean) => {
    setPureSeqStatus(prev => ({ ...prev, [playerId]: hasPure }));
    if (!hasPure) {
      // No pure sequence means full penalty count
      setPointsInput(prev => ({ ...prev, [playerId]: maxPts }));
    }
  };

  const handleConfirmSettle = () => {
    if (!activeWinnerId) return;
    onSettleDeal(activeWinnerId, pointsInput);
    setPointsInput({});
    setSelectedWinnerId('');
    setBreakdownOpen({});
    setPureSeqStatus({});
  };

  /* ───────── Case 1: Pre-deal Setup ───────── */
  if (!round) {
    return (
      <aside id="right">
        <div className="card slide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Session Bankroll Mode</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: isBalMode ? 'var(--gold)' : '#38bdf8', marginTop: 1 }}>
                {isBalMode ? `🪙 With Balance (Chips · ₹${defaultBuyIn})` : '📜 No Balance (Debt Settlement)'}
              </div>
            </div>
            <span className="pill" style={{ fontSize: 10.5, opacity: 0.75 }}>Session Locked</span>
          </div>

          {isBalMode && (
            <div style={{ marginBottom: 12 }}>
              <div className="row" style={{ margin: '6px 0 8px', alignItems: 'center', justifyContent: 'space-between', display: 'flex' }}>
                <span className="mut" style={{ fontSize: 12 }}>Chips per player:</span>
                <input
                  type="number"
                  min="10"
                  step="50"
                  value={defaultBuyIn}
                  onChange={(e) => onSetDefaultBuyIn(+e.target.value || 1000)}
                  style={{ width: 105, textAlign: 'center' }}
                />
              </div>
              <button
                className="sm"
                style={{
                  width: '100%',
                  background: 'rgba(217,119,6,0.15)',
                  border: '1px solid rgba(217,119,6,0.35)',
                  color: 'var(--gold)',
                  fontWeight: 600,
                }}
                onClick={onResetAllBalances}
              >
                🔄 Reset stacks to ₹{defaultBuyIn}
              </button>
            </div>
          )}

          {/* Cards & Melds Rules Configuration Card */}
          <div
            style={{
              background: 'linear-gradient(145deg, rgba(5,150,105,0.18), rgba(6,78,59,0.3))',
              border: '1.5px solid #10b981',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    color: '#6ee7b7',
                    letterSpacing: 0.5,
                  }}
                >
                  🎴 Hand Size &amp; Rules
                </span>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', marginTop: 1 }}>
                  {rummyConfig.totalCards} Cards Hand
                </div>
              </div>
              <button
                type="button"
                className="sm"
                style={{
                  background: 'rgba(16,185,129,0.25)',
                  borderColor: '#10b981',
                  color: '#6ee7b7',
                  fontWeight: 800,
                  fontSize: 11,
                  padding: '3px 8px',
                }}
                onClick={onOpenConfigModal}
              >
                ⚙️ Configure...
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.45, marginBottom: 10 }}>
              <b>Requirements: </b>
              {rummyConfig.requirements?.map((req, i) => (
                <span
                  key={req.id || i}
                  style={{
                    display: 'inline-block',
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(110,231,183,0.3)',
                    borderRadius: 6,
                    padding: '1px 6px',
                    margin: '2px 3px 2px 0',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#a7f3d0',
                  }}
                >
                  {req.type === 'pure_seq' ? 'Pure Seq' : req.type === 'any_seq' ? 'Seq' : 'Set'} ({req.cardsCount})
                </span>
              ))}
            </div>

            {/* Quick Switch Preset Buttons */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="sm"
                style={{
                  fontSize: 10.5,
                  padding: '2px 7px',
                  fontWeight: rummyConfig.totalCards === 9 ? 800 : 500,
                  background: rummyConfig.totalCards === 9 ? '#10b981' : 'rgba(0,0,0,0.3)',
                  color: rummyConfig.totalCards === 9 ? '#022c22' : 'inherit',
                }}
                onClick={() => onUpdateConfig(RUMMY_PRESETS['9_cards'])}
              >
                9 Cards
              </button>
              <button
                type="button"
                className="sm"
                style={{
                  fontSize: 10.5,
                  padding: '2px 7px',
                  fontWeight: rummyConfig.totalCards === 7 ? 800 : 500,
                  background: rummyConfig.totalCards === 7 ? '#10b981' : 'rgba(0,0,0,0.3)',
                  color: rummyConfig.totalCards === 7 ? '#022c22' : 'inherit',
                }}
                onClick={() => onUpdateConfig(RUMMY_PRESETS['7_cards'])}
              >
                7 Cards
              </button>
              <button
                type="button"
                className="sm"
                style={{
                  fontSize: 10.5,
                  padding: '2px 7px',
                  fontWeight: rummyConfig.totalCards === 13 ? 800 : 500,
                  background: rummyConfig.totalCards === 13 ? '#10b981' : 'rgba(0,0,0,0.3)',
                  color: rummyConfig.totalCards === 13 ? '#022c22' : 'inherit',
                }}
                onClick={() => onUpdateConfig(RUMMY_PRESETS['13_cards'])}
              >
                13 Cards
              </button>
              <button
                type="button"
                className="sm"
                style={{
                  fontSize: 10.5,
                  padding: '2px 7px',
                  fontWeight: rummyConfig.totalCards === 10 ? 800 : 500,
                  background: rummyConfig.totalCards === 10 ? '#10b981' : 'rgba(0,0,0,0.3)',
                  color: rummyConfig.totalCards === 10 ? '#022c22' : 'inherit',
                }}
                onClick={() => onUpdateConfig(RUMMY_PRESETS['10_cards'])}
              >
                10 Cards
              </button>
            </div>
          </div>

          <h2>Deal Configuration</h2>
          <div className="row" style={{ margin: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="mut">Point Value:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>₹</span>
              <input
                type="number"
                min="0.1"
                step="1"
                value={pointValue}
                onChange={(e) => onSetPointValue(Math.max(0.1, +e.target.value || 1))}
                style={{ width: 90, textAlign: 'center', fontSize: 16, fontWeight: 800 }}
              />
            </div>
          </div>

          <div className="q" style={{ marginBottom: 14 }}>
            <button className="sm" onClick={() => onSetPointValue(1)}>₹1/pt</button>
            <button className="sm" onClick={() => onSetPointValue(2)}>₹2/pt</button>
            <button className="sm" onClick={() => onSetPointValue(5)}>₹5/pt</button>
            <button className="sm" onClick={() => onSetPointValue(10)}>₹10/pt</button>
            <button className="sm" onClick={() => onSetPointValue(25)}>₹25/pt</button>
          </div>

          <button
            className="pri big"
            disabled={seated.length < 2}
            style={{
              background: 'linear-gradient(#34d399, #059669)',
              borderColor: '#6ee7b7',
              color: '#022c22',
              fontWeight: 800,
            }}
            onClick={() => {
              setSelectedWinnerId(seated[0]?.id || '');
              onStartDeal();
            }}
          >
            🎴 Deal {rummyConfig.totalCards} Cards &amp; Play (IRL)
          </button>
        </div>
      </aside>
    );
  }

  /* ───────── Case 2: Deal Settle / Enter Scores ───────── */
  return (
    <aside id="right">
      <div className="card slide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>Deal #{round.no} Scoring</h2>
          <span className="pill" style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)' }}>
            ₹{pointValue}/pt
          </span>
        </div>

        {/* Rule banner during scoring */}
        <div
          style={{
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11.5,
            color: '#a7f3d0',
            marginBottom: 12,
          }}
        >
          <b>Rules ({rummyConfig.totalCards} cards): </b>
          {formatConfigSummary(rummyConfig)}
        </div>

        <p className="mut" style={{ fontSize: 12, margin: '0 0 10px' }}>
          Select the winner who declared show (0 pts). Then enter penalty points (max {maxPts}) for other players.
        </p>

        {/* Winner Selector */}
        <label style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--gold)', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
          👑 Select Winner (0 Pts):
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {dealPlayers.map(p => {
            const isWinner = p.id === activeWinnerId;
            return (
              <button
                key={p.id}
                type="button"
                className={isWinner ? 'pri' : ''}
                style={{
                  fontSize: 12.5,
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontWeight: 700,
                  border: isWinner ? '2px solid #5eead4' : '1px solid var(--line)',
                }}
                onClick={() => setSelectedWinnerId(p.id)}
              >
                {isWinner ? '👑 ' : ''}{p.name}
              </button>
            );
          })}
        </div>

        {/* Loser Points Entry */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {dealPlayers.map(p => {
            const isWinner = p.id === activeWinnerId;
            if (isWinner) {
              return (
                <div
                  key={p.id}
                  style={{
                    background: 'rgba(94, 234, 212, 0.1)',
                    border: '1.5px solid #5eead4',
                    borderRadius: 10,
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <b style={{ color: '#5eead4' }}>👑 {p.name} (WINNER)</b>
                    <div className="mut" style={{ fontSize: 11 }}>0 penalty points (Declared valid {rummyConfig.totalCards}-card show)</div>
                  </div>
                  <b className="pos" style={{ fontSize: 16 }}>+{money(totalPot)}</b>
                </div>
              );
            }

            const pts = pointsInput[p.id] !== undefined ? pointsInput[p.id] : 0;
            const lossAmt = Math.round(pts * pointValue);
            const isBreakdown = !!breakdownOpen[p.id];
            const hasPure = pureSeqStatus[p.id] !== false;

            return (
              <div
                key={p.id}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <b>{p.name}</b>
                    {isBalMode && <span className="mut" style={{ fontSize: 11, marginLeft: 6 }}>bal: {money(p.balance || 0)}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      min="0"
                      max={maxPts}
                      value={pts}
                      onChange={(e) => {
                        const v = Math.min(maxPts, Math.max(0, +e.target.value || 0));
                        setPointsInput(prev => ({ ...prev, [p.id]: v }));
                      }}
                      style={{ width: 65, textAlign: 'center', fontSize: 15, fontWeight: 800 }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--mut)' }}>pts</span>
                    <b className="neg" style={{ fontSize: 14, minWidth: 60, textAlign: 'right' }}>
                      -{money(lossAmt)}
                    </b>
                  </div>
                </div>

                {/* Quick Drop & Helper Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                  <div className="q" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="sm"
                      style={{ fontSize: 10.5, padding: '2px 6px' }}
                      onClick={() => handleSetQuickDrop(p.id, firstDropPts)}
                    >
                      1st Drop ({firstDropPts})
                    </button>
                    <button
                      type="button"
                      className="sm"
                      style={{ fontSize: 10.5, padding: '2px 6px' }}
                      onClick={() => handleSetQuickDrop(p.id, midDropPts)}
                    >
                      Mid Drop ({midDropPts})
                    </button>
                    <button
                      type="button"
                      className="sm"
                      style={{ fontSize: 10.5, padding: '2px 6px' }}
                      onClick={() => handleSetQuickDrop(p.id, maxPts)}
                    >
                      Full ({maxPts})
                    </button>
                  </div>

                  <button
                    type="button"
                    className="sm"
                    style={{
                      fontSize: 10.5,
                      padding: '2px 6px',
                      background: isBreakdown ? 'rgba(52,211,153,0.2)' : 'transparent',
                      color: isBreakdown ? '#34d399' : 'var(--mut)',
                      border: '1px dashed var(--line)',
                    }}
                    onClick={() => handleToggleBreakdown(p.id)}
                  >
                    {isBreakdown ? '▲ Hide Melds' : '▼ Meld Check'}
                  </button>
                </div>

                {/* Meld Breakdown Checklist */}
                {isBreakdown && (
                  <div
                    style={{
                      marginTop: 8,
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      fontSize: 11.5,
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={hasPure}
                        onChange={(e) => handlePureSeqToggle(p.id, e.target.checked)}
                      />
                      <span>
                        Formed required <b>Pure Sequence</b>
                      </span>
                    </label>

                    {!hasPure ? (
                      <div style={{ color: '#f87171', fontSize: 11 }}>
                        ⚠️ Without a Pure Sequence, all cards count as penalty ({maxPts} pts).
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4 }}>
                        <span className="mut">Unmelded card points:</span>
                        <input
                          type="number"
                          min="0"
                          max={maxPts}
                          placeholder="e.g. 15"
                          value={pts === maxPts ? '' : pts}
                          onChange={(e) => {
                            const val = Math.min(maxPts, Math.max(0, +e.target.value || 0));
                            setPointsInput(prev => ({ ...prev, [p.id]: val }));
                          }}
                          style={{ width: 60, textAlign: 'center', padding: '3px' }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live Deal Summary */}
        <div style={{ background: 'rgba(244,195,79,0.08)', border: '1px solid var(--gold)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span className="mut">Total Penalty Points:</span>
            <b>{totalPenaltyPoints} pts</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
            <span style={{ color: 'var(--gold)', fontWeight: 800 }}>Total Winner Pot:</span>
            <b className="pos" style={{ fontSize: 18 }}>+{money(totalPot)}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="pri grow"
            style={{
              flex: 2,
              background: 'linear-gradient(#34d399, #059669)',
              borderColor: '#6ee7b7',
              color: '#022c22',
              fontWeight: 800,
            }}
            disabled={!activeWinnerId}
            onClick={handleConfirmSettle}
          >
            💰 Settle Deal #{round.no}
          </button>
          <button className="bad" style={{ flex: 1 }} onClick={onAbortDeal}>
            Abort
          </button>
        </div>
      </div>
    </aside>
  );
}
