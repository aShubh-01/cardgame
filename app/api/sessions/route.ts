import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import Session from '@/lib/models/Session';

const FRESH_SESSION_DATA = {
  players: [],
  ante: { mode: 'each', amt: 100 },
  balanceMode: false,
  defaultBuyIn: 1000,
  round: null,
  debts: {},
  wins: {},
  hist: [],
  rno: 0,
  seq: 1,
  tot: { rounds: 0, total: 0, big: 0 },
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized. Sign in with Google is required.' }, { status: 401 });
    }
    const userId = session.user.email;
    const userEmail = userId.toLowerCase();

    await connectDB();
    const { searchParams } = new URL(request.url);
    const gameType = searchParams.get('gameType');

    const validTypes = ['tp', 'pk', 'rummy', 'bj'];
    const query: any = {
      $or: [
        { userId: { $regex: new RegExp(`^${userEmail}$`, 'i') } },
        { userEmail: { $regex: new RegExp(`^${userEmail}$`, 'i') } },
        { hostUserId: { $regex: new RegExp(`^${userEmail}$`, 'i') } },
        { gameOperatorUserId: { $regex: new RegExp(`^${userEmail}$`, 'i') } },
        { 'players.userId': { $regex: new RegExp(`^${userEmail}$`, 'i') } },
      ],
    };
    if (gameType && validTypes.includes(gameType)) {
      query.gameType = gameType;
    }

    const sessions = await Session.find(query).sort({ updatedAt: -1 }).lean();
    return NextResponse.json(sessions);
  } catch (error) {
    console.error('GET /api/sessions error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized. Sign in with Google is required.' }, { status: 401 });
    }
    const userId = session.user.email;

    await connectDB();
    const body = await request.json();
    const { name, gameType, balanceMode, defaultBuyIn, sessionMode, hostName } = body;

    const validTypes = ['tp', 'pk', 'rummy', 'bj'];
    if (!gameType || !validTypes.includes(gameType)) {
      return NextResponse.json({ error: 'Invalid gameType. Must be "tp", "pk", "rummy", or "bj".' }, { status: 400 });
    }

    const gameLabels: Record<string, string> = {
      tp: 'Teen Patti',
      pk: 'Poker',
      rummy: 'Rummy',
      bj: 'Blackjack',
    };

    const sessionCount = await Session.countDocuments({ userId, gameType });
    const sessionName = name?.trim() || `${gameLabels[gameType] || 'Game'} Session #${sessionCount + 1}`;
    const mode = sessionMode === 'online' ? 'online' : 'tracker';

    // Generate unique 6-character room code for online sessions
    let roomCode = null;
    if (mode === 'online') {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      roomCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    const isBal = typeof balanceMode === 'boolean' ? balanceMode : false;
    const initialBuyIn = isBal ? (typeof defaultBuyIn === 'number' ? defaultBuyIn : 1000) : undefined;
    const hostDisplayName = hostName?.trim() || session.user.name || session.user.email.split('@')[0] || 'Host';

    // In online mode, creator is Session Owner & default Game Operator (cannot participate as player until GO role is transferred)
    const initialPlayers = mode === 'online' ? [{
      id: 'p1',
      name: hostDisplayName,
      userId,
      sit: false,
      balance: initialBuyIn,
      isOnline: true,
      isConnected: true,
      lastSeenAt: Date.now(),
      isGameOperator: true,
    }] : [];

    const newSession = await Session.create({
      userId,
      userEmail: userId,
      hostUserId: userId,
      gameOperatorUserId: mode === 'online' ? userId : null,
      goLastHeartbeat: mode === 'online' ? Date.now() : 0,
      readyPlayers: {},
      activityLog: mode === 'online' ? [`👑 Session created by ${hostDisplayName} (Session Owner & default Game Operator)`] : [],
      name: sessionName,
      gameType,
      sessionMode: mode,
      roomCode,
      status: 'active',
      ...FRESH_SESSION_DATA,
      players: initialPlayers,
      seq: mode === 'online' ? 2 : 1,
      balanceMode: isBal,
      defaultBuyIn: typeof defaultBuyIn === 'number' ? defaultBuyIn : 1000,
    });

    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    console.error('POST /api/sessions error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

