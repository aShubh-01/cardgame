'use client';

import React, { useState } from 'react';
import { Player, Round, COL, esc, money } from '@/types/game';

interface SeatsListProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  defaultBuyIn?: number;
  totalStats: { rounds: number; total: number; big: number };
  playerWins: Record<string, number>;
  debts: Record<string, number>;
  onAddPlayer: (name: string, customBalance?: number) => void;
  onRemovePlayer: (id: string) => void;
  onSitToggle: (id: string) => void;
  onShuffle: () => void;
  onOpenAddMoney: (id: string) => void;
  onOpenDebtModal: () => void;
  onReorderPlayers: (newPlayers: Player[]) => void;
}

export default function SeatsList({
  players,
  round,
  balanceMode,
  defaultBuyIn = 1000,
  totalStats,
  playerWins,
  debts,
  onAddPlayer,
  onRemovePlayer,
  onSitToggle,
  onShuffle,
  onOpenAddMoney,
  onOpenDebtModal,
  onReorderPlayers,
}: SeatsListProps) {
  const [newName, setNewName] = useState('');
  const [customBal, setCustomBal] = useState<string>('');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const isBalMode = !!balanceMode;

  // Net calculation for Debt mode
  const net: Record<string, number> = {};
  players.forEach(p => { net[p.id] = 0; });
  Object.entries(debts).forEach(([k, a]) => {
    const [from, to] = k.split('|');
    if (from in net) net[from] -= a;
    if (to in net) net[to] += a;
  });

  const rankedPlayers = players.slice().sort((a, b) => {
    if (isBalMode) return (b.balance || 0) - (a.balance || 0);
    return (net[b.id] || 0) - (net[a.id] || 0);
  });

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const initialChips = customBal ? Math.max(0, +customBal) : undefined;
    onAddPlayer(trimmed, initialChips);
    setNewName('');
    setCustomBal('');
  };

  // Drag and drop reordering
  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const dragIdx = players.findIndex(p => p.id === draggedId);
    const targetIdx = players.findIndex(p => p.id === targetId);
    if (dragIdx < 0 || targetIdx < 0) return;

    const copy = [...players];
    const [removed] = copy.splice(dragIdx, 1);
    copy.splice(targetIdx, 0, removed);
    onReorderPlayers(copy);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const avFn = (id: string) => {
    const p = players.find(x => x.id === id);
    const col = COL[players.findIndex(x => x.id === id) % COL.length];
    return (
      <div className="av" style={{ background: col }}>
        {esc((p?.name[0] || '?').toUpperCase())}
      </div>
    );
  };

  return (
    <aside id="left">
      <div className="card">
        <h2>👥 Seats · drag ⠿ to reorder</h2>
        <div className="plist">
          {!players.length ? (
            <p className="mut" style={{ margin: '8px 0' }}>Add players in seating order.</p>
          ) : (
            players.map(p => {
              const isBusted = isBalMode && (p.balance || 0) <= 0;
              const isAllIn = round?.allIn?.[p.id];

              return (
                <div
                  key={p.id}
                  className={`pr ${draggedId === p.id ? 'dragging' : ''}`}
                  draggable={!round}
                  onDragStart={() => handleDragStart(p.id)}
                  onDragOver={(e) => handleDragOver(e, p.id)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="hd" title="Drag to reorder seat">⠿</span>
                  {avFn(p.id)}
                  <div className="pr-main">
                    <span className="nmx" style={{ opacity: p.sit ? 0.5 : 1 }}>
                      {p.name}
                    </span>
                    {isBalMode && (
                      <div className="pr-sub">
                        <span className={`bal-badge ${isBusted ? 'busted' : ''}`}>
                          {isBusted ? '💥 ₹0' : money(p.balance || 0)}
                        </span>
                        {isAllIn && (
                          <span style={{ fontSize: 9.5, color: '#ef4444', fontWeight: 800 }}>
                            ALL-IN
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="pr-actions">
                    {isBalMode && (
                      <button
                        className="ib sm reload-btn"
                        title="Add money / Rebuy"
                        onClick={() => onOpenAddMoney(p.id)}
                      >
                        +₹
                      </button>
                    )}
                    {!round && (
                      <>
                        <button
                          className="ib sm"
                          title={isBusted ? 'Busted (Add money to unpause)' : 'Sit out / in'}
                          onClick={() => onSitToggle(p.id)}
                        >
                          {p.sit ? '▶' : '⏸'}
                        </button>
                        <button
                          className="ib sm bad"
                          title="Remove"
                          onClick={() => onRemovePlayer(p.id)}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Add Player Box (only when no active round) */}
        {!round && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="row" style={{ gap: 6, flexWrap: 'nowrap', display: 'flex' }}>
              <input
                id="nm"
                className="grow"
                placeholder="Enter player name..."
                maxLength={20}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              />
              <button
                className="pri"
                style={{ padding: '8px 16px', whiteSpace: 'nowrap', fontWeight: 800, flexShrink: 0 }}
                onClick={handleAdd}
              >
                + Add
              </button>
            </div>

            {isBalMode && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(244,195,79,0.18)',
                  borderRadius: 8,
                  padding: '4px 8px',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--mut)' }}>Starting chips (optional):</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 800 }}>₹</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    placeholder={String(defaultBuyIn)}
                    value={customBal}
                    onChange={(e) => setCustomBal(e.target.value)}
                    style={{ width: 85, textAlign: 'center', fontSize: 12, padding: '3px 6px' }}
                    title={`Custom starting chips (defaults to ₹${defaultBuyIn})`}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <button style={{ width: '100%', marginTop: 8 }} onClick={onShuffle}>
          🔀 Shuffle order
        </button>
        <button style={{ width: '100%', marginTop: 8 }} onClick={onOpenDebtModal}>
          💸 Who owes who
        </button>
      </div>

      {/* Leaderboard / Stats Card */}
      <div className="card">
        <h2>📊 {isBalMode ? 'Leaderboard' : 'Stats'}</h2>
        <div className="row" style={{ textAlign: 'center', marginBottom: 8, display: 'flex' }}>
          <div className="grow" style={{ flex: 1 }}>
            <b>{totalStats.rounds}</b>
            <div className="mut">Rounds</div>
          </div>
          <div className="grow" style={{ flex: 1 }}>
            <b>{money(totalStats.big)}</b>
            <div className="mut">Biggest pot</div>
          </div>
        </div>

        {rankedPlayers.map(p => {
          if (isBalMode) {
            const b = p.balance || 0;
            return (
              <div className="li" key={p.id}>
                <span>
                  {p.name} <span className="mut">· won {money(playerWins[p.id] || 0)}</span>
                </span>
                <span className={b > 0 ? 'pos' : 'neg'}>{money(b)}</span>
              </div>
            );
          }
          const v = net[p.id] || 0;
          return (
            <div className="li" key={p.id}>
              <span>
                {p.name} <span className="mut">· won {money(playerWins[p.id] || 0)}</span>
              </span>
              <span className={v > 0 ? 'pos' : v < 0 ? 'neg' : 'mut'}>
                {v > 0 ? '+' : v < 0 ? '−' : ''}{money(Math.abs(v))}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

