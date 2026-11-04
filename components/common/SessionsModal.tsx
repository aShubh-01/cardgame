'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SessionDoc, money } from '@/types/game';

interface SessionsModalProps {
  sessions: SessionDoc[];
  currentSessionId: string | null;
  initialGameFilter?: 'all' | 'tp' | 'pk' | 'rummy' | 'bj';
  onClose: () => void;
  onSwitchSession: (sessionId: string) => Promise<SessionDoc | null | void> | void;
  onCreateSession: (name: string, gameType: 'tp' | 'pk' | 'rummy' | 'bj', balanceMode: boolean, defaultBuyIn?: number) => Promise<SessionDoc | null | void>;
  onSessionChosen?: (session: SessionDoc) => void;
}

const GAME_ROUTES: Record<'tp' | 'pk' | 'rummy' | 'bj', string> = {
  tp: '/teen-patti',
  pk: '/poker',
  rummy: '/rummy',
  bj: '/blackjack',
};

const GAME_NAMES: Record<'tp' | 'pk' | 'rummy' | 'bj', string> = {
  tp: 'Teen Patti',
  pk: 'Texas Hold\'em',
  rummy: 'Indian Rummy',
  bj: 'Blackjack',
};

const GAME_ICONS: Record<'tp' | 'pk' | 'rummy' | 'bj', string> = {
  tp: '🃏',
  pk: '♠',
  rummy: '🎴',
  bj: '♦',
};

export default function SessionsModal({
  sessions,
  currentSessionId,
  initialGameFilter = 'all',
  onClose,
  onSwitchSession,
  onCreateSession,
  onSessionChosen,
}: SessionsModalProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'tp' | 'pk' | 'rummy' | 'bj'>(initialGameFilter);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGame, setNewGame] = useState<'tp' | 'pk' | 'rummy' | 'bj'>(
    initialGameFilter !== 'all' ? initialGameFilter : 'pk'
  );
  const [newBalMode, setNewBalMode] = useState(false);
  const [newBuyIn, setNewBuyIn] = useState(1000);
  const [submitting, setSubmitting] = useState(false);

  const filteredSessions = sessions.filter(s => {
    if (filter === 'all') return true;
    return s.gameType === filter;
  });

  const handleSelectSession = async (sess: SessionDoc) => {
    await onSwitchSession(sess._id);
    if (onSessionChosen) {
      onSessionChosen(sess);
    } else {
      router.push(GAME_ROUTES[sess.gameType]);
    }
    onClose();
  };

  const handleCreate = async () => {
    if (!newName.trim() || submitting) return;
    setSubmitting(true);
    try {
      const created = await onCreateSession(
        newName.trim(),
        newGame,
        newBalMode,
        newBalMode ? newBuyIn : undefined
      );
      setNewName('');
      setIsCreating(false);

      if (created && typeof created === 'object' && '_id' in created) {
        if (onSessionChosen) {
          onSessionChosen(created as SessionDoc);
        } else {
          router.push(GAME_ROUTES[(created as SessionDoc).gameType]);
        }
      } else {
        router.push(GAME_ROUTES[newGame]);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="session-modal-box">
        <div className="session-modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              {filter !== 'all' ? `${GAME_ICONS[filter]} ${GAME_NAMES[filter]} Sessions` : '🎲 Game Sessions'}
            </h2>
            <div className="mut" style={{ fontSize: 12, marginTop: 3 }}>
              {filter !== 'all'
                ? `Choose an existing ${GAME_NAMES[filter]} session to join, or create a new one.`
                : 'Each session tracks players, bankrolls, rounds, and debts independently.'}
            </div>
          </div>
          <button className="sm" onClick={onClose}>✕ Close</button>
        </div>

        {/* Filter tabs & New Session toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div className="seg" style={{ margin: 0 }}>
            <button className={filter === 'all' ? 'on' : ''} onClick={() => { setFilter('all'); setNewGame('pk'); }}>All</button>
            <button className={filter === 'pk' ? 'on' : ''} onClick={() => { setFilter('pk'); setNewGame('pk'); }}>♠ Poker</button>
            <button className={filter === 'tp' ? 'on' : ''} onClick={() => { setFilter('tp'); setNewGame('tp'); }}>♥ Teen Patti</button>
            <button className={filter === 'rummy' ? 'on' : ''} onClick={() => { setFilter('rummy'); setNewGame('rummy'); }}>🎴 Rummy</button>
            <button className={filter === 'bj' ? 'on' : ''} onClick={() => { setFilter('bj'); setNewGame('bj'); }}>♦ Blackjack</button>
          </div>
          <button
            className="sm pri"
            style={{ fontWeight: 800 }}
            onClick={() => {
              if (filter !== 'all') setNewGame(filter);
              setIsCreating(prev => !prev);
            }}
          >
            {isCreating ? 'Cancel' : '+ New Session'}
          </button>
        </div>

        {/* New Session Creation Form */}
        {isCreating && (
          <div className="new-session-form">
            <h3 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--gold)' }}>
              Create New {filter !== 'all' ? GAME_NAMES[filter] : ''} Session
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 3 }}>Session Name</label>
                <input
                  type="text"
                  placeholder={`e.g. Friday ${GAME_NAMES[newGame]} Night`}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={40}
                  style={{ width: '100%', fontSize: 14, padding: '6px 10px' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 3 }}>Game</label>
                  <div className="seg" style={{ margin: 0, width: '100%' }}>
                    <button
                      type="button"
                      style={{ flex: 1 }}
                      className={newGame === 'pk' ? 'on' : ''}
                      onClick={() => setNewGame('pk')}
                    >
                      ♠ Poker
                    </button>
                    <button
                      type="button"
                      style={{ flex: 1 }}
                      className={newGame === 'tp' ? 'on' : ''}
                      onClick={() => setNewGame('tp')}
                    >
                      ♥ Teen Patti
                    </button>
                    <button
                      type="button"
                      style={{ flex: 1 }}
                      className={newGame === 'rummy' ? 'on' : ''}
                      onClick={() => setNewGame('rummy')}
                    >
                      🎴 Rummy
                    </button>
                    <button
                      type="button"
                      style={{ flex: 1 }}
                      className={newGame === 'bj' ? 'on' : ''}
                      onClick={() => setNewGame('bj')}
                    >
                      ♦ Blackjack
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 3 }}>Bankroll Mode (Locked to session)</label>
                  <div className="seg" style={{ margin: 0, width: '100%' }}>
                    <button
                      type="button"
                      style={{ flex: 1 }}
                      className={!newBalMode ? 'on' : ''}
                      onClick={() => setNewBalMode(false)}
                    >
                      📜 Debts
                    </button>
                    <button
                      type="button"
                      style={{ flex: 1 }}
                      className={newBalMode ? 'on' : ''}
                      onClick={() => setNewBalMode(true)}
                    >
                      🪙 Chips
                    </button>
                  </div>
                </div>
              </div>

              {newBalMode ? (
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(244,195,79,0.25)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12 }}>Starting Buy-in per player:</span>
                    <input
                      type="number"
                      min="10"
                      step="50"
                      value={newBuyIn}
                      onChange={(e) => setNewBuyIn(+e.target.value || 1000)}
                      style={{ width: 100, textAlign: 'center', fontSize: 14 }}
                    />
                  </div>
                  <div className="q" style={{ marginTop: 8 }}>
                    <button type="button" className="sm" onClick={() => setNewBuyIn(500)}>₹500</button>
                    <button type="button" className="sm" onClick={() => setNewBuyIn(1000)}>₹1,000</button>
                    <button type="button" className="sm" onClick={() => setNewBuyIn(2000)}>₹2,000</button>
                    <button type="button" className="sm" onClick={() => setNewBuyIn(5000)}>₹5,000</button>
                  </div>
                  <div className="mut" style={{ fontSize: 11, marginTop: 6 }}>
                    Every player starts with this chip stack. All-ins and rebuys are tracked.
                  </div>
                </div>
              ) : (
                <div className="mut" style={{ fontSize: 11, background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 6 }}>
                  📜 <b>Debt Mode:</b> Players don&apos;t have fixed stacks. Net wins and losses are calculated and settled via the Debt matrix.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button className="sm" onClick={() => setIsCreating(false)}>Cancel</button>
                <button
                  className="sm pri"
                  style={{ fontWeight: 800, padding: '6px 16px' }}
                  disabled={!newName.trim() || submitting}
                  onClick={handleCreate}
                >
                  {submitting ? 'Creating...' : 'Create & Play'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sessions List or Empty State */}
        <div className="session-cards-list">
          {!filteredSessions.length ? (
            <div style={{ textAlign: 'center', padding: '36px 20px', background: 'rgba(0,0,0,0.25)', borderRadius: 14, border: '1px dashed var(--line)', margin: '10px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>
                {filter !== 'all' ? GAME_ICONS[filter] : '🎲'}
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: 16, color: 'var(--gold)' }}>
                {filter !== 'all' ? `No ${GAME_NAMES[filter]} Sessions Available` : 'No Sessions Found'}
              </h3>
              <p className="mut" style={{ fontSize: 12.5, maxWidth: 360, margin: '0 auto 16px', lineHeight: 1.45 }}>
                {filter !== 'all'
                  ? `No sessions currently exist for ${GAME_NAMES[filter]}. Create a session below to set buy-ins and start recording your physical card game.`
                  : 'No game sessions exist yet. Create one to begin tracking stacks, pots, and debts.'}
              </p>
              {!isCreating && (
                <button
                  type="button"
                  className="pri big"
                  style={{ padding: '8px 24px', fontSize: 13 }}
                  onClick={() => {
                    if (filter !== 'all') setNewGame(filter);
                    setIsCreating(true);
                  }}
                >
                  + Create {filter !== 'all' ? GAME_NAMES[filter] : ''} Session
                </button>
              )}
            </div>
          ) : (
            filteredSessions.map(sess => {
              const isCurrent = sess._id === currentSessionId;
              const isEnded = sess.status === 'archived';
              const dateStr = sess.createdAt
                ? new Date(sess.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '';
              const totalPot = sess.tot?.total || 0;
              const roundsCount = sess.tot?.rounds || 0;
              const playersCount = sess.players?.length || 0;

              return (
                <div
                  key={sess._id}
                  className={`session-card ${isCurrent ? 'active-sess' : ''}`}
                  onClick={() => handleSelectSession(sess)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span className="session-game-tag">
                        {GAME_ICONS[sess.gameType]} {GAME_NAMES[sess.gameType]}
                      </span>
                      <b style={{ fontSize: 14 }}>{sess.name}</b>
                      {isCurrent && (
                        <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: '1px solid #4ade80', borderRadius: 4, padding: '1px 5px', fontWeight: 800 }}>
                          ACTIVE TABLE
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>
                        {isEnded ? '● Ended' : '● Live'}
                      </span>
                      <button
                        className="sm pri"
                        style={{ padding: '3px 10px', fontSize: 11, fontWeight: 800 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectSession(sess);
                        }}
                      >
                        ▶ Play
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--mut)', marginTop: 6, flexWrap: 'wrap' }}>
                    <span>👥 {playersCount} players</span>
                    <span>
                      {sess.gameType === 'rummy' ? `🎴 ${roundsCount} deals` : sess.gameType === 'bj' ? `♦ ${roundsCount} hands` : `🃏 ${roundsCount} rounds`}
                    </span>
                    <span>💰 Total pot: {money(totalPot)}</span>
                    <span>{sess.balanceMode ? '🪙 Chips Mode' : '📝 Debt Mode'}</span>
                    {dateStr && <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>{dateStr}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
