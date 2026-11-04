'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { SessionDoc, money } from '@/types/game';

interface SessionsModalProps {
  sessions: SessionDoc[];
  currentSessionId: string | null;
  initialGameFilter?: 'all' | 'tp' | 'pk' | 'rummy' | 'bj';
  onClose: () => void;
  onSwitchSession: (sessionId: string) => Promise<SessionDoc | null | void> | void;
  onCreateSession: (
    name: string,
    gameType: 'tp' | 'pk' | 'rummy' | 'bj',
    balanceMode: boolean,
    defaultBuyIn?: number,
    sessionMode?: 'tracker' | 'online',
    hostName?: string
  ) => Promise<SessionDoc | null | void>;
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
  const { data: authSession } = useSession();
  const defaultHostName = authSession?.user?.name || authSession?.user?.email?.split('@')[0] || '';

  const [filter, setFilter] = useState<'all' | 'tp' | 'pk' | 'rummy' | 'bj'>(initialGameFilter);
  const [isCreating, setIsCreating] = useState(false);
  const [newMode, setNewMode] = useState<'tracker' | 'online'>('tracker');
  const [newName, setNewName] = useState('');
  const [hostPlayerName, setHostPlayerName] = useState(defaultHostName);
  const [newGame, setNewGame] = useState<'tp' | 'pk' | 'rummy' | 'bj'>(
    initialGameFilter !== 'all' ? initialGameFilter : 'pk'
  );
  const [newBalMode, setNewBalMode] = useState(false);
  const [newBuyInStr, setNewBuyInStr] = useState<string>('1000');
  const [submitting, setSubmitting] = useState(false);
  const newBuyIn = newBuyInStr.trim() === '' ? 0 : Math.floor(Number(newBuyInStr));
  const isBuyInValid = !newBalMode || (!isNaN(newBuyIn) && newBuyIn >= 10);

  const filteredSessions = sessions.filter(s => {
    if (filter === 'all') return true;
    return s.gameType === filter;
  });

  const handleSelectSession = async (sess: SessionDoc) => {
    await onSwitchSession(sess._id);
    if (onSessionChosen) {
      onSessionChosen(sess);
    } else {
      if (typeof window !== 'undefined') {
        window.location.href = `${GAME_ROUTES[sess.gameType]}?session=${sess._id}`;
      } else {
        router.push(`${GAME_ROUTES[sess.gameType]}?session=${sess._id}`);
      }
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
        newBalMode ? newBuyIn : undefined,
        newMode,
        newMode === 'online' ? hostPlayerName.trim() : undefined
      );
      setNewName('');
      setIsCreating(false);

      if (created && typeof created === 'object' && '_id' in created) {
        if (onSessionChosen) {
          onSessionChosen(created as SessionDoc);
        } else {
          const sess = created as SessionDoc;
          if (typeof window !== 'undefined') {
            window.location.href = `${GAME_ROUTES[sess.gameType]}?session=${sess._id}`;
          } else {
            router.push(`${GAME_ROUTES[sess.gameType]}?session=${sess._id}`);
          }
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
              {/* Mode Selection */}
              <div>
                <label style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 4 }}>Session Mode</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  <div
                    onClick={() => setNewMode('tracker')}
                    style={{
                      cursor: 'pointer',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: newMode === 'tracker' ? '1.5px solid var(--gold)' : '1px solid rgba(255,255,255,0.12)',
                      background: newMode === 'tracker' ? 'rgba(244, 195, 79, 0.12)' : 'rgba(0,0,0,0.25)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: newMode === 'tracker' ? 'var(--gold)' : '#fff' }}>
                      <span>🎲</span>
                      <span>IRL Tracker Mode</span>
                      {newMode === 'tracker' && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--gold)' }}>✓</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 4, lineHeight: 1.35 }}>
                      Playing with physical cards in real life. Admin manually records rounds, chip stacks, and settlements.
                    </div>
                  </div>

                  <div
                    onClick={() => setNewMode('online')}
                    style={{
                      cursor: 'pointer',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: newMode === 'online' ? '1.5px solid #38bdf8' : '1px solid rgba(255,255,255,0.12)',
                      background: newMode === 'online' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(0,0,0,0.25)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: newMode === 'online' ? '#38bdf8' : '#fff' }}>
                      <span>🌐</span>
                      <span>Online Multiplayer</span>
                      {newMode === 'online' && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#38bdf8' }}>✓</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 4, lineHeight: 1.35 }}>
                      Play online across devices with a shareable Room Code. Virtual cards, decentralized player inputs &amp; sync.
                    </div>
                  </div>
                </div>
              </div>

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

              {newMode === 'online' && (
                <div>
                  <label style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 3 }}>
                    Your Display Name (Session Owner &amp; Default Game Operator)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your name / nickname"
                    value={hostPlayerName}
                    onChange={(e) => setHostPlayerName(e.target.value)}
                    maxLength={20}
                    style={{
                      width: '100%',
                      fontSize: 13,
                      fontWeight: 600,
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      background: 'rgba(15, 23, 42, 0.7)',
                      color: '#38bdf8',
                    }}
                  />
                  <div className="mut" style={{ fontSize: 10.5, marginTop: 3 }}>
                    You start as the Session Owner &amp; stealth Game Operator (hidden from players). You can transfer the Game Operator role to any player before/after a round if you want to play!
                  </div>
                </div>
              )}

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
                    <span style={{ fontSize: 12 }}>Starting Buy-in per player (Min ₹10):</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="1000"
                      value={newBuyInStr}
                      onChange={(e) => setNewBuyInStr(e.target.value.replace(/[^0-9]/g, ''))}
                      style={{ width: 100, textAlign: 'center', fontSize: 14 }}
                    />
                  </div>
                  <div className="q" style={{ marginTop: 8 }}>
                    <button type="button" className="sm" onClick={() => setNewBuyInStr('500')}>₹500</button>
                    <button type="button" className="sm" onClick={() => setNewBuyInStr('1000')}>₹1,000</button>
                    <button type="button" className="sm" onClick={() => setNewBuyInStr('2000')}>₹2,000</button>
                    <button type="button" className="sm" onClick={() => setNewBuyInStr('5000')}>₹5,000</button>
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
                  disabled={!newName.trim() || !isBuyInValid || submitting}
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

                  <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--mut)', marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 10.5,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: sess.sessionMode === 'online' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255, 255, 255, 0.08)',
                      color: sess.sessionMode === 'online' ? '#38bdf8' : '#e2e8f0',
                      border: sess.sessionMode === 'online' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.15)',
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                    }}>
                      {sess.sessionMode === 'online' ? `🌐 Online · Room ${sess.roomCode || ''}` : '🎲 IRL Tracker'}
                    </span>
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
