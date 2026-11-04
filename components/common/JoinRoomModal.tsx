'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { SessionDoc } from '@/types/game';

interface JoinRoomModalProps {
  initialRoomCode?: string;
  onClose: () => void;
  onJoinSuccess: (session: SessionDoc) => void;
}

const GAME_ROUTES: Record<string, string> = {
  tp: '/teen-patti',
  pk: '/poker',
  rummy: '/rummy',
  bj: '/blackjack',
};

export default function JoinRoomModal({ initialRoomCode, onClose, onJoinSuccess }: JoinRoomModalProps) {
  const router = useRouter();
  const { data: authSession } = useSession();

  const getInitialCode = () => {
    if (initialRoomCode) return initialRoomCode.trim().toUpperCase();
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return (p.get('join') || p.get('room') || '').trim().toUpperCase();
    }
    return '';
  };

  const initialCode = getInitialCode();
  const [roomCode, setRoomCode] = useState(initialCode);
  const [playerName, setPlayerName] = useState(
    authSession?.user?.name || authSession?.user?.email?.split('@')[0] || ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (authSession?.user && !playerName) {
      setPlayerName(authSession.user.name || authSession.user.email?.split('@')[0] || '');
    }
  }, [authSession?.user, playerName]);

  React.useEffect(() => {
    const code = getInitialCode();
    if (code && !roomCode) {
      setRoomCode(code);
    }
  }, [initialRoomCode]);

  const handleJoin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = roomCode.trim().toUpperCase();
    if (!clean) {
      setError('Please enter a room code');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/sessions/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: clean, playerName: playerName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to join room.');
        return;
      }

      onJoinSuccess(data.session);
      const targetRoute = GAME_ROUTES[data.gameType] || '/';
      onClose();
      if (typeof window !== 'undefined') {
        window.location.href = `${targetRoute}?session=${data.sessionId}`;
      } else {
        router.push(`${targetRoute}?session=${data.sessionId}`);
      }
    } catch (err: any) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="session-modal-box" style={{ maxWidth: 420 }}>
        <div className="session-modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: '#38bdf8' }}>🌐 Join Online Room</h2>
            <div className="mut" style={{ fontSize: 12, marginTop: 3 }}>
              Enter the 6-character room code shared by the host.
            </div>
          </div>
          <button className="sm" onClick={onClose}>✕ Close</button>
        </div>

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 11, opacity: 0.8 }}>
                6-Digit Room Code
              </label>
              {initialCode && (
                <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 800, background: 'rgba(34, 197, 94, 0.15)', padding: '1px 6px', borderRadius: 4 }}>
                  ✓ Autofilled from Link
                </span>
              )}
            </div>
            <input
              type="text"
              placeholder="e.g. 7X9K2A"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoFocus={!initialCode}
              style={{
                width: '100%',
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '0.25em',
                textAlign: 'center',
                padding: '10px',
                textTransform: 'uppercase',
                border: '1.5px solid rgba(56, 189, 248, 0.4)',
                borderRadius: 8,
                background: 'rgba(15, 23, 42, 0.7)',
                color: '#38bdf8',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 6 }}>
              Your In-Game Display Name
            </label>
            <input
              type="text"
              placeholder="Enter your name / nickname"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20}
              autoFocus={!!initialCode}
              style={{
                width: '100%',
                fontSize: 14,
                fontWeight: 600,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(15, 23, 42, 0.6)',
                color: '#fff',
              }}
            />
            <div className="mut" style={{ fontSize: 10.5, marginTop: 4 }}>
              This is the name other players will see at the table.
            </div>
          </div>

          {error && (
            <div style={{ color: '#f87171', fontSize: 12, background: 'rgba(239,68,68,0.15)', padding: '6px 10px', borderRadius: 6 }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <button type="button" className="sm" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="sm pri"
              disabled={!roomCode.trim() || loading}
              style={{
                padding: '8px 20px',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                color: '#fff',
                border: 'none',
              }}
            >
              {loading ? 'Joining...' : 'Join Game Table ▶'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

