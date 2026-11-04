'use client';

import React, { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import GoogleConfigModal from '@/components/common/GoogleConfigModal';

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const { data: session, status } = useSession();
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (!data.configured) {
        setShowConfigModal(true);
        setIsSigningIn(false);
        return;
      }
      await signIn('google');
    } catch {
      await signIn('google');
    } finally {
      setIsSigningIn(false);
    }
  };

  // 1. Loading State
  if (status === 'loading') {
    return (
      <div className="login-gate-wrap">
        <div className="bgs">
          <i style={{ left: '10%', top: '20%' }}>♠</i>
          <i style={{ left: '85%', top: '30%', animationDelay: '2s' }}>♥</i>
          <i style={{ left: '15%', top: '75%', animationDelay: '4s' }}>♦</i>
          <i style={{ left: '80%', top: '70%', animationDelay: '1s' }}>♣</i>
        </div>
        <div className="login-gate-card" style={{ textAlign: 'center', maxWidth: 400, padding: '40px 24px' }}>
          <div style={{ fontSize: 44, animation: 'float 2s ease-in-out infinite', color: 'var(--gold)' }}>
            ♠
          </div>
          <h2 style={{ color: 'var(--gold)', letterSpacing: 2, marginTop: 18, fontSize: 16, textTransform: 'uppercase' }}>
            Entering Card Room...
          </h2>
          <p className="mut" style={{ fontSize: 13, marginTop: 6 }}>
            Verifying your table credentials
          </p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State (Strict Gate)
  if (status === 'unauthenticated' || !session) {
    return (
      <div className="login-gate-wrap">
        <div className="bgs">
          <i style={{ left: '8%', top: '15%' }}>♠</i>
          <i style={{ left: '88%', top: '22%', animationDelay: '2s' }}>♥</i>
          <i style={{ left: '12%', top: '72%', animationDelay: '4s' }}>♦</i>
          <i style={{ left: '82%', top: '80%', animationDelay: '1s' }}>♣</i>
          <i style={{ left: '50%', top: '8%', animationDelay: '3s' }}>♠</i>
        </div>

        <div className="login-gate-card">
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(244,195,79,0.15)',
                border: '1px solid var(--gold)',
                color: 'var(--gold)',
                padding: '4px 14px',
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1.5,
                marginBottom: 12,
              }}
            >
              ♠ HIGH ROLLERS CARD ROOM ♥
            </span>
            <h1 className="login-gate-title">SATTEBAAZI TRACKER</h1>
            <p className="login-gate-subtitle">
              Sign in with Google to access tables, track bankrolls, manage pots &amp; settle debts.
            </p>
          </div>

          <div className="login-features-list" style={{ marginBottom: 24 }}>
            <div className="login-feat-item">
              <span className="feat-icon">🃏</span>
              <div>
                <b>Teen Patti &amp; Texas Hold&apos;em</b>
                <p>Blind vs Seen, All-In, dynamic Main &amp; Side Pots with showdown splits.</p>
              </div>
            </div>
            <div className="login-feat-item">
              <span className="feat-icon">🎴</span>
              <div>
                <b>Indian Rummy &amp; Blackjack</b>
                <p>Points Rummy (configurable cards) and Dealer/House 21 blackjack engine.</p>
              </div>
            </div>
            <div className="login-feat-item">
              <span className="feat-icon">💰</span>
              <div>
                <b>Persistent Sessions &amp; Debt Settlements</b>
                <p>Separate sessions for each game with automatic who-owes-whom ledger.</p>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              className="google-login-btn-lg"
              onClick={handleSignIn}
              disabled={isSigningIn}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              {isSigningIn ? 'Connecting...' : 'Sign in with Google'}
            </button>
          </div>
        </div>

        {showConfigModal && (
          <GoogleConfigModal onClose={() => setShowConfigModal(false)} />
        )}
      </div>
    );
  }

  // 3. Authenticated State
  return <>{children}</>;
}
