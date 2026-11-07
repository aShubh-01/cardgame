'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { GameState, Round, SessionDoc, freshGameState, GType, Player } from '@/types/game';
import { createStandardDeck, shuffleDeck, dealCards } from '@/lib/virtualDeck';
import { startOnlinePokerRound } from '@/lib/pokerEngine';

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
  const [showJoinRoomModal, setShowJoinRoomModal] = useState(false);
  const [showGoogleConfigModal, setShowGoogleConfigModal] = useState(false);
  const [addMoneyTarget, setAddMoneyTarget] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ msg: string; fn: () => void } | null>(null);
  const [explicitSessionDoc, setExplicitSessionDoc] = useState<SessionDoc | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showOperatorModal, setShowOperatorModal] = useState(false);

  // Derived session doc guarantees roomCode and sessionMode are always available immediately
  const currentSessionDoc = sessionsList.find(s => s._id === sessionId) || explicitSessionDoc;

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

        // If currently in a game and no active session selected, pick or activate session
        const g = gameTypeRef.current;
        if (g && !sessionIdRef.current) {
          const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
          const urlSessionId = urlParams?.get('session');

          let match = urlSessionId ? list.find(s => s._id === urlSessionId) : null;
          if (!match) {
            match = list.find(s => s.gameType === g && s.status === 'active') || list.find(s => s.gameType === g) || null;
          }

          if (match) {
            if (match.sessionMode === 'online') {
              try {
                const detailRes = await fetch(`/api/sessions/${match._id}`);
                if (detailRes.ok) {
                  const sess = await detailRes.json();
                  setSessionId(sess._id);
                  setSessionName(sess.name);
                  setExplicitSessionDoc(sess);
                  const { _id, createdAt, updatedAt, ...cleanData } = sess as any;
                  setGameState(prev => ({
                    ...prev,
                    ...cleanData,
                  }));
                } else {
                  setSessionId(match._id);
                  setSessionName(match.name);
                  setExplicitSessionDoc(match);
                  const { _id, createdAt, updatedAt, ...cleanData } = match as any;
                  setGameState(prev => ({ ...prev, ...cleanData }));
                }
              } catch {
                setSessionId(match._id);
                setSessionName(match.name);
                setExplicitSessionDoc(match);
                const { _id, createdAt, updatedAt, ...cleanData } = match as any;
                setGameState(prev => ({ ...prev, ...cleanData }));
              }
            } else {
              setSessionId(match._id);
              setSessionName(match.name);
              setExplicitSessionDoc(match);
              const { _id, createdAt, updatedAt, ...cleanData } = match as any;
              setGameState(prev => ({
                ...prev,
                ...cleanData,
              }));
            }
          } else if (urlSessionId) {
            // Directly fetch and activate session from URL
            try {
              const urlRes = await fetch(`/api/sessions/${urlSessionId}`);
              if (urlRes.ok) {
                const sess = await urlRes.json();
                if (sess && sess._id) {
                  setSessionId(sess._id);
                  setSessionName(sess.name);
                  setExplicitSessionDoc(sess);
                  setSessionsList(prev => [sess, ...prev.filter(s => s._id !== sess._id)]);
                  const { _id, createdAt, updatedAt, ...cleanData } = sess;
                  setGameState(prev => ({
                    ...prev,
                    ...cleanData,
                  }));
                }
              }
            } catch (err) {
              console.error('Failed to load session from URL param:', err);
            }
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

  // URL param session listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const urlSessionId = urlParams.get('session');
    if (urlSessionId && urlSessionId !== sessionIdRef.current) {
      switchSession(urlSessionId);
    }
    const joinCode = urlParams.get('join') || urlParams.get('room');
    if (joinCode) {
      setShowJoinRoomModal(true);
    }
  }, []);

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
        setExplicitSessionDoc(sess);
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

  // Real-time synchronization polling for Online Multiplayer sessions
  useEffect(() => {
    if (!sessionId || currentSessionDoc?.sessionMode !== 'online') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const sess: SessionDoc = await res.json();
          setExplicitSessionDoc(sess);
          const { _id, createdAt, updatedAt, ...cleanData } = sess as any;
          setGameState(prev => ({
            ...prev,
            ...cleanData,
          }));
        }
      } catch (err) {
        // silent sync retry
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [sessionId, currentSessionDoc?.sessionMode]);

  // Send authenticated multiplayer in-game action
  const sendMultiplayerAction = async (action: string, extra?: Record<string, any>) => {
    if (!sessionId) return null;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (res.ok) {
        const updated = await res.json();
        setExplicitSessionDoc(updated);
        const { _id, createdAt, updatedAt, ...cleanData } = updated;
        setGameState(prev => ({
          ...prev,
          ...cleanData,
        }));
        setActionError(null);
        return updated;
      } else {
        const errData = await res.json().catch(() => ({}));
        if (errData?.error) {
          setActionError(errData.error);
          setTimeout(() => setActionError(null), 5000);
        }
      }
    } catch (e) {
      console.error('Multiplayer action error:', e);
    }
    return null;
  };

  // Notify server immediately when any online participant (player or Game Operator) closes/leaves the tab
  useEffect(() => {
    if (!sessionId || currentSessionDoc?.sessionMode !== 'online') return;
    const handleBeforeUnload = () => {
      try {
        const blob = new Blob([JSON.stringify({ action: 'PLAYER_DISCONNECT' })], { type: 'application/json' });
        navigator.sendBeacon(`/api/sessions/${sessionId}/action`, blob);
      } catch {
        // fallback handled by server heartbeat timeout
      }
    };
    window.addEventListener('pagehide', handleBeforeUnload);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', handleBeforeUnload);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionId, currentSessionDoc?.sessionMode]);

  const sendChatMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await sendMultiplayerAction('SEND_CHAT', { text: trimmed.slice(0, 240) });
  };

  const toggleReady = async (betAmount?: number) => {
    const validBet =
      typeof betAmount === 'number' && Number.isFinite(betAmount) && betAmount > 0
        ? betAmount
        : undefined;
    await sendMultiplayerAction('TOGGLE_READY', validBet !== undefined ? { betAmount: validBet } : {});
  };

  const setPlayerBet = async (betAmount: number, targetPlayerId?: string) => {
    if (sessionIdRef.current && currentSessionDoc?.sessionMode === 'online') {
      await sendMultiplayerAction('SET_PLAYER_BET', { betAmount, targetPlayerId });
      return;
    }
    updateState(prev => ({
      ...prev,
      playerBets: {
        ...(prev.playerBets || {}),
        [targetPlayerId || prev.players[0]?.id || 'p1']: betAmount,
      },
    }));
  };

  const openPreRoundLobby = async () => {
    await sendMultiplayerAction('OPEN_PRE_ROUND_LOBBY');
  };

  const transferGameOperator = async (targetPlayerId: string) => {
    await sendMultiplayerAction('TRANSFER_GO', { targetPlayerId });
    setShowOperatorModal(false);
  };

  const volunteerGameOperator = async () => {
    await sendMultiplayerAction('VOLUNTEER_GO');
  };

  const triggerGoDisconnect = async () => {
    await sendMultiplayerAction('GO_DISCONNECT');
  };

  const checkGoTimeout = async () => {
    await sendMultiplayerAction('CHECK_GO_TIMEOUT');
  };

  /* ───────── Blackjack Dealer & Rotation Management ───────── */
  const setBjDealer = async (dealerPlayerId?: string, bjDealerRotation?: boolean) => {
    if (sessionIdRef.current && currentSessionDoc?.sessionMode === 'online') {
      await sendMultiplayerAction('SET_BJ_DEALER', {
        ...(dealerPlayerId !== undefined ? { dealerPlayerId } : {}),
        ...(bjDealerRotation !== undefined ? { bjDealerRotation } : {}),
      });
      return;
    }
    updateState(prev => ({
      ...prev,
      ...(dealerPlayerId !== undefined ? { bjDealerId: dealerPlayerId } : {}),
      ...(bjDealerRotation !== undefined ? { bjDealerRotation } : {}),
    }));
  };

  const requestBjDealer = async () => {
    await sendMultiplayerAction('REQUEST_DEALER');
  };

  const resolveBjDealerRequest = async (requestId: string, decision: 'approved' | 'rejected') => {
    await sendMultiplayerAction('RESOLVE_DEALER_REQUEST', { requestId, decision });
  };

  // Create session
  const createSession = async (
    name: string,
    type: 'tp' | 'pk' | 'rummy' | 'bj',
    balMode: boolean,
    defBuyIn: number = 1000,
    sessMode: 'tracker' | 'online' = 'tracker',
    hostName?: string
  ): Promise<SessionDoc | null> => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          gameType: type,
          balanceMode: balMode,
          defaultBuyIn: defBuyIn,
          sessionMode: sessMode,
          hostName,
        }),
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
    if (currentSessionDoc?.sessionMode === 'online') {
      sendMultiplayerAction('KICK_PLAYER', { targetPlayerId: id });
      return;
    }
    updateState(prev => {
      if (prev.round) return prev; // Cannot remove during active round
      return {
        ...prev,
        players: prev.players.filter(p => p.id !== id),
      };
    });
  };

  const toggleSit = (id: string) => {
    if (sessionIdRef.current) {
      sendMultiplayerAction('TOGGLE_SIT', { targetPlayerId: id }).catch(console.error);
    }
    updateState(prev => {
      if (prev.round && !prev.round.settled && prev.round.phase !== 'result') return prev;
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

  const renamePlayer = async (playerId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    updateState(prev => ({
      ...prev,
      players: prev.players.map(p => (p.id === playerId ? { ...p, name: trimmed } : p)),
    }));

    if (sessionId && currentSessionDoc?.sessionMode === 'online') {
      try {
        await fetch(`/api/sessions/${sessionId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'SET_USERNAME', playerId, name: trimmed }),
        });
      } catch (err) {
        console.error('Failed to sync username:', err);
      }
    }
  };

  /* ───────── Chip Management ───────── */
  const adjustMoney = (playerId: string, amt: number, mode: 'credit' | 'debit') => {
    if (amt <= 0) return;
    if (sessionIdRef.current && currentSessionDoc?.sessionMode === 'online') {
      sendMultiplayerAction('ADMIN_ADJUST_CHIPS', { playerId, amount: amt, mode });
      setAddMoneyTarget(null);
      return;
    }
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
    if (sessionIdRef.current && currentSessionDoc?.sessionMode === 'online') {
      sendMultiplayerAction('ADMIN_ADJUST_CHIPS', { playerId, amount: val, mode: 'exact' });
      setAddMoneyTarget(null);
      return;
    }
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

  const requestChips = async (amt: number) => {
    if (amt <= 0) return;
    await sendMultiplayerAction('REQUEST_CHIPS', { amount: amt });
    setAddMoneyTarget(null);
  };

  const resolveChipRequest = async (requestId: string, decision: 'approved' | 'rejected') => {
    await sendMultiplayerAction('RESOLVE_CHIP_REQUEST', { requestId, decision });
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
    if (sessionIdRef.current && currentSessionDoc?.sessionMode === 'online') {
      sendMultiplayerAction('SEE_CARDS', { playerId });
      return;
    }
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
    if (sessionIdRef.current && currentSessionDoc?.sessionMode === 'online') {
      sendMultiplayerAction('START_ROUND', {
        bootAmt: stateRef.current.ante?.amt || 0,
        bootMode: stateRef.current.ante?.mode || 'each',
      });
      setIsRaiseOpen(false);
      return;
    }

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
        const dIdx = prev.dealerIdx ?? 0;
        const bootMode = prev.ante?.mode === 'admin' ? 'admin' : 'each';
        const bootAmt = Math.max(0, prev.ante?.amt || 0);
        const antePerPlayer = bootMode === 'admin' && bootAmt > 0
          ? Math.max(1, Math.floor(bootAmt / activeIds.length) || 1)
          : Math.max(1, bootAmt || 5);
        const started = startOnlinePokerRound({
          players: prev.players,
          rno,
          dealerIdx: dIdx,
          balanceMode: !!prev.balanceMode,
          hands: {},
          boardCards: [],
          deck: [],
          minBet: antePerPlayer,
          ante: prev.ante,
          adminPlayerId: activePlayers[0]?.id,
        });
        if (!started) return prev;
        setIsRaiseOpen(false);
        return {
          ...prev,
          players: started.players,
          rno,
          round: started.round,
        };
      } else {
        // Teen Patti Initialization with Blind Status
        const playerStatus: Record<string, 'blind' | 'seen'> = {};
        activeIds.forEach(id => {
          playerStatus[id] = 'blind';
        });

        const bootMode = prev.ante?.mode === 'admin' ? 'admin' : 'each';
        const bootAmt = Math.max(0, prev.ante?.amt || 0);
        const baseStake = Math.max(
          1,
          bootMode === 'admin' && bootAmt > 0
            ? Math.max(1, Math.floor(bootAmt / activeIds.length) || 1)
            : bootAmt || 5
        );

        const rd: Round = {
          no: rno,
          phase: 'bet',
          parts: activeIds,
          contrib: {},
          folded: {},
          turn: activeIds[0],
          stake: baseStake,
          lastBetAmt: 0,
          lastIsBlind: true,
          stack: [],
          log: ['All players start BLIND 🙈'],
          lastBy: '',
          winner: null,
          allIn: {},
          potWinners: {},
          playerStatus,
        };

        activeIds.forEach(id => {
          rd.contrib[id] = 0;
        });

        let updatedPlayers = [...prev.players];
        if (bootMode === 'admin' && bootAmt > 0) {
          const adminId = activePlayers[0]?.id;
          let actualSeed = bootAmt;
          if (prev.balanceMode && adminId) {
            updatedPlayers = updatedPlayers.map(p => {
              if (p.id !== adminId) return p;
              actualSeed = Math.min(p.balance || 0, bootAmt);
              const nextBal = Math.max(0, (p.balance || 0) - actualSeed);
              if (nextBal === 0 && actualSeed > 0) {
                rd.allIn![p.id] = true;
              }
              return { ...p, balance: nextBal };
            });
          }
          if (actualSeed > 0) {
            rd.contrib['__pot_seed__'] = actualSeed;
            rd.log.push(`👑 Initial pot ₹${actualSeed} funded from ${activePlayers[0]?.name || 'Admin'}'s wallet`);
          }
        } else {
          updatedPlayers = prev.players.map(p => {
            if (p.sit) return p;
            const v = customAnteMap && customAnteMap[p.id] !== undefined
              ? customAnteMap[p.id]
              : prev.ante.amt;
            let actualBoot = Math.max(0, v);
            let nextBal = p.balance;
            if (prev.balanceMode) {
              actualBoot = Math.min(p.balance || 0, actualBoot);
              nextBal = Math.max(0, (p.balance || 0) - actualBoot);
              if (nextBal === 0 && actualBoot > 0) {
                rd.allIn![p.id] = true;
              }
            }
            rd.contrib[p.id] = actualBoot;
            if (actualBoot > 0) {
              rd.log.push(`${p.name} boot ₹${actualBoot}${rd.allIn![p.id] ? ' (all-in)' : ''}`);
            }
            return { ...p, balance: nextBal };
          });
        }

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
        if (sessionIdRef.current && currentSessionDoc?.sessionMode === 'online') {
          sendMultiplayerAction('ABORT_ROUND');
          setIsRaiseOpen(false);
          return;
        }
        updateState(prev => {
          if (!prev.round) return prev;
          let players = prev.players;
          if (prev.balanceMode) {
            const seedRefund = prev.round.contrib['__pot_seed__'] || 0;
            const firstActiveId = prev.players.find(p => !p.sit)?.id || prev.players[0]?.id;
            players = prev.players.map(p => {
              const contributed = (prev.round!.contrib[p.id] || 0) + (p.id === firstActiveId ? seedRefund : 0);
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
    if (sessionIdRef.current && currentSessionDoc?.sessionMode === 'online') {
      sendMultiplayerAction('UNDO');
      return;
    }
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
    currentSessionDoc,
    sessionName,
    sessionsLoaded,
    loadSessions,
    switchSession,
    createSession,
    sendMultiplayerAction,
    setRummyConfig,
    authSession,
    authStatus,
    handleGoogleSignIn,
    // Modals
    showDebtModal,
    setShowDebtModal,
    showSessionModal,
    setShowSessionModal,
    showJoinRoomModal,
    setShowJoinRoomModal,
    showGoogleConfigModal,
    setShowGoogleConfigModal,
    addMoneyTarget,
    setAddMoneyTarget,
    confirmModal,
    setConfirmModal,
    actionError,
    setActionError,
    showOperatorModal,
    setShowOperatorModal,
    // Actions
    isRaiseOpen,
    setIsRaiseOpen,
    toggleReady,
    setPlayerBet,
    openPreRoundLobby,
    transferGameOperator,
    volunteerGameOperator,
    triggerGoDisconnect,
    checkGoTimeout,
    sendChatMessage,
    setBjDealer,
    requestBjDealer,
    resolveBjDealerRequest,
    addPlayer,
    removePlayer,
    renamePlayer,
    toggleSit,
    shufflePlayers,
    reorderPlayers,
    adjustMoney,
    setPlayerBalance,
    requestChips,
    resolveChipRequest,
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

