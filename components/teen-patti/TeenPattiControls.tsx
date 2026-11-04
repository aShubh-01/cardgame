'use client';

import React, { useState } from 'react';
import { Player, Round, COL, money } from '@/types/game';
import { getTeenPattiBetAmounts } from '@/lib/blindRules';

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
  onPickWinner: (id: string) => void;
  onConfirmWin: () => void;
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
  onSetBalanceMode,
  onSetDefaultBuyIn,
  onResetAllBalances,
  onSetAnteMode,
  onSetAnteAmt,
  onSeeCards,
  onAct,
  onPickWinner,
  onConfirmWin,
}: TeenPattiControlsProps) {
  const [isRaiseOpen, setIsRaiseOpen] = useState(false);
  const [raiseAmt, setRaiseAmt] = useState<number>(0);
  const [customAnte, setCustomAnte] = useState<Record<string, number>>({});

  const isBalMode = !!balanceMode;
  const seated = players.filter(p => !p.sit);

  const potTotal = round
    ? Object.values(round.contrib || {}).reduce((a, b) => a + b, 0)
    : 0;

  const activePlayers = round
    ? round.parts.filter(id => !round.folded[id])
    : [];

  const handleStartRound = () => {
    onStartRound(ante.mode === 'each' ? customAnte : undefined);
    setIsRaiseOpen(false);
  };

  // Turn player stats
  const turnPlayer = round ? players.find(p => p.id === round.turn) : null;
  const turnPlayerId = turnPlayer?.id || '';
  const bal = turnPlayer?.balance || 0;
  const n = activePlayers.length;

  const isBlind = (round?.playerStatus?.[turnPlayerId] || 'blind') === 'blind';
  const otherActiveId = activePlayers.find(id => id !== turnPlayerId);
  const isOtherBlind = otherActiveId ? (round?.playerStatus?.[otherActiveId] || 'blind') === 'blind' : false;

  const baseUnit = Math.max(1, round?.stake || ante.amt || 10);
  const { chaalCost, minRaise, showCost } = getTeenPattiBetAmounts(baseUnit, isBlind, isOtherBlind);

  const canShow = n === 2 && (!isBalMode || bal >= showCost);
  const canChaal = !isBalMode || bal >= chaalCost;
  const canRaise = !isBalMode || bal >= minRaise;

  const effectiveRaiseVal = Math.max(minRaise, raiseAmt || minRaise);

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

          <h2>🎰 New round</h2>
          <div className="seg">
            <button className={isEach ? 'on' : ''} onClick={() => onSetAnteMode('each')}>
              Per player
            </button>
            <button className={!isEach ? 'on' : ''} onClick={() => onSetAnteMode('common')}>
              Common boot
            </button>
          </div>

          <div className="row" style={{ margin: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="mut">{isEach ? 'Default boot' : 'Boot'}</span>
            <input
              type="number"
              min="0"
              value={ante.amt}
              onChange={(e) => onSetAnteAmt(+e.target.value || 0)}
              style={{ width: 110 }}
            />
          </div>

          {isEach &&
            seated.map(p => (
              <div className="li" key={p.id}>
                <span>{p.name}</span>
                <input
                  type="number"
                  min="0"
                  value={customAnte[p.id] !== undefined ? customAnte[p.id] : ante.amt}
                  onChange={(e) => setCustomAnte({ ...customAnte, [p.id]: +e.target.value || 0 })}
                  style={{ width: 90 }}
                />
              </div>
            ))}

          <button
            className="pri big"
            style={{ marginTop: 10 }}
            disabled={seated.length < 2}
            onClick={handleStartRound}
          >
            🃏 Deal &amp; start round
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
        <button className="grow bad" style={{ flex: 1 }} onClick={onAbortRound}>
          Abort round
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

    const turnSubtitle = `Base Stake: ${money(baseUnit)} · in for ${money(round.contrib[turnPlayerId] || 0)}${isBalMode ? ` · stack: ₹${bal}` : ''}`;

    const isInvalidRaise = effectiveRaiseVal < minRaise || (isBalMode && effectiveRaiseVal > bal);

    return (
      <aside id="right">
        <div className="card slide">
          <div className="turnbox">
            <div className="av" style={{ background: col, margin: '0 auto 4px', width: 44, height: 44 }}>
              {(turnPlayer?.name[0] || '?').toUpperCase()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, margin: '4px 0' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: isBlind ? 'rgba(56, 189, 248, 0.2)' : 'rgba(244, 195, 79, 0.2)',
                  color: isBlind ? '#38bdf8' : 'var(--gold)',
                  border: `1px solid ${isBlind ? '#38bdf8' : 'var(--gold)'}`,
                }}
              >
                {isBlind ? '🙈 PLAYING BLIND' : '👁 PLAYING SEEN'}
              </span>
              {isBlind && onSeeCards && (
                <button
                  className="sm"
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    background: 'rgba(244,195,79,0.15)',
                    borderColor: 'var(--gold)',
                    color: 'var(--gold)',
                  }}
                  title="View your cards and switch to Seen"
                  onClick={() => onSeeCards(turnPlayerId)}
                >
                  👁 See Cards
                </button>
              )}
            </div>
            <div style={{ fontSize: 21, fontWeight: 900 }}>{turnPlayer?.name}</div>
            <div className="mut" style={{ fontSize: 12 }}>{turnSubtitle}</div>
          </div>

          {isRaiseOpen ? (
            <div style={{ marginTop: 10 }}>
              <div className="mut" style={{ fontSize: 12, marginBottom: 6, textAlign: 'center' }}>
                Raise amount as <b>{isBlind ? 'BLIND (min 2×)' : 'SEEN (min 4×)'}</b> (min {money(minRaise)}):
                {isBalMode && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>Your balance: <b>{money(bal)}</b></div>}
              </div>

              <input
                type="number"
                min={minRaise}
                max={isBalMode ? bal : undefined}
                value={effectiveRaiseVal}
                onChange={(e) => setRaiseAmt(+e.target.value || 0)}
                onBlur={() => {
                  if (effectiveRaiseVal < minRaise) setRaiseAmt(minRaise);
                }}
                style={{ width: '100%', textAlign: 'center', fontSize: 22, marginTop: 6 }}
              />

              <div className="q" style={{ marginTop: 8 }}>
                <button className="sm" onClick={() => setRaiseAmt(minRaise)}>
                  Min ({money(minRaise)})
                </button>
                <button className="sm" onClick={() => setRaiseAmt(minRaise * 2)}>
                  2× ({money(minRaise * 2)})
                </button>
                <button className="sm" onClick={() => setRaiseAmt(minRaise * 3)}>
                  3× ({money(minRaise * 3)})
                </button>
                <button className="sm" onClick={() => setRaiseAmt(isBalMode ? Math.min(bal, potTotal) : potTotal)}>
                  Pot ({money(isBalMode ? Math.min(bal, potTotal) : potTotal)})
                </button>
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
                  ⬆ Confirm Raise {money(effectiveRaiseVal)}
                </button>
                <button onClick={() => setIsRaiseOpen(false)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="acts">
              <button
                className="pri big"
                style={{ gridColumn: '1/-1' }}
                disabled={!canChaal}
                title={!canChaal ? `Insufficient chips: you have ${money(bal)}, need ${money(chaalCost)}` : undefined}
                onClick={() => onAct('bet', chaalCost)}
              >
                💰 Chaal {money(chaalCost)} {isBlind ? '(Blind)' : '(Seen)'}
              </button>

              <button
                className="gold"
                disabled={!canRaise}
                title={!canRaise ? `Insufficient chips to raise (min ${money(minRaise)})` : undefined}
                onClick={() => {
                  setRaiseAmt(minRaise);
                  setIsRaiseOpen(true);
                }}
              >
                ⬆ Raise
              </button>

              <button className="bad" onClick={() => onAct('fold')}>
                🏳 Fold
              </button>

              <button
                className="good"
                disabled={!canShow}
                title={
                  !canShow
                    ? n !== 2
                      ? 'Show is only allowed when exactly 2 players remain'
                      : isBalMode && bal < showCost
                      ? `Insufficient chips: you have ${money(bal)}, need ${money(showCost)} to Show`
                      : ''
                    : undefined
                }
                onClick={() => onAct('show', showCost)}
              >
                🎴 Show {money(showCost)}
              </button>

              <button disabled={n < 2} onClick={() => onAct('mutual')}>
                🤝 Mutual
              </button>
            </div>
          )}
        </div>

        {roundControlBox}
      </aside>
    );
  }

  /* ───────── Case 4: Showdown Phase ───────── */
  const winner = round.winner;

  return (
    <aside id="right">
      <div className="card slide">
        <h2>🎴 Showdown</h2>
        <p className="mut" style={{ margin: '0 0 8px' }}>
          {activePlayers.length === 1 ? 'Everyone else folded.' : 'Tap who has the best cards.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activePlayers.map(id => {
            const p = players.find(x => x.id === id);
            const isWinner = winner === id;
            return (
              <div
                key={id}
                className={`opt ${isWinner ? 'sel' : ''}`}
                onClick={() => onPickWinner(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px' }}
              >
                <div className="grow">
                  <b>{p?.name}</b>
                  <div className="mut">Wagered {money(round.contrib[id] || 0)}</div>
                </div>
                {isWinner && <span>🏆</span>}
              </div>
            );
          })}
        </div>

        {winner && (
          <p style={{ margin: '8px 0', fontSize: 13 }}>
            <b>{players.find(p => p.id === winner)?.name}</b> receives{' '}
            <b>{money(potTotal - (round.contrib[winner] || 0))}</b> from the others
          </p>
        )}

        <button
          className="pri big"
          style={{ marginTop: 10 }}
          disabled={!winner}
          onClick={onConfirmWin}
        >
          ✅ Confirm &amp; settle
        </button>
      </div>

      {roundControlBox}
    </aside>
  );
}

