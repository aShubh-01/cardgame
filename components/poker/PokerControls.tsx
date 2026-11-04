'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Player, Round, COL, money } from '@/types/game';
import { calculatePots } from '@/lib/pokerPot';
import { resolveBetAmount } from '@/lib/pokerEngine';
import { sounds } from '@/lib/soundEffects';
import PlayingCard from '@/components/common/PlayingCard';

interface PokerControlsProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  defaultBuyIn?: number;
  ante: { mode: string; amt: number };
  blinds?: { sb: number; bb: number };
  dealerIdx?: number;
  onSetBlinds?: (sb: number, bb: number) => void;
  onStartRound: (anteMap?: Record<string, number>) => void;
  onAbortRound: () => void;
  onUndo: () => void;
  onSetBalanceMode: (enabled: boolean) => void;
  onSetDefaultBuyIn: (amt: number) => void;
  onResetAllBalances: () => void;
  onSetAnteMode: (mode: string) => void;
  onSetAnteAmt: (amt: number) => void;
  onAct: (action: string, amt?: number) => void;
  onRequestMutualShow?: () => void;
  onRespondMutualShow?: (decision: 'accepted' | 'rejected') => void;
  onConfirmShowdown: (potWinners: Record<string, string[]>) => void;
  sessionMode?: 'tracker' | 'online';
  myPlayerId?: string | null;
  isHost?: boolean;
  readyPlayers?: Record<string, boolean>;
  onToggleReady?: () => void;
  onOpenAddMoney?: (playerId: string) => void;
}

export default function PokerControls({
  players,
  round,
  balanceMode,
  defaultBuyIn = 1000,
  ante,
  dealerIdx = 0,
  onStartRound,
  onAbortRound,
  onUndo,
  onSetDefaultBuyIn,
  onResetAllBalances,
  onSetAnteMode,
  onSetAnteAmt,
  onAct,
  onRequestMutualShow,
  onRespondMutualShow,
  onConfirmShowdown,
  sessionMode = 'tracker',
  myPlayerId,
  isHost = true,
  readyPlayers = {},
  onToggleReady,
  onOpenAddMoney,
}: PokerControlsProps) {
  const [betInputStr, setBetInputStr] = useState<string>('50');
  const [buyInStr, setBuyInStr] = useState<string>(String(defaultBuyIn));
  const [anteAmtStr, setAnteAmtStr] = useState<string>(String(ante.amt || 0));
  const [showCustomRaise, setShowCustomRaise] = useState<boolean>(false);
  const [potWinnersState, setPotWinnersState] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setBuyInStr(String(defaultBuyIn));
  }, [defaultBuyIn]);

  useEffect(() => {
    setAnteAmtStr(String(ante.amt ?? 0));
  }, [ante.amt]);

  const isBalMode = !!balanceMode;
  const isOnline = sessionMode === 'online';
  const seated = players.filter(p => !p.sit && !p.isGameOperator);
  const readyCount = seated.filter(p => readyPlayers[p.id]).length;
  const allSeatedReady = !isOnline || (seated.length >= 2 && readyCount === seated.length);
  const isMeReady = Boolean(myPlayerId && readyPlayers[myPlayerId]);

  const { pots, totalPot } = round
    ? calculatePots(round.contrib || {}, round.folded || {})
    : { pots: [], totalPot: 0 };

  const streetNames = ['Pre-flop', 'Flop', 'Turn', 'River'];

  // Audio alert when turn lands on current user
  const prevTurnRef = useRef<string | null>(null);
  useEffect(() => {
    if (round && round.phase === 'bet' && round.turn === myPlayerId && prevTurnRef.current !== myPlayerId) {
      sounds.playYourTurnSound();
    }
    prevTurnRef.current = round?.turn || null;
  }, [round?.turn, round?.phase, myPlayerId]);

  // Turn player stats
  const turnPlayer = round ? players.find(p => p.id === round.turn) : null;
  const sc = (round && turnPlayer && round.st?.[turnPlayer.id]) || 0;
  const cur = round?.cur || 0;
  const tc = Math.max(0, cur - sc);
  const canCheck = tc === 0;
  const bal = turnPlayer?.balance || 0;
  const canCallFull = !isBalMode || bal >= tc;
  const minRaiseStep = Math.max(round?.minRaise || 10, 10);
  const minAddForRaise = cur === 0 ? minRaiseStep : tc + minRaiseStep;
  const canAffordMinRaise = !isBalMode || bal >= minAddForRaise;

  // Update default betInput when turn or street changes
  useEffect(() => {
    if (!round || round.phase !== 'bet') return;
    const defaultAdd = cur === 0 ? Math.min(isBalMode ? bal : 50, Math.max(50, minRaiseStep)) : minAddForRaise;
    setBetInputStr(String(isBalMode ? Math.min(bal, Math.max(tc, defaultAdd)) : defaultAdd));
    setShowCustomRaise(false);
  }, [round?.turn, round?.street, cur, tc, minAddForRaise, isBalMode, bal, minRaiseStep]);

  const betInput = betInputStr.trim() === '' ? 0 : Math.floor(Number(betInputStr) || 0);

  // Pre-populate showdown winners when entering showdown
  useEffect(() => {
    if (round?.phase === 'result') {
      if (round.potWinners && Object.keys(round.potWinners).length > 0) {
        setPotWinnersState(round.potWinners);
      } else if (round.winners && round.winners.length > 0) {
        const init: Record<string, string[]> = {};
        pots.forEach(p => { init[p.id] = round.winners!; });
        setPotWinnersState(init);
      }
    }
  }, [round?.phase, round?.potWinners, round?.winners, pots.length]);

  const handleStartRound = () => {
    sounds.playCardDealSound();
    onStartRound();
    setPotWinnersState({});
  };

  // Toggle winner for a pot in showdown
  const togglePotWinner = (potId: string, playerId: string) => {
    if (!isHost) return;
    setPotWinnersState(prev => {
      const current = prev[potId] || [];
      if (current.includes(playerId)) {
        return { ...prev, [potId]: current.filter(id => id !== playerId) };
      }
      return { ...prev, [potId]: [...current, playerId] };
    });
  };

  const pickAllPotsForPlayer = (playerId: string) => {
    if (!isHost) return;
    const updated: Record<string, string[]> = { ...potWinnersState };
    pots.forEach(pot => {
      if (pot.eligiblePlayerIds.includes(playerId)) {
        updated[pot.id] = [playerId];
      }
    });
    setPotWinnersState(updated);
  };

  const handleConfirmShowdown = () => {
    if (!isHost) return;
    onConfirmShowdown(potWinnersState);
  };

  const renderOnlineReadyAndRequests = () => {
    if (!isOnline) return null;
    return (
      <div
        style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 12,
          background: 'rgba(0,0,0,0.32)',
          border: '1px solid rgba(212, 175, 55, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            👍 Next Hand Ready Status
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 900, color: allSeatedReady ? '#2ecc71' : '#f2c94c' }}>
            {readyCount} / {seated.length} Ready
          </span>
        </div>

        {seated.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {seated.map(p => {
              const r = Boolean(readyPlayers[p.id]);
              return (
                <span
                  key={p.id}
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: r ? 'rgba(46, 204, 113, 0.16)' : 'rgba(255,255,255,0.05)',
                    border: r ? '1px solid rgba(46, 204, 113, 0.45)' : '1px solid rgba(255,255,255,0.12)',
                    color: r ? '#2ecc71' : 'var(--mut)',
                    fontWeight: 700,
                  }}
                >
                  {r ? '👍' : '⏳'} {p.name}
                </span>
              );
            })}
          </div>
        )}

        {!isHost && myPlayerId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className={isMeReady ? 'good' : 'gold'}
              style={{ width: '100%', padding: '10px 14px', fontSize: 13.5, fontWeight: 900 }}
              onClick={onToggleReady}
            >
              {isMeReady ? '✅ Ready! (Click to Unready)' : '👍 Ready for Next Hand'}
            </button>
            {isBalMode && onOpenAddMoney && (
              <button
                type="button"
                className="sm"
                style={{ width: '100%', padding: '8px 12px', fontWeight: 800 }}
                onClick={() => onOpenAddMoney(myPlayerId)}
              >
                🪙 Request Chips from Game Operator
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ───────── Case 1: Pre-round Setup (No SB, BB, or Optional Ante fields) ───────── */
  if (!round) {
    const parsedBuyIn = buyInStr.trim() === '' ? 0 : Math.floor(Number(buyInStr) || 0);
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
            <span className="pill" style={{ fontSize: 10.5, opacity: 0.75 }}>{isOnline ? '🌐 Online' : '📋 Tracker'}</span>
          </div>

          {isHost && isBalMode && (
            <div style={{ marginBottom: 12 }}>
              <div className="row" style={{ margin: '6px 0 8px', alignItems: 'center', justifyContent: 'space-between', display: 'flex' }}>
                <span className="mut" style={{ fontSize: 12 }}>Default chips per player:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="1000"
                  value={buyInStr}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9]/g, '');
                    setBuyInStr(clean);
                    if (clean !== '' && Number(clean) >= 10) {
                      onSetDefaultBuyIn(Math.floor(Number(clean)));
                    }
                  }}
                  style={{ width: 105, textAlign: 'center' }}
                />
              </div>
              <button
                className="sm"
                disabled={parsedBuyIn < 10}
                style={{
                  width: '100%',
                  background: 'rgba(217,119,6,0.15)',
                  border: '1px solid rgba(217,119,6,0.35)',
                  color: 'var(--gold)',
                  fontWeight: 600,
                }}
                onClick={onResetAllBalances}
              >
                🔄 Reset all stacks to ₹{defaultBuyIn}
              </button>
            </div>
          )}

          <h2>🏺 Initial Pot &amp; Hand Setup</h2>
          {isHost ? (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="mut" style={{ fontSize: 11.5 }}>Fill initial pot from:</span>
                <div className="seg">
                  <button
                    type="button"
                    className={ante.mode !== 'admin' ? 'on sm' : 'sm'}
                    onClick={() => onSetAnteMode('each')}
                  >
                    👥 Each Player
                  </button>
                  <button
                    type="button"
                    className={ante.mode === 'admin' ? 'on sm' : 'sm'}
                    onClick={() => onSetAnteMode('admin')}
                  >
                    👑 Admin Wallet
                  </button>
                </div>
              </div>

              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="mut" style={{ fontSize: 12 }}>
                  {ante.mode === 'admin' ? 'Initial pot from Admin:' : 'Entry per player:'}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={anteAmtStr}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9]/g, '');
                    setAnteAmtStr(clean);
                    onSetAnteAmt(clean === '' ? 0 : Math.max(0, Math.floor(Number(clean) || 0)));
                  }}
                  style={{ width: 105, textAlign: 'center' }}
                />
              </div>

              <div className="q" style={{ margin: '4px 0 8px' }}>
                {[0, 10, 20, 50, 100].map(v => (
                  <button
                    key={v}
                    type="button"
                    className={`sm ${ante.amt === v ? 'pri' : ''}`}
                    onClick={() => {
                      setAnteAmtStr(String(v));
                      onSetAnteAmt(v);
                    }}
                  >
                    {v === 0 ? '₹0' : money(v)}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, paddingTop: 6, borderTop: '1px solid rgba(94,234,212,0.18)' }}>
                <span className="mut">Starting Pot Preview:</span>
                <b style={{ color: '#5eead4' }}>
                  {ante.mode === 'admin'
                    ? `${money(ante.amt || 0)} (from Admin)`
                    : `${money((ante.amt || 0) * seated.length)} (${money(ante.amt || 0)} × ${seated.length})`}
                </b>
              </div>
              {seated.length >= 2 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, marginTop: 4 }}>
                  <span className="mut">🔘 Dealer Button [D]:</span>
                  <b style={{ color: 'var(--gold)' }}>{seated[dealerIdx % seated.length]?.name || 'Next'}</b>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="mut">Initial Pot Source:</span>
                <b style={{ color: '#5eead4' }}>
                  {ante.mode === 'admin' ? '👑 Admin Wallet' : '👥 Each Player'}
                </b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="mut">{ante.mode === 'admin' ? 'Seeded Pot:' : 'Entry per Player:'}</span>
                <b>{money(ante.amt || 0)}</b>
              </div>
              {seated.length >= 2 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="mut">🔘 Dealer Button [D]:</span>
                  <b style={{ color: 'var(--gold)' }}>{seated[dealerIdx % seated.length]?.name || 'Next'}</b>
                </div>
              )}
            </div>
          )}

          {renderOnlineReadyAndRequests()}

          {isHost ? (
            <>
              <button
                className="pri big"
                style={{ marginTop: 10 }}
                disabled={seated.length < 2 || !allSeatedReady}
                onClick={handleStartRound}
              >
                {isOnline && !allSeatedReady
                  ? `⏳ Waiting for Players Ready (${readyCount}/${seated.length})`
                  : `🃏 Deal Hand (${seated.length} Players)`}
              </button>
              {seated.length < 2 && (
                <p className="mut" style={{ marginTop: 8, textAlign: 'center' }}>
                  {isOnline
                    ? 'Waiting for at least 2 players to join the room...'
                    : 'Add at least 2 active players on the left to deal.'}
                </p>
              )}
            </>
          ) : (
            <div style={{ marginTop: 10, textAlign: 'center', padding: '10px', background: 'rgba(56, 189, 248, 0.08)', border: '1px dashed rgba(56, 189, 248, 0.35)', borderRadius: 10, color: '#bae6fd', fontSize: 12.5 }}>
              {isMeReady
                ? '👍 You are Ready! Waiting for Game Operator to deal...'
                : '👆 Press "Ready for Next Hand" above so the Game Operator can deal cards!'}
            </div>
          )}
        </div>
      </aside>
    );
  }

  /* ───────── Case 2: Round Control (Admin) vs. Round Ledger (Players) ───────── */
  const roundControlBox = (
    <div className="card">
      <h2>{isHost ? '⚙ Round Control & Ledger' : '📜 Round Action Ledger'}</h2>
      {isHost && (
        <div className="row" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {!isOnline && (
            <button
              className="grow"
              style={{ flex: 1 }}
              disabled={!round.stack || !round.stack.length}
              onClick={onUndo}
            >
              ↩ Undo
            </button>
          )}
          {!isOnline && round.phase === 'bet' && (
            <button className="grow" style={{ flex: 1 }} onClick={() => onAct('showdown')}>
              🎴 Showdown
            </button>
          )}
          {!round.settled && (
            <button className="grow bad" style={{ flex: 1 }} onClick={onAbortRound}>
              Abort
            </button>
          )}
        </div>
      )}
      {round.log
        .slice()
        .reverse()
        .slice(0, 6)
        .map((l, i) => (
          <div className="li mut" key={i} style={{ fontSize: 12 }}>
            {l}
          </div>
        ))}
    </div>
  );

  // Personal hole cards preview for Online Mode
  const myHoleCards = myPlayerId && Array.isArray(round.hands?.[myPlayerId]) ? round.hands[myPlayerId] : null;
  const activePlayerIds = round.parts.filter(id => !round.folded[id]);
  const effectiveMyId = isOnline ? (myPlayerId || '') : (turnPlayer?.id || '');
  const isMeActiveInRound = !!(effectiveMyId && round.parts.includes(effectiveMyId) && !round.folded[effectiveMyId]);
  const mutualReq = round.mutualShowRequest;
  const approvedCount = mutualReq ? Object.values(mutualReq.approvals || {}).filter(v => v === 'accepted').length : 0;
  const myMutualApproval = mutualReq && effectiveMyId ? mutualReq.approvals?.[effectiveMyId] : undefined;

  const mutualShowBox = round.phase === 'bet' && activePlayerIds.length >= 2 && isMeActiveInRound ? (
    mutualReq ? (
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(6, 78, 59, 0.45))',
          border: '1.5px solid #10b981',
          padding: '12px 14px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: '#34d399', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            🤝 Mutual Card Show Requested
          </span>
          <span className="pill" style={{ fontSize: 10.5, fontWeight: 800, color: '#a7f3d0', borderColor: '#10b981' }}>
            {approvedCount} / {activePlayerIds.length} Accepted
          </span>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#ecfdf5', lineHeight: 1.4 }}>
          <b>{mutualReq.requesterName}</b> requested a free Mutual Showdown (₹0 extra bet). If all {activePlayerIds.length} active players accept, all community &amp; hole cards are revealed and the best hand wins!
        </p>
        {myMutualApproval === 'accepted' ? (
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6ee7b7', textAlign: 'center', padding: '5px 8px', background: 'rgba(0,0,0,0.25)', borderRadius: 8 }}>
            ✓ You accepted · Waiting for remaining players...
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="good"
              style={{ flex: 1, fontWeight: 900, padding: '8px 10px' }}
              onClick={() => onRespondMutualShow && onRespondMutualShow('accepted')}
            >
              ✅ Accept Show (₹0)
            </button>
            <button
              type="button"
              className="bad"
              style={{ flex: 1, fontWeight: 800, padding: '8px 10px' }}
              onClick={() => onRespondMutualShow && onRespondMutualShow('rejected')}
            >
              ❌ Decline
            </button>
          </div>
        )}
      </div>
    ) : null
  ) : null;

  /* ───────── Case 3: Betting Phase ───────── */
  if (round.phase === 'bet') {
    const isSpectator = !!(myPlayerId && !round.parts?.includes(myPlayerId));

    if (isOnline && isSpectator) {
      return (
        <aside id="ctr">
          <div className="card" style={{ textAlign: 'center', padding: '20px 18px', border: '1.5px solid rgba(56, 189, 248, 0.4)', background: 'rgba(15, 23, 42, 0.85)' }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>👀</div>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#38bdf8' }}>
              Spectating Active Hand
            </h3>
            <p className="mut" style={{ fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.45 }}>
              You joined while this hand was running. You will be dealt into the next hand automatically!
            </p>
          </div>
          {roundControlBox}
        </aside>
      );
    }

    const isMyTurn = !isOnline || !myPlayerId || round.turn === myPlayerId;

    if (isOnline && !isMyTurn) {
      return (
        <aside id="ctr">
          {mutualShowBox}
          <div className="card" style={{ textAlign: 'center', padding: '18px 16px', border: '1.5px solid rgba(56, 189, 248, 0.35)', background: 'rgba(15, 23, 42, 0.75)' }}>
            {myHoleCards && (
              <div style={{ marginBottom: 12 }}>
                <div className="mut" style={{ fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Your Hole Cards
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {myHoleCards.map((c: any, ci: number) => (
                    <PlayingCard key={ci} card={c} size="md" />
                  ))}
                </div>
              </div>
            )}
            <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#38bdf8' }}>
              ⏳ Waiting for {turnPlayer?.name || 'Player'} to bet...
            </h3>
            <p className="mut" style={{ fontSize: 12, margin: '0 0 10px' }}>
              Street: {streetNames[round.street || 0]} · Current Bet: {money(cur)}
            </p>
            {isBalMode && (
              <div style={{ fontSize: 12, padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, color: '#94a3b8', marginBottom: 8 }}>
                Your stack: <b style={{ color: '#fff' }}>{money(players.find(p => p.id === myPlayerId)?.balance || 0)}</b>
              </div>
            )}
            {isMeActiveInRound && !mutualReq && activePlayerIds.length >= 2 && onRequestMutualShow && (
              <button
                type="button"
                className="sm"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(16, 185, 129, 0.14)',
                  borderColor: '#10b981',
                  color: '#6ee7b7',
                  fontWeight: 800,
                }}
                onClick={onRequestMutualShow}
              >
                🤝 Request Mutual Card Show (₹0)
              </button>
            )}
          </div>
          {roundControlBox}
        </aside>
      );
    }

    const colIdx = players.findIndex(p => p.id === turnPlayer?.id) % COL.length;
    const col = COL[colIdx >= 0 ? colIdx : 0];

    // Validate the direct bet input (amount of chips being added from player's stack right now)
    const resolution = resolveBetAmount({
      amount: betInput,
      streetContribution: sc,
      currentBet: cur,
      minRaise: minRaiseStep,
      balance: isBalMode ? bal : null,
    });
    const isBetInputValid = !('error' in resolution);
    const betErrorMsg = 'error' in resolution ? resolution.error : '';

    return (
      <aside id="right">
        {mutualShowBox}
        {pots.length > 1 && (
          <div className="card" style={{ padding: '10px 12px', marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#5eead4', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                🏺 Pots Breakdown
              </span>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#fff' }}>Total {money(totalPot)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pots.map((pot, idx) => (
                <div
                  key={pot.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 11.5,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: idx === 0 ? 'rgba(94,234,212,0.12)' : 'rgba(56,189,248,0.12)',
                    border: `1px solid ${idx === 0 ? 'rgba(94,234,212,0.3)' : 'rgba(56,189,248,0.3)'}`,
                  }}
                >
                  <div>
                    <b style={{ color: idx === 0 ? '#5eead4' : '#38bdf8' }}>{pot.name}: {money(pot.amount)}</b>
                    <div className="mut" style={{ fontSize: 10 }}>
                      Eligible: {pot.eligiblePlayerIds.map(id => players.find(p => p.id === id)?.name || id).join(', ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="card slide">
          <div className="turnbox" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, textAlign: 'left', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="av" style={{ background: col, margin: 0, width: 42, height: 42 }}>
                {(turnPlayer?.name[0] || '?').toUpperCase()}
              </div>
              <div>
                <div className="mut" style={{ fontSize: 11 }}>
                  {streetNames[round.street || 0]} · Playing Now
                </div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{turnPlayer?.name}</div>
                <div className="mut" style={{ fontSize: 11.5 }}>
                  {tc > 0
                    ? `To call: ${money(tc)} (Current bet ${money(cur)})`
                    : `No bet to call (Check or Bet)`}
                  {isBalMode ? ` · Stack: ${money(bal)}` : ''}
                </div>
              </div>
            </div>

            {myHoleCards && (
              <div style={{ display: 'flex', gap: 6 }}>
                {myHoleCards.map((c: any, ci: number) => (
                  <PlayingCard key={ci} card={c} size="sm" />
                ))}
              </div>
            )}
          </div>

          {/* Short-Stack All-In Notice */}
          {isBalMode && !canCallFull && bal > 0 && (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.14)',
                border: '1px solid rgba(245, 158, 11, 0.45)',
                color: '#fde68a',
                fontSize: 11.5,
                lineHeight: 1.35,
              }}
            >
              ⚡ Your stack ({money(bal)}) is below the call amount ({money(tc)}). Go <b>All-In</b> to contest the Main Pot while other players bet into a Side Pot!
            </div>
          )}

          {/* Primary One-Click Actions + Custom Raise Toggle */}
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {canCheck ? (
              <button
                type="button"
                className="pri"
                style={{ gridColumn: '1 / -1', padding: '12px 16px', fontSize: 15, fontWeight: 900 }}
                onClick={() => {
                  sounds.playChipSound();
                  onAct('check');
                }}
              >
                ✋ Check (₹0)
              </button>
            ) : isBalMode && !canCallFull ? (
              <button
                type="button"
                className="bad"
                disabled={bal <= 0}
                style={{ gridColumn: '1 / -1', padding: '12px 16px', fontSize: 15, fontWeight: 900, background: 'linear-gradient(135deg,#ef4444,#b91c1c)', borderColor: '#fca5a5', color: '#fff' }}
                onClick={() => {
                  sounds.playChipSound();
                  onAct('allin');
                }}
              >
                🚨 Go All-In ({money(bal)}) · Side Pot
              </button>
            ) : (
              <button
                type="button"
                className="good"
                style={{ gridColumn: '1 / -1', padding: '12px 16px', fontSize: 15, fontWeight: 900 }}
                onClick={() => {
                  sounds.playChipSound();
                  onAct('call');
                }}
              >
                📞 Call {money(tc)}{isBalMode && tc === bal ? ' (All-In)' : ''}
              </button>
            )}

            {!(isBalMode && !canCallFull) && (
              <>
                {isBalMode && !canAffordMinRaise && bal > tc ? (
                  <button
                    type="button"
                    className="gold"
                    style={{ padding: '9px 12px', fontWeight: 800, fontSize: 12.5 }}
                    onClick={() => {
                      sounds.playChipSound();
                      onAct('allin');
                    }}
                  >
                    🚨 All-In ({money(bal)})
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gold"
                    disabled={!canAffordMinRaise}
                    style={{ padding: '9px 12px', fontWeight: 800, fontSize: 12.5 }}
                    onClick={() => {
                      const minRes = resolveBetAmount({
                        amount: minAddForRaise,
                        streetContribution: sc,
                        currentBet: cur,
                        minRaise: minRaiseStep,
                        balance: isBalMode ? bal : null,
                      });
                      if ('error' in minRes) return;
                      sounds.playChipSound();
                      onAct(minRes.action, minRes.target);
                    }}
                  >
                    {cur === 0 ? `💰 Bet ${money(minAddForRaise)}` : `⬆ Min Raise (+${money(minAddForRaise)})`}
                  </button>
                )}

                <button
                  type="button"
                  className={showCustomRaise ? 'pri' : ''}
                  style={{
                    padding: '9px 12px',
                    fontWeight: 800,
                    fontSize: 12.5,
                    borderColor: showCustomRaise ? 'var(--gold)' : undefined,
                  }}
                  onClick={() => setShowCustomRaise(prev => !prev)}
                >
                  {showCustomRaise ? '✕ Close Custom' : '✏️ Custom Raise'}
                </button>
              </>
            )}
          </div>

          {/* Expandable Custom Bet / Raise Input Interface */}
          {showCustomRaise && (
            <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.35)', border: '1px solid var(--gold)', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                <span className="mut">Enter custom bet / raise amount:</span>
                {isBalMode && (
                  <span style={{ color: 'var(--gold)', fontWeight: 800 }}>
                    Stack: {money(bal)}
                  </span>
                )}
              </div>

              <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={String(minAddForRaise)}
                  value={betInputStr}
                  onChange={(e) => {
                    setBetInputStr(e.target.value.replace(/[^0-9]/g, ''));
                  }}
                  style={{ flex: 1, textAlign: 'center', fontSize: 19, fontWeight: 900 }}
                />
                <button
                  type="button"
                  className={isBetInputValid ? 'gold' : 'bad'}
                  disabled={!isBetInputValid || betInput <= 0 || betInputStr.trim() === ''}
                  title={!isBetInputValid ? betErrorMsg : undefined}
                  style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 900 }}
                  onClick={() => {
                    if (!isBetInputValid || 'error' in resolution) return;
                    sounds.playChipSound();
                    onAct(resolution.action, resolution.target);
                    setShowCustomRaise(false);
                  }}
                >
                  {betInput > 0 && isBalMode && betInput === bal
                    ? `🚨 All-In ${money(bal)}`
                    : betInput === tc && tc > 0
                    ? `📞 Call ${money(tc)}`
                    : cur === 0
                    ? `💰 Bet ${money(betInput)}`
                    : `⬆ Raise (+${money(betInput)})`}
                </button>
              </div>

              {!isBetInputValid && betInputStr.trim() !== '' && (
                <div style={{ color: '#f87171', fontSize: 11.5, fontWeight: 700, marginTop: 6 }}>
                  ⚠️ {betErrorMsg}
                </div>
              )}

              <div className="q" style={{ marginTop: 8, marginBottom: 0 }}>
                {[50, 100, 200, 500].map(preset => {
                  const disabled = isBalMode && preset > bal;
                  return (
                    <button
                      key={preset}
                      type="button"
                      className="sm"
                      disabled={disabled}
                      onClick={() => setBetInputStr(String(preset))}
                    >
                      {money(preset)}
                    </button>
                  );
                })}
                {canAffordMinRaise && (
                  <button
                    type="button"
                    className="sm"
                    onClick={() => setBetInputStr(String(minAddForRaise))}
                  >
                    Min Raise ({money(minAddForRaise)})
                  </button>
                )}
                {totalPot > 0 && (!isBalMode || Math.max(minAddForRaise, totalPot) <= bal) && (
                  <button
                    type="button"
                    className="sm"
                    onClick={() => setBetInputStr(String(Math.max(minAddForRaise, totalPot)))}
                  >
                    Pot ({money(Math.max(minAddForRaise, totalPot))})
                  </button>
                )}
                {isBalMode && bal > 0 && (
                  <button
                    type="button"
                    className="sm"
                    style={{ borderColor: '#ef4444', color: '#fca5a5' }}
                    onClick={() => setBetInputStr(String(bal))}
                  >
                    🚨 All-In ({money(bal)})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Fold & Mutual Show Request */}
          <div className="acts" style={{ marginTop: 10 }}>
            {!mutualReq && activePlayerIds.length >= 2 && onRequestMutualShow && (
              <button
                type="button"
                style={{
                  background: 'rgba(16, 185, 129, 0.14)',
                  borderColor: '#10b981',
                  color: '#6ee7b7',
                  fontWeight: 800,
                }}
                onClick={onRequestMutualShow}
              >
                🤝 Mutual Show (₹0)
              </button>
            )}

            <button
              className="bad"
              style={!mutualReq && activePlayerIds.length >= 2 && onRequestMutualShow ? undefined : { gridColumn: '1 / -1' }}
              onClick={() => {
                sounds.playFoldSound();
                onAct('fold');
              }}
            >
              🏳 Fold
            </button>
          </div>
        </div>

        {roundControlBox}
      </aside>
    );
  }

  /* ───────── Case 4: Showdown Phase ───────── */
  const activeRoundPlayers = players.filter(p => round.parts.includes(p.id) && !round.folded[p.id]);
  const hasSidePots = pots.length > 1;
  const allPotsHaveWinners = pots.every(p => p.amount <= 0 || (potWinnersState[p.id] || []).length > 0);

  if (isOnline || round.settled) {
    return (
      <aside id="right">
        <div className="card slide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>🏆 Hand #{round.no} Result</h2>
            <span className="pill" style={{ fontSize: 11, fontWeight: 900, color: '#4ade80' }}>
              ✓ System Settled · {money(totalPot)}
            </span>
          </div>

          <p className="mut" style={{ margin: '0 0 10px', fontSize: 12 }}>
            {activeRoundPlayers.length === 1
              ? `Everyone else folded! Pot automatically awarded to ${activeRoundPlayers[0]?.name}.`
              : 'Showdown evaluated automatically by best 5-card Texas Hold’em hand:'}
          </p>

          {hasSidePots && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {pots.map((pot, idx) => {
                const pWinners = (round.potWinners?.[pot.id] || round.winners || [round.winner]).filter(Boolean);
                const wNames = pWinners.map(wid => players.find(p => p.id === wid)?.name || wid).join(', ');
                return (
                  <div
                    key={pot.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 11.5,
                      padding: '5px 9px',
                      borderRadius: 8,
                      background: idx === 0 ? 'rgba(94,234,212,0.12)' : 'rgba(56,189,248,0.12)',
                      border: `1px solid ${idx === 0 ? 'rgba(94,234,212,0.35)' : 'rgba(56,189,248,0.35)'}`,
                    }}
                  >
                    <span style={{ fontWeight: 800, color: idx === 0 ? '#5eead4' : '#38bdf8' }}>
                      🏺 {pot.name}: {money(pot.amount)}
                    </span>
                    <span style={{ color: '#4ade80', fontWeight: 800 }}>
                      👑 {wNames || 'Settled'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeRoundPlayers.map(pl => {
              const isWinner =
                round.winner === pl.id ||
                (round.winners || []).includes(pl.id) ||
                Object.values(round.potWinners || {}).some(arr => (arr || []).includes(pl.id));
              const evalName = round.handEvaluations?.[pl.id]?.rankName;
              const pCards = Array.isArray(round.hands?.[pl.id]) ? round.hands[pl.id] : null;
              return (
                <div
                  key={pl.id}
                  className={`opt ${isWinner ? 'sel' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'default', padding: '8px 12px' }}
                >
                  <div className="grow">
                    <b>{isWinner ? '👑 ' : ''}{pl.name}</b>
                    <div className="mut" style={{ fontSize: 11.5 }}>
                      Wagered {money(round.contrib[pl.id] || 0)}
                      {evalName && <span style={{ color: '#5eead4', fontWeight: 800, marginLeft: 6 }}>· {evalName}</span>}
                    </div>
                  </div>
                  {pCards && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {pCards.map((c: any, ci: number) => (
                        <PlayingCard key={ci} card={c} size="xs" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 10 }}>
            {renderOnlineReadyAndRequests()}
          </div>

          {isHost ? (
            <button
              className="pri big"
              style={{ marginTop: 8 }}
              disabled={seated.length < 2 || !allSeatedReady}
              onClick={handleStartRound}
            >
              🃏 {isOnline && !allSeatedReady ? `Waiting for Players to Ready (${readyCount}/${seated.length})` : 'Deal Next Hand'}
            </button>
          ) : (
            <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12.5, color: '#bae6fd' }}>
              ⏳ {myPlayerId && readyPlayers[myPlayerId] ? 'Ready! Waiting for Game Operator to deal next hand...' : 'Press 👍 Ready above so Game Operator can deal the next hand.'}
            </div>
          )}
        </div>

        {roundControlBox}
      </aside>
    );
  }

  return (
    <aside id="right">
      <div className="card slide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>🏆 Showdown</h2>
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--gold)' }}>Total {money(totalPot)}</span>
        </div>

        <p className="mut" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.4 }}>
          {hasSidePots
            ? 'Side pots formed! Select winner(s) for each pot independently.'
            : activeRoundPlayers.length === 1
            ? 'Everyone else folded! Confirm to award the pot.'
            : isOnline
            ? 'All active hands revealed and evaluated! Admin can confirm & settle the pot.'
            : 'Tap the winner(s). Tap several for a split pot.'}
        </p>

        {hasSidePots ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pots.map(potItem => {
              const selected = potWinnersState[potItem.id] || [];
              return (
                <div
                  key={potItem.id}
                  className="pot-box"
                  style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(244,195,79,0.3)', borderRadius: 10, padding: '8px 10px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 900, fontSize: 13, color: 'var(--gold)' }}>
                      🏺 {potItem.name}: <b>{money(potItem.amount)}</b>
                    </span>
                    <span className="mut" style={{ fontSize: 11 }}>{potItem.eligiblePlayerIds.length} eligible</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {activeRoundPlayers.map(pl => {
                      const isEligible = potItem.eligiblePlayerIds.includes(pl.id);
                      const isWinner = selected.includes(pl.id);
                      const evalName = round.handEvaluations?.[pl.id]?.rankName;
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          disabled={!isEligible || !isHost}
                          onClick={() => togglePotWinner(potItem.id, pl.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 8px',
                            borderRadius: 8,
                            textAlign: 'left',
                            fontSize: 11.5,
                            cursor: isEligible && isHost ? 'pointer' : 'default',
                            opacity: isEligible ? 1 : 0.35,
                            background: isWinner ? 'rgba(34,197,94,0.22)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isWinner ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <b>{pl.name}</b>
                            <div style={{ fontSize: 9.5, opacity: 0.85, color: evalName ? '#5eead4' : undefined }}>
                              {evalName || (isEligible ? (isWinner ? '🏆 Winner' : 'Eligible') : 'Ineligible')}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {isHost && (
              <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="mut" style={{ fontSize: 11, marginBottom: 5 }}>
                  Quick Pick: Best Hand Overall
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {activeRoundPlayers.map(pl => (
                    <button
                      key={pl.id}
                      type="button"
                      className="sm"
                      onClick={() => pickAllPotsForPlayer(pl.id)}
                    >
                      👑 {pl.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeRoundPlayers.map(pl => {
              const selected = potWinnersState['main'] || [];
              const isWinner = selected.includes(pl.id);
              const evalName = round.handEvaluations?.[pl.id]?.rankName;
              const pCards = Array.isArray(round.hands?.[pl.id]) ? round.hands[pl.id] : null;
              return (
                <div
                  key={pl.id}
                  className={`opt ${isWinner ? 'sel' : ''}`}
                  onClick={() => togglePotWinner('main', pl.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: isHost ? 'pointer' : 'default', padding: '8px 12px' }}
                >
                  <div className="grow">
                    <b>{pl.name}</b>
                    <div className="mut" style={{ fontSize: 11.5 }}>
                      Wagered {money(round.contrib[pl.id] || 0)}
                      {evalName && <span style={{ color: '#5eead4', fontWeight: 800, marginLeft: 6 }}>· {evalName}</span>}
                    </div>
                  </div>
                  {pCards && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {pCards.map((c: any, ci: number) => (
                        <PlayingCard key={ci} card={c} size="xs" />
                      ))}
                    </div>
                  )}
                  {isWinner && <span>🏆</span>}
                </div>
              );
            })}
          </div>
        )}

        {isHost ? (
          <button
            className="pri big"
            style={{ marginTop: 12 }}
            disabled={!allPotsHaveWinners}
            onClick={handleConfirmShowdown}
          >
            {allPotsHaveWinners ? '✅ Confirm & Settle Pots' : '⚠️ Pick Winner(s) for Each Pot'}
          </button>
        ) : (
          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12.5, color: '#bae6fd' }}>
            ⏳ Waiting for room admin to confirm &amp; settle pots...
          </div>
        )}
      </div>

      {roundControlBox}
    </aside>
  );
}
