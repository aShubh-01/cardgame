'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { GameState, Round, SessionDoc, freshGameState, GType, Player } from '@/types/game';
import { calculatePots, distributePots } from '@/lib/pokerPot';
import { getPokerBlindPositions, postPokerBlinds } from '@/lib/blindRules';

export function useGameEngine(initialGameType: GType) {
  const [gameType, setGameType] = useState<GType>(initialGameType);
  const [gameState, setGameState] = useState<GameState>(freshGameState());
  const [sessionsList, setSessionsList] = useState<SessionDoc[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // Modals state
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showGoogleConfigModal, setShowGoogleConfigModal] = useState(false);
  const [addMoneyTarget, setAddMoneyTarget] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ msg: string; fn: () => void } | null>(null);

  // UI raise mode (inline raise panel toggle)
  const [isRaiseOpen, setIsRaiseOpen] = useState(false);

  const { data: authSession, status: authStatus } = useSession();
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const gameTypeRef = useRef(gameType);
  gameTypeRef.current = gameType;

  // Debounced save to API
  const saveToAPI = useCallback(() => {
    if (!loadedRef.current) return;
    const g = gameTypeRef.current;
    if (!g) return;

    const payload = JSON.stringify(stateRef.current);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const currentSessId = sessionIdRef.current;
      if (currentSessId) {
        fetch(`/api/sessions/${currentSessId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        }).catch(console.error);

        // Update local session list entry
        setSessionsList(prev =>
          prev.map(s => {
            if (s._id === currentSessId) {
              return {
                ...s,
                players: stateRef.current.players,
                round: stateRef.current.round,
                debts: stateRef.current.debts,
                wins: stateRef.current.wins,
                hist: stateRef.current.hist,
                tot: stateRef.current.tot,
                balanceMode: stateRef.current.balanceMode,
                rummyConfig: (stateRef.current as any).rummyConfig,
              };
            }
            return s;
          })
        );
      } else {
        fetch(`/api/games/${g}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        }).catch(console.error);
      }
    }, 400);
  }, []);

  const updateState = useCallback((updater: (prev: GameState) => GameState) => {
    setGameState(prev => {
      const next = updater(prev);
      stateRef.current = next;
      saveToAPI();
      return next;
    });
  }, [saveToAPI]);

  // Load Sessions
  const loadSessions = useCallback(async () => {
    if (authStatus !== 'authenticated') return;
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const list: SessionDoc[] = await res.json();
        setSessionsList(list);

        // If currently in a game and no active session selected, pick or create session
        const g = gameTypeRef.current;
        if (g && !sessionIdRef.current) {
          const match = list.find(s => s.gameType === g && s.status === 'active') || list.find(s => s.gameType === g);
          if (match) {
            setSessionId(match._id);
            setSessionName(match.name);
            const { _id, createdAt, updatedAt, ...cleanData } = match as any;
            setGameState(prev => ({
              ...prev,
              ...cleanData,
            }));
          }
        }
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
    } finally {
      setSessionsLoaded(true);
    }
  }, [authStatus]);

  // Initial load
  useEffect(() => {
    if (authStatus === 'authenticated' && !loadedRef.current) {
      loadedRef.current = true;
      loadSessions();
    }
  }, [authStatus, loadSessions]);

  // Google sign in check
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

  // Switch session
  const switchSession = async (sessId: string): Promise<SessionDoc | null> => {
    try {
      const res = await fetch(`/api/sessions/${sessId}`);
      if (res.ok) {
        const sess: SessionDoc = await res.json();
        setSessionId(sess._id);
        setSessionName(sess.name);
        setGameType(sess.gameType);
        const { _id, createdAt, updatedAt, ...cleanData } = sess as any;
        setGameState(prev => ({
          ...prev,
          ...cleanData,
        }));
        setShowSessionModal(false);
        return sess;
      }
    } catch (e) {
      console.error('Switch session failed:', e);
    }
    return null;
  };

  // Create session
  const createSession = async (name: string, type: 'tp' | 'pk' | 'rummy' | 'bj', balMode: boolean, defBuyIn: number = 1000): Promise<SessionDoc | null> => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, gameType: type, balanceMode: balMode, defaultBuyIn: defBuyIn }),
      });
      if (res.ok) {
        const sess: SessionDoc = await res.json();
        setSessionsList(prev => [sess, ...prev]);
        await switchSession(sess._id);
        return sess;
      }
    } catch (e) {
      console.error('Create session failed:', e);
    }
    return null;
  };

  /* ───────── Snapshot for Undo ───────── */
  const takeSnapshot = (rd: Round, players: Player[]) => {
    rd.stack = rd.stack || [];
    rd.stack.push(JSON.stringify({
      ...rd,
      stack: undefined,
      _plBals: players.map(p => ({ id: p.id, balance: p.balance })),
    }));
  };

  /* ───────── Player Management ───────── */
  const addPlayer = (name: string, customBalance?: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateState(prev => {
      const newId = 'p' + (prev.seq || 1);
      const buyIn = customBalance !== undefined
        ? Math.max(0, customBalance)
        : (prev.defaultBuyIn || 1000);

      const newPlayer: Player = {
        id: newId,
        name: trimmed,
        sit: false,
        balance: prev.balanceMode ? buyIn : undefined,
      };

      return {
        ...prev,
        players: [...prev.players, newPlayer],
        seq: (prev.seq || 1) + 1,
      };
    });
  };

  const removePlayer = (id: string) => {
    updateState(prev => {
      if (prev.round) return prev; // Cannot remove during active round
      return {
        ...prev,
        players: prev.players.filter(p => p.id !== id),
      };
    });
  };

  const toggleSit = (id: string) => {
    updateState(prev => {
      if (prev.round) return prev;
      return {
        ...prev,
        players: prev.players.map(p => (p.id === id ? { ...p, sit: !p.sit } : p)),
      };
    });
  };

  const shufflePlayers = () => {
    updateState(prev => {
      if (prev.round) return prev;
      const arr = [...prev.players];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return { ...prev, players: arr };
    });
  };

  const reorderPlayers = (newOrder: Player[]) => {
    updateState(prev => {
      if (prev.round) return prev;
      return { ...prev, players: newOrder };
    });
  };

  /* ───────── Chip Management ───────── */
  const adjustMoney = (playerId: string, amt: number, mode: 'credit' | 'debit') => {
    if (amt <= 0) return;
    updateState(prev => {
      const players = prev.players.map(p => {
        if (p.id === playerId) {
          const current = p.balance || 0;
          const nextBal = mode === 'credit' ? current + amt : Math.max(0, current - amt);
          return {
            ...p,
            balance: nextBal,
            sit: nextBal <= 0 ? true : (current <= 0 ? false : p.sit),
          };
        }
        return p;
      });
      return { ...prev, players };
    });
    setAddMoneyTarget(null);
  };

  const setPlayerBalance = (playerId: string, exactAmt: number) => {
    const val = Math.max(0, exactAmt);
    updateState(prev => {
      const players = prev.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            balance: val,
            sit: val <= 0 ? true : false,
          };
        }
        return p;
      });
      return { ...prev, players };
    });
    setAddMoneyTarget(null);
  };

  const resetAllBalances = () => {
    setConfirmModal({
      msg: `Reset all player stacks to the default buy-in (₹${gameState.defaultBuyIn || 1000})?`,
      fn: () => {
        updateState(prev => {
          const def = prev.defaultBuyIn || 1000;
          return {
            ...prev,
            players: prev.players.map(p => ({ ...p, balance: def, sit: false })),
          };
        });
      },
    });
  };

  /* ───────── Debts ───────── */
  const settleDebt = (k: string) => {
    updateState(prev => {
      const debts = { ...prev.debts };
      delete debts[k];
      return { ...prev, debts };
    });
  };

  const settleAllDebts = () => {
    setConfirmModal({
      msg: 'Mark all pending debts as settled?',
      fn: () => {
        updateState(prev => ({ ...prev, debts: {} }));
      },
    });
  };

  /* ───────── Settings ───────── */
  const setBalanceMode = (enabled: boolean) => {
    updateState(prev => {
      const def = prev.defaultBuyIn || 1000;
      const players = prev.players.map(p => ({
        ...p,
        balance: enabled ? (p.balance !== undefined ? p.balance : def) : undefined,
      }));
      return { ...prev, balanceMode: enabled, players };
    });
  };

  const setDefaultBuyIn = (amt: number) => {
    const val = Math.max(10, amt);
    updateState(prev => ({ ...prev, defaultBuyIn: val }));
  };

  const setAnteMode = (m: string) => {
    updateState(prev => ({ ...prev, ante: { ...prev.ante, mode: m } }));
  };

  const setAnteAmt = (amt: number) => {
    updateState(prev => ({ ...prev, ante: { ...prev.ante, amt: Math.max(0, amt) } }));
  };

  const setBlinds = (sb: number, bb: number) => {
    updateState(prev => ({
      ...prev,
      blinds: { sb: Math.max(1, sb), bb: Math.max(2, bb) },
    }));
  };

  const seeCards = (playerId: string) => {
    updateState(prev => {
      if (!prev.round || !prev.round.playerStatus) return prev;
      if (prev.round.playerStatus[playerId] === 'seen') return prev;
      const pName = prev.players.find(p => p.id === playerId)?.name || playerId;
      const log = [...prev.round.log, `👁 ${pName} saw their cards (now SEEN)`];
      return {
        ...prev,
        round: {
          ...prev.round,
          playerStatus: {
            ...prev.round.playerStatus,
            [playerId]: 'seen',
          },
          log,
        },
      };
    });
  };

  /* ───────── Round Controls ───────── */
  const startRound = (customAnteMap?: Record<string, number>) => {
    updateState(prev => {
      if (prev.balanceMode) {
        prev.players.forEach(p => {
          if ((p.balance || 0) <= 0) p.sit = true;
        });
      }
      const activePlayers = prev.players.filter(p => !p.sit);
      if (activePlayers.length < 2) return prev;

      const rno = prev.rno + 1;
      const activeIds = activePlayers.map(p => p.id);

      if (gameTypeRef.current === 'pk') {
        // Poker Initialization with Blinds
        const dIdx = prev.dealerIdx ?? 0;
        const pos = getPokerBlindPositions(activeIds, dIdx);

        const bbAmt = prev.blinds?.bb || (prev.ante.amt ? prev.ante.amt * 2 : 20);
        const sbAmt = prev.blinds?.sb || Math.floor(bbAmt / 2) || 10;

        // Deduct ante if configured
        let currentPlayers = prev.players.map(p => ({ ...p }));
        const anteContrib: Record<string, number> = {};
        const anteAllIn: Record<string, boolean> = {};
        const anteLog: string[] = [];

        if (prev.ante.amt > 0) {
          currentPlayers = currentPlayers.map(p => {
            if (p.sit) return p;
            let a = prev.ante.amt;
            if (prev.balanceMode) {
              const bal = p.balance || 0;
              a = Math.min(bal, a);
              const nextBal = bal - a;
              p.balance = nextBal;
              if (nextBal === 0) anteAllIn[p.id] = true;
            }
            anteContrib[p.id] = a;
            anteLog.push(`${p.name} ante ₹${a}`);
            return p;
          });
        }

        // Post Small Blind and Big Blind
        const blindsRes = postPokerBlinds({
          players: currentPlayers,
          activePlayerIds: activeIds,
          sbId: pos.sbId,
          bbId: pos.bbId,
          sbAmt,
          bbAmt,
          balanceMode: !!prev.balanceMode,
        });

        const mergedContrib: Record<string, number> = {};
        activeIds.forEach(id => {
          mergedContrib[id] = (anteContrib[id] || 0) + (blindsRes.contribMap[id] || 0);
        });

        const mergedAllIn: Record<string, boolean> = {
          ...anteAllIn,
          ...blindsRes.allInMap,
        };

        const sbName = prev.players.find(p => p.id === pos.sbId)?.name || pos.sbId;
        const bbName = prev.players.find(p => p.id === pos.bbId)?.name || pos.bbId;
        const dealerName = prev.players.find(p => p.id === pos.dealerId)?.name || pos.dealerId;

        const roundLog = [
          ...anteLog,
          `Dealer button is ${dealerName} [D]`,
          `${sbName} posted Small Blind ₹${blindsRes.sbPosted}${blindsRes.isSbAllIn ? ' (ALL-IN) 🚨' : ''}`,
          `${bbName} posted Big Blind ₹${blindsRes.bbPosted}${blindsRes.isBbAllIn ? ' (ALL-IN) 🚨' : ''}`,
        ];

        let firstTurn = pos.firstToActPreFlopId;
        if (mergedAllIn[firstTurn]) {
          const actOrder = activeIds;
          let idx = actOrder.indexOf(firstTurn);
          for (let k = 0; k < actOrder.length; k++) {
            idx = (idx + 1) % actOrder.length;
            if (!mergedAllIn[actOrder[idx]]) {
              firstTurn = actOrder[idx];
              break;
            }
          }
        }

        const rd: Round = {
          no: rno,
          phase: 'bet',
          parts: activeIds,
          contrib: mergedContrib,
          folded: {},
          turn: firstTurn,
          stake: bbAmt,
          stack: [],
          log: roundLog,
          lastBy: '',
          winner: null,
          street: 0, // Pre-flop
          cur: bbAmt,
          st: { ...blindsRes.stMap },
          acted: {},
          locked: false,
          winners: [],
          lastRaiser: null,
          minRaise: bbAmt,
          allIn: mergedAllIn,
          potWinners: {},
          dealer: pos.dealerId,
          smallBlind: { playerId: pos.sbId, amt: blindsRes.sbPosted },
          bigBlind: { playerId: pos.bbId, amt: blindsRes.bbPosted },
        };

        setIsRaiseOpen(false);
        return {
          ...prev,
          players: blindsRes.updatedPlayers,
          rno,
          round: rd,
        };
      } else {
        // Teen Patti Initialization with Blind Status
        const playerStatus: Record<string, 'blind' | 'seen'> = {};
        activeIds.forEach(id => {
          playerStatus[id] = 'blind';
        });

        const rd: Round = {
          no: rno,
          phase: 'bet',
          parts: activeIds,
          contrib: {},
          folded: {},
          turn: activeIds[0],
          stake: Math.max(10, prev.ante.amt || 10),
          stack: [],
          log: ['All players start BLIND 🙈'],
          lastBy: '',
          winner: null,
          allIn: {},
          potWinners: {},
          playerStatus,
        };

        const updatedPlayers = prev.players.map(p => {
          if (p.sit) return p;
          const v = customAnteMap && customAnteMap[p.id] !== undefined
            ? customAnteMap[p.id]
            : prev.ante.amt;
          let actualBoot = Math.max(0, v);
          let nextBal = p.balance;
          if (prev.balanceMode) {
            actualBoot = Math.min(p.balance || 0, actualBoot);
            nextBal = Math.max(0, (p.balance || 0) - actualBoot);
            if (nextBal === 0) {
              rd.allIn![p.id] = true;
            }
          }
          rd.contrib[p.id] = actualBoot;
          rd.log.push(`${p.name} boot ₹${actualBoot}${rd.allIn![p.id] ? ' (all-in)' : ''}`);
          return { ...p, balance: nextBal };
        });

        setIsRaiseOpen(false);
        return {
          ...prev,
          players: updatedPlayers,
          rno,
          round: rd,
        };
      }
    });
  };

  const abortRound = () => {
    setConfirmModal({
      msg: 'Abort the current round? Chips/bets put in this round will be returned.',
      fn: () => {
        updateState(prev => {
          if (!prev.round) return prev;
          let players = prev.players;
          if (prev.balanceMode) {
            players = prev.players.map(p => {
              const contributed = prev.round!.contrib[p.id] || 0;
              return { ...p, balance: (p.balance || 0) + contributed };
            });
          }
          setIsRaiseOpen(false);
          return {
            ...prev,
            players,
            round: null,
            rno: Math.max(0, prev.rno - 1),
          };
        });
      },
    });
  };

  const undoAction = () => {
    updateState(prev => {
      const rd = prev.round;
      if (!rd || !rd.stack.length) return prev;
      const prevSnap = JSON.parse(rd.stack[rd.stack.length - 1]);
      let players = prev.players;
      if (prev.balanceMode && prevSnap._plBals) {
        players = prev.players.map(p => {
          const found = prevSnap._plBals.find((b: any) => b.id === p.id);
          return found ? { ...p, balance: found.balance } : p;
        });
      }
      return {
        ...prev,
        players,
        round: { ...prevSnap, stack: rd.stack.slice(0, -1) },
      };
    });
  };

  const resetGame = () => {
    const gameName = gameTypeRef.current === 'pk' ? "Texas Hold'em (Poker)" : 'Teen Patti';
    setConfirmModal({
      msg: `Clear all players, chip stacks, debts, and history for ${gameName}?`,
      fn: () => {
        const fresh = freshGameState();
        setGameState(fresh);
        stateRef.current = fresh;
        setIsRaiseOpen(false);
        saveToAPI();
      },
    });
  };

  const setRummyConfig = (cfg: any) => {
    updateState(prev => ({
      ...prev,
      rummyConfig: cfg,
    }));
  };

  return {
    gameType,
    setGameType,
    gameState,
    setGameState,
    updateState,
    sessionsList,
    sessionId,
    sessionName,
    sessionsLoaded,
    loadSessions,
    switchSession,
    createSession,
    setRummyConfig,
    authSession,
    authStatus,
    handleGoogleSignIn,
    // Modals
    showDebtModal,
    setShowDebtModal,
    showSessionModal,
    setShowSessionModal,
    showGoogleConfigModal,
    setShowGoogleConfigModal,
    addMoneyTarget,
    setAddMoneyTarget,
    confirmModal,
    setConfirmModal,
    // Actions
    isRaiseOpen,
    setIsRaiseOpen,
    addPlayer,
    removePlayer,
    toggleSit,
    shufflePlayers,
    reorderPlayers,
    adjustMoney,
    setPlayerBalance,
    resetAllBalances,
    settleDebt,
    settleAllDebts,
    setBalanceMode,
    setDefaultBuyIn,
    setAnteMode,
    setAnteAmt,
    setBlinds,
    seeCards,
    startRound,
    abortRound,
    undoAction,
    resetGame,
    takeSnapshot,
  };
}

