'use client';

import React, { useState } from 'react';
import { Player, Round, ChipRequest, COL, esc, money } from '@/types/game';

interface SeatsListProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  defaultBuyIn?: number;
  totalStats: { rounds: number; total: number; big: number };
  playerWins: Record<string, number>;
  debts: Record<string, number>;
  sessionMode?: 'tracker' | 'online';
  roomCode?: string | null;
  myPlayerId?: string | null;
  isHost?: boolean;
  readyPlayers?: Record<string, boolean>;
  chipRequests?: ChipRequest[];
  onResolveChipRequest?: (requestId: string, decision: 'approved' | 'rejected') => void;
  onAddPlayer: (name: string, customBalance?: number) => void;
  onRemovePlayer: (id: string) => void;
  onRenamePlayer?: (id: string, newName: string) => void;
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
  sessionMode = 'tracker',
  roomCode,
  myPlayerId,
  isHost = true,
  readyPlayers = {},
  chipRequests = [],
  onResolveChipRequest,
  onAddPlayer,
  onRemovePlayer,
  onRenamePlayer,
  onSitToggle,
  onShuffle,
  onOpenAddMoney,
  onOpenDebtModal,
  onReorderPlayers,
}: SeatsListProps) {
  const [newName, setNewName] = useState('');
  const [customBal, setCustomBal] = useState<string>('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const isBalMode = !!balanceMode;
  const isOnline = sessionMode === 'online';
  const isRoundActive = Boolean(round && !round.settled && round.phase !== 'result');
  const pendingRequests = (chipRequests || []).filter(r => r.status === 'pending');

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

  // Drag and drop reordering (Admin only, when round is not running)
  const handleDragStart = (id: string) => {
    if (!isHost || round) return;
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!isHost || round || !draggedId || draggedId === targetId) return;
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
      {/* Admin Pending Chip Requests Box */}
      {isOnline && isBalMode && isHost && pendingRequests.length > 0 && (
        <div
          className="card"
          style={{
            borderColor: 'var(--gold)',
            background: 'linear-gradient(145deg, rgba(244, 195, 79, 0.16), rgba(15, 23, 42, 0.9))',
          }}
        >
          <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🪙 Chip Requests</span>
            <span
              style={{
                background: 'var(--gold)',
                color: '#000',
                borderRadius: 99,
                padding: '1px 8px',
                fontSize: 11,
                fontWeight: 900,
              }}
            >
              {pendingRequests.length}
            </span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingRequests.map(req => (
              <div
                key={req.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(0,0,0,0.45)',
                  border: '1px solid rgba(244,195,79,0.35)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  gap: 8,
                }}
              >
                <div>
                  <b style={{ fontSize: 13 }}>{req.playerName}</b>
                  <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 800 }}>
                    Requested +{money(req.amount)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    type="button"
                    className="sm good"
                    style={{ padding: '4px 9px', fontSize: 11, fontWeight: 800 }}
                    onClick={() => onResolveChipRequest?.(req.id, 'approved')}
                  >
                    ✓ Accept
                  </button>
                  <button
                    type="button"
                    className="sm bad"
                    style={{ padding: '4px 8px', fontSize: 11 }}
                    onClick={() => onResolveChipRequest?.(req.id, 'rejected')}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>👥 {isHost && !round ? 'Seats · drag ⠿ to reorder' : 'Seated Players'}</h2>
        <div className="plist">
          {!players.length ? (
            <p className="mut" style={{ margin: '8px 0' }}>Add players in seating order.</p>
          ) : (
            players.map(p => {
              const isBusted = isBalMode && (p.balance || 0) <= 0;
              const isAllIn = round?.allIn?.[p.id];
              const canEditName = isHost || p.id === myPlayerId;
              // Requests & chip edits are only allowed before a round starts or after a round ends
              const canOpenChips = !isRoundActive && isBalMode && (!isOnline || isHost || p.id === myPlayerId);
              const myPendingReq = pendingRequests.find(r => r.playerId === p.id);
              const isPlayerReady = Boolean(readyPlayers?.[p.id]);

              return (
                <div
                  key={p.id}
                  className={`pr ${draggedId === p.id ? 'dragging' : ''}`}
                  draggable={isHost && !round}
                  onDragStart={() => handleDragStart(p.id)}
                  onDragOver={(e) => handleDragOver(e, p.id)}
                  onDragEnd={handleDragEnd}
                >
                  {isHost && !round && <span className="hd" title="Drag to reorder seat">⠿</span>}
                  {avFn(p.id)}
                  <div className="pr-main">
                    {editingId === p.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          maxLength={20}
                          autoFocus
                          style={{
                            fontSize: 12,
                            padding: '2px 6px',
                            width: 110,
                            borderRadius: 4,
                            border: '1px solid #38bdf8',
                            background: 'rgba(15, 23, 42, 0.9)',
                            color: '#38bdf8',
                            fontWeight: 700,
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingName.trim() && onRenamePlayer) {
                                onRenamePlayer(p.id, editingName.trim());
                              }
                              setEditingId(null);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                            }
                          }}
                          onBlur={() => {
                            if (editingName.trim() && onRenamePlayer) {
                              onRenamePlayer(p.id, editingName.trim());
                            }
                            setEditingId(null);
                          }}
                        />
                        <button
                          type="button"
                          className="sm"
                          style={{ padding: '2px 5px', fontSize: 10, background: '#0284c7', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                          onClick={() => {
                            if (editingName.trim() && onRenamePlayer) {
                              onRenamePlayer(p.id, editingName.trim());
                            }
                            setEditingId(null);
                          }}
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span className="nmx" style={{ opacity: p.sit ? 0.5 : 1 }}>
                          {p.name}
                        </span>
                        {p.id === myPlayerId && (
                          <span style={{ fontSize: 9, background: '#38bdf8', color: '#0f172a', fontWeight: 900, padding: '1px 4px', borderRadius: 4 }}>
                            YOU
                          </span>
                        )}
                        {isOnline && !isRoundActive && !p.sit && (
                          <span
                            style={{
                              fontSize: 9.5,
                              background: isPlayerReady ? 'rgba(46, 204, 113, 0.2)' : 'rgba(242, 201, 76, 0.14)',
                              color: isPlayerReady ? '#2ecc71' : '#f2c94c',
                              border: isPlayerReady ? '1px solid rgba(46, 204, 113, 0.45)' : '1px solid rgba(242, 201, 76, 0.35)',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: 999,
                            }}
                          >
                            {isPlayerReady ? '👍 Ready' : '⏳'}
                          </span>
                        )}
                        {canEditName && (
                          <button
                            type="button"
                            title="Change username / Rename"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 11,
                              padding: '0 2px',
                              opacity: 0.6,
                              color: '#94a3b8',
                            }}
                            onClick={() => {
                              setEditingId(p.id);
                              setEditingName(p.name);
                            }}
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    )}
                    {round && !round.parts?.includes(p.id) && (
                      <span style={{ fontSize: 9.5, color: '#38bdf8', fontWeight: 800, marginTop: 2, display: 'block' }}>
                        ⏳ Next Hand
                      </span>
                    )}
                    {isBalMode && (
                      <div className="pr-sub" style={{ flexWrap: 'wrap' }}>
                        <span className={`bal-badge ${isBusted ? 'busted' : ''}`}>
                          {isBusted ? '💥 ₹0' : money(p.balance || 0)}
                        </span>
                        {isAllIn && (
                          <span style={{ fontSize: 9.5, color: '#ef4444', fontWeight: 800 }}>
                            ALL-IN
                          </span>
                        )}
                        {myPendingReq && (
                          <span style={{ fontSize: 9.5, color: 'var(--gold)', fontWeight: 800 }}>
                            ⏳ Req +{money(myPendingReq.amount)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="pr-actions">
                    {canOpenChips && (
                      <button
                        className="ib sm reload-btn"
                        title={isOnline && !isHost ? 'Request chips from admin' : 'Manage chips (Credit / Debit / Overwrite)'}
                        onClick={() => onOpenAddMoney(p.id)}
                      >
                        +₹
                      </button>
                    )}
                    {isHost && !round && (
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

        {/* Manual Player Add only in Offline Tracker Mode */}
        {!isOnline && !round && isHost && (
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

        {/* Shuffle Order: ONLY shown for Admin (isHost), and DISABLED while a game is running */}
        {isHost && (
          <button
            style={{ width: '100%', marginTop: 8 }}
            disabled={(!!round && !round.settled) || players.length < 2}
            title={round && !round.settled ? 'Cannot shuffle seating order while a round is in progress' : 'Randomly shuffle player seating order'}
            onClick={onShuffle}
          >
            🔀 Shuffle order
          </button>
        )}

        <button style={{ width: '100%', marginTop: 8 }} onClick={onOpenDebtModal}>
          💸 You owe &amp; Who owes you
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
