'use client';

import React, { useState } from 'react';
import { Player, Round, COL, money } from '@/types/game';
import { calculatePots, distributePots } from '@/lib/pokerPot';

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
  onConfirmShowdown: (potWinners: Record<string, string[]>) => void;
}

export default function PokerControls({
  players,
  round,
  balanceMode,
  defaultBuyIn = 1000,
  ante,
  blinds,
  dealerIdx = 0,
  onSetBlinds,
  onStartRound,
  onAbortRound,
  onUndo,
  onSetBalanceMode,
  onSetDefaultBuyIn,
  onResetAllBalances,
  onSetAnteMode,
  onSetAnteAmt,
  onAct,
  onConfirmShowdown,
}: PokerControlsProps) {
  const [isRaiseOpen, setIsRaiseOpen] = useState(false);
  const [raiseAmt, setRaiseAmt] = useState<number>(0);
  const [customAnte, setCustomAnte] = useState<Record<string, number>>({});
  const [potWinnersState, setPotWinnersState] = useState<Record<string, string[]>>({});

  const isBalMode = !!balanceMode;
  const seated = players.filter(p => !p.sit);

  const { pots, totalPot } = round
    ? calculatePots(round.contrib || {}, round.folded || {})
    : { pots: [], totalPot: 0 };

  const streetNames = ['Pre-flop', 'Flop (Loop 1)', 'Turn (Loop 2)', 'River (Loop 3)'];

  // Start round click
  const handleStartRound = () => {
    onStartRound(ante.mode === 'each' ? customAnte : undefined);
    setIsRaiseOpen(false);
    setPotWinnersState({});
  };

  // Turn player stats
  const turnPlayer = round ? players.find(p => p.id === round.turn) : null;
  const sc = (round && turnPlayer && round.st?.[turnPlayer.id]) || 0;
  const tc = Math.max(0, (round?.cur || 0) - sc);
  const canCheck = tc === 0;
  const bal = turnPlayer?.balance || 0;
  const canCallFull = !isBalMode || bal >= tc;
  const cur = round?.cur || 0;
  const minInc = Math.max(round?.minRaise || 0, ante.amt || 10, 10);
  const minRaiseTarget = cur === 0 ? minInc : cur + 1;

  // Toggle winner for a pot in showdown
  const togglePotWinner = (potId: string, playerId: string) => {
    setPotWinnersState(prev => {
      const current = prev[potId] || [];
      if (current.includes(playerId)) {
        return { ...prev, [potId]: current.filter(id => id !== playerId) };
      }
      return { ...prev, [potId]: [...current, playerId] };
    });
  };

  // Quick pick best hand for all eligible pots
  const pickAllPotsForPlayer = (playerId: string) => {
    const updated: Record<string, string[]> = { ...potWinnersState };
    pots.forEach(pot => {
      if (pot.eligiblePlayerIds.includes(playerId)) {
        updated[pot.id] = [playerId];
      }
    });
    setPotWinnersState(updated);
  };

  // Confirm showdown
  const handleConfirmShowdown = () => {
    onConfirmShowdown(potWinnersState);
  };

  /* ───────── Case 1: Pre-round Setup ───────── */
  if (!round) {
    const isEach = ante.mode === 'each';
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
            <span className="pill" style={{ fontSize: 10.5, opacity: 0.75 }}>Session Locked</span>
          </div>

          {isBalMode && (
            <div style={{ marginBottom: 12 }}>
              <div className="row" style={{ margin: '6px 0 8px', alignItems: 'center', justifyContent: 'space-between', display: 'flex' }}>
                <span className="mut" style={{ fontSize: 12 }}>Chips per player:</span>
                <input
                  type="number"
                  min="10"
                  step="50"
                  value={defaultBuyIn}
                  onChange={(e) => onSetDefaultBuyIn(+e.target.value || 1000)}
                  style={{ width: 105, textAlign: 'center' }}
                />
              </div>
              <button
                className="sm"
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

          <h2>🎰 Hand Setup · Blinds</h2>
          <div className="row" style={{ margin: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="mut" style={{ fontSize: 13 }}>🪙 Small Blind (SB):</span>
            <input
              type="number"
              min="1"
              value={blinds?.sb ?? (ante.amt ? ante.amt : 10)}
              onChange={(e) => onSetBlinds?.(+e.target.value || 10, blinds?.bb ?? 20)}
              style={{ width: 95, textAlign: 'center' }}
            />
          </div>
          <div className="row" style={{ margin: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="mut" style={{ fontSize: 13 }}>🪙 Big Blind (BB):</span>
            <input
              type="number"
              min="2"
              value={blinds?.bb ?? (ante.amt ? ante.amt * 2 : 20)}
              onChange={(e) => {
                const bb = +e.target.value || 20;
                onSetBlinds?.(Math.floor(bb / 2), bb);
              }}
              style={{ width: 95, textAlign: 'center' }}
            />
          </div>
          <div className="row" style={{ margin: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="mut" style={{ fontSize: 13 }}>Optional Ante:</span>
            <input
              type="number"
              min="0"
              value={ante.amt}
              onChange={(e) => onSetAnteAmt(+e.target.value || 0)}
              style={{ width: 95, textAlign: 'center' }}
            />
          </div>

          {seated.length >= 2 && (
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 11.5, margin: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="mut">🔘 Dealer Button [D]:</span>
                <b style={{ color: 'var(--gold)' }}>{seated[dealerIdx % seated.length]?.name || 'Next'}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                <span className="mut">Small Blind [SB]:</span>
                <span>{seated[(dealerIdx + 1) % seated.length]?.name} ({money(blinds?.sb ?? 10)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                <span className="mut">Big Blind [BB]:</span>
                <span>{seated[(dealerIdx + (seated.length === 2 ? 1 : 2)) % seated.length]?.name} ({money(blinds?.bb ?? 20)})</span>
              </div>
            </div>
          )}

          <button
            className="pri big"
            style={{ marginTop: 10 }}
            disabled={seated.length < 2}
            onClick={handleStartRound}
          >
            🃏 Deal &amp; post blinds
          </button>

          {seated.length < 2 && (
            <p className="mut" style={{ marginTop: 8 }}>
              {players.length < 2 ? 'Add at least 2 players on the left.' : 'At least 2 active players needed.'}
            </p>
          )}
        </div>
      </aside>
    );
  }

  /* ───────── Case 2: Round Controls Common Box ───────── */
  const roundControlBox = (
    <div className="card">
      <h2>⚙ Round control</h2>
      <div className="row" style={{ display: 'flex', gap: 6 }}>
        <button
          className="grow"
          style={{ flex: 1 }}
          disabled={!round.stack || !round.stack.length}
          onClick={onUndo}
        >
          ↩ Undo
        </button>
        {round.phase === 'bet' && (
          <button className="grow" style={{ flex: 1 }} onClick={() => onAct('showdown')}>
            🎴 Showdown
          </button>
        )}
        <button className="grow bad" style={{ flex: 1 }} onClick={onAbortRound}>
          Abort
        </button>
      </div>
      {round.log
        .slice()
        .reverse()
        .slice(0, 5)
        .map((l, i) => (
          <div className="li mut" key={i} style={{ fontSize: 12 }}>
            {l}
          </div>
        ))}
    </div>
  );

  /* ───────── Case 3: Betting Phase ───────── */
  if (round.phase === 'bet') {
    const colIdx = players.findIndex(p => p.id === turnPlayer?.id) % COL.length;
    const col = COL[colIdx >= 0 ? colIdx : 0];

    const minRaiseStep = Math.max(round.minRaise || 0, ante.amt || 10, 10);
    const minAllowedRaise = cur === 0 ? minInc : cur + minRaiseStep;
    const effectiveRaiseVal = Math.max(minAllowedRaise, raiseAmt || (cur === 0 ? minInc : cur * 2));

    const isDealer = round.dealer === turnPlayer?.id;
    const isSb = round.smallBlind?.playerId === turnPlayer?.id;
    const isBb = round.bigBlind?.playerId === turnPlayer?.id;
    const posLabel = isDealer ? '🔘 Button [D]' : isSb ? '🪙 Small Blind [SB]' : isBb ? '🪙 Big Blind [BB]' : '';

    const isInvalidRaise = effectiveRaiseVal <= cur || (isBalMode && effectiveRaiseVal - sc > bal);

    return (
      <aside id="right">
        {/* Pots breakdown pill */}
        {pots.length > 1 && (
          <div className="card" style={{ marginBottom: 10, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(244,195,79,0.25)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1 }}>
                🏺 Pots Breakdown
              </span>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>Total {money(totalPot)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pots.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '5px 8px', borderRadius: 6, fontSize: 12 }}>
                  <div>
                    <b style={{ color: p.id === 'main' ? 'var(--gold)' : '#38bdf8' }}>{p.name}: {money(p.amount)}</b>
                    <div className="mut" style={{ fontSize: 10.5 }}>
                      Eligible: {p.eligiblePlayerIds.map(id => players.find(x => x.id === id)?.name || id).join(', ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card slide">
          <div className="turnbox">
            <div className="av" style={{ background: col, margin: '0 auto 4px', width: 44, height: 44 }}>
              {(turnPlayer?.name[0] || '?').toUpperCase()}
            </div>
            <div className="mut">{streetNames[round.street || 0]} · now playing {posLabel && <span style={{ color: 'var(--gold)', fontWeight: 700 }}>· {posLabel}</span>}</div>
            <div style={{ fontSize: 21, fontWeight: 900 }}>{turnPlayer?.name}</div>
            <div className="mut" style={{ fontSize: 12 }}>
              {cur
                ? (tc > 0
                    ? `To call ${money(cur)}${sc > 0 ? ` (you put in ${money(sc)}, add ${money(tc)})` : ''}${isBalMode ? ` · stack: ₹${bal}` : ''}`
                    : `Current bet: ${money(cur)} (you matched)${isBalMode ? ` · stack: ₹${bal}` : ''}`)
                : `No bet yet (check or open)${isBalMode ? ` · stack: ₹${bal}` : ''}`}
            </div>
          </div>

          {isRaiseOpen ? (
            <div style={{ marginTop: 10 }}>
              <div className="mut" style={{ fontSize: 12, marginBottom: 6, textAlign: 'center' }}>
                {cur === 0 ? `Open bet amount (min ${money(minInc)}):` : `Total amount you are giving (min raise ${money(minAllowedRaise)}):`}
                {isBalMode && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>Your balance: <b>{money(bal)}</b></div>}
              </div>

              <input
                type="number"
                min={minAllowedRaise}
                max={isBalMode ? sc + bal : undefined}
                value={effectiveRaiseVal}
                onChange={(e) => setRaiseAmt(+e.target.value || 0)}
                onBlur={() => {
                  if (effectiveRaiseVal < minAllowedRaise) {
                    setRaiseAmt(minAllowedRaise);
                  }
                }}
                style={{ width: '100%', textAlign: 'center', fontSize: 24, fontWeight: 900 }}
              />

              {cur > 0 && (
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', margin: '10px 0', fontSize: 13, lineHeight: 1.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="mut">Current Bet to Beat:</span>
                    <b>{money(cur)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="mut">Total You Are Giving:</span>
                    <b className="pos" style={{ fontSize: 15 }}>{money(effectiveRaiseVal)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 4, marginTop: 4 }}>
                    <span className="mut">Adding from your stack now:</span>
                    <b style={{ color: 'var(--gold)' }}>{money(Math.max(0, effectiveRaiseVal - sc))}</b>
                  </div>
                </div>
              )}

              <div className="q" style={{ marginTop: 8 }}>
                <button className="sm" onClick={() => setRaiseAmt(minAllowedRaise)}>
                  Min ({money(minAllowedRaise)})
                </button>
                <button className="sm" onClick={() => setRaiseAmt(Math.max(minAllowedRaise, cur === 0 ? minInc * 2 : cur * 2))}>
                  2×
                </button>
                <button className="sm" onClick={() => setRaiseAmt(Math.max(minAllowedRaise, cur === 0 ? Math.round(totalPot / 2) : cur + Math.round(totalPot / 2)))}>
                  ½ Pot
                </button>
                <button className="sm" onClick={() => setRaiseAmt(Math.max(minAllowedRaise, cur === 0 ? totalPot : cur + totalPot))}>
                  Pot
                </button>
                {isBalMode && bal > 0 && (
                  <button className="sm" style={{ borderColor: '#ef4444', color: '#ef4444' }} onClick={() => setRaiseAmt(sc + bal)}>
                    🚨 All-In
                  </button>
                )}
              </div>

              <div className="row" style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                <button
                  className={isInvalidRaise ? 'bad grow' : 'gold grow'}
                  style={{ flex: 1 }}
                  disabled={isInvalidRaise}
                  onClick={() => {
                    if (isInvalidRaise) return;
                    onAct('raise', effectiveRaiseVal);
                    setIsRaiseOpen(false);
                  }}
                >
                  {isInvalidRaise
                    ? (effectiveRaiseVal <= cur ? `❌ Must be > ${money(cur)}` : `❌ Insufficient chips`)
                    : (cur === 0 ? `⬆ Confirm Bet ${money(effectiveRaiseVal)}` : `⬆ Confirm Raise to ${money(effectiveRaiseVal)}`)}
                </button>
                <button onClick={() => setIsRaiseOpen(false)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="acts">
              {canCheck ? (
                <button className="pri big" style={{ gridColumn: '1/-1' }} onClick={() => onAct('check')}>
                  ✋ Check
                </button>
              ) : isBalMode && !canCallFull ? (
                <button
                  className="bad big"
                  style={{ gridColumn: '1/-1', background: 'linear-gradient(#dc2626,#991b1b)', borderColor: '#fca5a5' }}
                  onClick={() => onAct('call')}
                >
                  🚨 Call ALL-IN {money(bal)} (all your chips)
                </button>
              ) : (
                <button className="good big" style={{ gridColumn: '1/-1' }} onClick={() => onAct('call')}>
                  📞 Call {money(cur)}{tc !== cur ? ` (Put in ${money(tc)})` : ''}
                </button>
              )}

              <button
                className="gold"
                onClick={() => {
                  setRaiseAmt(cur === 0 ? minInc : Math.max(minAllowedRaise, cur * 2));
                  setIsRaiseOpen(true);
                }}
              >
                {cur === 0 ? '💰 Open Bet' : '⬆ Raise'}
              </button>
              <button className="bad" onClick={() => onAct('fold')}>
                🏳 Fold
              </button>

              {isBalMode && bal > 0 && cur === 0 && (
                <button
                  className="bad"
                  style={{ gridColumn: '1/-1', border: '1px solid #ef4444' }}
                  onClick={() => onAct('allin')}
                >
                  🚨 Shove ALL-IN {money(bal)}
                </button>
              )}
            </div>
          )}
        </div>

        {roundControlBox}
      </aside>
    );
  }

  /* ───────── Case 4: Showdown Phase ───────── */
  const activeRoundPlayers = players.filter(p => round.parts.includes(p.id) && !round.folded[p.id]);
  const hasSidePots = pots.length > 1;
  const allPotsHaveWinners = pots.every(p => p.amount <= 0 || (potWinnersState[p.id] || []).length > 0);

  return (
    <aside id="right">
      <div className="card slide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>🏆 Showdown</h2>
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--gold)' }}>Total {money(totalPot)}</span>
        </div>

        <p className="mut" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.4 }}>
          {hasSidePots
            ? 'Side pots formed! Select winner(s) for each pot independently. Only players who contributed to a pot are eligible to win it.'
            : activeRoundPlayers.length === 1
            ? 'Everyone else folded! Confirm to collect the pot.'
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
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          disabled={!isEligible}
                          title={!isEligible ? 'Ineligible: all-in at a lower tier' : undefined}
                          onClick={() => togglePotWinner(potItem.id, pl.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 8px',
                            borderRadius: 8,
                            textAlign: 'left',
                            fontSize: 11.5,
                            cursor: isEligible ? 'pointer' : 'not-allowed',
                            opacity: isEligible ? 1 : 0.35,
                            background: isWinner ? 'rgba(34,197,94,0.22)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isWinner ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <b>{pl.name}</b>
                            <div style={{ fontSize: 9.5, opacity: 0.8 }}>
                              {isEligible ? (isWinner ? '🏆 Winner' : 'Eligible') : 'Ineligible'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="mut" style={{ fontSize: 11, marginBottom: 5 }}>
                Quick Pick: Best Hand Overall (All Eligible Pots)
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {activeRoundPlayers.map(pl => (
                  <button
                    key={pl.id}
                    type="button"
                    className="sm"
                    onClick={() => pickAllPotsForPlayer(pl.id)}
                    title={`Award all pots ${pl.name} is eligible for`}
                  >
                    👑 {pl.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeRoundPlayers.map(pl => {
              const selected = potWinnersState['main'] || [];
              const isWinner = selected.includes(pl.id);
              return (
                <div
                  key={pl.id}
                  className={`opt ${isWinner ? 'sel' : ''}`}
                  onClick={() => togglePotWinner('main', pl.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px' }}
                >
                  <div className="grow">
                    <b>{pl.name}</b>
                    <div className="mut">Wagered {money(round.contrib[pl.id] || 0)}</div>
                  </div>
                  {isWinner && <span>🏆</span>}
                </div>
              );
            })}
          </div>
        )}

        <button
          className="pri big"
          style={{ marginTop: 12 }}
          disabled={!allPotsHaveWinners}
          onClick={handleConfirmShowdown}
        >
          {allPotsHaveWinners ? '✅ Confirm & Settle Pots' : '⚠️ Pick Winner(s) for Each Pot'}
        </button>
      </div>

      {roundControlBox}
    </aside>
  );
}

