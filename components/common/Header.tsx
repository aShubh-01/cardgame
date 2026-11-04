'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { GType, SessionDoc } from '@/types/game';

interface HeaderProps {
  title: string;
  roundTag?: string;
  sessionName?: string;
  currentGame: GType;
  sessionDoc?: SessionDoc | null;
  onOpenSessions: () => void;
  onOpenJoinRoom?: () => void;
  onResetGame?: () => void;
  onGoogleSignIn: () => void;
}

export default function Header({
  title,
  roundTag,
  sessionName,
  currentGame,
  sessionDoc,
  onOpenSessions,
  onOpenJoinRoom,
  onResetGame,
  onGoogleSignIn,
}: HeaderProps) {
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (!sessionDoc?.roomCode) return;
    const url = `${window.location.origin}/?join=${sessionDoc.roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      prompt('Copy this room code:', sessionDoc.roomCode);
    });
  };

  return (
    <header>
      <h1 id="ttl">
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          {title}
        </Link>
      </h1>

      {currentGame && roundTag && (
        <span className="tag" id="rn">{roundTag}</span>
      )}

      {/* Online Room Code Pill */}
      {sessionDoc?.sessionMode === 'online' && sessionDoc?.roomCode && (
        <div>
          {sessionDoc.roomCode && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px',
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: 6,
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: 900,
                color: '#38bdf8',
                letterSpacing: '0.15em',
              }}
            >
              <span>Room Code: {sessionDoc.roomCode}</span>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  fontSize: 11,
                  padding: 0,
                }}
                onClick={() => {
                  if (typeof navigator !== 'undefined') {
                    navigator.clipboard.writeText(sessionDoc?.roomCode || '');
                  }
                }}
                title="Copy Room Code"
              >
                📋
              </button>
            </div>
          )}
        </div>

      )}

      <span className="sp"></span>

      {/* Join Online Room Button */}
      {onOpenJoinRoom && (
        <button
          type="button"
          className="sm"
          onClick={onOpenJoinRoom}
          title="Join an online multiplayer room"
          style={{
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            color: '#38bdf8',
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          🌐 Join Room
        </button>
      )}

      {/* Sessions badge */}
      <button
        className="sm session-badge"
        onClick={onOpenSessions}
        title="Switch or manage game sessions"
      >
        🎲 {sessionName ? (sessionName.length > 18 ? sessionName.slice(0, 18) + '…' : sessionName) : 'Sessions'} ▾
      </button>

      {/* Games / Lobby Link */}
      <Link
        href="/"
        className="sm"
        style={{
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
        }}
      >
        🎮 Games
      </Link>

      {/* Reset game button */}
      {currentGame && onResetGame && (
        <button className="sm" id="resetb" onClick={onResetGame}>
          Reset game
        </button>
      )}

      {/* Google Authentication */}
      {session?.user ? (
        <div className="auth-user-badge">
          {session.user.image ? (
            <img src={session.user.image} alt={session.user.name || 'User'} className="auth-avatar" />
          ) : (
            <span className="auth-avatar-fallback">{(session.user.name?.[0] || 'U').toUpperCase()}</span>
          )}
          <span className="auth-username" title={session.user.email || ''}>
            {session.user.name || session.user.email}
          </span>
          <button className="sm auth-logout-btn" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      ) : (
        <button className="sm google-login-btn" onClick={onGoogleSignIn}>
          <svg width="15" height="15" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          Sign in with Google
        </button>
      )}
    </header>
  );
}

