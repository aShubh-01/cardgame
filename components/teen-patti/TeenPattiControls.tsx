'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Player, Round, COL, money } from '@/types/game';
import { getTeenPattiBetAmounts } from '@/lib/blindRules';
import { calculatePots } from '@/lib/pokerPot';
import { evaluateTeenPattiHand } from '@/lib/cardGamesEngine';
import { sounds } from '@/lib/soundEffects';
import PlayingCard from '@/components/common/PlayingCard';

interface TeenPattiControlsProps {
  players: Player[];
  round: Round | null;
  balanceMode?: boolean;
  defaultBuyIn?: number;
  ante: { mode: string; amt: number };
  onStartRound: (anteMap?: Record<string, number>) => void;
  onAbortRound: () => void;
  onUndo: () => void;
  onSetBalanceMode: (enabled: boolean) => void;
  onSetDefaultBuyIn: (amt: number) => void;
  onResetAllBalances: () => void;
  onSetAnteMode: (mode: string) => void;
  onSetAnteAmt: (amt: number) => void;
  onSeeCards?: (playerId: string) => void;
  onAct: (action: string, amt?: number) => void;
  onRequestMutualShow?: () => void;
  onRespondMutualShow?: (decision: 'accepted' | 'rejected') => void;
  onPickWinner: (id: string) => void;
  onConfirmWin: () => void;
  sessionMode?: 'tracker' | 'online';
  myPlayerId?: string | null;
  isHost?: boolean;
  readyPlayers?: Record<string, boolean>;
  onToggleReady?: () => void;
  onSitToggle?: (id: string) => void;
  onOpenAddMoney?: (playerId: string) => void;
}

export default function TeenPattiControls({
  players,
  round,
  balanceMode,
  defaultBuyIn = 1000,
  ante,
  onStartRound,
  onAbortRound,
  onUndo,
  onSetDefaultBuyIn,
  onResetAllBalances,
  onSetAnteMode,
  onSetAnteAmt,
  onSeeCards,
  onAct,
  onRequestMutualShow,
  onRespondMutualShow,
  onPickWinner,
  onConfirmWin,
  sessionMode = 'tracker',
  myPlayerId,
  isHost = true,
  readyPlayers = {},
  onToggleReady,
  onSitToggle,
  onOpenAddMoney,
}: TeenPattiControlsProps) {
  const [betInputStr, setBetInputStr] = useState<string>('20');
  const [buyInStr, setBuyInStr] = useState<string>(String(defaultBuyIn));
  const [anteAmtStr, setAnteAmtStr] = useState<string>(String(ante.amt || 0));
  const [showCustomRaise, setShowCustomRaise] = useState<boolean>(false);

  useEffect(() => {
    setBuyInStr(String(defaultBuyIn));
  }, [defaultBuyIn]);

  useEffect(() => {
    setAnteAmtStr(String(ante.amt ?? 0));
  }, [ante.amt]);

  const isBalMode = !!balanceMode;
  const isOnline = sessionMode === 'online';
  const seated = players.filter(p => !p.sit && !p.isGameOperator && (!isOnline || p.isConnected !== false));
  const readyCount = seated.filter(p => readyPlayers[p.id]).length;
  const allSeatedReady = !isOnline || (seated.length >= 2 && readyCount === seated.length);
  const isMeReady = Boolean(myPlayerId && readyPlayers[myPlayerId]);

  const { pots, totalPot: potTotal } = round
    ? calculatePots(round.contrib || {}, round.folded || {}, round.allIn || {})
    : { pots: [], totalPot: 0 };

  const activePlayers = round
    ? round.parts.filter(id => !round.folded[id])
    : [];
  const canActPlayers = round
    ? activePlayers.filter(id => !round.allIn?.[id])
    : [];

  // Audio alert when turn lands on current user
  const prevTurnRef = useRef<string | null>(null);
  useEffect(() => {
    if (round && round.phase === 'bet' && round.turn === myPlayerId && prevTurnRef.current !== myPlayerId) {
      sounds.playYourTurnSound();
    }
    prevTurnRef.current = round?.turn || null;
  }, [round?.turn, round?.phase, myPlayerId]);

  const handleStartRound = () => {
    sounds.playCardDealSound();
    onStartRound();
  };

  // Turn player stats
  const turnPlayer = round ? players.find(p => p.id === round.turn) : null;
  const turnPlayerId = turnPlayer?.id || '';
  const bal = turnPlayer?.balance || 0;
  const n = activePlayers.length;

  const isBlind = (round?.playerStatus?.[turnPlayerId] || 'blind') === 'blind';
  const otherActiveId = activePlayers.find(id => id !== turnPlayerId);
  const isOtherBlind = otherActiveId ? (round?.playerStatus?.[otherActiveId] || 'blind') === 'blind' : false;

  const anteShare = ante?.mode === 'admin' && ante.amt > 0
    ? Math.floor(ante.amt / (round?.parts?.length || 1))
    : ante?.amt;
  const baseUnit = Math.max(1, round?.stake || (anteShare && anteShare > 0 ? anteShare : 5));
  const lastBet = round?.lastBetAmt && round.lastBetAmt > 0
    ? { amount: round.lastBetAmt, isBlind: Boolean(round.lastIsBlind) }
    : null;
  const { chaalCost, minRaise, showCost } = getTeenPattiBetAmounts(baseUnit, isBlind, isOtherBlind, lastBet, potTotal);
  const canChaal = !isBalMode || bal >= chaalCost;
  const canAllInShort = isBalMode && bal > 0 && bal < chaalCost;

  useEffect(() => {
    if (round?.phase === 'bet') {
      const minAllowed = canAllInShort ? bal : chaalCost + 1;
      const defVal = isBalMode ? Math.min(bal, minAllowed) : minAllowed;
      setBetInputStr(String(defVal));
      setShowCustomRaise(false);
    }
  }, [round?.turn, round?.phase, chaalCost, canAllInShort, isBalMode, bal]);

  const betInput = betInputStr.trim() === '' ? 0 : Math.floor(Number(betInputStr) || 0);
  const canRaiseMin = !isBalMode || bal >= minRaise;
  const canRaiseAllIn = isBalMode && bal > chaalCost && bal < minRaise;
  const canShowEligible = n === 2 || (n > 2 && canActPlayers.length === 2);
  const canShow = canShowEligible && (!isBalMode || bal > 0);
  const isAllInShow = canShowEligible && isBalMode && bal > 0 && bal < showCost;
  const actualShowCost = isAllInShow ? bal : showCost;

  const renderOnlineReadyAndRequests = () => {
    if (!isOnline) return null;
    const allTablePlayers = players.filter(p => !p.isGameOperator);
    const mePlayer = players.find(p => p.id === myPlayerId);
    const isMeSitting = Boolean(mePlayer?.sit);

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
            👍 Next Round Ready Status
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 900, color: allSeatedReady ? '#2ecc71' : '#f2c94c' }}>
            {readyCount} / {seated.length} Ready
          </span>
        </div>

        {allTablePlayers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {allTablePlayers.map(p => {
              const isDisconnected = p.isConnected === false;
              const isSitting = Boolean(p.sit);
              const r = Boolean(readyPlayers[p.id]);

              let statusLabel = '⏳';
              let statusText = p.name;
              let bg = 'rgba(255,255,255,0.05)';
              let border = '1px solid rgba(255,255,255,0.12)';
              let color = 'var(--mut)';

              if (isDisconnected) {
                statusLabel = '🔌';
                statusText = `${p.name} (Offline · Auto-skipped)`;
                border = '1px dashed rgba(239, 68, 68, 0.45)';
                color = '#fca5a5';
              } else if (isSitting) {
                statusLabel = '⏸';
                statusText = `${p.name} (Skipping / Sitting)`;
                border = '1px dashed rgba(251, 191, 36, 0.45)';
                color = '#fde68a';
              } else if (r) {
                statusLabel = '👍';
                statusText = `${p.name} (Ready)`;
                bg = 'rgba(46, 204, 113, 0.16)';
                border = '1px solid rgba(46, 204, 113, 0.45)';
                color = '#2ecc71';
              } else {
                statusLabel = '⏳';
                statusText = `${p.name} (Waiting)`;
              }

              return (
                <span
                  key={p.id}
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: bg,
                    border,
                    color,
                    fontWeight: 700,
                  }}
                >
                  {statusLabel} {statusText}
                </span>
              );
            })}
          </div>
        )}

        {!isHost && myPlayerId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isMeSitting ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#fde68a', textAlign: 'center', background: 'rgba(251, 191, 36, 0.12)', padding: '6px 10px', borderRadius: 8 }}>
                  ⏸ You are skipping the next round (sitting out).
                </div>
                {onSitToggle && (
                  <button
                    type="button"
                    className="pri"
                    style={{ width: '100%', padding: '9px 14px', fontSize: 13, fontWeight: 800 }}
                    onClick={() => onSitToggle(myPlayerId)}
                  >
                    ▶️ Rejoin Next Round
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  className={isMeReady ? 'good' : 'gold'}
                  style={{ width: '100%', padding: '10px 14px', fontSize: 13.5, fontWeight: 900 }}
                  onClick={() => onToggleReady?.()}
                >
                  {isMeReady ? '✅ Ready! (Click to Unready)' : '👍 Ready for Next Round'}
                </button>
                {onSitToggle && (
                  <button
                    type="button"
                    className="sm mut"
                    style={{
                      width: '100%',
                      padding: '7px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px dashed rgba(255,255,255,0.2)',
                      color: '#cbd5e1',
                    }}
                    onClick={() => onSitToggle(myPlayerId)}
                  >
                    ⏸ Skip Next Round / Sit Out
                  </button>
                )}
              </div>
            )}
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

  /* ───────── Case 1: Pre-round Setup ───────── */
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
                <span className="mut" style={{ fontSize: 12 }}>Chips per player:</span>
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
                🔄 Reset stacks to ₹{defaultBuyIn}
              </button>
            </div>
          )}

          <h2>🏺 Initial Pot &amp; Boot Setup</h2>
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
                  {ante.mode === 'admin' ? 'Initial pot from Admin:' : 'Boot per player:'}
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
                {[5, 10, 20, 50, 100, 200].map(v => (
                  <button
                    key={v}
                    type="button"
                    className={`sm ${ante.amt === v ? 'pri' : ''}`}
                    onClick={() => {
                      setAnteAmtStr(String(v));
                      onSetAnteAmt(v);
                    }}
                  >
                    {money(v)}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, paddingTop: 6, borderTop: '1px solid rgba(244,195,79,0.18)' }}>
                <span className="mut">Starting Pot Preview:</span>
                <b style={{ color: 'var(--gold)' }}>
                  {ante.mode === 'admin'
                    ? `${money(ante.amt || 0)} (from Admin)`
                    : `${money((ante.amt || 0) * seated.length)} (${money(ante.amt || 0)} × ${seated.length})`}
                </b>
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="mut">Initial Pot Source:</span>
                <b style={{ color: 'var(--gold)' }}>
                  {ante.mode === 'admin' ? '👑 Admin Wallet' : '👥 Each Player'}
                </b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="mut">{ante.mode === 'admin' ? 'Seeded Pot:' : 'Boot per Player:'}</span>
                <b>{money(ante.amt || 0)}</b>
              </div>
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
                  ? `⏳ Waiting for Players (${readyCount}/${seated.length})`
                  : `🃏 Deal 3 Cards (${seated.length} Players)`}
              </button>
              {seated.length < 2 && (
                <p className="mut" style={{ marginTop: 8, textAlign: 'center' }}>
                  {isOnline
                    ? 'Waiting for at least 2 players to join the room...'
                    : 'Add at least 2 active players on the left.'}
                </p>
              )}
            </>
          ) : (
            <div style={{ marginTop: 10, textAlign: 'center', padding: '10px', background: 'rgba(244, 195, 79, 0.08)', border: '1px dashed rgba(244, 195, 79, 0.35)', borderRadius: 10, color: 'var(--gold)', fontSize: 12.5 }}>
              {isMeReady
                ? '👍 You are Ready! Waiting for Game Operator to deal...'
                : '👆 Press "Ready for Next Round" above so the Game Operator can deal cards!'}
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
          {!round.settled && (
            <button className="grow bad" style={{ flex: 1 }} onClick={onAbortRound}>
              Abort round
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

  // Personal 3-card preview for Online Mode
  const myHandData = myPlayerId ? round.hands?.[myPlayerId] : null;
  const myStatus = myPlayerId ? round.playerStatus?.[myPlayerId] || 'blind' : 'blind';
  const myCardsVisible = Array.isArray(myHandData);
  const myHandRank = myCardsVisible && myHandData.length === 3 ? evaluateTeenPattiHand(myHandData).rankName : null;

  const effectiveMyId = isOnline ? (myPlayerId || '') : turnPlayerId;
  const isMeActiveInRound = !!(effectiveMyId && round.parts.includes(effectiveMyId) && !round.folded[effectiveMyId]);
  const mutualReq = round.mutualShowRequest;
  const approvedCount = mutualReq ? Object.values(mutualReq.approvals || {}).filter(v => v === 'accepted').length : 0;
  const myMutualApproval = mutualReq && effectiveMyId ? mutualReq.approvals?.[effectiveMyId] : undefined;

  const mutualShowBox = round.phase === 'bet' && activePlayers.length >= 2 && isMeActiveInRound ? (
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
            {approvedCount} / {activePlayers.length} Accepted
          </span>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#ecfdf5', lineHeight: 1.4 }}>
          <b>{mutualReq.requesterName}</b> requested a free Mutual Showdown (₹0 extra bet). If all {activePlayers.length} active players accept, everyone&apos;s cards are revealed and the best hand wins!
        </p>
        {myMutualApproval === 'accepted' ? (
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6ee7b7', textAlign: 'center', padding: '5px 8px', background: 'rgba(0,0,0,0.25)', borderRadius: 8 }}>
            ✓ You accepted · Waiting for remaining players ({activePlayers.filter(id => mutualReq.approvals?.[id] !== 'accepted').map(id => players.find(p => p.id === id)?.name).join(', ')})...
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
        <aside id="right">
          <div className="card" style={{ textAlign: 'center', padding: '20px 18px', border: '1.5px solid rgba(56, 189, 248, 0.4)', background: 'rgba(15, 23, 42, 0.85)' }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>👀</div>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#38bdf8' }}>
              Spectating Active Hand
            </h3>
            <p className="mut" style={{ fontSize: 12.5, margin: 0 }}>
              You will be dealt into the next Teen Patti round automatically!
            </p>
          </div>
          {roundControlBox}
        </aside>
      );
    }

    const isMyTurn = isOnline ? Boolean(myPlayerId && round.turn === myPlayerId) : true;

    if (isOnline && !isMyTurn) {
      const isMyFolded = Boolean(myPlayerId && round.folded?.[myPlayerId]);
      return (
        <aside id="right">
          {mutualShowBox}
          <div className="card" style={{ textAlign: 'center', padding: '18px 16px' }}>
            {myHandData && (
              <div style={{ marginBottom: 14 }}>
                <div className="mut" style={{ fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Your 3 Cards {isMyFolded ? '· 🏳️ Folded' : ''} ({myStatus === 'blind' ? '🙈 Playing Blind' : `👁 Seen · ${myHandRank || ''}`})
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'center',
                    alignItems: 'center',
                    opacity: isMyFolded ? 0.7 : 1,
                    cursor: myStatus === 'blind' && onSeeCards && myPlayerId ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (myStatus === 'blind' && onSeeCards && myPlayerId) {
                      onSeeCards(myPlayerId);
                    }
                  }}
                >
                  {myCardsVisible ? (
                    myHandData.map((c: any, ci: number) => (
                      <PlayingCard key={ci} card={c} size="md" />
                    ))
                  ) : (
                    Array.from({ length: 3 }).map((_, ci) => (
                      <PlayingCard key={ci} faceDown size="md" backTheme="red" />
                    ))
                  )}
                </div>
                {myStatus === 'blind' && onSeeCards && myPlayerId && (
                  <button
                    type="button"
                    className="see-cards-cta"
                    style={{ width: '100%', marginTop: 10, padding: '10px 14px', fontSize: 13.5 }}
                    onClick={() => onSeeCards(myPlayerId)}
                  >
                    👁 FLIP &amp; SEE YOUR 3 CARDS
                  </button>
                )}
              </div>
            )}
            <h3 style={{ margin: '0 0 4px', fontSize: 15, color: isMyFolded ? '#f87171' : 'var(--gold)' }}>
              {isMyFolded
                ? `🏳️ You folded this hand · Waiting for ${turnPlayer?.name || 'others'} to finish...`
                : `⏳ Waiting for ${turnPlayer?.name || 'Player'} to act...`}
            </h3>
            <p className="mut" style={{ fontSize: 12, margin: '0 0 10px' }}>
              Base Stake: {money(baseUnit)} · Total Pot: {money(potTotal)}
            </p>
            {isMeActiveInRound && !mutualReq && activePlayers.length >= 2 && onRequestMutualShow && (
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
    const isAllInInput = isBalMode && bal > 0 && betInput === bal;
    // Any raise strictly greater than chaalCost is valid (or All-In)
    const isInvalidBet =
      betInputStr.trim() === '' ||
      (!isAllInInput && betInput <= chaalCost) ||
      (isBalMode && betInput > bal) ||
      betInput <= 0;

    return (
      <aside id="right">
        {mutualShowBox}
        {pots.length > 1 && (
          <div className="card" style={{ padding: '10px 12px', marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                🏺 Pots Breakdown
              </span>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#fff' }}>Total {money(potTotal)}</span>
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
                    background: idx === 0 ? 'rgba(244,195,79,0.12)' : 'rgba(56,189,248,0.12)',
                    border: `1px solid ${idx === 0 ? 'rgba(244,195,79,0.3)' : 'rgba(56,189,248,0.3)'}`,
                  }}
                >
                  <div>
                    <b style={{ color: idx === 0 ? 'var(--gold)' : '#38bdf8' }}>{pot.name}: {money(pot.amount)}</b>
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
          <div className="turnbox" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="av" style={{ background: col, margin: 0, width: 42, height: 42 }}>
                {(turnPlayer?.name[0] || '?').toUpperCase()}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '1px 7px',
                      borderRadius: 10,
                      background: isBlind ? 'rgba(56, 189, 248, 0.2)' : 'rgba(244, 195, 79, 0.2)',
                      color: isBlind ? '#38bdf8' : 'var(--gold)',
                      border: `1px solid ${isBlind ? '#38bdf8' : 'var(--gold)'}`,
                    }}
                  >
                    {isBlind ? '🙈 BLIND' : '👁 SEEN'}
                  </span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{turnPlayer?.name}</div>
                <div className="mut" style={{ fontSize: 11.5 }}>
                  Current Chaal: <b style={{ color: '#fff' }}>{money(chaalCost)}</b>{isBalMode ? ` · Stack: ${money(bal)}` : ''}
                </div>
              </div>
            </div>

            {myHandData && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 5,
                    cursor: isBlind && onSeeCards ? 'pointer' : 'default',
                  }}
                  title={isBlind ? 'Click to flip & see your 3 cards' : undefined}
                  onClick={() => {
                    if (isBlind && onSeeCards) onSeeCards(turnPlayerId);
                  }}
                >
                  {myCardsVisible ? (
                    myHandData.map((c: any, ci: number) => (
                      <PlayingCard key={ci} card={c} size="sm" />
                    ))
                  ) : (
                    Array.from({ length: 3 }).map((_, ci) => (
                      <PlayingCard key={ci} faceDown size="sm" backTheme="red" />
                    ))
                  )}
                </div>
                {myHandRank && (
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--gold)' }}>{myHandRank}</span>
                )}
              </div>
            )}
          </div>

          {/* Prominent See Cards Banner Button when Playing Blind */}
          {isBlind && onSeeCards && (
            <button
              type="button"
              className="see-cards-cta"
              style={{ width: '100%', marginTop: 10, padding: '10px 14px', fontSize: 13.5 }}
              onClick={() => onSeeCards(turnPlayerId)}
            >
              👁 FLIP &amp; SEE YOUR 3 CARDS
            </button>
          )}

          {/* Short-Stack All-In Notice */}
          {canAllInShort && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(239,68,68,0.22), rgba(185,28,28,0.28))',
                border: '1.5px solid #f87171',
                color: '#fee2e2',
                fontSize: 12.5,
                lineHeight: 1.4,
                boxShadow: '0 0 16px rgba(239,68,68,0.3)',
              }}
            >
              ⚡ <b>Short-Stack Detected:</b> Your stack ({money(bal)}) is below current Chaal ({money(chaalCost)}). Go <b>All-In</b> to play this hand and contest the Main Pot while remaining players bet into a Side Pot!
            </div>
          )}

          {/* 3D Casino Clay Chips Presets Bar */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                🎰 Quick Casino Chips
              </span>
              {isBalMode && (
                <span style={{ fontSize: 11.5, color: '#fcd34d', fontWeight: 800 }}>
                  Stack: {money(bal)}
                </span>
              )}
            </div>
            <div className="casino-chips-strip">
              {/* Chaal Chip */}
              <button
                type="button"
                className="casino-chip-item chip-red"
                disabled={!canChaal && !canAllInShort}
                title={canAllInShort ? `Go All-In with remaining ${money(bal)}` : `Chaal ${money(chaalCost)}`}
                onClick={() => {
                  sounds.playChipSound();
                  if (canAllInShort) {
                    onAct('allin', bal);
                  } else {
                    onAct(isBalMode && chaalCost === bal ? 'allin' : 'bet', chaalCost);
                  }
                }}
              >
                <span className="chip-lbl">{canAllInShort ? 'All-In' : isBlind ? 'Blind' : 'Chaal'}</span>
                <span className="chip-val">{money(canAllInShort ? bal : chaalCost)}</span>
              </button>

              {/* 2x Raise Chip */}
              <button
                type="button"
                className="casino-chip-item chip-blue"
                disabled={!canRaiseMin || (isBalMode && chaalCost * 2 > bal)}
                title={`2× Raise to ${money(chaalCost * 2)}`}
                onClick={() => {
                  const target = chaalCost * 2;
                  if (!canRaiseMin || (isBalMode && target > bal)) return;
                  sounds.playChipSound();
                  setBetInputStr(String(target));
                  onAct(isBalMode && target === bal ? 'allin' : 'raise', target);
                }}
              >
                <span className="chip-lbl">2× Raise</span>
                <span className="chip-val">{money(chaalCost * 2)}</span>
              </button>

              {/* 4x Raise Chip */}
              <button
                type="button"
                className="casino-chip-item chip-green"
                disabled={isBalMode && chaalCost * 4 > bal}
                title={`4× Raise to ${money(chaalCost * 4)}`}
                onClick={() => {
                  const target = chaalCost * 4;
                  if (isBalMode && target > bal) return;
                  sounds.playChipSound();
                  setBetInputStr(String(target));
                  onAct(isBalMode && target === bal ? 'allin' : 'raise', target);
                }}
              >
                <span className="chip-lbl">4× Raise</span>
                <span className="chip-val">{money(chaalCost * 4)}</span>
              </button>

              {/* Pot Chip (shown when pot is distinct from 2x and 4x raise amounts) */}
              {potTotal > chaalCost && potTotal !== minRaise && potTotal !== minRaise * 2 && (
                <button
                  type="button"
                  className="casino-chip-item chip-purple"
                  disabled={isBalMode && potTotal > bal}
                  title={`Raise to Pot size (${money(potTotal)})`}
                  onClick={() => {
                    sounds.playChipSound();
                    setBetInputStr(String(potTotal));
                    onAct(isBalMode && potTotal === bal ? 'allin' : 'raise', potTotal);
                  }}
                >
                  <span className="chip-lbl">Pot</span>
                  <span className="chip-val">{money(potTotal)}</span>
                </button>
              )}

              {/* All-In Chip */}
              {isBalMode && bal > 0 && (
                <button
                  type="button"
                  className="casino-chip-item chip-allin"
                  title={`Shove entire stack of ${money(bal)} All-In`}
                  onClick={() => {
                    sounds.playChipSound();
                    setBetInputStr(String(bal));
                    onAct('allin', bal);
                  }}
                >
                  <span className="chip-lbl">🚨 All-In</span>
                  <span className="chip-val">{money(bal)}</span>
                </button>
              )}
            </div>
          </div>

          {/* Primary Action Button */}
          <div style={{ marginTop: 6 }}>
            {canAllInShort ? (
              <button
                type="button"
                className="casino-hero-btn hero-allin"
                onClick={() => {
                  sounds.playChipSound();
                  onAct('allin', bal);
                }}
              >
                🚨 GO ALL-IN ({money(bal)}) · SIDE POT
              </button>
            ) : (
              <button
                type="button"
                className="casino-hero-btn hero-chaal"
                disabled={!canChaal}
                onClick={() => {
                  if (!canChaal) return;
                  sounds.playChipSound();
                  onAct(isBalMode && chaalCost === bal ? 'allin' : 'bet', chaalCost);
                }}
              >
                💰 {isBlind ? 'PLAY BLIND' : 'CHAAL'} {money(chaalCost)}{isBalMode && chaalCost === bal ? ' (ALL-IN)' : ''}
              </button>
            )}
          </div>

          {/* Interactive Casino Bet Counter & Custom Raise */}
          <div className="casino-counter-box">
            <div className="casino-counter-header">
              <span style={{ color: 'var(--gold)', letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11.5 }}>
                ✏️ Custom Bet / Raise
              </span>
              <span className="mut" style={{ fontSize: 11 }}>
                Min: {money(chaalCost + (canAllInShort ? 0 : 1))} {isBalMode ? `· Max: ${money(bal)}` : ''}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="casino-input-wrap" style={{ width: '100%' }}>
                <span className="currency-sym">₹</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={String(canAllInShort ? bal : chaalCost + 1)}
                  value={betInputStr}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9]/g, '');
                    setBetInputStr(clean);
                  }}
                />
                {betInputStr.length > 0 && (
                  <button
                    type="button"
                    className="clear-btn"
                    title="Clear amount"
                    onClick={() => setBetInputStr('')}
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="button"
                className={isAllInInput ? 'gold' : isInvalidBet ? 'bad' : 'pri'}
                disabled={isInvalidBet}
                style={{ width: '100%', padding: '10px 16px', fontWeight: 900, fontSize: 14 }}
                onClick={() => {
                  if (isInvalidBet) return;
                  sounds.playChipSound();
                  if (isAllInInput) {
                    onAct('allin', bal);
                  } else {
                    onAct('raise', betInput);
                  }
                }}
              >
                {isAllInInput
                  ? `🚨 All-In ${money(bal)}`
                  : betInput > chaalCost
                    ? `⬆ Raise to ${money(betInput)}`
                    : `⬆ Raise (Min ${money(chaalCost + 1)})`}
              </button>
            </div>

            {isInvalidBet && betInputStr.trim() !== '' && (
              <div style={{ color: '#f87171', fontSize: 11.5, fontWeight: 700, marginTop: 6 }}>
                ⚠️ {betInput <= chaalCost
                  ? `Enter an amount greater than current Chaal (${money(chaalCost)}) or All-In (${money(bal)})`
                  : isBalMode && betInput > bal
                    ? `Exceeds your balance of ${money(bal)}`
                    : 'Enter a valid amount'}
              </div>
            )}
          </div>

          {/* Secondary Actions: Paid Show & Pack/Fold */}
          <div className="acts" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="good"
              disabled={!canShow}
              style={{ padding: '12px 14px', fontSize: 14.5, fontWeight: 900 }}
              title={!canShow ? (!canShowEligible ? 'Paid Force Show is allowed when 2 active players remain with chips (use Mutual Show below for 3+ players)' : 'Insufficient chips') : undefined}
              onClick={() => {
                sounds.playChipSound();
                onAct('show', actualShowCost);
              }}
            >
              {isAllInShow ? `🚨 All-In Force Show (${money(actualShowCost)})` : `🎴 Force Show (${money(showCost)})`}
            </button>

            <button
              type="button"
              className="bad"
              style={{ padding: '12px 14px', fontSize: 14.5, fontWeight: 900 }}
              onClick={() => {
                sounds.playFoldSound();
                onAct('fold');
              }}
            >
              🏳 Pack / Fold
            </button>
          </div>

          {!mutualReq && activePlayers.length >= 2 && onRequestMutualShow && (
            <button
              type="button"
              className="sm"
              style={{
                width: '100%',
                marginTop: 10,
                padding: '10px 14px',
                background: 'rgba(16, 185, 129, 0.16)',
                border: '1.5px solid #10b981',
                color: '#6ee7b7',
                fontSize: 13,
                fontWeight: 900,
                borderRadius: 14,
              }}
              onClick={onRequestMutualShow}
            >
              🤝 Request Mutual Card Show (₹0 · All Active Players)
            </button>
          )}
        </div>

        {roundControlBox}
      </aside>
    );
  }

  /* ───────── Case 4: Showdown Phase ───────── */
  const winner = round.winner;

  if (isOnline || round.settled) {
    return (
      <aside id="right">
        <div className="card slide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>🏆 Round #{round.no} Result</h2>
            <span className="pill" style={{ fontSize: 11, fontWeight: 900, color: '#4ade80' }}>
              ✓ System Settled · {money(potTotal)}
            </span>
          </div>
          <p className="mut" style={{ margin: '0 0 8px', fontSize: 12 }}>
            {activePlayers.length === 1
              ? 'Everyone else packed! Pot automatically awarded:'
              : 'Showdown evaluated automatically by 3-card Teen Patti hand rank:'}
          </p>

          {pots.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {pots.map((pot, idx) => {
                const pWinners = (round.potWinners?.[pot.id] || [winner]).filter(Boolean);
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
                      background: idx === 0 ? 'rgba(244,195,79,0.12)' : 'rgba(56,189,248,0.12)',
                      border: `1px solid ${idx === 0 ? 'rgba(244,195,79,0.35)' : 'rgba(56,189,248,0.35)'}`,
                    }}
                  >
                    <span style={{ fontWeight: 800, color: idx === 0 ? 'var(--gold)' : '#38bdf8' }}>
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
            {activePlayers.map(id => {
              const p = players.find(x => x.id === id);
              const isWinner =
                winner === id ||
                (round.winners || []).includes(id) ||
                Object.values(round.potWinners || {}).some(arr => (arr || []).includes(id));
              const pCards = Array.isArray(round.hands?.[id]) ? round.hands[id] : null;
              const evalName =
                round.handEvaluations?.[id]?.rankName ||
                (pCards && pCards.length === 3 ? evaluateTeenPattiHand(pCards).rankName : null);

              return (
                <div
                  key={id}
                  className={`opt ${isWinner ? 'sel' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'default', padding: '8px 12px' }}
                >
                  <div className="grow">
                    <b>{isWinner ? '👑 ' : ''}{p?.name}</b>
                    <div className="mut" style={{ fontSize: 11.5 }}>
                      Wagered {money(round.contrib[id] || 0)}
                      {evalName && <span style={{ color: 'var(--gold)', fontWeight: 800, marginLeft: 6 }}>· {evalName}</span>}
                    </div>
                  </div>
                  {pCards && (
                    <div style={{ display: 'flex', gap: 3 }}>
                      {pCards.map((c: any, ci: number) => (
                        <PlayingCard key={ci} card={c} size="xs" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {winner && (
            <p style={{ margin: '10px 0 6px', fontSize: 13, textAlign: 'center', color: '#4ade80', fontWeight: 800 }}>
              🏆 {(round.winners && round.winners.length > 1
                ? round.winners.map(wid => players.find(p => p.id === wid)?.name || wid).join(' & ')
                : players.find(p => p.id === winner)?.name)} won from total pot of {money(potTotal)}!
            </p>
          )}

          {renderOnlineReadyAndRequests()}

          {isHost ? (
            <button
              className="pri big"
              style={{ marginTop: 10 }}
              disabled={seated.length < 2 || !allSeatedReady}
              onClick={handleStartRound}
            >
              {isOnline && !allSeatedReady
                ? `⏳ Waiting for Players (${readyCount}/${seated.length})`
                : `🃏 Deal Next Round`}
            </button>
          ) : (
            <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12.5, color: 'var(--gold)' }}>
              {isMeReady
                ? '👍 You are Ready! Waiting for Game Operator to deal next round...'
                : '👆 Press "Ready for Next Round" above so the Game Operator can deal!'}
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
        <h2>🎴 Showdown</h2>
        <p className="mut" style={{ margin: '0 0 8px', fontSize: 12 }}>
          {activePlayers.length === 1
            ? 'Everyone else packed!'
            : isOnline
              ? 'Cards revealed and evaluated! Admin can confirm & settle.'
              : 'Tap who has the best 3-card Teen Patti hand.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activePlayers.map(id => {
            const p = players.find(x => x.id === id);
            const isWinner = winner === id;
            const pCards = Array.isArray(round.hands?.[id]) ? round.hands[id] : null;
            const evalName =
              round.handEvaluations?.[id]?.rankName ||
              (pCards && pCards.length === 3 ? evaluateTeenPattiHand(pCards).rankName : null);

            return (
              <div
                key={id}
                className={`opt ${isWinner ? 'sel' : ''}`}
                onClick={() => { if (isHost) onPickWinner(id); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: isHost ? 'pointer' : 'default', padding: '8px 12px' }}
              >
                <div className="grow">
                  <b>{p?.name}</b>
                  <div className="mut" style={{ fontSize: 11.5 }}>
                    Wagered {money(round.contrib[id] || 0)}
                    {evalName && <span style={{ color: 'var(--gold)', fontWeight: 800, marginLeft: 6 }}>· {evalName}</span>}
                  </div>
                </div>
                {pCards && (
                  <div style={{ display: 'flex', gap: 3 }}>
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

        {winner && (
          <p style={{ margin: '8px 0', fontSize: 13 }}>
            <b>{players.find(p => p.id === winner)?.name}</b> wins the pot of <b>{money(potTotal)}</b>
          </p>
        )}

        {isHost ? (
          <button
            className="pri big"
            style={{ marginTop: 10 }}
            disabled={!winner}
            onClick={onConfirmWin}
          >
            ✅ Confirm &amp; Settle Pot
          </button>
        ) : (
          <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12.5, color: 'var(--gold)' }}>
            ⏳ Waiting for room admin to confirm &amp; settle...
          </div>
        )}
      </div>

      {roundControlBox}
    </aside>
  );
}
