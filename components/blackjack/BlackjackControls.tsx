'use client';

import React, { useState } from 'react';
import { Player, Round, money } from '@/types/game';
import { BlackjackHandOutcome, BlackjackPlayerInput } from '@/lib/blackjackEngine';

interface BlackjackControlsProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  defaultBuyIn?: number;
  dealerPlayerId: string | 'house';
  onSetDealerPlayerId: (id: string | 'house') => void;
  onSetDefaultBuyIn: (amt: number) => void;
  onResetAllBalances: () => void;
  onStartHand: () => void;
  onSettleHand: (
    dealerHasBlackjack: boolean,
    playersInput: BlackjackPlayerInput[]
  ) => void;
  onAbortHand: () => void;
}

export default function BlackjackControls({
  players,
  round,
  balanceMode,
  defaultBuyIn = 1000,
  dealerPlayerId,
  onSetDealerPlayerId,
  onSetDefaultBuyIn,
  onResetAllBalances,
  onStartHand,
  onSettleHand,
  onAbortHand,
}: BlackjackControlsProps) {
  const isBalMode = !!balanceMode;
  const seated = players.filter(p => !p.sit);

  const [dealerHasBj, setDealerHasBj] = useState<boolean>(false);
  const [defaultBet, setDefaultBet] = useState<number>(100);

  // Per-player betting state for active hand
  const [playerInputs, setPlayerInputs] = useState<Record<string, {
    bet1: number;
    outcome1: BlackjackHandOutcome;
    double1: boolean;
    isSplit: boolean;
    bet2: number;
    outcome2: BlackjackHandOutcome;
    double2: boolean;
    insurance: number;
  }>>({});

  const activePlayers = round
    ? players.filter(p => round.parts.includes(p.id) && p.id !== dealerPlayerId)
    : seated.filter(p => p.id !== dealerPlayerId);

  const getPlayerState = (id: string) => {
    return playerInputs[id] || {
      bet1: defaultBet,
      outcome1: 'win' as BlackjackHandOutcome,
      double1: false,
      isSplit: false,
      bet2: defaultBet,
      outcome2: 'loss' as BlackjackHandOutcome,
      double2: false,
      insurance: 0,
    };
  };

  const updatePlayerState = (id: string, patch: Partial<ReturnType<typeof getPlayerState>>) => {
    setPlayerInputs(prev => ({
      ...prev,
      [id]: { ...getPlayerState(id), ...patch },
    }));
  };

  // Live total calculations
  let totalPlayerNet = 0;
  activePlayers.forEach(p => {
    const s = getPlayerState(p.id);
    const eff1 = s.double1 ? s.bet1 * 2 : s.bet1;
    let net1 = 0;
    if (s.outcome1 === 'win') net1 = eff1;
    else if (s.outcome1 === 'loss') net1 = -eff1;
    else if (s.outcome1 === 'blackjack') net1 = Math.round(eff1 * 1.5);
    else if (s.outcome1 === 'surrender') net1 = -Math.round(eff1 / 2);

    let net2 = 0;
    if (s.isSplit) {
      const eff2 = s.double2 ? s.bet2 * 2 : s.bet2;
      if (s.outcome2 === 'win') net2 = eff2;
      else if (s.outcome2 === 'loss') net2 = -eff2;
      else if (s.outcome2 === 'blackjack') net2 = Math.round(eff2 * 1.5);
      else if (s.outcome2 === 'surrender') net2 = -Math.round(eff2 / 2);
    }

    const insNet = s.insurance > 0 ? (dealerHasBj ? s.insurance * 2 : -s.insurance) : 0;
    totalPlayerNet += net1 + net2 + insNet;
  });

  const dealerNet = -totalPlayerNet === 0 ? 0 : -totalPlayerNet;

  const handleConfirmSettle = () => {
    const inputs: BlackjackPlayerInput[] = activePlayers.map(p => {
      const s = getPlayerState(p.id);
      const hands = [{ bet: s.bet1, outcome: s.outcome1, doubleDown: s.double1 }];
      if (s.isSplit) {
        hands.push({ bet: s.bet2, outcome: s.outcome2, doubleDown: s.double2 });
      }
      return {
        playerId: p.id,
        hands,
        insuranceBet: s.insurance,
      };
    });

    onSettleHand(dealerHasBj, inputs);
    setDealerHasBj(false);
  };

  /* ───────── Case 1: Pre-hand Setup ───────── */
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

          <h2>🏦 Table &amp; Dealer Setup</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 4 }}>Designate Dealer / Banker:</label>
            <div className="seg" style={{ margin: 0, width: '100%' }}>
              <button
                type="button"
                className={dealerPlayerId === 'house' ? 'on' : ''}
                onClick={() => onSetDealerPlayerId('house')}
              >
                🏛 Casino House
              </button>
              {seated.slice(0, 3).map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={dealerPlayerId === p.id ? 'on' : ''}
                  onClick={() => onSetDealerPlayerId(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="row" style={{ margin: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="mut">Default Bet:</span>
            <input
              type="number"
              min="10"
              step="50"
              value={defaultBet}
              onChange={(e) => setDefaultBet(Math.max(10, +e.target.value || 50))}
              style={{ width: 95, textAlign: 'center', fontSize: 15, fontWeight: 800 }}
            />
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 11.5, margin: '12px 0' }}>
            <div>• <b>Win:</b> 1:1 payout · <b>Loss:</b> -1×</div>
            <div>• <b>Blackjack:</b> 3:2 payout (+1.5×) · <b>Push:</b> 0 net</div>
            <div>• <b>Double Down:</b> 2× bet · <b>Insurance:</b> 2:1 payout</div>
          </div>

          <button
            className="pri big"
            disabled={seated.length < 1}
            onClick={onStartHand}
          >
            🃏 Place Bets &amp; Deal Hand (IRL)
          </button>
        </div>
      </aside>
    );
  }

  /* ───────── Case 2: Settle Hand ───────── */
  return (
    <aside id="right">
      <div className="card slide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Hand #{round.no} Results</h2>
          <span className="pill" style={{ fontSize: 11, fontWeight: 800 }}>
            Dealer: {dealerPlayerId === 'house' ? '🏛 House' : players.find(p => p.id === dealerPlayerId)?.name || dealerPlayerId}
          </span>
        </div>

        {/* Dealer Blackjack Toggle */}
        <div
          style={{
            background: dealerHasBj ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.3)',
            border: `1.5px solid ${dealerHasBj ? '#ef4444' : 'var(--line)'}`,
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>
            🚨 Dealer has Natural Blackjack (21)?
          </span>
          <button
            type="button"
            className={dealerHasBj ? 'bad sm' : 'sm'}
            style={{ fontWeight: 800, padding: '4px 12px' }}
            onClick={() => setDealerHasBj(prev => !prev)}
          >
            {dealerHasBj ? 'YES' : 'NO'}
          </button>
        </div>

        {/* Player Outcomes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {activePlayers.map(p => {
            const s = getPlayerState(p.id);

            return (
              <div
                key={p.id}
                style={{
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <b>{p.name}</b>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="sm"
                      style={{ fontSize: 10, padding: '2px 6px', background: s.isSplit ? 'rgba(94,234,212,0.2)' : undefined }}
                      onClick={() => updatePlayerState(p.id, { isSplit: !s.isSplit })}
                    >
                      {s.isSplit ? '✂ Split (2 Hands)' : '+ Split'}
                    </button>
                  </div>
                </div>

                {/* Hand 1 */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, minWidth: 46 }}>{s.isSplit ? 'Hand 1:' : 'Bet:'}</span>
                  <input
                    type="number"
                    min="10"
                    step="50"
                    value={s.bet1}
                    onChange={(e) => updatePlayerState(p.id, { bet1: Math.max(0, +e.target.value || 0) })}
                    style={{ width: 65, textAlign: 'center', fontSize: 13 }}
                  />

                  <select
                    value={s.outcome1}
                    onChange={(e) => updatePlayerState(p.id, { outcome1: e.target.value as BlackjackHandOutcome })}
                    style={{ flex: 1, padding: '4px 6px', fontSize: 12, borderRadius: 6, background: '#07141c', color: '#fff', border: '1px solid var(--line)' }}
                  >
                    <option value="win">Win (1:1)</option>
                    <option value="loss">Loss</option>
                    <option value="push">Push (0)</option>
                    <option value="blackjack">Blackjack (3:2)</option>
                    <option value="surrender">Surrender (-½)</option>
                  </select>

                  <button
                    type="button"
                    className="sm"
                    style={{ fontSize: 10.5, padding: '3px 6px', background: s.double1 ? 'rgba(244,195,79,0.25)' : undefined, color: s.double1 ? 'var(--gold)' : undefined }}
                    onClick={() => updatePlayerState(p.id, { double1: !s.double1 })}
                  >
                    2× Dbl
                  </button>
                </div>

                {/* Hand 2 (if split) */}
                {s.isSplit && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, minWidth: 46 }}>Hand 2:</span>
                    <input
                      type="number"
                      min="10"
                      step="50"
                      value={s.bet2}
                      onChange={(e) => updatePlayerState(p.id, { bet2: Math.max(0, +e.target.value || 0) })}
                      style={{ width: 65, textAlign: 'center', fontSize: 13 }}
                    />

                    <select
                      value={s.outcome2}
                      onChange={(e) => updatePlayerState(p.id, { outcome2: e.target.value as BlackjackHandOutcome })}
                      style={{ flex: 1, padding: '4px 6px', fontSize: 12, borderRadius: 6, background: '#07141c', color: '#fff', border: '1px solid var(--line)' }}
                    >
                      <option value="win">Win (1:1)</option>
                      <option value="loss">Loss</option>
                      <option value="push">Push (0)</option>
                      <option value="blackjack">Blackjack (3:2)</option>
                      <option value="surrender">Surrender (-½)</option>
                    </select>

                    <button
                      type="button"
                      className="sm"
                      style={{ fontSize: 10.5, padding: '3px 6px', background: s.double2 ? 'rgba(244,195,79,0.25)' : undefined, color: s.double2 ? 'var(--gold)' : undefined }}
                      onClick={() => updatePlayerState(p.id, { double2: !s.double2 })}
                    >
                      2× Dbl
                    </button>
                  </div>
                )}

                {/* Insurance Option */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11 }}>
                  <span className="mut">Insurance bet:</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={s.insurance}
                    onChange={(e) => updatePlayerState(p.id, { insurance: Math.max(0, +e.target.value || 0) })}
                    placeholder="₹0"
                    style={{ width: 65, textAlign: 'center', fontSize: 12 }}
                  />
                  {s.insurance > 0 && (
                    <span style={{ color: dealerHasBj ? '#4ade80' : '#ef4444', fontWeight: 700 }}>
                      {dealerHasBj ? `+${money(s.insurance * 2)} (Won)` : `-${money(s.insurance)} (Lost)`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Dealer Outcome Banner */}
        <div
          style={{
            background: dealerNet >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1.5px solid ${dealerNet >= 0 ? '#22c55e' : '#ef4444'}`,
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <b>🏦 Dealer Net Outcome:</b>
            <div className="mut" style={{ fontSize: 11 }}>
              {dealerPlayerId === 'house' ? 'Casino House balance' : `Player: ${players.find(p => p.id === dealerPlayerId)?.name}`}
            </div>
          </div>
          <b style={{ fontSize: 20, color: dealerNet >= 0 ? '#22c55e' : '#ef4444' }}>
            {dealerNet >= 0 ? '+' : ''}{money(dealerNet)}
          </b>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="pri grow"
            style={{ flex: 2 }}
            onClick={handleConfirmSettle}
          >
            💰 Settle Hand #{round.no}
          </button>
          <button className="bad" style={{ flex: 1 }} onClick={onAbortHand}>
            Abort
          </button>
        </div>
      </div>
    </aside>
  );
}

