export const PLAYER_HEARTBEAT_TIMEOUT_MS = 10000;

export function isPlayerConnected(player: any, now: number = Date.now()): boolean {
  if (!player) return false;
  if (player.isConnected === false) return false;
  if (typeof player.lastSeenAt === 'number') {
    if (player.lastSeenAt <= 0) return false;
    return now - player.lastSeenAt <= PLAYER_HEARTBEAT_TIMEOUT_MS;
  }
  return player.isOnline !== false;
}

export function getOwnerEmail(sessionDoc: any): string {
  return (sessionDoc?.hostUserId || sessionDoc?.userId || sessionDoc?.userEmail || '')
    .toLowerCase()
    .trim();
}

export function getGoEmail(sessionDoc: any): string {
  return (sessionDoc?.gameOperatorUserId || getOwnerEmail(sessionDoc))
    .toLowerCase()
    .trim();
}

export function appendActivityLog(sessionDoc: any, text: string) {
  if (!sessionDoc) return;
  const now = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const list = Array.isArray(sessionDoc.activityLog) ? [...sessionDoc.activityLog] : [];
  list.push(`[${now}] ${text}`);
  sessionDoc.activityLog = list.slice(-100);
  if (typeof sessionDoc.markModified === 'function') {
    sessionDoc.markModified('activityLog');
  }
}

export function syncGoFlagsOnPlayers(sessionDoc: any) {
  if (!sessionDoc || sessionDoc.sessionMode !== 'online' || !Array.isArray(sessionDoc.players)) return;
  const goEmail = getGoEmail(sessionDoc);
  if (!goEmail) return;
  let changed = false;
  sessionDoc.players.forEach((p: any) => {
    const shouldBeGo = Boolean(p.userId && p.userId.toLowerCase().trim() === goEmail);
    if (Boolean(p.isGameOperator) !== shouldBeGo) {
      p.isGameOperator = shouldBeGo;
      changed = true;
    }
  });
  if (changed && typeof sessionDoc.markModified === 'function') {
    sessionDoc.markModified('players');
  }
}

export function assignNewGameOperator(sessionDoc: any, newGoUserId: string, reasonLog?: string) {
  if (!sessionDoc || !newGoUserId) return;
  const cleanEmail = newGoUserId.toLowerCase().trim();
  sessionDoc.gameOperatorUserId = newGoUserId;
  sessionDoc.nextGameOperatorUserId = null;
  sessionDoc.goDisconnectEvent = null;
  sessionDoc.goLastHeartbeat = Date.now();

  if (Array.isArray(sessionDoc.players)) {
    sessionDoc.players.forEach((p: any) => {
      const isNewGo = Boolean(p.userId && p.userId.toLowerCase().trim() === cleanEmail);
      if (p.isGameOperator && !isNewGo) {
        p.isGameOperator = false;
        p.sit = false;
      } else if (isNewGo) {
        p.isGameOperator = true;
        if (sessionDoc.readyPlayers && p.id in sessionDoc.readyPlayers) {
          delete sessionDoc.readyPlayers[p.id];
        }
      }
    });
    if (typeof sessionDoc.markModified === 'function') {
      sessionDoc.markModified('players');
      sessionDoc.markModified('readyPlayers');
    }
  }

  if (reasonLog) {
    appendActivityLog(sessionDoc, reasonLog);
  }
}

export function promoteQueuedGameOperatorIfIdle(sessionDoc: any): boolean {
  if (!sessionDoc || sessionDoc.sessionMode !== 'online') return false;
  if (!sessionDoc.nextGameOperatorUserId) return false;

  const isRoundActive =
    sessionDoc.round &&
    !sessionDoc.round.settled &&
    sessionDoc.round.phase !== 'result';

  if (isRoundActive) return false;

  const nextEmail = sessionDoc.nextGameOperatorUserId;
  const nextPl = (sessionDoc.players || []).find(
    (p: any) => p.userId && p.userId.toLowerCase().trim() === nextEmail.toLowerCase().trim()
  );
  assignNewGameOperator(
    sessionDoc,
    nextEmail,
    `🕵️ ${nextPl?.name || 'Queued Player'} promoted to active Game Operator`
  );
  return true;
}

export function syncGameOperatorPresence(sessionDoc: any, requestingUserEmail?: string | null): boolean {
  if (!sessionDoc || sessionDoc.sessionMode !== 'online') return false;
  let dirty = false;

  const reqEmail = (requestingUserEmail || '').toLowerCase().trim();
  const goEmail = getGoEmail(sessionDoc);

  if (!sessionDoc.gameOperatorUserId && goEmail) {
    sessionDoc.gameOperatorUserId = goEmail;
    dirty = true;
  }

  syncGoFlagsOnPlayers(sessionDoc);

  // If round is idle and there's a queued GO, promote them immediately
  if (promoteQueuedGameOperatorIfIdle(sessionDoc)) {
    dirty = true;
  }

  const activeGoEmail = getGoEmail(sessionDoc);
  const now = Date.now();
  const isRoundActive = Boolean(
    sessionDoc.round &&
    !sessionDoc.round.settled &&
    sessionDoc.round.phase !== 'result'
  );

  // Track per-player connection status & heartbeat across all seated players
  if (Array.isArray(sessionDoc.players)) {
    let playersChanged = false;
    sessionDoc.players.forEach((p: any) => {
      const pEmail = (p.userId || '').toLowerCase().trim();
      if (reqEmail && pEmail && pEmail === reqEmail) {
        const wasOffline = p.isConnected === false;
        if (wasOffline || p.isOnline !== true || !p.lastSeenAt || now - p.lastSeenAt > 1500) {
          p.lastSeenAt = now;
          p.isConnected = true;
          p.isOnline = true;
          playersChanged = true;
          dirty = true;
        }
        if (wasOffline && !p.isGameOperator) {
          appendActivityLog(sessionDoc, `🟢 ${p.name} reconnected to the room`);
        }
      } else if (pEmail && !p.isGameOperator) {
        if (typeof p.lastSeenAt === 'number') {
          const timedOut = p.lastSeenAt <= 0 || now - p.lastSeenAt > PLAYER_HEARTBEAT_TIMEOUT_MS;
          if (timedOut && p.isConnected !== false) {
            p.isConnected = false;
            p.isOnline = false;
            playersChanged = true;
            dirty = true;
            if (!isRoundActive && sessionDoc.readyPlayers && p.id in sessionDoc.readyPlayers) {
              delete sessionDoc.readyPlayers[p.id];
              if (typeof sessionDoc.markModified === 'function') {
                sessionDoc.markModified('readyPlayers');
              }
            }
            appendActivityLog(sessionDoc, `🔌 ${p.name} disconnected`);
          }
        }
      }
    });
    if (playersChanged && typeof sessionDoc.markModified === 'function') {
      sessionDoc.markModified('players');
    }
  }

  if (reqEmail && reqEmail === activeGoEmail) {
    sessionDoc.goLastHeartbeat = now;
    sessionDoc.goDisconnectedAt = 0;
    if (sessionDoc.goDisconnectEvent && sessionDoc.goDisconnectEvent.status === 'volunteering') {
      sessionDoc.goDisconnectEvent = null;
      appendActivityLog(sessionDoc, '🟢 Game Operator reconnected');
      if (typeof sessionDoc.markModified === 'function') {
        sessionDoc.markModified('goDisconnectEvent');
      }
    }
    dirty = true;
  } else {
    // Check if GO heartbeat timed out (1 minute grace period) and no volunteer event is active yet
    const lastBeat = sessionDoc.goLastHeartbeat || 0;
    const eligiblePlayers = (sessionDoc.players || []).filter(
      (p: any) => p.userId && p.userId.toLowerCase().trim() !== activeGoEmail && !p.isGameOperator
    );

    // Record when Game Operator first stopped heartbeating
    if (lastBeat > 0 && now - lastBeat > 10000 && !sessionDoc.goDisconnectedAt) {
      sessionDoc.goDisconnectedAt = lastBeat;
      dirty = true;
    }

    // Wait at least 1 minute (60,000ms) before triggering the volunteer alert
    const disconnectedDuration = sessionDoc.goDisconnectedAt
      ? now - sessionDoc.goDisconnectedAt
      : (lastBeat > 0 ? now - lastBeat : 0);

    if (
      (lastBeat > 0 || (sessionDoc.goDisconnectedAt && sessionDoc.goDisconnectedAt > 0)) &&
      disconnectedDuration >= 60000 &&
      !sessionDoc.goDisconnectEvent &&
      !sessionDoc.nextGameOperatorUserId &&
      eligiblePlayers.length > 0
    ) {
      sessionDoc.goDisconnectEvent = {
        disconnectedAt: sessionDoc.goDisconnectedAt || now,
        expiresAt: now + 15000,
        status: 'volunteering',
        volunteerUserId: null,
        volunteerName: null,
      };
      appendActivityLog(sessionDoc, '⚠️ Game Operator offline for >1 minute · 15s volunteer prompt sent to all players');
      if (typeof sessionDoc.markModified === 'function') {
        sessionDoc.markModified('goDisconnectEvent');
      }
      dirty = true;
    }

    // Check if 15s volunteer timer expired with no volunteer
    if (
      sessionDoc.goDisconnectEvent &&
      sessionDoc.goDisconnectEvent.status === 'volunteering' &&
      now >= sessionDoc.goDisconnectEvent.expiresAt &&
      !sessionDoc.nextGameOperatorUserId &&
      eligiblePlayers.length > 0
    ) {
      const chosen = eligiblePlayers[0];
      const isRoundActive =
        sessionDoc.round &&
        !sessionDoc.round.settled &&
        sessionDoc.round.phase !== 'result';

      if (isRoundActive) {
        sessionDoc.nextGameOperatorUserId = chosen.userId;
        sessionDoc.goDisconnectEvent = {
          ...sessionDoc.goDisconnectEvent,
          status: 'queued',
          volunteerUserId: chosen.userId,
          volunteerName: chosen.name,
        };
        appendActivityLog(
          sessionDoc,
          `⏱ No volunteer in 15s · ${chosen.name} auto-selected and queued as Game Operator for next round`
        );
        if (typeof sessionDoc.markModified === 'function') {
          sessionDoc.markModified('goDisconnectEvent');
        }
      } else {
        assignNewGameOperator(
          sessionDoc,
          chosen.userId,
          `⏱ No volunteer in 15s · ${chosen.name} auto-promoted to Game Operator`
        );
      }
      dirty = true;
    }
  }

  return dirty;
}

