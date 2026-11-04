'use client';

import React, { useState } from 'react';
import { Player, COL, esc, money } from '@/types/game';

interface DebtModalProps {
  players: Player[];
  debts: Record<string, number>;
  myPlayerId?: string | null;
  isHost?: boolean;
  onClose: () => void;
  onSettle: (key: string) => void;
  onSettleAll: () => void;
}

export default function DebtModal({
  players,
  debts,
  myPlayerId,
  isHost = true,
  onClose,
  onSettle,
  onSettleAll,
}: DebtModalProps) {
  const allDebtEntries = Object.entries(debts || {}).filter(([, amt]) => amt > 0);
  const hasHouseDebt = allDebtEntries.some(([k]) => k.startsWith('house|') || k.endsWith('|house'));
  const effectivePlayers: Player[] =
    hasHouseDebt && !players.some(p => p.id === 'house')
      ? [...players, { id: 'house', name: '🏛 Casino House', sit: false }]
      : players;

  const defaultFocusId = myPlayerId || effectivePlayers[0]?.id || '';
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(defaultFocusId);

  const activePlayerId = (isHost ? selectedPlayerId : myPlayerId) || selectedPlayerId || effectivePlayers[0]?.id || '';
  const activePlayer = effectivePlayers.find(p => p.id === activePlayerId);
  const playerMap = new Map(effectivePlayers.map(p => [p.id, p]));

  const dtAv = (id: string) => {
    const p = playerMap.get(id);
    const idx = effectivePlayers.findIndex(x => x.id === id);
    const col = id === 'house' ? '#b45309' : COL[Math.max(0, idx) % COL.length];
    return (
      <div
        className="av"
        style={{
          background: col,
          width: 28,
          height: 28,
          fontSize: 12,
          borderWidth: 1.5,
          boxShadow: 'none',
          display: 'inline-grid',
          margin: 0,
          flex: 'none',
        }}
      >
        {id === 'house' ? '🏛' : esc((p?.name[0] || '?').toUpperCase())}
      </div>
    );
  };

  // Build "You Owe Who" and "Who Owes You" rows for activePlayerId
  const youOweList: Array<{ key: string; player: Player; amount: number }> = [];
  const owesYouList: Array<{ key: string; player: Player; amount: number }> = [];

  effectivePlayers.forEach(other => {
    if (other.id === activePlayerId) return;
    const oweKey = `${activePlayerId}|${other.id}`;
    const owedKey = `${other.id}|${activePlayerId}`;
    const oweAmt = debts[oweKey] || 0;
    const owedAmt = debts[owedKey] || 0;
    if (oweAmt > 0) {
      youOweList.push({ key: oweKey, player: other, amount: oweAmt });
    }
    if (owedAmt > 0) {
      owesYouList.push({ key: owedKey, player: other, amount: owedAmt });
    }
  });

  const totalYouOwe = youOweList.reduce((s, r) => s + r.amount, 0);
  const totalOwesYou = owesYouList.reduce((s, r) => s + r.amount, 0);
  const netVal = totalOwesYou - totalYouOwe;

  return (
    <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="debt-modal-box" style={{ maxWidth: 680 }}>
        {/* Header */}
        <div className="debt-modal-header">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18 }}>
              <span>💸</span> You Owe Who &amp; Who Owes You
            </h2>
            <div className="mut" style={{ fontSize: 12, marginTop: 2 }}>
              Personal settlement ledger for <b>{activePlayer?.name || 'Player'}</b>
            </div>
          </div>
          <button className="sm" onClick={onClose} style={{ padding: '4px 12px' }}>
            ✕ Close
          </button>
        </div>

        <div className="debt-modal-body">
          {!effectivePlayers.length ? (
            <p className="mut" style={{ margin: '30px 0', textAlign: 'center' }}>
              No players seated at the table yet.
            </p>
          ) : (
            <>
              {/* If Game Operator / Host, allow inspecting any player's ledger + show full Who Owes Who Matrix */}
              {(isHost || !myPlayerId) && effectivePlayers.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <div className="mut" style={{ fontSize: 12, marginBottom: 6 }}>
                    {isHost ? '👁 Game Operator View — Inspect ledger for player:' : 'Viewing ledger for player:'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {effectivePlayers.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`sm ${p.id === activePlayerId ? 'pri' : ''}`}
                        onClick={() => setSelectedPlayerId(p.id)}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Table "Who Owes Who" Matrix for Game Operator / Host */}
              {isHost && effectivePlayers.length > 1 && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    borderRadius: 12,
                    background: 'rgba(212, 175, 55, 0.06)',
                    border: '1px solid rgba(212, 175, 55, 0.3)',
                    overflowX: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#f7d97e', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      📊 Complete &ldquo;Who Owes Who&rdquo; Table Matrix (Game Operator View)
                    </div>
                    <span className="mut" style={{ fontSize: 11.5 }}>Row owes Column</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--mut)' }}>Debtor ↓ \ Creditor →</th>
                        {effectivePlayers.map(colP => (
                          <th key={colP.id} style={{ textAlign: 'right', padding: '6px 8px', color: '#f7d97e' }}>
                            {colP.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {effectivePlayers.map(rowP => (
                        <tr key={rowP.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 800 }}>
                            {rowP.name}
                          </td>
                          {effectivePlayers.map(colP => {
                            if (rowP.id === colP.id) {
                              return (
                                <td key={colP.id} style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(255,255,255,0.2)' }}>
                                  —
                                </td>
                              );
                            }
                            const amt = debts[`${rowP.id}|${colP.id}`] || 0;
                            return (
                              <td
                                key={colP.id}
                                style={{
                                  textAlign: 'right',
                                  padding: '6px 8px',
                                  fontWeight: amt > 0 ? 900 : 400,
                                  color: amt > 0 ? '#f87171' : 'rgba(255,255,255,0.3)',
                                }}
                              >
                                {amt > 0 ? money(amt) : '₹0'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Net Summary Banner */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                  marginBottom: 16,
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div className="mut" style={{ fontSize: 11, textTransform: 'uppercase' }}>You Owe</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: totalYouOwe > 0 ? '#f87171' : 'var(--mut)', marginTop: 2 }}>
                    {money(totalYouOwe)}
                  </div>
                </div>
                <div>
                  <div className="mut" style={{ fontSize: 11, textTransform: 'uppercase' }}>Owes You</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: totalOwesYou > 0 ? '#4ade80' : 'var(--mut)', marginTop: 2 }}>
                    {money(totalOwesYou)}
                  </div>
                </div>
                <div>
                  <div className="mut" style={{ fontSize: 11, textTransform: 'uppercase' }}>Your Net</div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      color: netVal > 0 ? '#4ade80' : netVal < 0 ? '#f87171' : 'var(--mut)',
                      marginTop: 2,
                    }}
                  >
                    {netVal > 0 ? `+${money(netVal)}` : netVal < 0 ? `−${money(Math.abs(netVal))}` : '₹0'}
                  </div>
                </div>
              </div>

              {/* Two Side-by-Side or Stacked Tables: 1. You Owe Who, 2. Who Owes You */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                {/* Table 1: You Owe Who */}
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.06)',
                    border: '1px solid rgba(239, 68, 68, 0.28)',
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 14, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      📤 You Owe Who
                    </h3>
                    <b style={{ color: '#f87171', fontSize: 14 }}>{money(totalYouOwe)}</b>
                  </div>

                  {youOweList.length === 0 ? (
                    <div className="mut" style={{ padding: '18px 8px', textAlign: 'center', fontSize: 12.5 }}>
                      ✓ You don&apos;t owe anyone right now.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--mut)', fontSize: 11 }}>
                          <th style={{ textAlign: 'left', padding: '6px 4px' }}>Player</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px' }}>You Owe</th>
                          {isHost && <th style={{ textAlign: 'right', padding: '6px 4px' }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {youOweList.map(item => (
                          <tr key={item.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <td style={{ padding: '8px 4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {dtAv(item.player.id)}
                                <b>{item.player.name}</b>
                              </div>
                            </td>
                            <td style={{ padding: '8px 4px', textAlign: 'right', color: '#f87171', fontWeight: 900 }}>
                              {money(item.amount)}
                            </td>
                            {isHost && (
                              <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="sm good"
                                  style={{ padding: '3px 8px', fontSize: 11 }}
                                  onClick={() => onSettle(item.key)}
                                >
                                  ✓ Settle
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Table 2: Who Owes You */}
                <div
                  style={{
                    background: 'rgba(34, 197, 94, 0.06)',
                    border: '1px solid rgba(34, 197, 94, 0.28)',
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 14, color: '#86efac', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      📥 Who Owes You
                    </h3>
                    <b style={{ color: '#4ade80', fontSize: 14 }}>{money(totalOwesYou)}</b>
                  </div>

                  {owesYouList.length === 0 ? (
                    <div className="mut" style={{ padding: '18px 8px', textAlign: 'center', fontSize: 12.5 }}>
                      No one owes you money right now.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--mut)', fontSize: 11 }}>
                          <th style={{ textAlign: 'left', padding: '6px 4px' }}>Player</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px' }}>Owes You</th>
                          {isHost && <th style={{ textAlign: 'right', padding: '6px 4px' }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {owesYouList.map(item => (
                          <tr key={item.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <td style={{ padding: '8px 4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {dtAv(item.player.id)}
                                <b>{item.player.name}</b>
                              </div>
                            </td>
                            <td style={{ padding: '8px 4px', textAlign: 'right', color: '#4ade80', fontWeight: 900 }}>
                              {money(item.amount)}
                            </td>
                            {isHost && (
                              <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="sm good"
                                  style={{ padding: '3px 8px', fontSize: 11 }}
                                  onClick={() => onSettle(item.key)}
                                >
                                  ✓ Settle
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {isHost && allDebtEntries.length > 0 && (
                <div style={{ marginTop: 14, textAlign: 'right' }}>
                  <button
                    className="sm pri"
                    onClick={onSettleAll}
                    style={{ fontSize: 12, padding: '6px 14px', fontWeight: 800 }}
                  >
                    ✓ Mark all table debts as settled
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
