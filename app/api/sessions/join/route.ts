import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import Session from '@/lib/models/Session';
import { sanitizeStateForClient } from '@/lib/virtualDeck';
import { appendActivityLog, getGoEmail, syncGameOperatorPresence } from '@/lib/gameOperator';

export async function POST(request: NextRequest) {
  try {
    const authSession = await getServerSession(authOptions);
    if (!authSession?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized. Sign in with Google is required to join an online session.' },
        { status: 401 }
      );
    }
    const userEmail = authSession.user.email;
    const userName = authSession.user.name || authSession.user.email.split('@')[0] || 'Player';

    await connectDB();
    const body = await request.json();
    const { roomCode, playerName } = body;

    if (!roomCode || typeof roomCode !== 'string') {
      return NextResponse.json({ error: 'Please enter a valid room code.' }, { status: 400 });
    }

    const cleanCode = roomCode.trim().toUpperCase();
    const sessionDoc = await Session.findOne({ roomCode: cleanCode, sessionMode: 'online' });

    if (!sessionDoc) {
      return NextResponse.json({ error: `No active online room found with code "${cleanCode}".` }, { status: 404 });
    }

    const effectiveName = playerName?.trim() || userName;

    // Check if player is already seated in this room
    const existingPlayerIndex = sessionDoc.players.findIndex(
      (p: any) => p.userId && p.userId.toLowerCase() === userEmail.toLowerCase()
    );

    if (existingPlayerIndex !== -1) {
      // Mark reconnected and optionally update display name
      sessionDoc.players[existingPlayerIndex].lastSeenAt = Date.now();
      sessionDoc.players[existingPlayerIndex].isConnected = true;
      sessionDoc.players[existingPlayerIndex].isOnline = true;
      if (playerName && playerName.trim()) {
        sessionDoc.players[existingPlayerIndex].name = playerName.trim();
      }
      sessionDoc.markModified('players');
      await sessionDoc.save();
    } else {
      // Add new player to room
      const newSeq = (sessionDoc.seq || 1) + 1;
      const newPlayerId = 'p' + (sessionDoc.seq || 1);
      const buyIn = sessionDoc.balanceMode ? (sessionDoc.defaultBuyIn || 1000) : undefined;

      const goEmail = getGoEmail(sessionDoc);
      const isCreatorGo = userEmail.toLowerCase() === goEmail;

      const newPlayer = {
        id: newPlayerId,
        name: effectiveName,
        userId: userEmail,
        sit: false,
        balance: buyIn,
        isOnline: true,
        isConnected: true,
        lastSeenAt: Date.now(),
        isGameOperator: isCreatorGo,
      };

      sessionDoc.players.push(newPlayer);
      sessionDoc.seq = newSeq;
      appendActivityLog(sessionDoc, `👋 ${effectiveName} joined the room`);
      syncGameOperatorPresence(sessionDoc, userEmail);
      await sessionDoc.save();
    }

    if (syncGameOperatorPresence(sessionDoc, userEmail)) {
      await sessionDoc.save();
    }

    const sanitized = sanitizeStateForClient(sessionDoc.toObject(), userEmail);
    return NextResponse.json({ session: sanitized, gameType: sessionDoc.gameType, sessionId: sessionDoc._id });
  } catch (error) {
    console.error('POST /api/sessions/join error:', error);
    return NextResponse.json({ error: 'Failed to join session.' }, { status: 500 });
  }
}

