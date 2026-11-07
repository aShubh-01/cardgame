import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import Session from '@/lib/models/Session';
import { sanitizeStateForClient } from '@/lib/virtualDeck';
import { getGoEmail, getOwnerEmail, syncGameOperatorPresence } from '@/lib/gameOperator';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized. Sign in with Google is required.' }, { status: 401 });
    }
    const userId = session.user.email;

    await connectDB();
    const sessionDoc: any = await Session.findById(params.id).lean();
    if (!sessionDoc) {
      return NextResponse.json({ error: 'Session not found or access denied.' }, { status: 404 });
    }

    const ownerEmail = getOwnerEmail(sessionDoc);
    const goEmail = getGoEmail(sessionDoc);
    const isHost = userId.toLowerCase() === ownerEmail || userId.toLowerCase() === goEmail;
    const isSeated = sessionDoc.players?.some(
      (p: any) => p.userId && p.userId.toLowerCase() === userId.toLowerCase()
    );

    if (sessionDoc.sessionMode === 'online') {
      if (!isHost && !isSeated) {
        return NextResponse.json({ error: 'You are not seated in this online room.' }, { status: 403 });
      }
      const PRESENCE_KEYS = ['isConnected', 'isOnline', 'lastSeenAt'];
      const stripPresence = (list: any[]) =>
        JSON.stringify(
          (list || []).map((p: any) => {
            const c = { ...p };
            PRESENCE_KEYS.forEach(k => delete c[k]);
            return c;
          })
        );
      const beforePlayers = JSON.parse(JSON.stringify(sessionDoc.players || []));
      const beforeNonPresence = stripPresence(beforePlayers);

      if (syncGameOperatorPresence(sessionDoc, userId)) {
        const $set: Record<string, any> = {
          gameOperatorUserId: sessionDoc.gameOperatorUserId,
          nextGameOperatorUserId: sessionDoc.nextGameOperatorUserId,
          goLastHeartbeat: sessionDoc.goLastHeartbeat,
          goDisconnectEvent: sessionDoc.goDisconnectEvent,
          readyPlayers: sessionDoc.readyPlayers,
          activityLog: sessionDoc.activityLog,
        };
        const arrayFilters: any[] = [];

        if (stripPresence(sessionDoc.players) !== beforeNonPresence) {
          // Structural player changes (e.g. GO flag sync) → write full array
          $set.players = sessionDoc.players;
        } else {
          // Presence-only changes → targeted per-player field updates (no clobbering)
          (sessionDoc.players || []).forEach((p: any, idx: number) => {
            const prev = beforePlayers.find((b: any) => b.id === p.id) || {};
            const changed = PRESENCE_KEYS.some(k => prev[k] !== p[k]);
            if (!changed) return;
            const tag = `pl${idx}`;
            PRESENCE_KEYS.forEach(k => {
              if (p[k] !== undefined) $set[`players.$[${tag}].${k}`] = p[k];
            });
            arrayFilters.push({ [`${tag}.id`]: p.id });
          });
        }

        await Session.updateOne(
          { _id: params.id },
          { $set },
          arrayFilters.length ? { arrayFilters } : {}
        );
      }
      return NextResponse.json(sanitizeStateForClient(sessionDoc, userId));
    }

    if (!isHost) {
      return NextResponse.json({ error: 'Session not found or access denied.' }, { status: 403 });
    }

    return NextResponse.json(sessionDoc);
  } catch (error) {
    console.error('GET /api/sessions/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized. Sign in with Google is required.' }, { status: 401 });
    }
    const userId = session.user.email;

    await connectDB();
    const body = await request.json();

    delete body._id;
    delete body.userId;
    delete body.hostUserId;
    delete body.gameOperatorUserId;
    delete body.nextGameOperatorUserId;
    delete body.goLastHeartbeat;
    delete body.goDisconnectEvent;
    delete body.myRole;
    delete body.isSessionOwner;
    delete body.isGameOperator;
    delete body.isQueuedGameOperator;
    delete body.operatorProfile;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.__v;

    // Prevent overwriting full server deck from client in online mode
    if (body.round && body.round.deckRemaining !== undefined && !body.round.deck) {
      delete body.round.deckRemaining;
    }

    const sessionDoc: any = await Session.findById(params.id);
    if (!sessionDoc) {
      return NextResponse.json({ error: 'Session not found or access denied.' }, { status: 404 });
    }

    const ownerEmail = getOwnerEmail(sessionDoc);
    const goEmail = getGoEmail(sessionDoc);
    const isHost = userId.toLowerCase() === ownerEmail || userId.toLowerCase() === goEmail;
    if (!isHost) {
      return NextResponse.json({ error: 'Only the Game Operator or Session Owner can update table configuration.' }, { status: 403 });
    }

    // Preserve hidden Game Operator profile entry in sessionDoc.players when online client saves sanitized players
    if (sessionDoc.sessionMode === 'online' && Array.isArray(body.players) && Array.isArray(sessionDoc.players)) {
      const existingGoEntries = sessionDoc.players.filter(
        (p: any) => p.isGameOperator || (p.userId && p.userId.toLowerCase() === goEmail)
      );
      const clientIds = new Set(body.players.map((p: any) => p.id));
      for (const goPl of existingGoEntries) {
        if (!clientIds.has(goPl.id)) {
          body.players.unshift(goPl);
        }
      }
      // Restore server-only userId and connection presence on each player if stripped or stale
      const serverUserMap = new Map<string, any>(
        (sessionDoc.players as any[]).map((p: any) => [
          p.id,
          {
            userId: p.userId,
            isGameOperator: p.isGameOperator,
            isConnected: p.isConnected,
            isOnline: p.isOnline,
            lastSeenAt: p.lastSeenAt,
          },
        ])
      );
      body.players = body.players.map((p: any) => {
        const srv = serverUserMap.get(p.id);
        return srv
          ? {
              ...p,
              userId: p.userId || srv.userId,
              isGameOperator: srv.isGameOperator ?? p.isGameOperator,
              isConnected: srv.isConnected ?? p.isConnected,
              isOnline: srv.isOnline ?? p.isOnline,
              lastSeenAt: srv.lastSeenAt ?? p.lastSeenAt,
            }
          : p;
      });
    }

    // Preserve server-only virtual deck & unmasked hands in online mode if client sends sanitized round
    if (sessionDoc.sessionMode === 'online' && body.round && sessionDoc.round) {
      if (!body.round.deck && sessionDoc.round.deck) {
        body.round.deck = sessionDoc.round.deck;
      }
      if (!body.round.boardCards && sessionDoc.round.boardCards) {
        body.round.boardCards = sessionDoc.round.boardCards;
      }
      if (body.round.hands && sessionDoc.round.hands) {
        const mergedHands: Record<string, any> = { ...sessionDoc.round.hands };
        for (const [pid, h] of Object.entries(body.round.hands as Record<string, any>)) {
          if (Array.isArray(h)) {
            mergedHands[pid] = h;
          }
        }
        body.round.hands = mergedHands;
      }
      if (
        Array.isArray(body.round.dealerHand) &&
        body.round.dealerHand.some((c: any) => c?.hidden) &&
        Array.isArray(sessionDoc.round.dealerHand)
      ) {
        body.round.dealerHand = sessionDoc.round.dealerHand;
      }
    }

    const updated = await Session.findByIdAndUpdate(
      params.id,
      { $set: body },
      { new: true, runValidators: true }
    ).lean();

    return NextResponse.json(sessionDoc.sessionMode === 'online' ? sanitizeStateForClient(updated, userId) : updated);
  } catch (error) {
    console.error('PUT /api/sessions/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized. Sign in with Google is required.' }, { status: 401 });
    }
    const userId = session.user.email;

    await connectDB();
    const deleted = await Session.findOneAndDelete({ _id: params.id, userId });
    if (!deleted) {
      return NextResponse.json({ error: 'Session not found or access denied.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('DELETE /api/sessions/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}

