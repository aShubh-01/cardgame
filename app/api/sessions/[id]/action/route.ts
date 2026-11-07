import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import Session from '@/lib/models/Session';
import { createStandardDeck, shuffleDeck, dealCards, sanitizeStateForClient } from '@/lib/virtualDeck';
import { applyPokerAction, settlePokerShowdown, startOnlinePokerRound, PokerActionType } from '@/lib/pokerEngine';
import {
  evaluateAllPokerHands,
  evaluateTeenPattiHand,
  evaluateAllTeenPattiHands,
  evaluateBlackjackHand,
  advanceBlackjackTurnOrSettle,
  calculateRummyOptimalDeadwood,
} from '@/lib/cardGamesEngine';
import { calculateRummyDeal } from '@/lib/rummyEngine';
import { calcTeenPattiNewBaseStake, getTeenPattiBetAmounts } from '@/lib/blindRules';
import { calculatePots, distributePots } from '@/lib/pokerPot';
import { money } from '@/types/game';
import {
  getGoEmail,
  getOwnerEmail,
  appendActivityLog,
  assignNewGameOperator,
  promoteQueuedGameOperatorIfIdle,
  syncGameOperatorPresence,
  isPlayerConnected,
} from '@/lib/gameOperator';

function resetReadyAndPromoteQueuedGo(sessionDoc: any) {
  sessionDoc.readyPlayers = {};
  sessionDoc.markModified('readyPlayers');
  promoteQueuedGameOperatorIfIdle(sessionDoc);
}

function settleTeenPattiRoundOnServer(
  sessionDoc: any,
  round: any,
  players: any[],
  winnerId?: string | null,
  challengerId?: string
) {
  if (!round || round.settled) return;

  const { pots, totalPot } = calculatePots(round.contrib || {}, round.folded || {}, round.allIn || {});
  if (!pots.length || totalPot <= 0) return;

  const potWinners: Record<string, string[]> = { ...(round.potWinners || {}) };
  for (const pot of pots) {
    if (!potWinners[pot.id] || potWinners[pot.id].length === 0) {
      if (pot.eligiblePlayerIds.length === 1) {
        potWinners[pot.id] = [pot.eligiblePlayerIds[0]];
      } else if (round.hands && Object.keys(round.hands).length > 0) {
        const tpEval = evaluateAllTeenPattiHands(round.hands, pot.eligiblePlayerIds, challengerId);
        potWinners[pot.id] = tpEval.bestWinnerId ? [tpEval.bestWinnerId] : [pot.eligiblePlayerIds[0]];
      } else if (winnerId && pot.eligiblePlayerIds.includes(winnerId)) {
        potWinners[pot.id] = [winnerId];
      } else if (pot.eligiblePlayerIds.length > 0) {
        potWinners[pot.id] = [pot.eligiblePlayerIds[0]];
      }
    }
  }

  const playerMap: Record<string, { name: string }> = {};
  players.forEach((p: any) => {
    playerMap[p.id] = { name: p.name };
  });

  const summary = distributePots(pots, potWinners, playerMap);
  const pays: { name: string; amt: number }[] = [];
  const debts = { ...(sessionDoc.debts || {}) };
  const wins = { ...(sessionDoc.wins || {}) };

  if (sessionDoc.balanceMode) {
    players.forEach((p: any) => {
      if (p.isGameOperator) return;
      const won = summary.totalPlayerWins[p.id] || 0;
      p.balance = (p.balance || 0) + won;
      if (p.balance <= 0) {
        p.sit = true;
      }
    });
  }

  const nets: Record<string, number> = {};
  (round.parts || []).forEach((id: string) => {
    nets[id] = (summary.totalPlayerWins[id] || 0) - (round.contrib?.[id] || 0);
  });
  const cr = Object.entries(nets).filter(e => e[1] > 0);
  const tc = cr.reduce((acc, e) => acc + e[1], 0);

  Object.entries(nets)
    .filter(e => e[1] < 0)
    .forEach(([d, v]) => {
      let left = -v;
      cr.forEach(([c, cv], i) => {
        if (tc <= 0) return;
        const x = i === cr.length - 1 ? left : Math.round((-v * cv) / tc);
        left -= x;
        if (x <= 0) return;
        const k = `${d}|${c}`;
        const rk = `${c}|${d}`;
        const rev = debts[rk] || 0;
        if (rev >= x) {
          debts[rk] = rev - x;
          if (!debts[rk]) delete debts[rk];
        } else {
          const rem = x - rev;
          delete debts[rk];
          debts[k] = (debts[k] || 0) + rem;
        }
      });
      pays.push({ name: players.find((p: any) => p.id === d)?.name || d, amt: -v });
    });

  Object.entries(summary.totalPlayerWins).forEach(([wId, amt]) => {
    const netProfit = Math.max(0, amt - (round.contrib?.[wId] || 0));
    wins[wId] = (wins[wId] || 0) + (pots.length > 1 ? amt : netProfit);
  });

  const allWinnerIds = Array.from(
    new Set(
      Object.entries(summary.totalPlayerWins)
        .filter(([, amt]) => amt > 0)
        .map(([wid]) => wid)
    )
  );
  const primaryWinnerId = winnerId || potWinners['main']?.[0] || allWinnerIds[0] || null;
  const winningNames = allWinnerIds
    .map(wid => players.find((p: any) => p.id === wid)?.name || wid)
    .join(' & ');

  const got =
    allWinnerIds.length === 1 && primaryWinnerId
      ? totalPot - (round.contrib?.[primaryWinnerId] || 0)
      : totalPot;

  sessionDoc.debts = debts;
  sessionDoc.wins = wins;
  sessionDoc.tot = {
    rounds: (sessionDoc.tot?.rounds || 0) + 1,
    total: (sessionDoc.tot?.total || 0) + totalPot,
    big: Math.max(sessionDoc.tot?.big || 0, totalPot),
  };
  sessionDoc.hist = [
    { no: round.no, winner: winningNames || 'Winner', pot: totalPot, got, pays },
    ...(sessionDoc.hist || []),
  ].slice(0, 30);

  round.winner = primaryWinnerId;
  round.winners = allWinnerIds;
  round.potWinners = potWinners;
  round.settled = true;
  appendActivityLog(sessionDoc, `🏆 Round #${round.no} settled · Winner: ${winningNames || 'Winner'} (${money(totalPot)})`);
  resetReadyAndPromoteQueuedGo(sessionDoc);
  sessionDoc.markModified('players');
  sessionDoc.markModified('debts');
  sessionDoc.markModified('wins');
  sessionDoc.markModified('tot');
  sessionDoc.markModified('hist');
}

function settleBlackjackRoundOnServer(sessionDoc: any, round: any, players: any[]) {
  if (!round || round.phase !== 'result' || round.settled || !round.bjOutcomes) return;
  const debts = { ...(sessionDoc.debts || {}) };
  const wins = { ...(sessionDoc.wins || {}) };
  const pays: { name: string; amt: number }[] = [];
  let totalPotMoved = 0;
  let totalPlayerNet = 0;
  const winningNames: string[] = [];

  const dealerId: string = round.dealer || sessionDoc.bjDealerId || 'house';
  const dealerPlayer = dealerId !== 'house' ? players.find((p: any) => p.id === dealerId) : null;
  const dealerName = dealerPlayer?.name || 'Casino House';

  const applyDebtTransfer = (debtorId: string, creditorId: string, amt: number) => {
    if (!debtorId || !creditorId || debtorId === creditorId || amt <= 0) return;
    const k = `${debtorId}|${creditorId}`;
    const rk = `${creditorId}|${debtorId}`;
    const rev = debts[rk] || 0;
    if (rev >= amt) {
      debts[rk] = rev - amt;
      if (!debts[rk]) delete debts[rk];
    } else {
      const rem = amt - rev;
      delete debts[rk];
      debts[k] = (debts[k] || 0) + rem;
    }
  };

  for (const pid of round.parts || []) {
    const out = round.bjOutcomes[pid];
    if (!out) continue;
    const bet = round.contrib?.[pid] || round.stake || 100;
    const pl = players.find((p: any) => p.id === pid);
    const pName = pl?.name || pid;

    totalPlayerNet += out.net || 0;

    if (sessionDoc.balanceMode && pl) {
      // Bet was already deducted from pl.balance on deal / double-down
      if (out.outcome === 'push') {
        pl.balance = (pl.balance || 0) + bet;
      } else if (out.outcome === 'win' || out.outcome === 'blackjack') {
        pl.balance = (pl.balance || 0) + bet + out.net;
      } else if ((pl.balance || 0) <= 0) {
        pl.sit = true;
      }
    }

    if (out.net > 0) {
      wins[pid] = (wins[pid] || 0) + out.net;
      winningNames.push(pName);
      totalPotMoved += out.net;
      // Dealer owes player
      applyDebtTransfer(dealerId, pid, out.net);
    } else if (out.net < 0) {
      const lossAmt = Math.abs(out.net);
      pays.push({ name: pName, amt: lossAmt });
      totalPotMoved += lossAmt;
      // Player owes dealer
      applyDebtTransfer(pid, dealerId, lossAmt);
    }
  }

  const dealerNet = -totalPlayerNet;
  if (dealerPlayer) {
    if (sessionDoc.balanceMode) {
      dealerPlayer.balance = Math.max(0, (dealerPlayer.balance || 0) + dealerNet);
    }
    if (dealerNet > 0) {
      wins[dealerPlayer.id] = (wins[dealerPlayer.id] || 0) + dealerNet;
    }
  }

  const winnerSummary =
    winningNames.length > 0
      ? winningNames.join(', ')
      : dealerNet > 0
      ? `${dealerName} (Dealer)`
      : 'Push (Break-Even)';

  sessionDoc.debts = debts;
  sessionDoc.wins = wins;
  sessionDoc.tot = {
    rounds: (sessionDoc.tot?.rounds || 0) + 1,
    total: (sessionDoc.tot?.total || 0) + totalPotMoved,
    big: Math.max(sessionDoc.tot?.big || 0, totalPotMoved),
  };
  sessionDoc.hist = [
    { no: round.no, winner: winnerSummary, pot: totalPotMoved, got: totalPotMoved, pays },
    ...(sessionDoc.hist || []),
  ].slice(0, 30);

  round.settled = true;
  appendActivityLog(
    sessionDoc,
    `🏆 Blackjack Hand #${round.no} settled · Dealer: ${dealerName} (${dealerNet >= 0 ? '+' : ''}${money(dealerNet)}) · Winner: ${winnerSummary}`
  );

  // If Rotational Dealer is enabled, advance bjDealerId to the next seated player for the upcoming hand
  if (sessionDoc.bjDealerRotation) {
    const seatedPlayers = players.filter((p: any) => !p.sit && !p.isGameOperator);
    if (seatedPlayers.length >= 2) {
      const curIdx = seatedPlayers.findIndex((p: any) => p.id === dealerId);
      const nextDealer = seatedPlayers[(curIdx + 1 + seatedPlayers.length) % seatedPlayers.length];
      if (nextDealer) {
        sessionDoc.bjDealerId = nextDealer.id;
        appendActivityLog(sessionDoc, `🔁 Rotational Dealer advanced to ${nextDealer.name} for the next hand`);
      }
    }
  }

  resetReadyAndPromoteQueuedGo(sessionDoc);
  sessionDoc.markModified('players');
  sessionDoc.markModified('debts');
  sessionDoc.markModified('wins');
  sessionDoc.markModified('tot');
  sessionDoc.markModified('hist');
}

function takeRoundSnapshot(rd: any, players: any[]) {
  if (!rd) return;
  rd.stack = rd.stack || [];
  rd.stack.push(
    JSON.stringify({
      ...rd,
      stack: undefined,
      _plBals: players.map((p: any) => ({ id: p.id, balance: p.balance })),
    })
  );
  if (rd.stack.length > 25) {
    rd.stack = rd.stack.slice(-25);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authSession = await getServerSession(authOptions);
    if (!authSession?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized. Sign in required.' }, { status: 401 });
    }
    const userEmail = authSession.user.email;

    await connectDB();
    const sessionDoc = await Session.findById(params.id);
    if (!sessionDoc) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }

    syncGameOperatorPresence(sessionDoc, userEmail);

    const ownerEmail = getOwnerEmail(sessionDoc);
    const goEmail = getGoEmail(sessionDoc);
    const isOwner = userEmail.toLowerCase() === ownerEmail;
    const isGO = userEmail.toLowerCase() === goEmail;
    const isHost = sessionDoc.sessionMode === 'online' ? isGO : (isOwner || isGO);

    const body = await request.json();
    const { action, amount, cardIndex } = body;

    const players: any[] = sessionDoc.players || [];
    const requestingPlayer = players.find(
      (p: any) => p.userId && p.userId.toLowerCase() === userEmail.toLowerCase()
    );

    let round = sessionDoc.round;
    const isRoundActive = Boolean(round && !round.settled && round.phase !== 'result');

    switch (action) {
      /* ──────────────── 0. ROLE, READY & GAME OPERATOR MANAGEMENT ──────────────── */
      case 'TOGGLE_READY': {
        if (!requestingPlayer || requestingPlayer.isGameOperator) {
          return NextResponse.json({ error: 'Only active players can toggle Ready status.' }, { status: 403 });
        }
        if (isRoundActive) {
          return NextResponse.json({ error: 'Wait until the current round finishes to ready up.' }, { status: 400 });
        }
        if (body.betAmount !== undefined) {
          sessionDoc.playerBets = sessionDoc.playerBets || {};
          sessionDoc.playerBets[requestingPlayer.id] = Math.max(1, Math.floor(Number(body.betAmount) || 50));
          sessionDoc.markModified('playerBets');
        }
        const readyMap = { ...(sessionDoc.readyPlayers || {}) };
        const nextReady = !readyMap[requestingPlayer.id];
        readyMap[requestingPlayer.id] = nextReady;
        sessionDoc.readyPlayers = readyMap;
        const myWager = sessionDoc.playerBets?.[requestingPlayer.id];
        const wagerTxt = myWager ? ` (Wager: ${money(myWager)})` : '';
        appendActivityLog(
          sessionDoc,
          nextReady
            ? `👍 ${requestingPlayer.name} is READY${wagerTxt} for the next round`
            : `⏳ ${requestingPlayer.name} un-readied`
        );
        promoteQueuedGameOperatorIfIdle(sessionDoc);
        sessionDoc.markModified('readyPlayers');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'SET_PLAYER_BET': {
        const targetPid = body.targetPlayerId || requestingPlayer?.id;
        const targetPl = players.find((p: any) => p.id === targetPid);
        if (!targetPl) {
          return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
        }
        if (targetPl.id !== requestingPlayer?.id && !isGO && !isOwner) {
          return NextResponse.json({ error: 'Permission denied.' }, { status: 403 });
        }
        if (isRoundActive) {
          return NextResponse.json({ error: 'Cannot change wager during an active hand.' }, { status: 400 });
        }
        const amt = Math.max(1, Math.floor(Number(body.betAmount) || 50));
        sessionDoc.playerBets = sessionDoc.playerBets || {};
        sessionDoc.playerBets[targetPl.id] = amt;
        sessionDoc.markModified('playerBets');
        appendActivityLog(sessionDoc, `🪙 ${targetPl.name} set Blackjack wager to ${money(amt)}`);
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'TOGGLE_SIT': {
        const targetPid = body.targetPlayerId || requestingPlayer?.id;
        const targetPl = players.find((p: any) => p.id === targetPid);
        if (!targetPl) {
          return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
        }
        if (targetPl.id !== requestingPlayer?.id && !isGO && !isOwner) {
          return NextResponse.json({ error: 'Permission denied.' }, { status: 403 });
        }
        if (isRoundActive) {
          return NextResponse.json({ error: 'Cannot sit out or rejoin during an active hand.' }, { status: 400 });
        }
        targetPl.sit = !targetPl.sit;
        if (targetPl.sit && sessionDoc.readyPlayers?.[targetPl.id]) {
          const readyMap = { ...(sessionDoc.readyPlayers || {}) };
          delete readyMap[targetPl.id];
          sessionDoc.readyPlayers = readyMap;
          sessionDoc.markModified('readyPlayers');
        }
        appendActivityLog(
          sessionDoc,
          targetPl.sit
            ? `⏸ ${targetPl.name} chose to skip the next round (sitting out)`
            : `▶️ ${targetPl.name} rejoined table for the next round`
        );
        sessionDoc.markModified('players');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'OPEN_PRE_ROUND_LOBBY': {
        if (!isHost && !isOwner) {
          return NextResponse.json({ error: 'Only the Game Operator can advance to the pre-round lobby.' }, { status: 403 });
        }
        if (isRoundActive) {
          return NextResponse.json({ error: 'Cannot clear an active round.' }, { status: 400 });
        }
        sessionDoc.round = null;
        promoteQueuedGameOperatorIfIdle(sessionDoc);
        sessionDoc.markModified('round');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'TRANSFER_GO': {
        if (!isGO && !isOwner) {
          return NextResponse.json({ error: 'Only the current Game Operator or Session Owner can transfer the Game Operator role.' }, { status: 403 });
        }
        if (isRoundActive) {
          return NextResponse.json(
            { error: 'Game Operator role can only be transferred before a round starts or after a round ends.' },
            { status: 400 }
          );
        }
        const targetPlayerId = body.targetPlayerId;
        const targetPlayer = players.find((p: any) => p.id === targetPlayerId && !p.isGameOperator);
        if (!targetPlayer || !targetPlayer.userId) {
          return NextResponse.json({ error: 'Select a valid player to transfer the Game Operator role to.' }, { status: 400 });
        }
        const prevGoPlayer = players.find((p: any) => p.isGameOperator || p.userId?.toLowerCase() === goEmail);
        const prevName = prevGoPlayer?.name || 'Previous Operator';
        assignNewGameOperator(
          sessionDoc,
          targetPlayer.userId,
          `🔄 ${prevName} transferred Game Operator role to ${targetPlayer.name} (${prevName} joined the table as a Player)`
        );
        // Clear ready status for transferred players
        const readyMap = { ...(sessionDoc.readyPlayers || {}) };
        delete readyMap[targetPlayer.id];
        sessionDoc.readyPlayers = readyMap;
        sessionDoc.markModified('readyPlayers');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'GO_DISCONNECT': {
        if (!isGO && !isOwner) {
          return NextResponse.json({ error: 'Only the Game Operator can trigger operator disconnect.' }, { status: 403 });
        }
        const candidatePlayers = players.filter(
          (p: any) => !p.isGameOperator && p.userId && p.userId.toLowerCase() !== goEmail
        );
        if (candidatePlayers.length > 0 && sessionDoc.goDisconnectEvent?.status !== 'volunteering') {
          const now = Date.now();
          sessionDoc.goDisconnectEvent = {
            disconnectedAt: now,
            expiresAt: now + 15000,
            status: 'volunteering',
          };
          sessionDoc.goLastHeartbeat = 0;
          appendActivityLog(
            sessionDoc,
            `⚠️ Game Operator stepped away / disconnected! 15s volunteer window opened for all players.`
          );
          sessionDoc.markModified('goDisconnectEvent');
          await sessionDoc.save();
        }
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'VOLUNTEER_GO': {
        if (!requestingPlayer || !requestingPlayer.userId) {
          return NextResponse.json({ error: 'You must be a seated player to volunteer as Game Operator.' }, { status: 403 });
        }
        if (!sessionDoc.goDisconnectEvent || sessionDoc.goDisconnectEvent.status !== 'volunteering') {
          return NextResponse.json({ error: 'Another player has already become or been queued as Game Operator.' }, { status: 400 });
        }
        if (isRoundActive) {
          sessionDoc.nextGameOperatorUserId = requestingPlayer.userId;
          sessionDoc.goDisconnectEvent = {
            ...sessionDoc.goDisconnectEvent,
            status: 'queued',
            volunteeredByUserId: requestingPlayer.userId,
            volunteeredByName: requestingPlayer.name,
          };
          appendActivityLog(
            sessionDoc,
            `🙋 ${requestingPlayer.name} volunteered for Game Operator! Queued to become Game Operator starting next round.`
          );
          sessionDoc.markModified('goDisconnectEvent');
        } else {
          assignNewGameOperator(
            sessionDoc,
            requestingPlayer.userId,
            `🙋 ${requestingPlayer.name} volunteered and is now the Game Operator!`
          );
        }
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'CHECK_GO_TIMEOUT': {
        syncGameOperatorPresence(sessionDoc, userEmail);
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'PLAYER_DISCONNECT': {
        if (requestingPlayer) {
          requestingPlayer.lastSeenAt = 0;
          requestingPlayer.isConnected = false;
          requestingPlayer.isOnline = false;
          if (!isRoundActive && sessionDoc.readyPlayers && requestingPlayer.id in sessionDoc.readyPlayers) {
            delete sessionDoc.readyPlayers[requestingPlayer.id];
            sessionDoc.markModified('readyPlayers');
          }
          if (!requestingPlayer.isGameOperator) {
            appendActivityLog(sessionDoc, `🔌 ${requestingPlayer.name} disconnected`);
          }
          sessionDoc.markModified('players');
        }
        if (isGO || isOwner) {
          const now = Date.now();
          sessionDoc.goDisconnectedAt = now;
          sessionDoc.goLastHeartbeat = 0;
          appendActivityLog(
            sessionDoc,
            `⚠️ Game Operator disconnected · 1 min reconnect grace period started`
          );
          sessionDoc.markModified('goDisconnectedAt');
        }
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'SEND_CHAT': {
        const rawText = typeof body.text === 'string' ? body.text.trim() : '';
        if (!rawText) {
          return NextResponse.json({ error: 'Chat message cannot be empty.' }, { status: 400 });
        }
        const cleanText = rawText.slice(0, 240);
        const senderName =
          sessionDoc.sessionMode === 'online' && isHost
            ? '🎩 Game Operator'
            : requestingPlayer?.name || authSession.user.name || userEmail.split('@')[0] || 'Player';
        const senderId =
          sessionDoc.sessionMode === 'online' && isHost
            ? '__go__'
            : requestingPlayer?.id || userEmail;
        const senderRole: 'go' | 'player' = isHost ? 'go' : 'player';

        const chatMessages = Array.isArray(sessionDoc.chatMessages) ? [...sessionDoc.chatMessages] : [];
        chatMessages.push({
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          senderId,
          senderName,
          senderRole,
          text: cleanText,
          createdAt: Date.now(),
        });
        sessionDoc.chatMessages = chatMessages.slice(-100);
        sessionDoc.markModified('chatMessages');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── KICK PLAYER (Game Operator / Owner Only) ──────────────── */
      case 'KICK_PLAYER': {
        if (!isGO && !isOwner) {
          return NextResponse.json(
            { error: 'Only the Game Operator or Session Owner can kick players.' },
            { status: 403 }
          );
        }
        const targetPlayerId = body.targetPlayerId || body.playerId;
        if (!targetPlayerId) {
          return NextResponse.json({ error: 'Player ID is required to kick.' }, { status: 400 });
        }
        const targetIndex = players.findIndex((p: any) => p.id === targetPlayerId);
        if (targetIndex < 0) {
          return NextResponse.json({ error: 'Player not found in this room.' }, { status: 404 });
        }
        const targetPlayer = players[targetIndex];
        if (targetPlayer.isGameOperator) {
          return NextResponse.json({ error: 'Cannot kick the Game Operator.' }, { status: 400 });
        }
        if (targetPlayer.userId && targetPlayer.userId.toLowerCase() === ownerEmail) {
          return NextResponse.json({ error: 'Cannot kick the Session Owner.' }, { status: 400 });
        }

        const kickedName = targetPlayer.name;

        // Fold the player if currently in an active round
        if (round && round.parts && round.parts.includes(targetPlayerId)) {
          if (!round.folded) round.folded = {};
          round.folded[targetPlayerId] = 1;
          sessionDoc.markModified('round');
        }

        // Remove from players array
        players.splice(targetIndex, 1);
        sessionDoc.markModified('players');

        // Clear ready state
        if (sessionDoc.readyPlayers && targetPlayerId in sessionDoc.readyPlayers) {
          delete sessionDoc.readyPlayers[targetPlayerId];
          sessionDoc.markModified('readyPlayers');
        }

        // Clean up any pending chip requests
        if (Array.isArray(sessionDoc.chipRequests)) {
          sessionDoc.chipRequests = sessionDoc.chipRequests.filter(
            (r: any) => r.playerId !== targetPlayerId
          );
          sessionDoc.markModified('chipRequests');
        }

        // Audit log
        appendActivityLog(sessionDoc, `👢 ${kickedName} was kicked from the session by Game Operator`);

        // System notification in Live Chat
        const chatMessages = Array.isArray(sessionDoc.chatMessages) ? [...sessionDoc.chatMessages] : [];
        chatMessages.push({
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          senderId: '__system__',
          senderName: 'System',
          senderRole: 'go',
          text: `📢 ${kickedName} was kicked from the room by the Game Operator.`,
          createdAt: Date.now(),
        });
        sessionDoc.chatMessages = chatMessages.slice(-100);
        sessionDoc.markModified('chatMessages');

        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── 1. SET USERNAME / RENAME ──────────────── */
      case 'SET_USERNAME': {
        const newName = body.name?.trim();
        if (!newName || newName.length > 20) {
          return NextResponse.json({ error: 'Username must be between 1 and 20 characters.' }, { status: 400 });
        }
        const targetPlayerId = body.playerId;
        const targetPlayer =
          isHost && targetPlayerId
            ? players.find((p: any) => p.id === targetPlayerId)
            : requestingPlayer;

        if (!targetPlayer) {
          return NextResponse.json({ error: 'Player not found in room.' }, { status: 404 });
        }

        const oldName = targetPlayer.name;
        targetPlayer.name = newName;
        appendActivityLog(sessionDoc, `✏️ ${oldName} renamed to ${newName}`);
        sessionDoc.markModified('players');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── 2. CHIP REQUESTS & ADMIN CHIP MANAGEMENT ──────────────── */
      case 'REQUEST_CHIPS': {
        if (!requestingPlayer || requestingPlayer.isGameOperator) {
          return NextResponse.json({ error: 'You must be an active player in this room to request chips.' }, { status: 403 });
        }
        if (isRoundActive) {
          return NextResponse.json(
            { error: 'Chip requests can only be made before a round starts or after a round ends — not during an active round.' },
            { status: 400 }
          );
        }
        const reqAmt = Math.max(10, Math.floor(Number(amount) || 0));
        const chipRequests = Array.isArray(sessionDoc.chipRequests) ? [...sessionDoc.chipRequests] : [];
        chipRequests.push({
          id: 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          playerId: requestingPlayer.id,
          playerName: requestingPlayer.name,
          amount: reqAmt,
          status: 'pending',
          createdAt: Date.now(),
        });
        sessionDoc.chipRequests = chipRequests;
        appendActivityLog(sessionDoc, `🪙 ${requestingPlayer.name} requested ${money(reqAmt)} in chips from Game Operator`);
        sessionDoc.markModified('chipRequests');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'RESOLVE_CHIP_REQUEST': {
        if (!isHost) {
          return NextResponse.json({ error: 'Only the Game Operator can approve or reject chip requests.' }, { status: 403 });
        }
        const { requestId, decision } = body; // 'approved' | 'rejected'
        const chipRequests = Array.isArray(sessionDoc.chipRequests) ? [...sessionDoc.chipRequests] : [];
        const reqIdx = chipRequests.findIndex((r: any) => r.id === requestId);
        if (reqIdx < 0) {
          return NextResponse.json({ error: 'Chip request not found.' }, { status: 404 });
        }
        const targetReq = chipRequests[reqIdx];
        if (decision === 'approved') {
          const pl = players.find((p: any) => p.id === targetReq.playerId);
          if (pl) {
            const currentBal = pl.balance || 0;
            pl.balance = currentBal + targetReq.amount;
            if (currentBal <= 0 && pl.balance > 0) {
              pl.sit = false;
            }
          }
          appendActivityLog(sessionDoc, `✅ Game Operator approved ${money(targetReq.amount)} chip request for ${targetReq.playerName}`);
        } else {
          appendActivityLog(sessionDoc, `❌ Game Operator declined ${money(targetReq.amount)} chip request from ${targetReq.playerName}`);
        }
        chipRequests.splice(reqIdx, 1);
        sessionDoc.chipRequests = chipRequests;
        sessionDoc.markModified('chipRequests');
        sessionDoc.markModified('players');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'ADMIN_ADJUST_CHIPS': {
        if (!isHost) {
          return NextResponse.json({ error: 'Only the Game Operator can overwrite or adjust chips.' }, { status: 403 });
        }
        if (isRoundActive) {
          return NextResponse.json(
            { error: 'Chip balances can only be adjusted before a round starts or after a round ends.' },
            { status: 400 }
          );
        }
        const { playerId, mode } = body; // mode: 'credit' | 'debit' | 'exact'
        const adjAmt = Math.max(0, Math.floor(Number(amount) || 0));
        const pl = players.find((p: any) => p.id === playerId);
        if (!pl) {
          return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
        }
        const currentBal = pl.balance || 0;
        if (mode === 'exact') {
          pl.balance = adjAmt;
          pl.sit = adjAmt <= 0 ? true : false;
          appendActivityLog(sessionDoc, `🏦 Game Operator set ${pl.name}'s wallet balance to ${money(adjAmt)}`);
        } else if (mode === 'credit') {
          pl.balance = currentBal + adjAmt;
          if (currentBal <= 0 && pl.balance > 0) pl.sit = false;
          appendActivityLog(sessionDoc, `🏦 Game Operator credited +${money(adjAmt)} to ${pl.name}'s wallet (New: ${money(pl.balance)})`);
        } else if (mode === 'debit') {
          pl.balance = Math.max(0, currentBal - adjAmt);
          if (pl.balance <= 0) pl.sit = true;
          appendActivityLog(sessionDoc, `🏦 Game Operator debited -${money(adjAmt)} from ${pl.name}'s wallet (New: ${money(pl.balance)})`);
        }
        sessionDoc.markModified('players');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── 2B. BLACKJACK DEALER, ROTATION & DEALER REQUESTS ──────────────── */
      case 'SET_BJ_DEALER': {
        if (!isHost) {
          return NextResponse.json({ error: 'Only the Game Operator can change the Blackjack Dealer or rotation.' }, { status: 403 });
        }
        if (isRoundActive) {
          return NextResponse.json(
            { error: 'Blackjack Dealer and rotation can only be changed before or after a hand.' },
            { status: 400 }
          );
        }
        if (body.dealerPlayerId !== undefined) {
          sessionDoc.bjDealerId = body.dealerPlayerId;
          const dName =
            body.dealerPlayerId === 'house'
              ? 'Casino House'
              : players.find((p: any) => p.id === body.dealerPlayerId)?.name || body.dealerPlayerId;
          appendActivityLog(sessionDoc, `🏦 Game Operator set Blackjack Dealer to ${dName}`);
        }
        if (body.bjDealerRotation !== undefined) {
          sessionDoc.bjDealerRotation = Boolean(body.bjDealerRotation);
          appendActivityLog(
            sessionDoc,
            sessionDoc.bjDealerRotation
              ? '🔁 Game Operator enabled Rotational Dealer mode (rotates every hand)'
              : '📌 Game Operator disabled Rotational Dealer mode (keeps current dealer)'
          );
        }
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'REQUEST_DEALER': {
        if (isRoundActive) {
          return NextResponse.json(
            { error: 'Dealer role can only be requested between rounds.' },
            { status: 400 }
          );
        }
        if (!requestingPlayer || requestingPlayer.isGameOperator) {
          return NextResponse.json({ error: 'Only seated players can request to be Dealer.' }, { status: 403 });
        }
        const readyMap = sessionDoc.readyPlayers || {};
        if (readyMap[requestingPlayer.id]) {
          return NextResponse.json(
            { error: 'Unready first if you want to request to be the Dealer before the hand starts.' },
            { status: 400 }
          );
        }
        const dealerRequests = Array.isArray(sessionDoc.dealerRequests) ? [...sessionDoc.dealerRequests] : [];
        if (dealerRequests.some((r: any) => r.playerId === requestingPlayer.id && r.status === 'pending')) {
          return NextResponse.json({ error: 'You already have a pending Dealer request.' }, { status: 400 });
        }
        dealerRequests.push({
          id: 'dreq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          playerId: requestingPlayer.id,
          playerName: requestingPlayer.name,
          status: 'pending',
          createdAt: Date.now(),
        });
        sessionDoc.dealerRequests = dealerRequests;
        appendActivityLog(sessionDoc, `🎩 ${requestingPlayer.name} requested to be the Blackjack Dealer`);
        sessionDoc.markModified('dealerRequests');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'RESOLVE_DEALER_REQUEST': {
        if (!isHost) {
          return NextResponse.json({ error: 'Only the Game Operator can approve or decline Dealer requests.' }, { status: 403 });
        }
        if (isRoundActive) {
          return NextResponse.json({ error: 'Wait until the hand finishes to change the Dealer.' }, { status: 400 });
        }
        const { requestId, decision } = body; // 'approved' | 'rejected'
        const dealerRequests = Array.isArray(sessionDoc.dealerRequests) ? [...sessionDoc.dealerRequests] : [];
        const reqIdx = dealerRequests.findIndex((r: any) => r.id === requestId);
        if (reqIdx < 0) {
          return NextResponse.json({ error: 'Dealer request not found.' }, { status: 404 });
        }
        const targetReq = dealerRequests[reqIdx];
        if (decision === 'approved') {
          sessionDoc.bjDealerId = targetReq.playerId;
          appendActivityLog(sessionDoc, `✅ Game Operator approved ${targetReq.playerName} as the Blackjack Dealer`);
          // Clear all pending dealer requests once one is approved
          sessionDoc.dealerRequests = [];
        } else {
          dealerRequests.splice(reqIdx, 1);
          sessionDoc.dealerRequests = dealerRequests;
          appendActivityLog(sessionDoc, `❌ Game Operator declined Dealer request from ${targetReq.playerName}`);
        }
        sessionDoc.markModified('dealerRequests');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── 3. DEAL / START ROUND (ALL 4 GAMES) ──────────────── */
      case 'DEAL':
      case 'START_ROUND': {
        if (!isHost) {
          return NextResponse.json({ error: 'Only the Game Operator can deal cards and start a round.' }, { status: 403 });
        }

        if (sessionDoc.goDisconnectEvent?.status === 'volunteering') {
          return NextResponse.json(
            { error: 'Game Operator role is currently waiting for a volunteer.' },
            { status: 400 }
          );
        }

        promoteQueuedGameOperatorIfIdle(sessionDoc);

        const currentGoEmail = getGoEmail(sessionDoc);
        const now = Date.now();
        const disconnectedNames: string[] = [];

        if (sessionDoc.sessionMode === 'online') {
          players.forEach((p: any) => {
            if (p.isGameOperator || (p.userId && p.userId.toLowerCase() === currentGoEmail)) return;
            const connected = isPlayerConnected(p, now);
            p.isConnected = connected;
            p.isOnline = connected;
            if (!connected) {
              disconnectedNames.push(p.name);
            }
          });
          sessionDoc.markModified('players');
        }

        if (sessionDoc.balanceMode) {
          players.forEach((p: any) => {
            if (!p.isGameOperator && (p.balance || 0) <= 0) p.sit = true;
          });
        }
        const activePlayers = players.filter(
          (p: any) =>
            !p.sit &&
            !p.isGameOperator &&
            (!p.userId || p.userId.toLowerCase() !== currentGoEmail) &&
            (sessionDoc.sessionMode !== 'online' || p.isConnected !== false)
        );
        const minRequired = sessionDoc.gameType === 'bj' ? 1 : 2;
        if (activePlayers.length < minRequired) {
          return NextResponse.json(
            {
              error:
                disconnectedNames.length > 0
                  ? `At least ${minRequired} connected player(s) required to deal (Disconnected: ${disconnectedNames.join(', ')}).`
                  : `At least ${minRequired} active player(s) (excluding Game Operator) required to deal.`,
            },
            { status: 400 }
          );
        }

        if (sessionDoc.sessionMode === 'online') {
          const readyMap = sessionDoc.readyPlayers || {};
          const unreadyPlayers = activePlayers.filter((p: any) => !readyMap[p.id]);
          if (unreadyPlayers.length > 0) {
            const names = unreadyPlayers.map((p: any) => p.name).join(', ');
            return NextResponse.json(
              { error: `Waiting for connected players to press 👍 Ready before dealing: ${names}` },
              { status: 400 }
            );
          }
          if (disconnectedNames.length > 0) {
            appendActivityLog(
              sessionDoc,
              `🔌 Skipped disconnected player(s) for Round #${(sessionDoc.rno || 0) + 1}: ${disconnectedNames.join(', ')}`
            );
          }
        }

        const gameType = sessionDoc.gameType;
        const newRno = (sessionDoc.rno || 0) + 1;
        const dealerIdx = ((sessionDoc.dealerIdx ?? -1) + 1) % activePlayers.length;
        sessionDoc.dealerIdx = dealerIdx;

        const bootAmt = Math.max(
          0,
          Math.floor(Number(body.bootAmt ?? sessionDoc.ante?.amt ?? (gameType === 'tp' ? 10 : 0)))
        );
        const bootMode = (body.bootMode || sessionDoc.ante?.mode) === 'admin' ? 'admin' : 'each';
        sessionDoc.ante = { mode: bootMode, amt: bootAmt };
        sessionDoc.markModified('ante');

        const hostPlayer =
          players.find(
            (p: any) => p.isGameOperator || (p.userId && p.userId.toLowerCase() === currentGoEmail)
          ) ||
          players.find(
            (p: any) => p.userId && p.userId.toLowerCase() === sessionDoc.hostUserId?.toLowerCase()
          ) ||
          activePlayers[0];

        if (gameType === 'pk') {
          let deck = shuffleDeck(createStandardDeck(1));
          const hands: Record<string, any[]> = {};
          for (const pl of activePlayers) {
            const d = dealCards(deck, 2);
            hands[pl.id] = d.dealt;
            deck = d.remaining;
          }
          const boardDraw = dealCards(deck, 5);
          const boardCards = boardDraw.dealt;
          deck = boardDraw.remaining;

          const started = startOnlinePokerRound({
            players,
            rno: newRno,
            dealerIdx,
            balanceMode: !!sessionDoc.balanceMode,
            hands,
            boardCards,
            deck,
            minBet: Math.max(1, bootMode === 'admin' && bootAmt > 0 ? Math.floor(bootAmt / activePlayers.length) || 1 : (bootAmt || 5)),
            ante: { mode: bootMode, amt: bootAmt },
            adminPlayerId: hostPlayer?.id,
          });
          if (!started) {
            return NextResponse.json({ error: 'Unable to start poker hand.' }, { status: 400 });
          }
          sessionDoc.players = started.players;
          round = started.round;
        } else if (gameType === 'tp') {
          let deck = shuffleDeck(createStandardDeck(1));
          const hands: Record<string, any[]> = {};
          const playerStatus: Record<string, 'blind' | 'seen'> = {};
          const contrib: Record<string, number> = {};
          const allIn: Record<string, boolean> = {};
          const rawAnte = bootMode === 'admin' && bootAmt > 0
            ? Math.floor(bootAmt / activePlayers.length)
            : bootAmt;
          const baseStake = Math.max(1, rawAnte > 0 ? rawAnte : 5);

          for (const pl of activePlayers) {
            const d = dealCards(deck, 3);
            hands[pl.id] = d.dealt;
            deck = d.remaining;
            playerStatus[pl.id] = 'blind';
            contrib[pl.id] = 0;
          }

          let bootLogMsg = 'Enter how much you want to bet on your turn';
          if (bootAmt > 0) {
            if (bootMode === 'admin' && hostPlayer) {
              let actualSeed = bootAmt;
              if (sessionDoc.balanceMode && typeof hostPlayer.balance === 'number') {
                actualSeed = Math.min(hostPlayer.balance, bootAmt);
                hostPlayer.balance = Math.max(0, hostPlayer.balance - actualSeed);
                if (hostPlayer.balance === 0 && actualSeed > 0 && activePlayers.some((p: any) => p.id === hostPlayer.id)) {
                  allIn[hostPlayer.id] = true;
                }
              }
              if (actualSeed > 0) {
                contrib['__pot_seed__'] = actualSeed;
                bootLogMsg = `👑 Initial pot ${money(actualSeed)} funded from ${hostPlayer.name}'s wallet`;
              }
            } else {
              for (const pl of activePlayers) {
                let actualBoot = bootAmt;
                if (sessionDoc.balanceMode && typeof pl.balance === 'number') {
                  actualBoot = Math.min(pl.balance, bootAmt);
                  pl.balance = Math.max(0, pl.balance - actualBoot);
                  if (pl.balance === 0 && actualBoot > 0) allIn[pl.id] = true;
                }
                contrib[pl.id] = actualBoot;
              }
              bootLogMsg = `🪙 Boot ${money(bootAmt)} collected from each player`;
            }
          }

          let firstTurnId = activePlayers[(dealerIdx + 1) % activePlayers.length].id;
          for (let k = 1; k <= activePlayers.length; k++) {
            const cand = activePlayers[(dealerIdx + k) % activePlayers.length].id;
            if (!allIn[cand]) {
              firstTurnId = cand;
              break;
            }
          }

          round = {
            no: newRno,
            phase: 'bet',
            parts: activePlayers.map((p: any) => p.id),
            contrib,
            folded: {},
            turn: firstTurnId,
            stake: baseStake,
            stack: [],
            log: [
              `Round #${newRno} dealt · All players start BLIND 🙈`,
              bootLogMsg,
            ],
            lastBy: 'Dealer',
            winner: null,
            hands,
            deck,
            allIn,
            potWinners: {},
            playerStatus,
            revealedHands: {},
            handEvaluations: {},
            dealer: activePlayers[dealerIdx].id,
          };

          const canActAfterBoot = activePlayers.filter((p: any) => !allIn[p.id]);
          if (canActAfterBoot.length <= 1) {
            round.phase = 'result';
            round.revealedHands = { ...hands };
            const tpEval = evaluateAllTeenPattiHands(hands, round.parts);
            round.handEvaluations = tpEval.evaluations;
            round.winner = tpEval.bestWinnerId;
            round.log.push('— Players All-In on Boot · Automatic Showdown! —');
            settleTeenPattiRoundOnServer(sessionDoc, round, players, tpEval.bestWinnerId);
          }
        } else if (gameType === 'rummy') {
          const handSize = sessionDoc.rummyConfig?.totalCards || 13;
          const decksCount = activePlayers.length * handSize > 44 ? 2 : 1;
          let deck = shuffleDeck(createStandardDeck(decksCount));
          const hands: Record<string, any[]> = {};

          for (const pl of activePlayers) {
            const d = dealCards(deck, handSize);
            hands[pl.id] = d.dealt;
            deck = d.remaining;
          }

          const jokerDraw = dealCards(deck, 1);
          const jokerCard = jokerDraw.dealt[0];
          deck = jokerDraw.remaining;

          const openDraw = dealCards(deck, 1);
          const openCard = openDraw.dealt[0];
          deck = openDraw.remaining;

          const ptVal = Number(body.pointValue) || 10;

          round = {
            no: newRno,
            phase: 'deal',
            parts: activePlayers.map((p: any) => p.id),
            contrib: {},
            folded: {},
            dropped: {},
            turn: activePlayers[0].id,
            stake: ptVal,
            stack: [],
            hands,
            deck,
            jokerCard,
            openCard,
            discardPile: [openCard],
            rummyStep: 'draw',
            revealedHands: {},
            winner: null,
            lastBy: 'Dealer',
            log: [
              `Deal #${newRno} (${handSize} cards) dealt · Wild Joker: ${jokerCard.rank}${jokerCard.suit} · Open Card: ${openCard.rank}${openCard.suit}`,
            ],
          };
        } else if (gameType === 'bj') {
          let deck = shuffleDeck(createStandardDeck(4));
          const hands: Record<string, any[]> = {};
          const contrib: Record<string, number> = {};
          const bjStatus: Record<string, 'playing' | 'stood' | 'busted' | 'blackjack' | 'doubled'> = {};
          const defaultBet = Math.max(10, Number(body.defaultBet) || 50);

          let dealerId = body.dealerPlayerId || sessionDoc.bjDealerId;
          if (!dealerId || (dealerId !== 'house' && !activePlayers.some((p: any) => p.id === dealerId))) {
            dealerId = activePlayers.length >= 2 ? activePlayers[0].id : 'house';
          }
          sessionDoc.bjDealerId = dealerId;
          if (body.bjDealerRotation !== undefined) {
            sessionDoc.bjDealerRotation = Boolean(body.bjDealerRotation);
          }
          sessionDoc.dealerRequests = [];
          sessionDoc.markModified('dealerRequests');

          const bettingPlayers =
            dealerId !== 'house' && activePlayers.length >= 2
              ? activePlayers.filter((p: any) => p.id !== dealerId)
              : activePlayers;

          const dealerDisplayName =
            dealerId === 'house'
              ? 'Casino House'
              : activePlayers.find((p: any) => p.id === dealerId)?.name || 'Dealer';

          const playerBets = sessionDoc.playerBets || body.playerBets || {};
          for (const pl of bettingPlayers) {
            const d = dealCards(deck, 2);
            hands[pl.id] = d.dealt;
            deck = d.remaining;

            const chosenBet = Math.max(1, Number(playerBets[pl.id]) || Number(body.playerBets?.[pl.id]) || defaultBet);
            let bet = chosenBet;
            if (sessionDoc.balanceMode && typeof pl.balance === 'number') {
              bet = Math.min(pl.balance, chosenBet);
              pl.balance = Math.max(0, pl.balance - bet);
            }
            contrib[pl.id] = bet;
            const ev = evaluateBlackjackHand(d.dealt);
            bjStatus[pl.id] = ev.isBlackjack ? 'blackjack' : 'playing';
          }

          const dealerDraw = dealCards(deck, 2);
          const dealerHand = dealerDraw.dealt;
          deck = dealerDraw.remaining;

          const firstPlaying = bettingPlayers.find((p: any) => bjStatus[p.id] === 'playing') || bettingPlayers[0];

          round = {
            no: newRno,
            phase: 'hand',
            parts: bettingPlayers.map((p: any) => p.id),
            contrib,
            folded: {},
            turn: firstPlaying.id,
            stake: Object.values(contrib).length ? Math.max(...Object.values(contrib)) : defaultBet,
            stack: [],
            hands,
            dealer: dealerId,
            dealerHand,
            dealerHoleRevealed: false,
            bjStatus,
            deck,
            revealedHands: {},
            winner: null,
            lastBy: dealerDisplayName,
            log: [
              `Blackjack Hand #${newRno} dealt · Dealer (${dealerDisplayName}) shows ${dealerHand[0].rank}${dealerHand[0].suit}`,
            ],
          };

          // If all players got natural Blackjack immediately, settle with dealer
          if (bettingPlayers.every((p: any) => bjStatus[p.id] !== 'playing')) {
            round = advanceBlackjackTurnOrSettle(round, players, !!sessionDoc.balanceMode);
            settleBlackjackRoundOnServer(sessionDoc, round, players);
          }
        }

        sessionDoc.round = round;
        sessionDoc.rno = newRno;
        sessionDoc.readyPlayers = {};
        appendActivityLog(sessionDoc, `🃏 Round #${newRno} dealt by Game Operator (${activePlayers.length} players)`);
        sessionDoc.markModified('readyPlayers');
        sessionDoc.markModified('round');
        sessionDoc.markModified('players');
        await sessionDoc.save();

        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── 4. POKER ACTIONS & SETTLEMENT ──────────────── */
      case 'POKER_ACT': {
        if (!round) {
          return NextResponse.json({ error: 'No active round.' }, { status: 400 });
        }
        const subAction = body.subAction as PokerActionType | 'showdown';
        if (subAction === 'showdown') {
          if (!isHost) {
            return NextResponse.json({ error: 'Only the Game Operator can force showdown.' }, { status: 403 });
          }
          takeRoundSnapshot(round, players);
          round.phase = 'result';
          round.winners = [];
          if (round.boardCards && Array.isArray(round.boardCards)) {
            round.board = round.boardCards.slice(0, 5);
          }
          if (round.hands) {
            const activeIds = (round.parts || []).filter((id: string) => !round.folded?.[id]);
            round.revealedHands = { ...(round.revealedHands || {}) };
            activeIds.forEach((id: string) => {
              round.revealedHands[id] = round.hands[id];
            });
            const evalRes = evaluateAllPokerHands(round.hands, round.board || [], activeIds);
            round.handEvaluations = evalRes.evaluations;
            round.winners = evalRes.bestPlayerIds;
          }
          sessionDoc.round = round;
          sessionDoc.markModified('round');
          await sessionDoc.save();
          return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
        }

        if (!isHost && (!requestingPlayer || round.turn !== requestingPlayer.id)) {
          return NextResponse.json({ error: 'It is not your turn.' }, { status: 403 });
        }

        takeRoundSnapshot(round, players);
        const next = applyPokerAction(
          {
            players,
            round,
            anteAmt: sessionDoc.ante?.amt || 10,
            balanceMode: !!sessionDoc.balanceMode,
          },
          subAction,
          amount !== undefined ? Number(amount) : undefined
        );

        if (!next) {
          return NextResponse.json({ error: 'Invalid poker action.' }, { status: 400 });
        }

        if (next.round?.log?.length) {
          appendActivityLog(sessionDoc, `♠️ ${next.round.log[next.round.log.length - 1]}`);
        }

        // System-controlled win conditions: auto-settle immediately when a winner or showdown is reached!
        if (next.round?.phase === 'result') {
          const autoPotWinners = next.round.potWinners || (next.round.winners?.length ? { main: next.round.winners } : {});
          const settled = settlePokerShowdown(
            {
              players: next.players,
              round: next.round,
              debts: sessionDoc.debts || {},
              wins: sessionDoc.wins || {},
              hist: sessionDoc.hist || [],
              tot: sessionDoc.tot || { rounds: 0, total: 0, big: 0 },
              balanceMode: !!sessionDoc.balanceMode,
              dealerIdx: sessionDoc.dealerIdx ?? 0,
            },
            autoPotWinners
          );

          sessionDoc.players = settled.players;
          sessionDoc.debts = settled.debts;
          sessionDoc.wins = settled.wins;
          sessionDoc.hist = settled.hist;
          sessionDoc.tot = settled.tot;
          sessionDoc.dealerIdx = settled.dealerIdx;
          sessionDoc.round = {
            ...next.round,
            phase: 'result',
            settled: true,
            winner: next.round.winners?.[0] || null,
            winners: next.round.winners || [],
          };
          resetReadyAndPromoteQueuedGo(sessionDoc);
          sessionDoc.markModified('players');
          sessionDoc.markModified('debts');
          sessionDoc.markModified('wins');
          sessionDoc.markModified('hist');
          sessionDoc.markModified('tot');
          sessionDoc.markModified('round');
          await sessionDoc.save();
          return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
        }

        sessionDoc.players = next.players;
        sessionDoc.round = next.round;
        sessionDoc.markModified('players');
        sessionDoc.markModified('round');
        await sessionDoc.save();

        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'POKER_SETTLE': {
        if (!round) {
          return NextResponse.json({ error: 'No active round to settle.' }, { status: 400 });
        }
        // If already auto-settled by system, simply clear the round state
        if (round.settled) {
          sessionDoc.round = null;
          promoteQueuedGameOperatorIfIdle(sessionDoc);
          sessionDoc.markModified('round');
          await sessionDoc.save();
          return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
        }
        if (!isHost) {
          return NextResponse.json({ error: 'Only the Game Operator can settle the showdown.' }, { status: 403 });
        }
        const potWinners = body.potWinners || round.potWinners || {};
        const settled = settlePokerShowdown(
          {
            players,
            round,
            debts: sessionDoc.debts || {},
            wins: sessionDoc.wins || {},
            hist: sessionDoc.hist || [],
            tot: sessionDoc.tot || { rounds: 0, total: 0, big: 0 },
            balanceMode: !!sessionDoc.balanceMode,
            dealerIdx: sessionDoc.dealerIdx ?? 0,
          },
          potWinners
        );

        sessionDoc.players = settled.players;
        sessionDoc.debts = settled.debts;
        sessionDoc.wins = settled.wins;
        sessionDoc.hist = settled.hist;
        sessionDoc.tot = settled.tot;
        sessionDoc.dealerIdx = settled.dealerIdx;
        sessionDoc.round = null;
        resetReadyAndPromoteQueuedGo(sessionDoc);
        sessionDoc.markModified('players');
        sessionDoc.markModified('debts');
        sessionDoc.markModified('wins');
        sessionDoc.markModified('hist');
        sessionDoc.markModified('tot');
        sessionDoc.markModified('round');
        await sessionDoc.save();

        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── 5. TEEN PATTI: SEE CARDS, ACT & SETTLE ──────────────── */
      case 'SEE_CARDS': {
        if (!round || !round.playerStatus) {
          return NextResponse.json({ error: 'Cannot see cards right now.' }, { status: 400 });
        }
        const targetId = isHost && body.playerId ? body.playerId : requestingPlayer?.id;
        if (!targetId) {
          return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
        }
        if (round.playerStatus[targetId] !== 'seen') {
          round.playerStatus[targetId] = 'seen';
          const pName = players.find((p: any) => p.id === targetId)?.name || targetId;
          round.log = round.log || [];
          round.log.push(`👁 ${pName} saw their cards (now SEEN)`);
          appendActivityLog(sessionDoc, `👁 ${pName} saw their cards (now SEEN)`);
          if (round.hands?.[targetId]) {
            round.handEvaluations = round.handEvaluations || {};
            round.handEvaluations[targetId] = evaluateTeenPattiHand(round.hands[targetId]);
          }
          sessionDoc.markModified('round');
          await sessionDoc.save();
        }
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'TP_ACT': {
        if (!round) {
          return NextResponse.json({ error: 'No active Teen Patti round.' }, { status: 400 });
        }
        if (!isHost && (!requestingPlayer || round.turn !== requestingPlayer.id)) {
          return NextResponse.json({ error: 'It is not your turn.' }, { status: 403 });
        }

        takeRoundSnapshot(round, players);
        const subAction = body.subAction; // 'bet' | 'raise' | 'allin' | 'fold' | 'show' | 'mutual'
        const actAmt = Math.max(0, Math.floor(Number(amount) || 0));
        const id = round.turn;
        const me = players.find((p: any) => p.id === id)?.name || id;

        round.contrib = round.contrib || {};
        round.folded = round.folded || {};
        round.allIn = round.allIn || {};
        round.log = round.log || [];

        const nextOrder = (
          currentTurn: string,
          parts: string[],
          folded: Record<string, number>,
          allInMap: Record<string, boolean>
        ) => {
          const o = players.map((p: any) => p.id).filter((pid: string) => parts.includes(pid));
          let idx = o.indexOf(currentTurn);
          for (let k = 0; k < o.length; k++) {
            idx = (idx + 1) % o.length;
            if (!folded[o[idx]] && !allInMap[o[idx]]) return o[idx];
          }
          return currentTurn;
        };

        const runAutoShowdown = (challengerId?: string, reasonLog?: string) => {
          round.phase = 'result';
          if (reasonLog) round.log.push(reasonLog);
          const remaining = (round.parts || []).filter((pid: string) => !round.folded[pid]);
          if (round.hands) {
            round.revealedHands = { ...(round.revealedHands || {}) };
            remaining.forEach((pid: string) => {
              round.revealedHands[pid] = round.hands[pid];
            });
            const tpEval = evaluateAllTeenPattiHands(round.hands, remaining, challengerId);
            round.handEvaluations = tpEval.evaluations;
            round.winner = tpEval.bestWinnerId;
            if (tpEval.bestWinnerId) {
              const wName = players.find((p: any) => p.id === tpEval.bestWinnerId)?.name || tpEval.bestWinnerId;
              const wHand = tpEval.evaluations[tpEval.bestWinnerId]?.rankName || '';
              round.log.push(`👑 System Showdown Winner: ${wName} with ${wHand}`);
            }
            settleTeenPattiRoundOnServer(sessionDoc, round, players, tpEval.bestWinnerId, challengerId);
          } else {
            settleTeenPattiRoundOnServer(sessionDoc, round, players, round.winner, challengerId);
          }
        };

        if (subAction === 'bet' || subAction === 'raise' || subAction === 'allin') {
          const isBlind = (round.playerStatus?.[id] || 'blind') === 'blind';
          const anteShare = sessionDoc.ante?.mode === 'admin' && sessionDoc.ante.amt > 0
            ? Math.floor(sessionDoc.ante.amt / (round.parts?.length || 1))
            : sessionDoc.ante?.amt;
          const baseUnit = Math.max(1, round.stake || (anteShare && anteShare > 0 ? anteShare : 10));
          const lastBet = round.lastBetAmt && round.lastBetAmt > 0
            ? { amount: round.lastBetAmt, isBlind: Boolean(round.lastIsBlind) }
            : null;
          const { chaalCost } = getTeenPattiBetAmounts(baseUnit, isBlind, false, lastBet);

          let actual = actAmt;
          let isAllIn = false;

          if (sessionDoc.balanceMode) {
            const pObj = players.find((p: any) => p.id === id);
            const bal = pObj?.balance || 0;
            if (!pObj || bal <= 0) {
              return NextResponse.json({ error: 'Insufficient chips.' }, { status: 400 });
            }
            if (subAction === 'allin') {
              actual = bal;
            } else {
              if (actAmt <= 0) {
                return NextResponse.json({ error: 'Enter a valid bet amount.' }, { status: 400 });
              }
              if (actAmt > bal) {
                return NextResponse.json({ error: 'Insufficient chips.' }, { status: 400 });
              }
              if (actAmt < chaalCost && actAmt < bal) {
                return NextResponse.json(
                  { error: `Minimum bet is ${money(chaalCost)} (or go All-In with ${money(bal)}).` },
                  { status: 400 }
                );
              }
              actual = actAmt;
            }
            pObj.balance = Math.max(0, bal - actual);
            if (pObj.balance === 0) {
              isAllIn = true;
              round.allIn[id] = true;
            }
          } else {
            if (actual <= 0) {
              return NextResponse.json({ error: 'Enter a valid bet amount.' }, { status: 400 });
            }
          }

          // In Teen Patti, any normal bet/raise sets the new table stake:
          // A Blind bet of X sets baseStake = X.
          // A Seen bet of Y sets baseStake = floor(Y / 2).
          // Next player must bet at least baseStake (if blind) or 2*baseStake (if seen).
          if (!isAllIn || actual >= chaalCost) {
            round.stake = isBlind ? actual : Math.max(1, Math.floor(actual / 2));
          }

          round.contrib[id] = (round.contrib[id] || 0) + actual;
          round.lastBy = me;
          round.lastBetAmt = actual;
          round.lastIsBlind = isBlind;
          if (isAllIn) {
            round.log.push(`${me} went ALL-IN with ${money(actual)} (${isBlind ? 'Blind' : 'Seen'})! 🚨`);
          } else {
            round.log.push(
              `${me} ${subAction === 'raise' || actual > chaalCost ? 'raised to' : 'put in'} ${money(actual)} (${isBlind ? 'Blind' : 'Seen'})`
            );
          }

          const activeIds = (round.parts || []).filter((pid: string) => !round.folded[pid]);
          const canActIds = activeIds.filter((pid: string) => !round.allIn[pid]);
          const maxContrib = Math.max(0, ...activeIds.map((pid: string) => round.contrib[pid] || 0));

          if (
            canActIds.length === 0 ||
            (canActIds.length === 1 && (round.contrib[canActIds[0]] || 0) >= maxContrib)
          ) {
            const activeNames = activeIds.map((pid: string) => players.find((p: any) => p.id === pid)?.name || pid);
            const namesStr = activeNames.length === 2 ? `${activeNames[0]} and ${activeNames[1]}` : activeNames.join(', ');
            runAutoShowdown(id, `— All-In Showdown between ${namesStr}! —`);
          } else {
            round.turn = nextOrder(round.turn, round.parts, round.folded, round.allIn);
          }
        } else if (subAction === 'fold') {
          round.folded[id] = 1;
          const myContrib = round.contrib[id] || 0;
          round.log.push(
            myContrib > 0
              ? `${me} packed (folded, forfeited ${money(myContrib)} to pot)`
              : `${me} packed (folded)`
          );
          const remaining = (round.parts || []).filter((pid: string) => !round.folded[pid]);
          if (remaining.length === 1) {
            round.phase = 'result';
            round.winner = remaining[0];
            const winName = players.find((p: any) => p.id === remaining[0])?.name || remaining[0];
            round.log.push(`🏆 Everyone else folded! ${winName} wins the pot!`);
            settleTeenPattiRoundOnServer(sessionDoc, round, players, remaining[0]);
          } else {
            const canActIds = remaining.filter((pid: string) => !round.allIn[pid]);
            const maxContrib = Math.max(0, ...remaining.map((pid: string) => round.contrib[pid] || 0));
            if (
              canActIds.length === 0 ||
              (canActIds.length === 1 && (round.contrib[canActIds[0]] || 0) >= maxContrib)
            ) {
              const activeNames = remaining.map((pid: string) => players.find((p: any) => p.id === pid)?.name || pid);
              const namesStr = activeNames.length === 2 ? `${activeNames[0]} and ${activeNames[1]}` : activeNames.join(', ');
              runAutoShowdown(undefined, `— All-In Showdown between ${namesStr}! —`);
            } else {
              round.turn = nextOrder(round.turn, round.parts, round.folded, round.allIn);
            }
          }
        } else if (subAction === 'show' || subAction === 'mutual') {
          if (subAction === 'show') {
            let actual = actAmt;
            if (sessionDoc.balanceMode) {
              const pObj = players.find((p: any) => p.id === id);
              const bal = pObj?.balance || 0;
              if (!pObj || bal <= 0) {
                return NextResponse.json({ error: 'Insufficient chips for Show.' }, { status: 400 });
              }
              actual = actAmt > 0 ? Math.min(bal, actAmt) : bal;
              pObj.balance = Math.max(0, bal - actual);
              if (pObj.balance === 0) {
                round.allIn[id] = true;
              }
            }
            if (actual > 0) {
              round.contrib[id] = (round.contrib[id] || 0) + actual;
              round.log.push(
                `${me} paid ${money(actual)}${round.allIn[id] ? ' (ALL-IN)' : ''} for Force Show! 🎴`
              );
            }
          } else {
            round.log.push(`${me} called Showdown! 🎴`);
          }

          runAutoShowdown(id);
        }

        if (round.log?.length) {
          appendActivityLog(sessionDoc, `🎴 ${round.log[round.log.length - 1]}`);
        }
        sessionDoc.round = round;
        sessionDoc.markModified('round');
        sessionDoc.markModified('players');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'TP_SETTLE': {
        if (!round) {
          return NextResponse.json({ error: 'No active round.' }, { status: 400 });
        }
        if (round.settled) {
          sessionDoc.round = null;
          promoteQueuedGameOperatorIfIdle(sessionDoc);
          sessionDoc.markModified('round');
          await sessionDoc.save();
          return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
        }
        if (!isHost) {
          return NextResponse.json({ error: 'Only the Game Operator can settle the round.' }, { status: 403 });
        }
        const w = body.winnerId || round.winner;
        if (body.potWinners) {
          round.potWinners = body.potWinners;
        }
        settleTeenPattiRoundOnServer(sessionDoc, round, players, w);
        sessionDoc.round = null;
        sessionDoc.markModified('round');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── 5B. MUTUAL CARD SHOW REQUEST & RESPONSE ──────────────── */
      case 'REQUEST_MUTUAL_SHOW': {
        if (!round || round.phase !== 'bet') {
          return NextResponse.json({ error: 'Mutual Show can only be requested during an active betting round.' }, { status: 400 });
        }
        const pid = requestingPlayer?.id || (isHost ? round.turn : null);
        if (!pid || !(round.parts || []).includes(pid) || round.folded?.[pid]) {
          return NextResponse.json({ error: 'Only active non-folded players can request a Mutual Show.' }, { status: 403 });
        }
        const pName = players.find((p: any) => p.id === pid)?.name || pid;
        round.mutualShowRequest = {
          requesterId: pid,
          requesterName: pName,
          approvals: { [pid]: 'accepted' },
        };
        round.log = round.log || [];
        round.log.push(`🤝 ${pName} requested a Mutual Card Show (₹0 forced showdown)`);
        appendActivityLog(sessionDoc, `🤝 ${pName} requested a Mutual Card Show`);
        sessionDoc.round = round;
        sessionDoc.markModified('round');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'RESPOND_MUTUAL_SHOW': {
        if (!round || !round.mutualShowRequest) {
          return NextResponse.json({ error: 'No pending Mutual Show request.' }, { status: 400 });
        }
        const pid = body.playerId && isHost ? body.playerId : requestingPlayer?.id;
        if (!pid || !(round.parts || []).includes(pid) || round.folded?.[pid]) {
          return NextResponse.json({ error: 'Only active non-folded players can respond.' }, { status: 403 });
        }
        const decision = body.decision === 'accepted' ? 'accepted' : 'rejected';
        const pName = players.find((p: any) => p.id === pid)?.name || pid;
        round.log = round.log || [];

        if (decision === 'rejected') {
          round.mutualShowRequest = null;
          round.log.push(`❌ ${pName} declined the Mutual Show request — betting continues`);
          appendActivityLog(sessionDoc, `❌ ${pName} declined the Mutual Show request`);
          sessionDoc.round = round;
          sessionDoc.markModified('round');
          await sessionDoc.save();
          return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
        }

        round.mutualShowRequest.approvals[pid] = 'accepted';
        round.log.push(`✅ ${pName} accepted the Mutual Show request`);
        appendActivityLog(sessionDoc, `✅ ${pName} accepted the Mutual Show request`);

        const activeIds = (round.parts || []).filter((id: string) => !round.folded?.[id]);
        const allAccepted = activeIds.every(
          (id: string) => round.mutualShowRequest?.approvals?.[id] === 'accepted'
        );

        if (allAccepted) {
          round.mutualShowRequest = null;
          round.phase = 'result';
          round.log.push(`🤝 All active players accepted Mutual Show! Revealing all hands...`);

          if (sessionDoc.gameType === 'pk') {
            if (round.boardCards && Array.isArray(round.boardCards)) {
              round.board = round.boardCards.slice(0, 5);
            }
            if (round.hands) {
              round.revealedHands = { ...(round.revealedHands || {}) };
              activeIds.forEach((id: string) => {
                round.revealedHands[id] = round.hands[id];
              });
              const evalRes = evaluateAllPokerHands(round.hands, round.board || [], activeIds);
              round.handEvaluations = evalRes.evaluations;
              round.winners = evalRes.bestPlayerIds;
              const { pots } = calculatePots(round.contrib || {}, round.folded || {}, round.allIn || {});
              const autoPotWinners: Record<string, string[]> = {};
              pots.forEach(pot => {
                const eligEval = evaluateAllPokerHands(round.hands, round.board || [], pot.eligiblePlayerIds);
                if (eligEval.bestPlayerIds.length > 0) {
                  autoPotWinners[pot.id] = eligEval.bestPlayerIds;
                }
              });
              round.potWinners = autoPotWinners;
            }
            const settled = settlePokerShowdown(
              {
                players,
                round,
                debts: sessionDoc.debts || {},
                wins: sessionDoc.wins || {},
                hist: sessionDoc.hist || [],
                tot: sessionDoc.tot || { rounds: 0, total: 0, big: 0 },
                balanceMode: !!sessionDoc.balanceMode,
                dealerIdx: sessionDoc.dealerIdx ?? 0,
              },
              round.potWinners || { main: round.winners || [] }
            );
            sessionDoc.players = settled.players;
            sessionDoc.debts = settled.debts;
            sessionDoc.wins = settled.wins;
            sessionDoc.hist = settled.hist;
            sessionDoc.tot = settled.tot;
            sessionDoc.dealerIdx = settled.dealerIdx;
            round.settled = true;
            round.winner = round.winners?.[0] || null;
            resetReadyAndPromoteQueuedGo(sessionDoc);
          } else {
            // Teen Patti mutual show
            if (round.hands) {
              round.revealedHands = { ...(round.revealedHands || {}) };
              activeIds.forEach((id: string) => {
                round.revealedHands[id] = round.hands[id];
              });
              const tpEval = evaluateAllTeenPattiHands(round.hands, activeIds);
              round.handEvaluations = tpEval.evaluations;
              round.winner = tpEval.bestWinnerId;
              if (tpEval.bestWinnerId) {
                const wName = players.find((p: any) => p.id === tpEval.bestWinnerId)?.name || tpEval.bestWinnerId;
                const wHand = tpEval.evaluations[tpEval.bestWinnerId]?.rankName || '';
                round.log.push(`👑 Mutual Show Winner: ${wName} with ${wHand}`);
                settleTeenPattiRoundOnServer(sessionDoc, round, players, tpEval.bestWinnerId);
              }
            }
          }
        }

        sessionDoc.round = round;
        sessionDoc.markModified('round');
        sessionDoc.markModified('players');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── 6. INDIAN RUMMY ONLINE CARD ACTIONS ──────────────── */
      case 'RUMMY_DRAW': {
        if (!round) return NextResponse.json({ error: 'No active Rummy deal.' }, { status: 400 });
        const pid = isHost && body.playerId ? body.playerId : requestingPlayer?.id;
        if (!pid || round.turn !== pid) {
          return NextResponse.json({ error: 'It is not your turn to draw.' }, { status: 403 });
        }
        if (round.rummyStep === 'discard') {
          return NextResponse.json({ error: 'You already drew a card. Please discard one card.' }, { status: 400 });
        }

        const source = body.source === 'open' ? 'open' : 'closed';
        const pName = players.find((p: any) => p.id === pid)?.name || pid;
        round.hands = round.hands || {};
        round.hands[pid] = Array.isArray(round.hands[pid]) ? [...round.hands[pid]] : [];
        round.discardPile = Array.isArray(round.discardPile) ? [...round.discardPile] : [];
        round.deck = Array.isArray(round.deck) ? [...round.deck] : [];
        round.log = round.log || [];

        if (source === 'open') {
          if (round.discardPile.length === 0) {
            return NextResponse.json({ error: 'Open discard pile is empty.' }, { status: 400 });
          }
          const picked = round.discardPile.pop()!;
          round.openCard = round.discardPile[round.discardPile.length - 1] || null;
          round.hands[pid].push(picked);
          round.log.push(`${pName} picked ${picked.rank}${picked.suit} from Open Pile`);
          appendActivityLog(sessionDoc, `🃏 ${pName} picked ${picked.rank}${picked.suit} from Open Pile`);
        } else {
          if (round.deck.length === 0 && round.discardPile.length > 1) {
            const topOpen = round.discardPile.pop()!;
            round.deck = shuffleDeck(round.discardPile);
            round.discardPile = [topOpen];
          }
          if (round.deck.length === 0) {
            return NextResponse.json({ error: 'No cards left in stock.' }, { status: 400 });
          }
          const drawn = dealCards(round.deck, 1);
          const card = drawn.dealt[0];
          round.deck = drawn.remaining;
          round.hands[pid].push(card);
          round.log.push(`${pName} drew a card from Closed Stock`);
          appendActivityLog(sessionDoc, `🃏 ${pName} drew ${card.rank}${card.suit} from Closed Stock`);
        }

        round.rummyStep = 'discard';
        sessionDoc.round = round;
        sessionDoc.markModified('round');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'RUMMY_DISCARD': {
        if (!round) return NextResponse.json({ error: 'No active Rummy deal.' }, { status: 400 });
        const pid = isHost && body.playerId ? body.playerId : requestingPlayer?.id;
        if (!pid || round.turn !== pid) {
          return NextResponse.json({ error: 'It is not your turn to discard.' }, { status: 403 });
        }
        if (round.rummyStep !== 'discard') {
          return NextResponse.json({ error: 'Draw a card first before discarding.' }, { status: 400 });
        }

        const hand: any[] = round.hands?.[pid] || [];
        const idx = Number(cardIndex);
        if (isNaN(idx) || idx < 0 || idx >= hand.length) {
          return NextResponse.json({ error: 'Invalid card selected to discard.' }, { status: 400 });
        }

        const [discarded] = hand.splice(idx, 1);
        round.hands[pid] = hand;
        round.discardPile = [...(round.discardPile || []), discarded];
        round.openCard = discarded;
        round.rummyStep = 'draw';

        const pName = players.find((p: any) => p.id === pid)?.name || pid;
        round.log = round.log || [];
        round.log.push(`${pName} discarded ${discarded.rank}${discarded.suit}`);
        appendActivityLog(sessionDoc, `🃏 ${pName} discarded ${discarded.rank}${discarded.suit}`);

        // Advance turn to next non-dropped player
        const activeIds = (round.parts || []).filter((id: string) => !round.dropped?.[id]);
        if (activeIds.length > 0) {
          const curIdx = activeIds.indexOf(pid);
          round.turn = activeIds[(curIdx + 1) % activeIds.length];
        }

        sessionDoc.round = round;
        sessionDoc.markModified('round');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'RUMMY_DECLARE': {
        if (!round) return NextResponse.json({ error: 'No active Rummy deal.' }, { status: 400 });
        const pid = isHost && body.playerId ? body.playerId : requestingPlayer?.id;
        if (!pid || round.turn !== pid) {
          return NextResponse.json({ error: 'Only the player on turn can declare.' }, { status: 403 });
        }

        const hand: any[] = round.hands?.[pid] || [];
        if (cardIndex !== undefined && cardIndex >= 0 && cardIndex < hand.length) {
          const [finishCard] = hand.splice(Number(cardIndex), 1);
          round.hands[pid] = hand;
          round.openCard = finishCard;
        }

        const pName = players.find((p: any) => p.id === pid)?.name || pid;
        round.winner = pid;
        round.phase = 'result';
        round.revealedHands = { ...(round.hands || {}) };
        round.log = round.log || [];

        // Automatically evaluate deadwood points for all non-winning players
        const jokerRank = round.jokerCard?.rank;
        const loserPoints: Record<string, number> = { [pid]: 0 };
        for (const partId of round.parts || []) {
          if (partId === pid) continue;
          if (round.dropped?.[partId]) {
            loserPoints[partId] = round.dropped[partId];
          } else {
            const pCards = round.hands?.[partId] || [];
            loserPoints[partId] = calculateRummyOptimalDeadwood(pCards, jokerRank, 80);
          }
        }
        round.rummyScores = loserPoints;

        const ptVal = Number(round.stake) || 10;
        const activePartsPlayers = players.filter((p: any) => (round.parts || []).includes(p.id));
        const res = calculateRummyDeal({
          winnerId: pid,
          playerPoints: loserPoints,
          pointValue: ptVal,
          config: sessionDoc.rummyConfig,
          players: activePartsPlayers,
          balanceMode: !!sessionDoc.balanceMode,
        });

        // Apply updated balances
        const updatedMap = new Map(res.updatedPlayers.map((p: any) => [p.id, p]));
        sessionDoc.players = players.map((p: any) => updatedMap.get(p.id) || p);

        const debts = { ...(sessionDoc.debts || {}) };
        const wins = { ...(sessionDoc.wins || {}) };
        const pays: { name: string; amt: number }[] = [];

        Object.entries(res.debtsDelta).forEach(([k, amt]) => {
          const [d, c] = k.split('|');
          const rev = `${c}|${d}`;
          if (debts[rev] && debts[rev] >= amt) {
            debts[rev] -= amt;
            if (!debts[rev]) delete debts[rev];
          } else {
            const rem = amt - (debts[rev] || 0);
            delete debts[rev];
            debts[k] = (debts[k] || 0) + rem;
          }
          const dName = players.find((p: any) => p.id === d)?.name || d;
          pays.push({ name: dName, amt });
        });

        wins[pid] = (wins[pid] || 0) + res.totalWinnings;
        sessionDoc.debts = debts;
        sessionDoc.wins = wins;
        sessionDoc.tot = {
          rounds: (sessionDoc.tot?.rounds || 0) + 1,
          total: (sessionDoc.tot?.total || 0) + res.totalWinnings,
          big: Math.max(sessionDoc.tot?.big || 0, res.totalWinnings),
        };
        sessionDoc.hist = [
          { no: round.no, winner: pName, pot: res.totalWinnings, got: res.totalWinnings, pays },
          ...(sessionDoc.hist || []),
        ].slice(0, 30);

        round.settled = true;
        round.log.push(`🏆 ${pName} declared SHOW and won ${money(res.totalWinnings)}! (System Auto-Settled)`);
        appendActivityLog(sessionDoc, `🏆 ${pName} declared SHOW and won ${money(res.totalWinnings)}!`);
        resetReadyAndPromoteQueuedGo(sessionDoc);

        sessionDoc.round = round;
        sessionDoc.markModified('players');
        sessionDoc.markModified('debts');
        sessionDoc.markModified('wins');
        sessionDoc.markModified('tot');
        sessionDoc.markModified('hist');
        sessionDoc.markModified('round');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── 7. BLACKJACK ONLINE ACTIONS ──────────────── */
      case 'BJ_ACTION': {
        if (!round) return NextResponse.json({ error: 'No active Blackjack hand.' }, { status: 400 });
        const pid = isHost && body.playerId ? body.playerId : requestingPlayer?.id;
        if (!pid || round.turn !== pid) {
          return NextResponse.json({ error: 'It is not your turn.' }, { status: 403 });
        }

        const subAction = body.subAction; // 'hit' | 'stand' | 'double'
        const pName = players.find((p: any) => p.id === pid)?.name || pid;
        round.hands = round.hands || {};
        round.bjStatus = round.bjStatus || {};
        round.deck = round.deck || [];
        round.log = round.log || [];

        if (subAction === 'hit') {
          const d = dealCards(round.deck, 1);
          const card = d.dealt[0];
          round.deck = d.remaining;
          round.hands[pid] = [...(round.hands[pid] || []), card];
          const ev = evaluateBlackjackHand(round.hands[pid]);
          round.log.push(`${pName} hits ${card.rank}${card.suit} → ${ev.label}`);
          appendActivityLog(sessionDoc, `🃏 ${pName} hits ${card.rank}${card.suit} → ${ev.label}`);
          if (ev.isBusted) {
            round.bjStatus[pid] = 'busted';
            round = advanceBlackjackTurnOrSettle(round, players, !!sessionDoc.balanceMode);
          } else if (ev.total === 21) {
            round.bjStatus[pid] = 'stood';
            round = advanceBlackjackTurnOrSettle(round, players, !!sessionDoc.balanceMode);
          }
        } else if (subAction === 'stand') {
          const ev = evaluateBlackjackHand(round.hands[pid] || []);
          round.bjStatus[pid] = 'stood';
          round.log.push(`${pName} stands at ${ev.total}`);
          appendActivityLog(sessionDoc, `🃏 ${pName} stands at ${ev.total}`);
          round = advanceBlackjackTurnOrSettle(round, players, !!sessionDoc.balanceMode);
        } else if (subAction === 'double') {
          const currentBet = round.contrib?.[pid] || round.stake || 100;
          if (sessionDoc.balanceMode) {
            const pObj = players.find((p: any) => p.id === pid);
            if (!pObj || (pObj.balance || 0) < currentBet) {
              return NextResponse.json({ error: 'Insufficient chips to Double Down.' }, { status: 400 });
            }
            pObj.balance = Math.max(0, (pObj.balance || 0) - currentBet);
          }
          round.contrib = round.contrib || {};
          round.contrib[pid] = currentBet * 2;

          const d = dealCards(round.deck, 1);
          const card = d.dealt[0];
          round.deck = d.remaining;
          round.hands[pid] = [...(round.hands[pid] || []), card];
          const ev = evaluateBlackjackHand(round.hands[pid]);
          round.bjStatus[pid] = ev.isBusted ? 'busted' : 'doubled';
          round.log.push(`${pName} DOUBLES DOWN (${money(currentBet * 2)}) · draws ${card.rank}${card.suit} → ${ev.label}`);
          appendActivityLog(sessionDoc, `🃏 ${pName} DOUBLES DOWN (${money(currentBet * 2)}) · draws ${card.rank}${card.suit} → ${ev.label}`);
          round = advanceBlackjackTurnOrSettle(round, players, !!sessionDoc.balanceMode);
        }

        if (round.phase === 'result' && !round.settled) {
          settleBlackjackRoundOnServer(sessionDoc, round, players);
        }

        sessionDoc.round = round;
        sessionDoc.markModified('round');
        sessionDoc.markModified('players');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      /* ──────────────── 8. UNDO & ABORT ROUND (ADMIN ONLY) ──────────────── */
      case 'UNDO': {
        if (!isHost) {
          return NextResponse.json({ error: 'Only the Game Operator can undo actions.' }, { status: 403 });
        }
        if (!round || !round.stack?.length) {
          return NextResponse.json({ error: 'Nothing to undo.' }, { status: 400 });
        }
        const prevSnap = JSON.parse(round.stack[round.stack.length - 1]);
        if (sessionDoc.balanceMode && prevSnap._plBals) {
          players.forEach((p: any) => {
            const found = prevSnap._plBals.find((b: any) => b.id === p.id);
            if (found) p.balance = found.balance;
          });
        }
        sessionDoc.round = { ...prevSnap, stack: round.stack.slice(0, -1) };
        appendActivityLog(sessionDoc, `↩️ Game Operator undid last action`);
        sessionDoc.markModified('players');
        sessionDoc.markModified('round');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      case 'ABORT_ROUND': {
        if (!isHost) {
          return NextResponse.json({ error: 'Only the Game Operator can abort the round.' }, { status: 403 });
        }
        if (!round) {
          return NextResponse.json({ error: 'No active round.' }, { status: 400 });
        }
        if (sessionDoc.balanceMode && round.contrib) {
          players.forEach((p: any) => {
            const c = round.contrib[p.id] || 0;
            p.balance = (p.balance || 0) + c;
          });
          const seedRefund = round.contrib['__pot_seed__'] || 0;
          if (seedRefund > 0) {
            const hostPl =
              players.find(
                (p: any) => p.isGameOperator || (p.userId && p.userId.toLowerCase() === goEmail)
              ) ||
              players.find(
                (p: any) => p.userId && p.userId.toLowerCase() === sessionDoc.hostUserId?.toLowerCase()
              ) ||
              players[0];
            if (hostPl) {
              hostPl.balance = (hostPl.balance || 0) + seedRefund;
            }
          }
        }
        sessionDoc.round = null;
        sessionDoc.rno = Math.max(0, (sessionDoc.rno || 1) - 1);
        appendActivityLog(sessionDoc, `🛑 Game Operator aborted the active round and refunded all bets`);
        resetReadyAndPromoteQueuedGo(sessionDoc);
        sessionDoc.markModified('players');
        sessionDoc.markModified('round');
        await sessionDoc.save();
        return NextResponse.json(sanitizeStateForClient(sessionDoc.toObject(), userEmail));
      }

      default:
        return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
    }
  } catch (error) {
    console.error('POST /api/sessions/[id]/action error:', error);
    return NextResponse.json({ error: 'Action failed.' }, { status: 500 });
  }
}
