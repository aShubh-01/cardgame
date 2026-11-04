'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { calculatePots, distributePots, type Pot } from '@/lib/pokerPot';

/* ───────── Types ───────── */
interface Player { id: string; name: string; sit: boolean; balance?: number }
interface Ante { mode: string; amt: number }
interface PokerCard { rank: string; suit: string; red: boolean }
interface Round {
  no: number; phase: string; parts: string[];
  contrib: Record<string, number>; folded: Record<string, number>;
  turn: string; stake: number; stack: string[]; log: string[];
  lastBy: string; winner: string | null;
  street?: number; cur?: number; st?: Record<string, number>;
  acted?: Record<string, number>; locked?: boolean; winners?: string[];
  lastRaiser?: string | null; minRaise?: number;
  cards?: PokerCard[];
  allIn?: Record<string, boolean>;
  potWinners?: Record<string, string[]>;
}
interface HistEntry { no: number; winner: string; pot: number; got: number; pays: { name: string; amt: number }[] }
interface GameState {
  players: Player[]; ante: Ante;
  balanceMode?: boolean;
  defaultBuyIn?: number;
  round: Round | null;
  debts: Record<string, number>; wins: Record<string, number>;
  hist: HistEntry[]; rno: number; seq: number;
  tot: { rounds: number; total: number; big: number };
}
type GType = 'tp' | 'pk' | null;

/* ───────── Constants ───────── */
const COL = ['#c1121f','#1b8a6b','#7b2cbf','#e07a00','#2563eb','#d6336c','#0f766e','#6b7280'];
const STREETS = ['Pre-flop','Flop','Turn','River'];

function fresh(): GameState {
  return {
    players: [], ante: { mode: 'each', amt: 100 },
    balanceMode: false, defaultBuyIn: 1000,
    round: null, debts: {}, wins: {}, hist: [], rno: 0, seq: 1,
    tot: { rounds: 0, total: 0, big: 0 }
  };
}

/* ───────── Helpers ───────── */
const esc = (s: any) => String(s).replace(/[&<>"]/g, (c: string) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c));
const money = (n: number) => '₹' + Number(n).toLocaleString('en-IN');

declare global { interface Window { [k: string]: any } }

export default function Home() {
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState<{ msg: string; fn: () => void } | null>(null);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [addMoneyTarget, setAddMoneyTarget] = useState<string | null>(null);
  const [stackMode, setStackMode] = useState<'credit' | 'debit'>('credit');
  const [showGoogleConfigModal, setShowGoogleConfigModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<'all' | 'tp' | 'pk'>('all');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionGame, setNewSessionGame] = useState<'tp' | 'pk'>('pk');
  const [newSessionBalMode, setNewSessionBalMode] = useState(false);
  const { data: session, status } = useSession();
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (!data.configured) {
        setShowGoogleConfigModal(true);
        return;
      }
      signIn('google');
    } catch {
      signIn('google');
    }
  };

  // Mutable game state stored in refs (not React state) to avoid re-render loops
  const ref = useRef({
    ALL: { tp: fresh(), pk: fresh(), g: null as GType },
    G: null as GType,
    S: fresh(),
    sessionId: null as string | null,
    sessionName: '' as string,
    sessionStatus: 'active' as string,
    sessionsList: [] as any[],
    fx: {} as any,
    PP: 0,
    ui: { raise: 0 },
    dr: null as any,
  });
  const r = ref.current;

  const P = (id: string) => r.S.players.find(p => p.id === id);
  const nm = (id: string) => { const p = P(id); return p ? esc(p.name) : '?'; };
  const colFn = (id: string) => COL[r.S.players.findIndex(p => p.id === id) % COL.length];
  const avFn = (id: string) => { const p = P(id); return `<div class="av" style="background:${colFn(id)}">${esc((p?.name[0] || '?').toUpperCase())}</div>`; };
  const R = () => r.S.round;
  const pot = () => R() ? Object.values(R()!.contrib).reduce((a, b) => a + b, 0) : 0;
  const active = () => R() ? R()!.parts.filter(id => !R()!.folded[id]) : [];

  const render = useCallback(() => setTick(t => t + 1), []);

  /* ───────── Save to API (debounced) ───────── */
  const saveToAPI = useCallback(() => {
    if (!loadedRef.current) return;
    const g = r.G;
    if (!g) return;
    const payload = JSON.stringify({
      ...r.S,
      name: r.sessionName || `${g === 'pk' ? 'Poker' : 'Teen Patti'} Session`,
      gameType: g,
      status: r.sessionStatus || 'active'
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (r.sessionId) {
        fetch(`/api/sessions/${r.sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        }).catch(console.error);

        // Keep local sessionsList entry in sync for instant UI updates
        const localSess = r.sessionsList.find(s => s._id === r.sessionId);
        if (localSess) {
          Object.assign(localSess, {
            ...r.S,
            name: r.sessionName,
            status: r.sessionStatus,
            players: r.S.players,
            tot: r.S.tot,
            round: r.S.round,
            balanceMode: r.S.balanceMode,
            defaultBuyIn: r.S.defaultBuyIn,
            updatedAt: new Date().toISOString()
          });
        }
      }
      fetch(`/api/games/${g}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }).catch(console.error);
    }, 300);
  }, []);

  /* ───────── Sessions Management ───────── */
  const loadSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const list = await res.json();
        r.sessionsList = list;
        render();
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  };

  const openSessionModal = () => {
    loadSessions();
    setShowSessionModal(true);
  };

  const switchSession = async (sessId: string) => {
    try {
      if (r.sessionId && r.G) {
        fetch(`/api/sessions/${r.sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(r.S)
        }).catch(console.error);
      }
      const res = await fetch(`/api/sessions/${sessId}`);
      if (res.ok) {
        const sess = await res.json();
        const g = sess.gameType as GType;
        r.G = g;
        r.ALL.g = g;
        r.sessionId = sess._id;
        r.sessionName = sess.name;
        r.sessionStatus = sess.status;
        delete sess._id; delete sess.createdAt; delete sess.updatedAt; delete sess.__v;
        r.S = r.ALL[g!] = sess;
        setShowSessionModal(false);
        render();
      }
    } catch (e) {
      console.error('Switch session failed:', e);
    }
  };

  const createSession = async (name: string, gameType: 'tp' | 'pk', balanceMode: boolean) => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          gameType,
          balanceMode,
          defaultBuyIn: 1000
        })
      });
      if (res.ok) {
        const newSess = await res.json();
        await switchSession(newSess._id);
        setIsCreatingSession(false);
        setNewSessionName('');
      }
    } catch (e) {
      console.error('Create session failed:', e);
    }
  };

  const endSession = (sessId: string) => {
    const sess = r.sessionsList.find(s => s._id === sessId);
    setModal({
      msg: `End session "${sess?.name || 'this session'}"? This closes the round ledger for this night. You can still view it in past sessions.`,
      fn: async () => {
        try {
          await fetch(`/api/sessions/${sessId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'ended' })
          });
          if (r.sessionId === sessId) {
            r.sessionStatus = 'ended';
          }
          await loadSessions();
        } catch (e) {
          console.error('End session failed:', e);
        }
      }
    });
  };

  const deleteSession = (sessId: string) => {
    const sess = r.sessionsList.find(s => s._id === sessId);
    setModal({
      msg: `Permanently delete session "${sess?.name || 'this session'}"? All rounds and stats will be removed.`,
      fn: async () => {
        try {
          await fetch(`/api/sessions/${sessId}`, { method: 'DELETE' });
          if (r.sessionId === sessId) {
            r.sessionId = null;
            r.sessionName = '';
            goLobby();
          } else {
            await loadSessions();
          }
        } catch (e) {
          console.error('Delete session failed:', e);
        }
      }
    });
  };

  /* ───────── Game Logic ───────── */
  const addP = () => {
    if (R()) return;
    const el = document.getElementById('nm') as HTMLInputElement;
    const v = el?.value?.trim();
    if (!v) return;

    let initialBal: number | undefined = undefined;
    if (r.S.balanceMode) {
      const balEl = document.getElementById('p_bal') as HTMLInputElement | null;
      const customVal = balEl?.value ? Number(balEl.value) : NaN;
      initialBal = !isNaN(customVal) && customVal >= 0 ? customVal : (r.S.defaultBuyIn || 1000);
      if (balEl) balEl.value = '';
    }

    const isBusted = initialBal !== undefined && initialBal <= 0;
    r.S.players.push({ id: 'p' + r.S.seq++, name: v, sit: isBusted, balance: initialBal });
    if (el) {
      el.value = '';
      el.focus();
    }
    render();
  };

  const rmP = (id: string) => { if (R()) return; r.S.players = r.S.players.filter(p => p.id !== id); render(); };

  const shuffle = () => {
    const a = r.S.players;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    render();
  };

  const sit = (id: string) => {
    if (R()) return;
    const p = P(id);
    if (!p) return;
    // If balanceMode is ON and player has 0 balance, prompt to add chips instead of unpausing
    if (r.S.balanceMode && p.sit && (p.balance || 0) <= 0) {
      setAddMoneyTarget(id);
      return;
    }
    p.sit = !p.sit;
    render();
  };

  const setBalanceMode = (enabled: boolean) => {
    r.S.balanceMode = enabled;
    if (enabled) {
      const def = r.S.defaultBuyIn || 1000;
      r.S.players.forEach(p => {
        if (p.balance === undefined || p.balance === null) {
          p.balance = def;
        }
      });
    }
    render();
  };

  const setDefaultBuyIn = (v: string) => {
    r.S.defaultBuyIn = Math.max(10, +v || 1000);
    render();
  };

  const resetAllBalances = () => {
    const def = r.S.defaultBuyIn || 1000;
    setModal({
      msg: `Reset all player balances to ₹${def.toLocaleString('en-IN')} and unpause everyone?`,
      fn: () => {
        r.S.players.forEach(p => {
          p.balance = def;
          p.sit = false;
        });
        render();
      }
    });
  };

  const openAddMoney = (id: string) => {
    setStackMode('credit');
    setAddMoneyTarget(id);
  };

  const adjustMoney = (id: string, amt: number, type: 'credit' | 'debit') => {
    const p = P(id);
    if (!p || amt <= 0) return;
    if (type === 'credit') {
      p.balance = (p.balance || 0) + amt;
      if (p.balance > 0 && p.sit) {
        p.sit = false; // Unpause player automatically!
      }
    } else {
      p.balance = Math.max(0, (p.balance || 0) - amt);
      if (p.balance <= 0) {
        p.sit = true; // Pause busted player
      }
    }
    render();
    setAddMoneyTarget(null);
  };

  const addMoney = (id: string, amt: number) => adjustMoney(id, amt, 'credit');
  const debitMoney = (id: string, amt: number) => adjustMoney(id, amt, 'debit');

  const setPlayerBalance = (id: string, exactAmt: number) => {
    const p = P(id);
    if (!p || isNaN(exactAmt) || exactAmt < 0) return;
    p.balance = exactAmt;
    if (p.balance > 0 && p.sit) {
      p.sit = false;
    } else if (p.balance <= 0) {
      p.sit = true;
    }
    render();
    setAddMoneyTarget(null);
  };

  const resetAll = () => {
    const gameName = r.G === 'pk' ? "Texas Hold'em (Poker)" : "Teen Patti";
    setModal({
      msg: `Clear all players, balances and history for ${gameName}? The other game will NOT be affected.`,
      fn: () => {
        r.S = r.ALL[r.G!] = fresh();
        r.ui.raise = 0;
        // Also reset in DB
        if (r.G) fetch(`/api/games/${r.G}`, { method: 'DELETE' }).catch(console.error);
        render();
      }
    });
  };

  const setMode = (m: string) => { r.S.ante.mode = m; render(); };
  const setAnte = (v: string) => { r.S.ante.amt = Math.max(0, +v || 0); render(); };

  const nextTurn = () => {
    const rd = R()!;
    const o = r.S.players.map(p => p.id).filter(id => rd.parts.includes(id));
    let i = o.indexOf(rd.turn);
    for (let k = 0; k < o.length; k++) { i = (i + 1) % o.length; if (!rd.folded[o[i]]) { rd.turn = o[i]; return; } }
  };

  const snap = () => {
    const rd = R()!;
    rd.stack.push(JSON.stringify({
      ...rd,
      stack: undefined,
      _plBals: r.S.players.map(p => ({ id: p.id, balance: p.balance }))
    }));
  };

  const addDebt = (f: string, t: string, a: number) => {
    if (a <= 0) return;
    const k = f + '|' + t, rk = t + '|' + f, rev = r.S.debts[rk] || 0;
    if (rev >= a) { r.S.debts[rk] = rev - a; if (!r.S.debts[rk]) delete r.S.debts[rk]; return; }
    a -= rev; delete r.S.debts[rk]; r.S.debts[k] = (r.S.debts[k] || 0) + a;
  };

  const pkInit = (rd: Round) => {
    rd.street = 0; // 0: Pre-flop, 1: Flop, 2: Turn, 3: River
    rd.cur = 0; // Current street highest bet
    rd.st = {}; // Street contributions per player
    rd.acted = {}; // Acted in current round of betting
    rd.locked = false;
    rd.winners = [];
    rd.lastRaiser = null;
    rd.minRaise = r.S.ante.amt || 10;
  };

  const startRound = () => {
    if (r.S.balanceMode) {
      // Pause any player who has 0 balance
      r.S.players.forEach(p => {
        if ((p.balance || 0) <= 0) {
          p.sit = true;
        }
      });
    }

    const s = r.S.players.filter(p => !p.sit);
    if (s.length < 2) return;
    const ind = (r.S.ante.mode || 'each') === 'each';
    r.S.rno++;
    const rd: Round = r.S.round = {
      no: r.S.rno, phase: 'bet', parts: s.map(p => p.id), contrib: {}, folded: {},
      turn: s[0].id, stake: 0, stack: [], log: [], lastBy: '', winner: null
    };
    s.forEach(p => {
      const e = document.getElementById('a_' + p.id) as HTMLInputElement;
      const v = ind && e ? +e.value || 0 : r.S.ante.amt;
      let actualBoot = Math.max(0, v);
      if (r.S.balanceMode) {
        actualBoot = Math.min(p.balance || 0, actualBoot);
        p.balance = Math.max(0, (p.balance || 0) - actualBoot);
      }
      rd.contrib[p.id] = actualBoot;
      rd.log.push(p.name + ' boot ' + money(rd.contrib[p.id]));
    });
    // In Teen Patti & Poker, initial bet must be opened by players (not preset to boot)
    rd.stake = 0;
    if (r.G === 'pk') pkInit(rd);
    r.ui.raise = 0; r.fx.deal = 1; r.fx.flyAll = 1;
    render();
  };

  const abort = () => {
    setModal({
      msg: 'Abort this round? No money changes hands.',
      fn: () => {
        if (r.S.balanceMode && r.S.round) {
          Object.entries(r.S.round.contrib).forEach(([pId, amt]) => {
            const p = P(pId);
            if (p) p.balance = (p.balance || 0) + amt;
          });
        }
        r.S.round = null; r.S.rno--; r.ui.raise = 0; render();
      }
    });
  };

  const undo = () => {
    const rd = R();
    if (!rd || !rd.stack.length) return;
    const prev = JSON.parse(rd.stack[rd.stack.length - 1]);
    if (r.S.balanceMode && prev._plBals) {
      prev._plBals.forEach((b: any) => {
        const p = P(b.id);
        if (p) p.balance = b.balance;
      });
    }
    r.S.round = { ...prev, stack: rd.stack.slice(0, -1) };
    render();
  };

  const act = (t: string, a?: number) => {
    const rd = R()!; const id = rd.turn; a = a || 0; r.ui.raise = 0; snap();
    if (t === 'bet' || t === 'raise') {
      if (!a) { rd.stack.pop(); return; }
      let actual = a;
      if (r.S.balanceMode) {
        const p = P(id);
        if (!p || (p.balance || 0) < a) {
          // Cannot afford bet/raise! Blocked!
          rd.stack.pop();
          return;
        }
        actual = a;
        p.balance = Math.max(0, (p.balance || 0) - actual);
      }
      const wasZeroStake = (rd.stake || 0) === 0;
      rd.contrib[id] += actual; rd.stake = actual; rd.lastBy = P(id)!.name;
      const actionText = wasZeroStake ? ' opened bet ' : (t === 'raise' ? ' raised to ' : ' called chaal ');
      rd.log.push(P(id)!.name + actionText + money(actual));
      r.fx.fly = id; r.fx.bet = 1; nextTurn();
    } else if (t === 'check') {
      rd.log.push(P(id)!.name + ' checked');
      nextTurn();
    } else if (t === 'fold') {
      rd.folded[id] = 1; rd.log.push(P(id)!.name + ' folded');
      if (active().length === 1) { rd.phase = 'result'; rd.winner = active()[0]; }
      else nextTurn();
    } else if (t === 'show') {
      let actual = a;
      if (r.S.balanceMode) {
        const p = P(id);
        if (!p || (p.balance || 0) < a) {
          // Cannot afford show! Blocked!
          rd.stack.pop();
          return;
        }
        actual = a;
        p.balance = Math.max(0, (p.balance || 0) - actual);
      }
      rd.contrib[id] += actual; rd.log.push(P(id)!.name + ' paid ' + money(actual) + ' · show');
      rd.phase = 'result'; rd.winner = null; r.fx.fly = id;
    } else {
      rd.log.push(P(id)!.name + ' → mutual show'); rd.phase = 'result'; rd.winner = null;
    }
    render();
  };

  const updateRaisePreview = () => {
    const rd = R();
    if (!rd) return;
    const cur = rd.cur || 0;
    const id = rd.turn;
    const sc = (rd.st?.[id]) || 0;
    const e = document.getElementById('amt') as HTMLInputElement;
    const a = Math.max(0, +e?.value || 0);
    const totalDisp = document.getElementById('pk-total-disp');
    const addedDisp = document.getElementById('pk-added-disp');
    const btn = document.getElementById('pk-confirm-btn') as HTMLButtonElement | null;
    const isBalMode = !!r.S.balanceMode;
    const p = P(id);
    const bal = p?.balance || 0;
    const toAdd = cur === 0 ? a : Math.max(0, a - sc);

    if (cur === 0) {
      if (btn) {
        if (isBalMode && toAdd > bal) {
          btn.disabled = true;
          btn.style.opacity = '0.5';
          btn.style.cursor = 'not-allowed';
          btn.textContent = `❌ Insufficient chips (have ${money(bal)}, need ${money(toAdd)})`;
        } else {
          btn.disabled = a <= 0;
          btn.style.opacity = '1';
          btn.style.cursor = 'pointer';
          btn.textContent = `⬆ Confirm Bet ${money(a)}`;
        }
      }
    } else {
      if (totalDisp) totalDisp.textContent = money(a);
      if (addedDisp) addedDisp.textContent = money(Math.max(0, a - sc));

      if (btn) {
        if (a <= cur) {
          btn.disabled = true;
          btn.style.opacity = '0.5';
          btn.style.cursor = 'not-allowed';
          btn.textContent = `❌ Must be more than current bet (${money(cur)})`;
        } else if (isBalMode && toAdd > bal) {
          btn.disabled = true;
          btn.style.opacity = '0.5';
          btn.style.cursor = 'not-allowed';
          btn.textContent = `❌ Insufficient chips (have ${money(bal)}, need ${money(toAdd)})`;
        } else {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.style.cursor = 'pointer';
          btn.textContent = `⬆ Confirm Raise to ${money(a)}`;
        }
      }
    }
  };

  const toggleRaise = () => {
    r.ui.raise = r.ui.raise ? 0 : 1;
    render();
    setTimeout(() => {
      const e = document.getElementById('amt') as HTMLInputElement;
      if (e) {
        e.focus();
        e.select();
        updateRaisePreview();
      }
    }, 60);
  };

  const doRaise = () => {
    const rd = R()!; const st = rd.stake || 0;
    const minRequired = st ? st + 1 : 10;
    const e = document.getElementById('amt') as HTMLInputElement;
    const a = Math.max(0, +e.value || 0);
    if (a < minRequired) { e.value = String(minRequired); e.focus(); e.select(); return; }
    if (r.S.balanceMode) {
      const p = P(rd.turn);
      if (p && (p.balance || 0) < a) {
        alert(`Insufficient chips! You have ${money(p.balance || 0)}, but this bet requires ${money(a)}. Please rebuy chips first.`);
        return;
      }
    }
    if (a) act(st === 0 ? 'bet' : 'raise', a);
  };

  const setAmt = (v: number) => {
    const e = document.getElementById('amt') as HTMLInputElement;
    if (e) {
      e.value = String(v);
      updateRaisePreview();
    }
  };

  const pickW = (id: string) => {
    const rd = R();
    if (rd && rd.phase === 'result' && active().includes(id)) {
      if (r.G === 'pk') {
        rd.winners = rd.winners || [];
        const i = rd.winners.indexOf(id);
        i < 0 ? rd.winners.push(id) : rd.winners.splice(i, 1);
      } else rd.winner = id;
      render();
    }
  };

  const confirmWin = () => {
    const rd = R()!; const w = rd.winner; if (!w) return;
    const pt = pot(); const pays: { name: string; amt: number }[] = [];

    if (r.S.balanceMode) {
      // Winner receives pot into their chip balance!
      const winP = P(w);
      if (winP) {
        winP.balance = (winP.balance || 0) + pt;
      }
      rd.parts.forEach(id => {
        if (id !== w) {
          pays.push({ name: P(id)!.name, amt: rd.contrib[id] });
        }
      });
      // Pause any player who has busted (<= 0 balance)
      r.S.players.forEach(p => {
        if ((p.balance || 0) <= 0) {
          p.balance = 0;
          p.sit = true;
        }
      });
    } else {
      // Debt tracking mode
      rd.parts.forEach(id => {
        if (id !== w) { addDebt(id, w, rd.contrib[id]); pays.push({ name: P(id)!.name, amt: rd.contrib[id] }); }
      });
    }

    const got = pt - rd.contrib[w];
    r.S.wins[w] = (r.S.wins[w] || 0) + got;
    r.S.tot.rounds++; r.S.tot.total += pt; r.S.tot.big = Math.max(r.S.tot.big, pt);
    r.S.hist.unshift({ no: rd.no, winner: P(w)!.name, pot: pt, got, pays });
    r.S.hist = r.S.hist.slice(0, 30);
    r.fx.win = [P(w)!.name, got]; r.S.round = null; render();
  };

  const settle = (k: string) => { delete r.S.debts[k]; render(); };

  const openDebtModal = () => setShowDebtModal(true);
  const closeDebtModal = () => setShowDebtModal(false);

  const settleAll = () => {
    setModal({
      msg: 'Mark all pending debts as settled?',
      fn: () => {
        r.S.debts = {};
        render();
      }
    });
  };

  const dtAvFn = (id: string) => {
    const p = P(id);
    return `<div class="av" style="background:${colFn(id)};width:22px;height:22px;font-size:10px;border-width:1.5px;box-shadow:none;display:inline-grid;margin:0;flex:none">${esc((p?.name[0] || '?').toUpperCase())}</div>`;
  };

  const net = () => {
    const n: Record<string, number> = {};
    r.S.players.forEach(p => n[p.id] = 0);
    Object.entries(r.S.debts).forEach(([k, a]) => {
      const [f, t] = k.split('|');
      if (f in n) n[f] -= a; if (t in n) n[t] += a;
    });
    return n;
  };

  /* ── Poker actions (Real-world Texas Hold'em rules) ── */
  const pkAct = (t: string, a?: number) => {
    const rd = R()!;
    const id = rd.turn;
    const me = P(id)!.name;
    const sc = (rd.st?.[id]) || 0;
    const toCall = Math.max(0, (rd.cur || 0) - sc);
    r.ui.raise = 0;
    snap();

    if (t === 'check') {
      if (toCall > 0) {
        rd.stack.pop();
        return;
      }
      rd.acted = rd.acted || {};
      rd.acted[id] = 1;
      rd.lastBy = me + ' checked';
      rd.log.push(me + ' checks');
    } else if (t === 'fold') {
      rd.folded[id] = 1;
      if (rd.acted) delete rd.acted[id];
      rd.lastBy = me + ' folded';
      rd.log.push(me + ' folded');
      const remaining = rd.parts.filter(pId => !rd.folded[pId]);
      if (remaining.length === 1) {
        rd.phase = 'result';
        rd.winners = [remaining[0]];
        rd.log.push('🏆 Everyone folded! ' + P(remaining[0])!.name + ' wins the pot!');
        render();
        return;
      }
    } else if (t === 'call') {
      if (toCall <= 0) {
        rd.acted = rd.acted || {};
        rd.acted[id] = 1;
        rd.lastBy = me + ' checked';
        rd.log.push(me + ' checks');
      } else {
        let actualCall = toCall;
        if (r.S.balanceMode) {
          const p = P(id);
          if (!p || (p.balance || 0) < toCall) {
            rd.stack.pop();
            return;
          }
          actualCall = toCall;
          p.balance = Math.max(0, (p.balance || 0) - actualCall);
        }
        rd.contrib[id] += actualCall;
        rd.st = rd.st || {};
        rd.st[id] = sc + actualCall;
        rd.acted = rd.acted || {};
        rd.acted[id] = 1;
        const callBet = sc + actualCall;
        rd.lastBy = me + ' called ' + money(callBet);
        rd.log.push(me + ' called ' + money(callBet));
        r.fx.fly = id;
        r.fx.bet = 1;
      }
    } else if (t === 'raise') {
      const targetBet = a || 0;
      const toAdd = targetBet - sc;
      if (toAdd <= 0 || targetBet <= (rd.cur || 0)) {
        rd.stack.pop();
        return;
      }
      let actualAdd = toAdd;
      if (r.S.balanceMode) {
        const p = P(id);
        if (!p || (p.balance || 0) < toAdd) {
          rd.stack.pop();
          return;
        }
        actualAdd = toAdd;
        p.balance = Math.max(0, (p.balance || 0) - actualAdd);
      }
      const isFirstBet = (rd.cur || 0) === 0;
      const newStreetBet = sc + actualAdd;
      const raiseSize = newStreetBet - (rd.cur || 0);
      rd.contrib[id] += actualAdd;
      rd.st = rd.st || {};
      rd.st[id] = newStreetBet;
      rd.cur = newStreetBet;
      rd.stake = newStreetBet;
      rd.lastRaiser = id;
      if (raiseSize > 0) {
        rd.minRaise = Math.max(rd.minRaise || 0, raiseSize);
      }
      // Real-world rule: When someone raises, all other active players must react!
      rd.acted = { [id]: 1 };
      rd.lastBy = me + (isFirstBet ? ' bet ' + money(newStreetBet) : ' raised to ' + money(newStreetBet));
      rd.log.push(me + (isFirstBet ? ' bet ' + money(newStreetBet) : ' raised to ' + money(newStreetBet)));
      r.fx.fly = id;
      r.fx.bet = 1;
    }

    // CHECK IF BETTING LOOP IS COMPLETE:
    // A loop is when the highest raised bet person ends up being the last person.
    // All active players must have acted, and all active players must match the highest bet.
    const currentActive = rd.parts.filter(pId => !rd.folded[pId]);
    const allActed = currentActive.every(pId => rd.acted && rd.acted[pId]);
    const allMatched = currentActive.every(pId => (rd.st?.[pId] || 0) === (rd.cur || 0));

    if (allActed && allMatched) {
      if (rd.street === 3) {
        // River betting complete -> Showdown
        rd.phase = 'result';
        rd.winners = [];
        rd.log.push('— Showdown: Tap the winner(s) —');
        render();
        return;
      }
      // Advance to next street:
      // Loop 1 = Street 1 (Flop): Reveal 3 cards
      // Loop 2 = Street 2 (Turn): Reveal 1 card (total 4)
      // Loop 3 = Street 3 (River): Reveal 1 card (total 5)
      rd.street = (rd.street || 0) + 1;
      rd.st = {};
      rd.acted = {};
      rd.cur = 0;
      rd.stake = 0;
      rd.lastRaiser = null;
      rd.minRaise = r.S.ante.amt || 10;
      r.fx.card = 1;
      const streetNames = ['Pre-flop', 'Flop', 'Turn', 'River'];
      const desc = rd.street === 1 ? 'Loop 1: Flop revealed (3 cards open)' : rd.street === 2 ? 'Loop 2: Turn revealed (4th card open)' : 'Loop 3: River revealed (5th card open)';
      rd.lastBy = streetNames[rd.street] + ' dealt';
      rd.log.push(`— ${desc} —`);
      // Standard poker rule: action begins with first active player in seating order
      rd.turn = r.S.players.map(p => p.id).find(pId => rd.parts.includes(pId) && !rd.folded[pId])!;
    } else {
      nextTurn();
    }
    render();
  };

  const pkRaise = () => {
    const rd = R()!;
    const cur = rd.cur || 0;
    const minInc = Math.max(rd.minRaise || 0, r.S.ante.amt || 10, 10);
    const e = document.getElementById('amt') as HTMLInputElement;
    const a = Math.max(0, +e?.value || 0);

    if (cur === 0) {
      if (a < minInc) {
        if (e) { e.value = String(minInc); e.focus(); e.select(); updateRaisePreview(); }
        return;
      }
      pkAct('raise', a);
    } else {
      // User enters how much they are giving in total!
      // Must not let user raise less than or equal to current bet
      if (a <= cur) {
        const fallback = cur + minInc;
        if (e) {
          e.value = String(fallback);
          e.focus();
          e.select();
          updateRaisePreview();
        }
        return;
      }
      pkAct('raise', a);
    }
  };

  const pkShow = () => { const rd = R()!; snap(); rd.phase = 'result'; rd.winners = []; render(); };

  const pkConfirm = () => {
    const rd = R()!; const W = rd.winners || []; if (!W.length) return;
    const pt = pot(); const n = W.length;
    const pays: { name: string; amt: number }[] = [];

    if (r.S.balanceMode) {
      // Award pot to winners' chip stacks!
      W.forEach((wId, idx) => {
        const share = Math.floor(pt / n) + (idx === 0 ? pt % n : 0);
        const winP = P(wId);
        if (winP) {
          winP.balance = (winP.balance || 0) + share;
        }
      });
      rd.parts.forEach(id => {
        if (!W.includes(id)) {
          pays.push({ name: P(id)!.name, amt: rd.contrib[id] });
        }
      });
      // Pause any player who has busted out (balance <= 0)
      r.S.players.forEach(p => {
        if ((p.balance || 0) <= 0) {
          p.balance = 0;
          p.sit = true;
        }
      });
    } else {
      // Debt tracking mode
      const nets: Record<string, number> = {};
      rd.parts.forEach(id => {
        const k = W.indexOf(id);
        nets[id] = (k < 0 ? 0 : Math.floor(pt / n) + (k === 0 ? pt % n : 0)) - rd.contrib[id];
      });
      const cr = Object.entries(nets).filter(e => e[1] > 0);
      const tc = cr.reduce((a, e) => a + e[1], 0);
      Object.entries(nets).filter(e => e[1] < 0).forEach(([d, v]) => {
        let left = -v;
        cr.forEach(([c, cv], i) => {
          const x = i === cr.length - 1 ? left : Math.round(-v * cv / tc);
          left -= x; addDebt(d, c, x);
        });
        pays.push({ name: P(d)!.name, amt: -v });
      });
    }

    W.forEach(c => r.S.wins[c] = (r.S.wins[c] || 0) + Math.floor(pt / n));
    const wn = W.map(id => P(id)!.name).join(' & ');
    r.S.tot.rounds++; r.S.tot.total += pt; r.S.tot.big = Math.max(r.S.tot.big, pt);
    r.S.hist.unshift({ no: rd.no, winner: wn, pot: pt, got: pt, pays });
    r.S.hist = r.S.hist.slice(0, 30); r.fx.win = [wn, pt]; r.S.round = null; render();
  };

  /* ── Drag reorder ── */
  const dragStart = (e: PointerEvent) => {
    const row = (e.currentTarget as HTMLElement).closest('.pr') as HTMLElement;
    r.dr = { row, box: row.parentNode };
    row.classList.add('dragging');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const dragMove = (e: PointerEvent) => {
    if (!r.dr) return;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const o = t?.closest('.pr') as HTMLElement | null;
    if (!o || o === r.dr.row || o.parentNode !== r.dr.box) return;
    const b = o.getBoundingClientRect();
    r.dr.box.insertBefore(r.dr.row, e.clientY < b.top + b.height / 2 ? o : o.nextSibling);
  };
  const dragEnd = () => {
    if (!r.dr) return;
    const ids = [...r.dr.box.querySelectorAll('.pr')].map((x: any) => x.dataset.id);
    r.S.players.sort((a: Player, b: Player) => ids.indexOf(a.id) - ids.indexOf(b.id));
    r.dr = null; render();
  };

  /* ── Navigation ── */
  const pick = async (k: GType) => {
    // Flush current game save if switching games
    if (r.G && r.G !== k && r.sessionId) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      fetch(`/api/sessions/${r.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.S)
      }).catch(console.error);
    }
    r.G = k;
    r.ALL.g = k;
    r.ui.raise = 0;

    // Check active session for game k in sessionsList
    let sess = r.sessionsList.find(s => s.gameType === k && s.status === 'active') ||
               r.sessionsList.find(s => s.gameType === k);
    if (!sess) {
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${k === 'pk' ? 'Poker' : 'Teen Patti'} Session #1`,
            gameType: k,
            balanceMode: r.ALL[k!]?.balanceMode || false,
            defaultBuyIn: r.ALL[k!]?.defaultBuyIn || 1000,
          })
        });
        if (res.ok) {
          sess = await res.json();
          r.sessionsList.unshift(sess);
        }
      } catch (e) {
        console.error('Failed to auto-create session on pick:', e);
      }
    }

    if (sess) {
      r.sessionId = sess._id;
      r.sessionName = sess.name;
      r.sessionStatus = sess.status;
      const copy = { ...sess };
      delete copy._id; delete copy.__v; delete copy.createdAt; delete copy.updatedAt; delete copy.userId;
      r.S = r.ALL[k!] = copy;
    } else {
      r.sessionName = `${k === 'pk' ? 'Poker' : 'Teen Patti'} Session #1`;
      r.sessionStatus = 'active';
      r.S = r.ALL[k!];
    }
    render();
  };

  const goLobby = () => {
    // Flush current game save before leaving
    if (r.G && r.sessionId) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      fetch(`/api/sessions/${r.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.S)
      }).catch(console.error);
    }
    r.G = null;
    r.ALL.g = null;
    r.S = fresh();
    loadSessions();
    render();
  };

  /* ── Attach to window ── */
  useEffect(() => {
    window.addP = addP;
    window.rmP = rmP;
    window.shuffle = shuffle;
    window.sit = sit;
    window.resetAll = resetAll;
    window.setMode = setMode;
    window.setAnte = setAnte;
    window.startRound = startRound;
    window.abort = abort;
    window.undo = undo;
    window.act = act;
    window.toggleRaise = toggleRaise;
    window.doRaise = doRaise;
    window.setAmt = setAmt;
    window.pickW = pickW;
    window.confirmWin = confirmWin;
    window.settle = settle;
    window.goLobby = goLobby;
    window.pick = pick;
    window.dragStart = dragStart;
    window.dragMove = dragMove;
    window.dragEnd = dragEnd;
    window.pkAct = pkAct;
    window.pkRaise = pkRaise;
    window.pkShow = pkShow;
    window.pkConfirm = pkConfirm;
    window.openDebtModal = openDebtModal;
    window.closeDebtModal = closeDebtModal;
    window.settleAll = settleAll;
    window.setBalanceMode = setBalanceMode;
    window.setDefaultBuyIn = setDefaultBuyIn;
    window.resetAllBalances = resetAllBalances;
    window.openAddMoney = openAddMoney;
    window.addMoney = addMoney;
    window.debitMoney = debitMoney;
    window.adjustMoney = adjustMoney;
    window.setPlayerBalance = setPlayerBalance;
    window.updateRaisePreview = updateRaisePreview;
    window.openSessionModal = openSessionModal;
    window.switchSession = switchSession;
    window.endSession = endSession;
  });

  /* ── ESC to close modals ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDebtModal(false);
        setAddMoneyTarget(null);
        setShowGoogleConfigModal(false);
        setShowSessionModal(false);
      }
    };
    if (showDebtModal || addMoneyTarget || showGoogleConfigModal || showSessionModal) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showDebtModal, addMoneyTarget, showGoogleConfigModal, showSessionModal]);

  /* ── Load from API when authenticated ── */
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.email) {
      loadedRef.current = false;
      return;
    }
    (async () => {
      try {
        const [tpRes, pkRes, sessRes] = await Promise.all([
          fetch('/api/games/tp'),
          fetch('/api/games/pk'),
          fetch('/api/sessions')
        ]);
        if (tpRes.ok) {
          const d = await tpRes.json();
          delete d._id; delete d.__v; delete d.gameType; delete d.userId; delete d.createdAt; delete d.updatedAt;
          Object.assign(r.ALL.tp, d);
        }
        if (pkRes.ok) {
          const d = await pkRes.json();
          delete d._id; delete d.__v; delete d.gameType; delete d.userId; delete d.createdAt; delete d.updatedAt;
          Object.assign(r.ALL.pk, d);
        }
        if (sessRes.ok) {
          const sessions = await sessRes.json();
          r.sessionsList = sessions;
          const tpSess = sessions.find((s: any) => s.gameType === 'tp' && s.status === 'active') || sessions.find((s: any) => s.gameType === 'tp');
          const pkSess = sessions.find((s: any) => s.gameType === 'pk' && s.status === 'active') || sessions.find((s: any) => s.gameType === 'pk');
          if (tpSess) {
            const copy = { ...tpSess };
            delete copy._id; delete copy.__v; delete copy.createdAt; delete copy.updatedAt; delete copy.userId;
            Object.assign(r.ALL.tp, copy);
          }
          if (pkSess) {
            const copy = { ...pkSess };
            delete copy._id; delete copy.__v; delete copy.createdAt; delete copy.updatedAt; delete copy.userId;
            Object.assign(r.ALL.pk, copy);
          }
        }
      } catch (e) {
        console.error('Load failed:', e);
      }
      loadedRef.current = true;
      render();
    })();
  }, [status, session?.user?.email]);

  /* ── Save after every render ── */
  useEffect(() => { saveToAPI(); }, [tick]);

  /* ── Animations after render ── */
  useEffect(() => {
    const fx = r.fx;
    const rd = R();
    // Pot tween
    const target = pot();
    const potnEl = document.getElementById('potn');
    if (potnEl) {
      const from = r.PP; r.PP = target; const t0 = performance.now();
      const f = (t: number) => {
        const k = Math.min(1, (t - t0) / 600);
        const cur = document.getElementById('potn');
        if (!cur || cur !== potnEl) return;
        cur.textContent = money(Math.round(from + (target - from) * k));
        if (k < 1) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }
    // Chip fly
    const fly = (id: string, delay?: number) => {
      const T = document.getElementById('table');
      const s = T?.querySelector(`[data-seat="${id}"]`);
      const pt = document.getElementById('potn');
      if (!T || !s || !pt) return;
      const a = s.getBoundingClientRect(), b = pt.getBoundingClientRect(), t = T.getBoundingClientRect();
      const el = document.createElement('div');
      el.className = 'fly';
      el.style.left = (a.left + a.width / 2 - t.left - 11) + 'px';
      el.style.top = (a.top + a.height / 2 - t.top - 11) + 'px';
      T.appendChild(el);
      setTimeout(() => {
        el.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px,${b.top + b.height / 2 - a.top - a.height / 2}px) rotate(540deg)`;
        setTimeout(() => el.remove(), 750);
      }, 30 + (delay || 0));
    };
    if (fx.fly) fly(fx.fly);
    if (fx.flyAll && rd) rd.parts.forEach((id: string, i: number) => fly(id, i * 120));
    // Celebrate
    if (fx.win) {
      const [name, prize] = fx.win;
      const T = document.getElementById('table');
      if (T) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<div>🏆 ${esc(name)} wins ${money(prize)}!</div>`;
        T.appendChild(toast); setTimeout(() => toast.remove(), 3100);
        for (let i = 0; i < 30; i++) {
          const c = document.createElement('span');
          c.className = 'cf';
          c.textContent = ['🪙','✨','♠','♥','♦','♣'][i % 6];
          c.style.left = Math.random() * 100 + '%';
          c.style.animationDelay = Math.random() * 0.8 + 's';
          T.appendChild(c); setTimeout(() => c.remove(), 3600);
        }
      }
    }
    r.fx = {};
  }, [tick]);

  /* ── Set body attribute ── */
  useEffect(() => { document.body.dataset.v = r.G || 'lobby'; }, [tick]);

  /* ───────── HTML Generators (same as original) ───────── */
  const commHTML = (rd: Round) => {
    // Loop 1 = Street 1 (Flop): reveal 3 cards (indices 0, 1, 2)
    // Loop 2 = Street 2 (Turn): reveal 4 cards (indices 0, 1, 2, 3)
    // Loop 3 = Street 3 (River): reveal 5 cards (indices 0, 1, 2, 3, 4)
    // Street 0 (Pre-flop): reveal 0 cards
    const rev = rd.street === 1 ? 3 : rd.street === 2 ? 4 : rd.street === 3 ? 5 : 0;
    const ns = rd.street === 1 ? 0 : rev - 1;
    const labels = [
      'PRE-FLOP · HOLE CARDS (PLAYED IRL)',
      'FLOP · 3 CARDS OPEN (LOOP 1)',
      'TURN · 4 CARDS OPEN (LOOP 2)',
      'RIVER · ALL 5 CARDS OPEN (LOOP 3)'
    ];
    return `
      <div class="cc">
        ${[0, 1, 2, 3, 4].map(k => {
          const isUp = k < rev;
          const isFlipping = r.fx.card && k >= ns && k < rev;
          return `
            <i class="${isUp ? 'up' : 'down'} ${isFlipping ? 'flip' : ''}" title="${isUp ? 'Card #' + (k + 1) + ' is Open (played IRL)' : 'Card #' + (k + 1) + ' is Closed'}">
              ${isUp
                ? `<span class="cc-tag">OPEN</span><span class="cc-icon">🎴</span><span class="cc-num">#${k + 1}</span>`
                : ''
              }
            </i>
          `;
        }).join('')}
      </div>
      <div class="plabel">${labels[rd.street || 0]}</div>
    `;
  };

  const tableHTML = () => {
    const rd = R(); const n = r.S.players.length; const p = pot();
    const isBalMode = !!r.S.balanceMode;
    const seats = r.S.players.map((pl, i) => {
      const a = Math.PI / 2 + i * 2 * Math.PI / n;
      const x = Math.cos(a).toFixed(3), y = Math.sin(a).toFixed(3);
      const inR = rd && rd.parts.includes(pl.id);
      const f = inR && rd.folded[pl.id];
      const turn = rd && rd.phase === 'bet' && rd.turn === pl.id;
      const win = rd && rd.phase === 'result' && (rd.winner === pl.id || (rd.winners || []).includes(pl.id));
      const pk = rd && rd.phase === 'result' && inR && !f;
      const isBusted = isBalMode && (pl.balance || 0) <= 0;

      let sa = '';
      if (rd) {
        sa = !inR ? (isBusted ? 'Busted · Paused' : 'Sat out') : f ? 'FOLDED' : money(rd.contrib[pl.id] || 0);
      } else {
        sa = isBusted ? '💥 Busted (₹0) · Paused' : pl.sit ? 'Sitting out' : 'Ready';
      }

      const balDisplay = isBalMode ? `<div class="bal ${isBusted ? 'neg' : ''}">💰 ${money(pl.balance || 0)}</div>` : '';
      const rebuyBtn = isBalMode ? `<button class="rebuy-btn" onclick="openAddMoney('${pl.id}')">+ Add ₹</button>` : '';

      return `<div class="seat ${turn ? 'turn' : ''} ${f || (rd && !inR) || (!rd && pl.sit) || isBusted ? 'fold' : ''} ${isBusted ? 'busted' : ''} ${win ? 'win' : ''} ${pk ? 'pick' : ''}" data-seat="${pl.id}" style="left:calc(50% + (50% - var(--sx))*${x});top:calc(50% + (50% - var(--sy))*${y})" ${pk ? `onclick="pickW('${pl.id}')"` : ''}>${turn ? '<div class="tg">▼ PLAYING NOW</div>' : ''}${isBusted ? '<div class="tg" style="background:#ef4444;color:#fff;border-color:#fca5a5">💥 BUSTED</div>' : ''}${win ? '<div class="crown">👑</div>' : ''}${avFn(pl.id)}<div class="sn">${esc(pl.name)}</div><div class="sa ${isBusted ? 'neg' : ''}">${sa}</div>${balDisplay}${rebuyBtn}</div>`;
    }).join('');
    const ch = '<b></b>'.repeat(Math.min(7, 1 + Math.floor(p / 150)));
    const cards = r.G === 'pk' ? (rd ? commHTML(rd) : '') : (rd && rd.phase !== 'ante' ? `<div class="cards ${r.fx.deal ? 'deal' : ''}"><i></i><i></i><i></i></div>` : '');
    return `<div class="rail"><div class="felt"><div class="center">${rd && rd.phase === 'bet' ? `<div class="last ${r.fx.bet ? 'hit' : ''}">LAST BET <b>${money(rd.stake)}</b> <small>${esc(rd.lastBy || '')}</small></div>` : ''}<div class="plabel">${rd ? 'POT · ' + active().length + ' IN PLAY' : 'PLACE YOUR BETS'}</div><div class="pot" id="potn">${money(r.PP)}</div><div class="chips">${ch}</div>${cards}</div></div></div>${seats}`;
  };

  const leftHTML = () => {
    const rd = R(); const nb = net();
    const isBalMode = !!r.S.balanceMode;
    const rank = r.S.players.slice().sort((a, b) => {
      if (isBalMode) return (b.balance || 0) - (a.balance || 0);
      return nb[b.id] - nb[a.id];
    });
    return `<div class="card"><h2>👥 Seats · drag ⠿ to reorder</h2><div class="plist">${r.S.players.map(p => {
      const isBusted = isBalMode && (p.balance || 0) <= 0;
      const balBadge = isBalMode
        ? `<span class="bal-badge ${isBusted ? 'busted' : ''}">${isBusted ? '💥 ₹0' : money(p.balance || 0)}</span>`
        : '';
      const reloadBtn = isBalMode
        ? `<button class="ib sm reload-btn" title="Add money / Rebuy" onclick="openAddMoney('${p.id}')">+₹</button>`
        : '';
      const sitBtn = rd
        ? ''
        : `<button class="ib sm" title="${isBusted ? 'Busted (Add money to unpause)' : 'Sit out / in'}" onclick="sit('${p.id}')">${p.sit ? '▶' : '⏸'}</button>`;
      const rmBtn = rd
        ? ''
        : `<button class="ib sm bad" title="Remove" onclick="rmP('${p.id}')">✕</button>`;

      return `<div class="pr" data-id="${p.id}"><span class="hd" onpointerdown="dragStart(event)" onpointermove="dragMove(event)" onpointerup="dragEnd()" onpointercancel="dragEnd()">⠿</span>${avFn(p.id)}<div class="pr-main"><span class="nmx" style="${p.sit ? 'opacity:.5' : ''}">${esc(p.name)}</span>${isBalMode ? `<div class="pr-sub">${balBadge}</div>` : ''}</div><div class="pr-actions">${reloadBtn}${sitBtn}${rmBtn}</div></div>`;
    }).join('') || '<p class="mut">Add players in seating order.</p>'}</div>${rd ? '' : `
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
        <div class="row" style="gap:6px;flex-wrap:nowrap">
          <input id="nm" class="grow" placeholder="Enter player name..." maxlength="20" onkeydown="if(event.key==='Enter')addP()">
          <button class="pri" style="padding:8px 16px;white-space:nowrap;font-weight:800;flex-shrink:0" onclick="addP()">+ Add</button>
        </div>
        ${isBalMode ? `
          <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.3);border:1px solid rgba(244,195,79,0.18);border-radius:8px;padding:4px 8px;gap:6px">
            <span style="font-size:11px;color:var(--mut)">Starting chips (optional):</span>
            <div style="display:flex;align-items:center;gap:3px">
              <span style="color:var(--gold);font-size:12px;font-weight:800">₹</span>
              <input id="p_bal" type="number" min="0" step="50" placeholder="${r.S.defaultBuyIn || 1000}" style="width:85px;text-align:center;font-size:12px;padding:3px 6px" title="Custom starting chips (defaults to ₹${r.S.defaultBuyIn || 1000})" onkeydown="if(event.key==='Enter')addP()">
            </div>
          </div>
        ` : ''}
      </div>
    `}<button style="width:100%;margin-top:8px" onclick="shuffle()">🔀 Shuffle order</button><button style="width:100%;margin-top:8px" onclick="openDebtModal()">💸 Who owes who</button></div><div class="card"><h2>📊 ${isBalMode ? 'Leaderboard' : 'Stats'}</h2><div class="row" style="text-align:center;margin-bottom:8px"><div class="grow"><b>${r.S.tot.rounds}</b><div class="mut">Rounds</div></div><div class="grow"><b>${money(r.S.tot.big)}</b><div class="mut">Biggest pot</div></div></div>${rank.map(p => {
      if (isBalMode) {
        const b = p.balance || 0;
        return `<div class="li"><span>${esc(p.name)} <span class="mut">· won ${money(r.S.wins[p.id] || 0)}</span></span><span class="${b > 0 ? 'pos' : 'neg'}">${money(b)}</span></div>`;
      }
      const v = nb[p.id];
      return `<div class="li"><span>${esc(p.name)} <span class="mut">· won ${money(r.S.wins[p.id] || 0)}</span></span><span class="${v > 0 ? 'pos' : v < 0 ? 'neg' : 'mut'}">${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v))}</span></div>`;
    }).join('') || '<p class="mut">No players yet.</p>'}</div>`;
  };

  const pkRight = (rd: Round) => {
    let top;
    const ctl = `<div class="card"><h2>⚙ Round control</h2><div class="row"><button class="grow" ${rd.stack.length ? '' : 'disabled'} onclick="undo()">↩ Undo</button>${rd.phase === 'bet' ? '<button class="grow" onclick="pkShow()">🎴 Showdown</button>' : ''}<button class="grow bad" onclick="abort()">Abort</button></div>${rd.log.slice().reverse().slice(0, 5).map(l => `<div class="li mut">${esc(l)}</div>`).join('')}</div>`;

    if (rd.phase === 'bet') {
      const id = rd.turn;
      const sc = (rd.st?.[id]) || 0;
      const tc = Math.max(0, (rd.cur || 0) - sc);
      const canCheck = (tc === 0);
      const isBalMode = !!r.S.balanceMode;
      const p = P(id);
      const bal = p?.balance || 0;
      const canCall = !isBalMode || bal >= tc;
      const cur = rd.cur || 0;
      const minInc = Math.max(rd.minRaise || 0, r.S.ante.amt || 10, 10);
      const streetNames = ['Pre-flop', 'Flop (Loop 1)', 'Turn (Loop 2)', 'River (Loop 3)'];
      const streetName = streetNames[rd.street || 0];

      // Preset amounts
      const defaultVal = cur === 0 ? minInc : cur * 2;
      const presetMin = cur === 0 ? minInc : cur + minInc;
      const preset2x = cur === 0 ? minInc * 2 : cur * 2;
      const presetHalfPot = cur === 0 ? Math.max(minInc, Math.round(pot() / 2)) : cur + Math.max(minInc, Math.round(pot() / 2));
      const presetPot = cur === 0 ? Math.max(minInc, pot()) : cur + Math.max(minInc, pot());

      top = `<div class="card slide">
        <div class="turnbox">
          ${avFn(id)}
          <div class="mut">${streetName} · now playing</div>
          <div style="font-size:21px;font-weight:900">${nm(id)}</div>
          <div class="mut">
            ${cur
              ? (tc > 0
                  ? `To call ${money(cur)}${sc > 0 ? ` (you put in ${money(sc)}, add ${money(tc)})` : ''}`
                  : `Current bet: ${money(cur)} (you matched)`)
              : 'No bet yet (you can check or open)'
            }
          </div>
        </div>` + (r.ui.raise ?
          `<div style="margin-top:10px">
            <div class="mut" style="font-size:12px;margin-bottom:6px;text-align:center">
              ${cur === 0 ? 'Open bet amount (min ' + money(minInc) + '):' : 'Total amount you are giving (must be > ' + money(cur) + '):'}
            </div>
            <input id="amt" type="number" min="${cur === 0 ? minInc : cur + 1}" value="${defaultVal}" oninput="updateRaisePreview()" style="width:100%;text-align:center;font-size:24px;font-weight:900">
            ${cur > 0 ? `
              <div style="background:rgba(0,0,0,0.3);border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin:10px 0;font-size:13px;line-height:1.5">
                <div style="display:flex;justify-content:space-between">
                  <span class="mut">Current Bet to Beat:</span>
                  <b>${money(cur)}</b>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span class="mut">Total You Are Giving:</span>
                  <b class="pos" style="font-size:15px" id="pk-total-disp">${money(defaultVal)}</b>
                </div>
                <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.12);padding-top:4px;margin-top:4px">
                  <span class="mut">Adding from your stack now:</span>
                  <b style="color:var(--gold)" id="pk-added-disp">${money(Math.max(0, defaultVal - sc))}</b>
                </div>
              </div>
            ` : ''}
            <div class="q" style="margin-top:8px">
              <button class="sm" onclick="setAmt(${presetMin})">${cur === 0 ? 'Min' : 'Min (' + money(presetMin) + ')'}</button>
              <button class="sm" onclick="setAmt(${preset2x})">2× (${money(preset2x)})</button>
              <button class="sm" onclick="setAmt(${presetHalfPot})">½ Pot (${money(presetHalfPot)})</button>
              <button class="sm" onclick="setAmt(${presetPot})">Pot (${money(presetPot)})</button>
            </div>
            <div class="row" style="margin-top:10px">
              <button id="pk-confirm-btn" class="gold grow" onclick="pkRaise()">
                ${cur === 0 ? `⬆ Confirm Bet ${money(defaultVal)}` : `⬆ Confirm Raise to ${money(defaultVal)}`}
              </button>
              <button onclick="toggleRaise()">Back</button>
            </div>
          </div>` :
          `<div class="acts">
            ${canCheck
              ? `<button class="pri big" style="grid-column:1/-1" onclick="pkAct('check')">✋ Check</button>`
              : `<button class="good big" style="grid-column:1/-1" ${canCall ? '' : 'disabled'} title="${!canCall ? 'Insufficient chips: you have ' + money(bal) + ', need ' + money(tc) + ' to Call' : ''}" onclick="pkAct('call')">📞 Call ${money(cur)}${tc !== cur ? ` (Put in ${money(tc)})` : ''}</button>`
            }
            <button class="gold" onclick="toggleRaise()">${cur === 0 ? '💰 Open Bet' : '⬆ Raise'}</button>
            <button class="bad" onclick="pkAct('fold')">🏳 Fold</button>
          </div>`) +
        `</div>`;
    } else {
      const c = active(); const W = rd.winners || [];
      top = `<div class="card slide"><h2>🏆 Showdown</h2><p class="mut" style="margin:0 0 8px">${c.length === 1 ? 'Everyone else folded.' : 'Tap the winner(s). Tap several for a split pot.'}</p>${c.map(id => `<div class="opt ${W.includes(id) ? 'sel' : ''}" onclick="pickW('${id}')">${avFn(id)}<div class="grow"><b>${nm(id)}</b><div class="mut">Wagered ${money(rd.contrib[id])}</div></div>${W.includes(id) ? '🏆' : ''}</div>`).join('')}${W.length ? `<p style="margin:8px 0">Pot ${money(pot())} → ${W.length > 1 ? 'split ' + W.length + ' ways' : nm(W[0]) + ' receives ' + money(pot() - rd.contrib[W[0]]) + ' from the others'}</p>` : ''}<button class="pri big" ${W.length ? '' : 'disabled'} onclick="pkConfirm()">✅ Confirm &amp; settle</button></div>`;
    }
    return top + ctl;
  };

  const rightHTML = () => {
    const rd = R();
    if (r.G === 'pk' && rd) return pkRight(rd);
    if (!rd) {
      const seated = r.S.players.filter(p => !p.sit); const e = (r.S.ante.mode || 'each') === 'each';
      const isBalMode = !!r.S.balanceMode;
      const defBuyIn = r.S.defaultBuyIn || 1000;
      return `<div class="card slide">
        <h2>💰 Bankroll Mode</h2>
        <div class="seg" style="margin-bottom:10px">
          <button class="${!isBalMode ? 'on' : ''}" onclick="setBalanceMode(false)">No Balance (Debts)</button>
          <button class="${isBalMode ? 'on' : ''}" onclick="setBalanceMode(true)">With Balance (Chips)</button>
        </div>
        ${isBalMode ? `
          <div class="row" style="margin:6px 0 10px;align-items:center;justify-content:space-between">
            <span class="mut" style="font-size:12px">Default buy-in:</span>
            <input type="number" min="10" step="50" value="${defBuyIn}" onchange="setDefaultBuyIn(this.value)" style="width:105px;text-align:center">
          </div>
          <button class="sm" style="width:100%;margin-bottom:14px;background:rgba(217,119,6,0.15);border:1px solid rgba(217,119,6,0.35);color:var(--gold);font-weight:600" onclick="resetAllBalances()">🔄 Set common amount (${money(defBuyIn)}) for everyone</button>
        ` : ''}
        <h2>🎰 New round</h2>
        <div class="seg">
          <button class="${e ? 'on' : ''}" onclick="setMode('each')">Per player</button>
          <button class="${!e ? 'on' : ''}" onclick="setMode('common')">Common boot</button>
        </div>
        <div class="row" style="margin:10px 0">
          <span class="mut">${e ? 'Default boot' : 'Boot'}</span>
          <input type="number" min="0" value="${r.S.ante.amt}" onchange="setAnte(this.value)" style="width:110px">
        </div>
        ${e ? seated.map(p => `<div class="li"><span>${esc(p.name)}</span><input id="a_${p.id}" type="number" min="0" value="${r.S.ante.amt}" style="width:90px"></div>`).join('') : ''}
        <button class="pri big" style="margin-top:10px" ${seated.length < 2 ? 'disabled' : ''} onclick="startRound()">🃏 Deal &amp; start round ${r.S.rno + 1}</button>
        ${seated.length < 2 ? `<p class="mut" style="margin-top:8px">${r.S.players.length < 2 ? 'Add at least 2 players on the left.' : 'At least 2 active players needed. ' + (isBalMode ? 'Add money to busted players to unpause.' : '')}</p>` : ''}
      </div>`;
    }
    let top;
    if (rd.phase === 'bet') {
      const id = rd.turn; const n = active().length; const st = rd.stake || 0;
      const isBalMode = !!r.S.balanceMode;
      const p = P(id);
      const bal = p?.balance || 0;
      const showCost = pot();
      const canShow = (n === 2) && (!isBalMode || bal >= showCost);
      const canChaal = !isBalMode || bal >= st;
      const minRaise = st === 0 ? 10 : st + 1;
      const canRaise = !isBalMode || bal >= minRaise;

      const turnSubtitle = st > 0
        ? `in for ${money(rd.contrib[id])}${isBalMode ? ` · stack: <b style="color:var(--gold)">${money(bal)}</b>` : ''} · current bet ${money(st)}`
        : `in for ${money(rd.contrib[id])}${isBalMode ? ` · stack: <b style="color:var(--gold)">${money(bal)}</b>` : ''} · no bet opened yet (open or check)`;

      top = `<div class="card slide"><div class="turnbox">${avFn(id)}<div class="mut">Now playing</div><div style="font-size:21px;font-weight:900">${nm(id)}</div><div class="mut">${turnSubtitle}</div></div>` + (r.ui.raise ?
        `<div style="margin-top:10px">
          <div class="mut" style="font-size:12px;margin-bottom:6px;text-align:center">
            ${st === 0 ? 'Open bet amount (min ₹10):' : 'Raise amount (must be > ' + money(st) + '):'}
            ${isBalMode ? `<div style="font-size:11px;color:var(--gold);margin-top:2px">Your balance: <b>${money(bal)}</b></div>` : ''}
          </div>
          <input id="amt" type="number" min="${minRaise}" max="${isBalMode ? bal : ''}" value="${Math.min(isBalMode ? bal : Infinity, st === 0 ? Math.max(10, r.S.ante.amt || 50) : st * 2)}" style="width:100%;text-align:center;font-size:22px;margin-top:6px">
          <div class="q">
            <button class="sm" onclick="setAmt(${st === 0 ? 10 : st * 2})">${st === 0 ? '₹10' : '2× (' + money(st * 2) + ')'}</button>
            <button class="sm" onclick="setAmt(${st === 0 ? 50 : st * 3})">${st === 0 ? '₹50' : '3× (' + money(st * 3) + ')'}</button>
            <button class="sm" onclick="setAmt(${st === 0 ? 100 : st * 4})">${st === 0 ? '₹100' : '4× (' + money(st * 4) + ')'}</button>
            <button class="sm" onclick="setAmt(${isBalMode ? Math.min(bal, pot()) : pot()})">Pot (${money(isBalMode ? Math.min(bal, pot()) : pot())})</button>
          </div>
          <div class="row">
            <button class="gold grow" onclick="doRaise()">${st === 0 ? '💰 Confirm Open Bet' : '⬆ Confirm Raise'}</button>
            <button onclick="toggleRaise()">Back</button>
          </div>
        </div>` :
        `<div class="acts">
          ${st > 0
            ? `<button class="pri big" style="grid-column:1/-1" ${canChaal ? '' : 'disabled'} title="${!canChaal ? 'Insufficient chips: you have ' + money(bal) + ', need ' + money(st) : ''}" onclick="act('bet',${st})">💰 Chaal ${money(st)}</button>`
            : `<button class="pri big" style="grid-column:1/-1" ${canRaise ? '' : 'disabled'} title="${!canRaise ? 'Insufficient chips to open bet' : ''}" onclick="toggleRaise()">💰 Open Bet</button>`
          }
          ${st === 0
            ? `<button onclick="act('check')">✋ Check</button>`
            : `<button class="gold" ${canRaise ? '' : 'disabled'} title="${!canRaise ? 'Insufficient chips to raise' : ''}" onclick="toggleRaise()">⬆ Raise</button>`
          }
          <button class="bad" onclick="act('fold')">🏳 Fold</button>
          <button class="good" ${canShow ? '' : 'disabled'} title="${!canShow ? (n !== 2 ? 'Show is only allowed when exactly 2 players remain' : (isBalMode && bal < showCost ? 'Insufficient chips: you have ' + money(bal) + ', need ' + money(showCost) + ' to Show' : '')) : ''}" onclick="act('show',${showCost})">🎴 Show ${money(showCost)}</button>
          <button ${n < 2 ? 'disabled' : ''} onclick="act('mutual')">🤝 Mutual</button>
        </div>`) + `</div>`;
    } else {
      const c = active(); const w = rd.winner;
      top = `<div class="card slide"><h2>🎴 Showdown</h2><p class="mut" style="margin:0 0 8px">${c.length === 1 ? 'Everyone else folded.' : 'Tap who has the best cards.'}</p>${c.map(id => `<div class="opt ${w === id ? 'sel' : ''}" onclick="pickW('${id}')">${avFn(id)}<div class="grow"><b>${nm(id)}</b><div class="mut">Wagered ${money(rd.contrib[id])}</div></div>${w === id ? '🏆' : ''}</div>`).join('')}${w ? `<p style="margin:8px 0"><b>${nm(w)}</b> receives <b>${money(pot() - rd.contrib[w])}</b> from the others</p>` : ''}<button class="pri big" ${w ? '' : 'disabled'} onclick="confirmWin()">✅ Confirm &amp; settle</button></div>`;
    }
    return top + `<div class="card"><h2>⚙ Round control</h2><div class="row"><button class="grow" ${rd.stack.length ? '' : 'disabled'} onclick="undo()">↩ Undo</button><button class="grow bad" onclick="abort()">Abort round</button></div>${rd.log.slice().reverse().slice(0, 5).map(l => `<div class="li mut">${esc(l)}</div>`).join('')}</div>`;
  };

  const debtTableHTML = (isModal = false) => {
    const players = r.S.players;
    if (!players.length) {
      return '<p class="mut" style="margin:10px 0;text-align:center">No players seated at the table yet. Add players on the left to start tracking debts.</p>';
    }

    const d = Object.entries(r.S.debts).filter(([k]) => k.split('|').every(x => P(x)));
    const totalDebt = d.reduce((sum, [, a]) => sum + a, 0);
    const nb = net();

    const topBar = `
      <div class="row" style="margin-bottom:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div class="mut" style="font-size:12px">
          ${totalDebt > 0
            ? `<b>${d.length}</b> payment${d.length > 1 ? 's' : ''} pending · Total circulating: <b class="neg">${money(totalDebt)}</b>`
            : '<span class="pos" style="font-weight:700">✓ All square!</span> No pending payments between players.'
          }
        </div>
        ${totalDebt > 0 ? '<button class="sm bad" onclick="settleAll()">Settle all</button>' : ''}
      </div>
    `;

    const thead = `
      <thead>
        <tr>
          <th class="dt-corner">
            <div style="font-size:10px;line-height:1.2">
              <span style="color:var(--bad)">Owes ↓</span><br>
              <span style="color:var(--good)">Receives →</span>
            </div>
          </th>
          ${players.map(p => `
            <th>
              <div style="display:inline-flex;align-items:center;gap:4px">
                ${dtAvFn(p.id)}
                <span>${esc(p.name)}</span>
              </div>
            </th>
          `).join('')}
          <th class="dt-tot-col" style="color:var(--bad)">Total to Pay</th>
          <th class="dt-net-col">Net Balance</th>
        </tr>
      </thead>
    `;

    const tbody = `
      <tbody>
        ${players.map(rowP => {
          let rowOwed = 0;
          const cells = players.map(colP => {
            if (rowP.id === colP.id) {
              return '<td class="dt-diag" title="Same person">—</td>';
            }
            const debtKey = `${rowP.id}|${colP.id}`;
            const amt = r.S.debts[debtKey] || 0;
            rowOwed += amt;
            if (amt > 0) {
              return `
                <td class="dt-debt">
                  <div class="dt-amt neg">${money(amt)}</div>
                  <button class="sm good dt-btn" onclick="settle('${debtKey}')" title="Settle ${esc(rowP.name)} → ${esc(colP.name)}">
                    Settled
                  </button>
                </td>
              `;
            }
            return '<td class="dt-zero">₹0</td>';
          }).join('');

          const netVal = nb[rowP.id] || 0;
          const netClass = netVal > 0 ? 'pos' : netVal < 0 ? 'neg' : 'mut';
          const netSign = netVal > 0 ? '+' : netVal < 0 ? '−' : '';

          return `
            <tr>
              <td class="dt-player-col">
                <div style="display:inline-flex;align-items:center;gap:5px">
                  ${dtAvFn(rowP.id)}
                  <span class="nmx">${esc(rowP.name)}</span>
                </div>
              </td>
              ${cells}
              <td class="dt-tot-col ${rowOwed > 0 ? 'neg' : 'mut'}">
                ${money(rowOwed)}
              </td>
              <td class="dt-net-col ${netClass}">
                ${netSign}${money(Math.abs(netVal))}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;

    const tfoot = `
      <tfoot>
        <tr class="dt-footer-row">
          <td class="dt-player-col" style="font-weight:900;color:var(--good)">
            Total to Receive
          </td>
          ${players.map(colP => {
            let colRec = 0;
            players.forEach(rowP => {
              if (rowP.id !== colP.id) {
                colRec += (r.S.debts[`${rowP.id}|${colP.id}`] || 0);
              }
            });
            return `
              <td style="font-weight:800" class="${colRec > 0 ? 'pos' : 'mut'}">
                ${money(colRec)}
              </td>
            `;
          }).join('')}
          <td class="dt-tot-col" style="font-weight:900;color:var(--gold)">
            ${money(totalDebt)}
          </td>
          <td class="dt-net-col mut" style="font-size:12px">—</td>
        </tr>
      </tfoot>
    `;

    return `
      ${topBar}
      <div class="debt-table-wrap">
        <table class="debt-table">
          ${thead}
          ${tbody}
          ${tfoot}
        </table>
      </div>
    `;
  };

  const footHTML = () => {
    const h = r.S.hist;
    return `
      <div class="fh">
        <h2 style="margin:0 0 10px;border:none;padding:0">📜 Round history</h2>
        ${h.length ? `<div class="hs">${h.slice(0, 16).map(x => {
          const roundPot = x.pot != null ? x.pot : (x.got != null ? x.got + (x.pays?.reduce((s, p) => s + (p.amt || 0), 0) || 0) : 0);
          return `
          <div class="hc" style="min-width:185px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span class="hn">Round #${x.no}</span>
              <span style="font-size:11px;font-weight:900;color:var(--gold);background:rgba(244,195,79,0.15);border:1px solid rgba(244,195,79,0.3);padding:1px 6px;border-radius:5px">Pot ${money(roundPot)}</span>
            </div>
            <div class="hw">🏆 ${esc(x.winner)}</div>
            <div class="hg pos">+${money(x.got !== undefined ? x.got : roundPot)} <span style="font-size:10.5px;opacity:.7;font-weight:600">net</span></div>
            <div class="mut" style="font-size:11px;margin-top:4px;line-height:1.3">${(x.pays || []).map(p => esc(p.name) + ' −' + money(p.amt)).join(' · ')}</div>
          </div>
        `;}).join('')}</div>` : '<p class="mut" style="margin:0">Finished rounds will appear here.</p>'}
      </div>
    `;
  };

  const lobbyHTML = () => {
    const g = (k: string, ic: string, t: string, d: string, c: string) => {
      const sess = r.sessionsList.find(s => s.gameType === k && s.status === 'active') ||
                   r.sessionsList.find(s => s.gameType === k);
      const s = sess || r.ALL[k as 'tp' | 'pk'];
      const sessName = sess?.name || 'Session #1';
      return `
        <div class="gc ${c}" onclick="pick('${k}')">
          <div class="ge">${ic}</div>
          <h3>${t}</h3>
          <p>${d}</p>
          <div style="font-size:12px;color:var(--gold);margin-bottom:8px;font-weight:800">
            🎲 ${esc(sessName)}
          </div>
          <div class="gs">
            <span>${(s.players || []).length} players</span>
            <span>${s.tot?.rounds || 0} rounds</span>
            ${s.round ? '<span class="live">● live</span>' : ''}
          </div>
          <button class="pri big">Play ${t}</button>
        </div>
      `;
    };
    return `
      <h2 class="lt">Choose your table</h2>
      <div style="display:flex;justify-content:center;margin-bottom:24px">
        <button class="session-badge" onclick="openSessionModal()" style="font-size:14px;padding:8px 18px">
          🎲 Manage Game Sessions &amp; History
        </button>
      </div>
      <div class="gg">
        ${g('tp', '🃏', 'Teen Patti', 'Boot, chaal, show. Track the pot and who owes whom.', 'gtp')}
        ${g('pk', '♠️', 'Poker', "Hold'em streets with check, call, raise and community cards.", 'gpk')}
      </div>
    `;
  };

  /* ───────── Computed values for header ───────── */
  const rd = R();
  const titleMap: Record<string, string> = { tp: '♠ TEEN PATTI ♥ HIGH ROLLERS', pk: "♠ TEXAS HOLD'EM ♦ NIGHT TABLE" };
  const title = r.G ? titleMap[r.G] || '' : '♠ CARD ROOM ♥ PICK YOUR GAME';
  const phaseMap: Record<string, string> = { ante: 'Boot', bet: 'Betting', result: 'Showdown' };
  const pkStreetTag = ['Pre-flop', 'Flop (Loop 1)', 'Turn (Loop 2)', 'River (Loop 3)'];
  const roundTag = rd
    ? 'Round ' + rd.no + ' · ' + (r.G === 'pk' ? (rd.phase === 'bet' ? pkStreetTag[rd.street || 0] : 'Showdown') : phaseMap[rd.phase] || rd.phase)
    : 'Round ' + (r.S.rno + 1) + ' ready';
  const hint = r.S.players.length ? '' : 'Add players on the left to seat them at the table.';

  /* ───────── Mandatory Login Gate ───────── */
  if (status === 'loading') {
    return (
      <div className="login-gate-wrap">
        <div className="login-gate-card" style={{ textAlign: 'center', padding: '50px 30px' }}>
          <div className="chips" style={{ justifyContent: 'center', marginBottom: 20 }}>
            <b></b><b></b><b></b>
          </div>
          <h2 style={{ color: 'var(--gold)', letterSpacing: 2, fontSize: 18, margin: '0 0 8px' }}>
            ♠ SATTEBAAZI CALCULATOR ♦
          </h2>
          <p className="mut" style={{ fontSize: 14 }}>Connecting to your secure casino bankroll...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || !session) {
    return (
      <div className="login-gate-wrap">
        <div className="bgs">
          <i style={{ left: '8%', top: '12%' }}>♠</i>
          <i style={{ left: '88%', top: '20%', animationDelay: '2s' }}>♥</i>
          <i style={{ left: '12%', top: '75%', animationDelay: '4s' }}>♦</i>
          <i style={{ left: '82%', top: '70%', animationDelay: '1s' }}>♣</i>
          <i style={{ left: '48%', top: '6%', animationDelay: '3s' }}>♠</i>
        </div>

        <div className="login-gate-card">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div className="chips" style={{ justifyContent: 'center', marginBottom: 14 }}>
              <b></b><b></b><b></b>
            </div>
            <h1 className="login-gate-title">♠ SATTEBAAZI CALCULATOR ♦</h1>
            <p className="login-gate-subtitle">
              Live Texas Hold&apos;em Poker &amp; Teen Patti Bankroll Manager, Pot Tracker &amp; Debt Simplifier
            </p>
          </div>

          <div className="login-features-list">
            <div className="login-feat-item">
              <span className="feat-icon">🔒</span>
              <div>
                <b>User-Separated Cloud Data</b>
                <p>Your games, chips, and debts are completely private to your Google account.</p>
              </div>
            </div>
            <div className="login-feat-item">
              <span className="feat-icon">🃏</span>
              <div>
                <b>Isolated Poker &amp; Teen Patti Ledgers</b>
                <p>Data from Texas Hold&apos;em never mixes with Teen Patti rounds.</p>
              </div>
            </div>
            <div className="login-feat-item">
              <span className="feat-icon">💰</span>
              <div>
                <b>Bankroll Mode with Debit &amp; Credit</b>
                <p>Real-time chip balance tracking, custom starting stacks, and instant rebuy management.</p>
              </div>
            </div>
            <div className="login-feat-item">
              <span className="feat-icon">💸</span>
              <div>
                <b>Interactive Debt Settlement Matrix</b>
                <p>Calculates the minimum cash transfers needed between all players at the table.</p>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--gold)', marginBottom: 14, fontWeight: 700 }}>
              Google Sign-in is required to access your game tables &amp; sessions:
            </p>

            <button
              onClick={handleGoogleSignIn}
              className="google-login-btn-lg"
              title="Sign in with your Google Account"
            >
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign in with Google</span>
            </button>
          </div>
        </div>

        {/* Google Auth Setup Guide Modal */}
        {showGoogleConfigModal && (
          <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) setShowGoogleConfigModal(false); }}>
            <div className="config-guide-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>🔑 Google OAuth Credentials Needed</h2>
                <button className="sm" onClick={() => setShowGoogleConfigModal(false)}>✕</button>
              </div>
              <p style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5, margin: '0 0 12px' }}>
                To enable <b>Sign in with Google</b>, add your Google Cloud credentials to <code>.env.local</code>:
              </p>
              <ol>
                <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>Google Cloud Console &rarr; APIs &amp; Services &rarr; Credentials</a>.</li>
                <li>Click <b>Create Credentials &rarr; OAuth client ID</b> (Application type: <b>Web application</b>).</li>
                <li>Under <b>Authorized redirect URIs</b>, enter:
                  <pre style={{ margin: '6px 0' }}>http://localhost:3000/api/auth/callback/google</pre>
                </li>
                <li>Copy the <b>Client ID</b> and <b>Client Secret</b> into your <code>.env.local</code> file:
                  <pre style={{ margin: '6px 0' }}>
{`GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret`}
                  </pre>
                </li>
                <li>Restart your development server (<code>npm run dev</code>).</li>
              </ol>
              <div className="row" style={{ marginTop: 16 }}>
                <button className="pri grow" onClick={() => setShowGoogleConfigModal(false)}>Got it!</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Background decorations */}
      <div className="bgs">
        <i style={{ left: '6%', top: '15%' }}>♠</i>
        <i style={{ left: '88%', top: '25%', animationDelay: '2s' }}>♥</i>
        <i style={{ left: '14%', top: '70%', animationDelay: '4s' }}>♦</i>
        <i style={{ left: '80%', top: '78%', animationDelay: '1s' }}>♣</i>
        <i style={{ left: '50%', top: '5%', animationDelay: '3s' }}>♠</i>
      </div>

      {/* Header */}
      <header>
        <h1 id="ttl">{title}</h1>
        <span className="tag" id="rn">{r.G ? roundTag : ''}</span>
        <span className="sp"></span>
        <button className="sm session-badge" onClick={openSessionModal} title="Switch or manage game sessions">
          🎲 {r.sessionName ? r.sessionName.slice(0, 18) + (r.sessionName.length > 18 ? '…' : '') : 'Sessions'} ▾
        </button>
        <button className="sm" onClick={goLobby}>🎮 Games</button>
        {r.G && <button className="sm" id="resetb" onClick={resetAll}>Reset game</button>}

        {/* Google Authentication */}
        {session?.user ? (
          <div className="auth-user-badge">
            {session.user.image ? (
              <img src={session.user.image} alt={session.user.name || 'User'} className="auth-avatar" />
            ) : (
              <span className="auth-avatar-fallback">{(session.user.name?.[0] || 'U').toUpperCase()}</span>
            )}
            <span className="auth-username" title={session.user.email || ''}>{session.user.name || session.user.email}</span>
            <button className="sm auth-logout-btn" onClick={() => signOut()}>Sign out</button>
          </div>
        ) : (
          <button className="sm google-login-btn" onClick={handleGoogleSignIn}>
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

      {/* Lobby */}
      {!r.G && (
        <div id="lobby" dangerouslySetInnerHTML={{ __html: lobbyHTML() }} />
      )}

      {/* Main game view */}
      {r.G && (
        <>
          <main>
            <aside id="left" dangerouslySetInnerHTML={{ __html: leftHTML() }} />
            <section id="mid">
              <div id="table" dangerouslySetInnerHTML={{ __html: tableHTML() }} />
              <div className="mut" style={{ textAlign: 'center', marginTop: '6px' }} id="hint">{hint}</div>
            </section>
            <aside id="right" dangerouslySetInnerHTML={{ __html: rightHTML() }} />
          </main>
          <footer id="foot" dangerouslySetInnerHTML={{ __html: footHTML() }} />
        </>
      )}

      {/* Confirm Modal */}
      {modal && (
        <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="mb">
            <p>{modal.msg}</p>
            <div className="row">
              <button className="bad grow" onClick={() => setModal(null)}>Cancel</button>
              <button className="pri grow" onClick={() => { setModal(null); modal.fn(); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Debt Table Modal */}
      {showDebtModal && (
        <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) setShowDebtModal(false); }}>
          <div className="debt-modal-box">
            <div className="debt-modal-header">
              <div>
                <h2>💸 Who Owes Who</h2>
                <div className="mut" style={{ fontSize: '12px', marginTop: '3px' }}>
                  Rows show who owes money (Debtor) · Columns show who receives money (Creditor)
                </div>
              </div>
              <button
                className="sm"
                onClick={() => setShowDebtModal(false)}
                style={{ fontSize: '14px', padding: '5px 12px', fontWeight: 800 }}
              >
                ✕ Close
              </button>
            </div>
            <div className="debt-modal-body" dangerouslySetInnerHTML={{ __html: debtTableHTML(true) }} />
          </div>
        </div>
      )}

      {/* Add Money / Manage Stack Modal */}
      {addMoneyTarget && (() => {
        const targetPlayer = P(addMoneyTarget);
        if (!targetPlayer) return null;
        const currentBal = targetPlayer.balance || 0;
        const isBusted = currentBal <= 0;
        return (
          <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) setAddMoneyTarget(null); }}>
            <div className="add-money-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 19 }}>💰 Manage Chips · {targetPlayer.name}</h2>
                <button className="sm" onClick={() => setAddMoneyTarget(null)}>✕</button>
              </div>

              {/* Debit / Credit Switcher */}
              <div className="seg" style={{ width: '100%', marginBottom: 12, display: 'flex' }}>
                <button
                  type="button"
                  style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 800 }}
                  className={stackMode === 'credit' ? 'on' : ''}
                  onClick={() => setStackMode('credit')}
                >
                  ➕ Credit (+ Add)
                </button>
                <button
                  type="button"
                  style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 800 }}
                  className={stackMode === 'debit' ? 'on' : ''}
                  onClick={() => setStackMode('debit')}
                >
                  ➖ Debit (− Deduct)
                </button>
              </div>

              <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.9 }}>
                Current balance: <b className={isBusted ? 'neg' : 'pos'}>{money(currentBal)}</b>
                {isBusted && (
                  <span style={{ display: 'block', color: '#ef4444', fontWeight: 700, marginTop: 4 }}>
                    💥 Player is BUSTED &amp; paused. Crediting chips will unpause them automatically!
                  </span>
                )}
              </p>

              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, marginBottom: 6 }}>
                {stackMode === 'credit' ? 'Quick Credit Presets:' : 'Quick Debit Presets:'}
              </div>
              <div className="preset-grid">
                {[100, 500, 1000, 2000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    className={`preset-btn ${stackMode === 'debit' ? 'bad' : ''}`}
                    onClick={() => adjustMoney(targetPlayer.id, amt, stackMode)}
                  >
                    {stackMode === 'credit' ? `+${money(amt)}` : `−${money(amt)}`}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 12, opacity: 0.8, display: 'block', marginBottom: 4 }}>
                  {stackMode === 'credit' ? 'Custom Amount to Credit:' : 'Custom Amount to Debit:'}
                </label>
                <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                  <input
                    id="custom-add-amt"
                    type="number"
                    min="1"
                    defaultValue={r.S.defaultBuyIn || 500}
                    style={{ flex: 1, fontSize: 18, textAlign: 'center' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = +(e.currentTarget as HTMLInputElement).value;
                        if (val > 0) adjustMoney(targetPlayer.id, val, stackMode);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={stackMode === 'credit' ? 'good' : 'bad'}
                    style={{ padding: '8px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}
                    onClick={() => {
                      const inp = document.getElementById('custom-add-amt') as HTMLInputElement;
                      const val = inp ? +inp.value : 0;
                      if (val > 0) adjustMoney(targetPlayer.id, val, stackMode);
                    }}
                  >
                    {stackMode === 'credit' ? '➕ Credit' : '➖ Debit'}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <label style={{ fontSize: 12, opacity: 0.8, display: 'block', marginBottom: 4 }}>Or Set Exact Chip Stack Directly:</label>
                <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                  <input
                    id="exact-set-amt"
                    type="number"
                    min="0"
                    placeholder="e.g. 1500"
                    defaultValue={targetPlayer.balance !== undefined ? targetPlayer.balance : (r.S.defaultBuyIn || 1000)}
                    style={{ flex: 1, fontSize: 16, textAlign: 'center' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = +(e.currentTarget as HTMLInputElement).value;
                        if (!isNaN(val) && val >= 0) setPlayerBalance(targetPlayer.id, val);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="gold"
                    style={{ padding: '8px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}
                    onClick={() => {
                      const inp = document.getElementById('exact-set-amt') as HTMLInputElement;
                      const val = inp ? +inp.value : NaN;
                      if (!isNaN(val) && val >= 0) setPlayerBalance(targetPlayer.id, val);
                    }}
                  >
                    Set Stack
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Google Auth Setup Guide Modal */}
      {showGoogleConfigModal && (
        <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) setShowGoogleConfigModal(false); }}>
          <div className="config-guide-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>🔑 Google OAuth Credentials Needed</h2>
              <button className="sm" onClick={() => setShowGoogleConfigModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5, margin: '0 0 12px' }}>
              To enable <b>Sign in with Google</b>, add your Google Cloud credentials to <code>.env.local</code>:
            </p>
            <ol>
              <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>Google Cloud Console &rarr; APIs &amp; Services &rarr; Credentials</a>.</li>
              <li>Click <b>Create Credentials &rarr; OAuth client ID</b> (Application type: <b>Web application</b>).</li>
              <li>Under <b>Authorized redirect URIs</b>, enter:
                <pre style={{ margin: '6px 0' }}>http://localhost:3000/api/auth/callback/google</pre>
              </li>
              <li>Copy the <b>Client ID</b> and <b>Client Secret</b> into your <code>.env.local</code> file:
                <pre style={{ margin: '6px 0' }}>
{`GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret`}
                </pre>
              </li>
              <li>Restart your development server (<code>npm run dev</code>).</li>
            </ol>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="pri grow" onClick={() => setShowGoogleConfigModal(false)}>Got it!</button>
            </div>
          </div>
        </div>
      )}

      {/* Sessions Manager Modal */}
      {showSessionModal && (
        <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) setShowSessionModal(false); }}>
          <div className="session-modal-box">
            <div className="session-modal-header">
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>🎲 Game Sessions</h2>
                <div className="mut" style={{ fontSize: 12, marginTop: 3 }}>
                  Each session tracks multiple rounds, player chip stacks, debts, and history independently.
                </div>
              </div>
              <button className="sm" onClick={() => setShowSessionModal(false)}>✕ Close</button>
            </div>

            {/* Filter tabs & New Session toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div className="seg" style={{ margin: 0 }}>
                <button className={sessionFilter === 'all' ? 'on' : ''} onClick={() => setSessionFilter('all')}>All</button>
                <button className={sessionFilter === 'pk' ? 'on' : ''} onClick={() => setSessionFilter('pk')}>♠ Poker</button>
                <button className={sessionFilter === 'tp' ? 'on' : ''} onClick={() => setSessionFilter('tp')}>🃏 Teen Patti</button>
              </div>
              <button className="pri sm" onClick={() => setIsCreatingSession(!isCreatingSession)}>
                {isCreatingSession ? '✕ Cancel' : '+ New Session'}
              </button>
            </div>

            {/* Create Session Form */}
            {isCreatingSession && (
              <div className="new-session-form">
                <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--gold)' }}>✨ Start New Session</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, opacity: 0.8, display: 'block', marginBottom: 4 }}>Session Name:</label>
                    <input
                      type="text"
                      placeholder="e.g. Diwali Poker Night, Friday Game #2"
                      value={newSessionName}
                      onChange={(e) => setNewSessionName(e.target.value)}
                      style={{ width: '100%', fontSize: 14 }}
                      maxLength={32}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ fontSize: 12, opacity: 0.8, display: 'block', marginBottom: 4 }}>Game Type:</label>
                      <div className="seg" style={{ margin: 0 }}>
                        <button className={newSessionGame === 'pk' ? 'on' : ''} onClick={() => setNewSessionGame('pk')}>♠ Poker</button>
                        <button className={newSessionGame === 'tp' ? 'on' : ''} onClick={() => setNewSessionGame('tp')}>🃏 Teen Patti</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 18 }}>
                      <input
                        type="checkbox"
                        id="sess-bal-mode"
                        checked={newSessionBalMode}
                        onChange={(e) => setNewSessionBalMode(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor="sess-bal-mode" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                        Play with Chip Stacks
                      </label>
                    </div>
                  </div>
                  <div className="row" style={{ marginTop: 6 }}>
                    <button className="pri grow" onClick={() => createSession(newSessionName, newSessionGame, newSessionBalMode)}>
                      Create &amp; Play Now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sessions List */}
            <div className="session-list-wrap">
              {(() => {
                const filtered = r.sessionsList.filter(s => sessionFilter === 'all' || s.gameType === sessionFilter);
                if (!filtered.length) {
                  return (
                    <p className="mut" style={{ textAlign: 'center', margin: '30px 0' }}>
                      No sessions found. Click &quot;+ New Session&quot; to start one!
                    </p>
                  );
                }
                return filtered.map((s: any) => {
                  const isCurrent = s._id === r.sessionId;
                  const isEnded = s.status === 'ended';
                  const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                  const totalPot = s.tot?.total || 0;
                  const roundsCount = s.tot?.rounds || 0;
                  const playersCount = (s.players || []).length;

                  return (
                    <div key={s._id} className={`session-card ${isCurrent ? 'active' : ''}`}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 16 }}>{s.gameType === 'pk' ? '♠️' : '🃏'}</span>
                          <b style={{ fontSize: 15 }}>{s.name}</b>
                          {isCurrent && <span style={{ fontSize: 10, background: 'var(--gold)', color: '#000', fontWeight: 900, padding: '1px 7px', borderRadius: 99 }}>CURRENT</span>}
                          <span className={`session-status-tag ${isEnded ? 'ended' : 'active'}`}>
                            {isEnded ? '✓ Ended' : '● Live'}
                          </span>
                        </div>
                        <div className="mut" style={{ fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>📅 {dateStr}</span>
                          <span>🃏 {roundsCount} rounds</span>
                          <span>👥 {playersCount} players</span>
                          <span>💰 Pot: {money(totalPot)}</span>
                          {s.balanceMode ? <span>🪙 Chip Mode</span> : <span>💸 Debt Mode</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {!isCurrent && (
                          <button className="pri sm" onClick={() => switchSession(s._id)} title="Switch to this session">
                            ▶ Play
                          </button>
                        )}
                        {!isEnded && (
                          <button className="sm" onClick={() => endSession(s._id)} title="End session">
                            ⏹ End
                          </button>
                        )}
                        <button className="sm bad" onClick={() => deleteSession(s._id)} title="Delete session">
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
