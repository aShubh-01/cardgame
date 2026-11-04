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

    await connectDB();
    const { searchParams } = new URL(request.url);
    const gameType = searchParams.get('gameType');

    const query: any = { userId };
    if (gameType && (gameType === 'tp' || gameType === 'pk')) {
      query.gameType = gameType;
    }

    let sessions = await Session.find(query).sort({ updatedAt: -1 }).lean();

    // Auto-create default active sessions (Session #1) if none exist for this user
    const hasTp = sessions.some((s: any) => s.gameType === 'tp');
    const hasPk = sessions.some((s: any) => s.gameType === 'pk');

    const toCreate: any[] = [];
    if (!hasTp && (!gameType || gameType === 'tp')) {
      toCreate.push({
        userId,
        userEmail: userId,
        name: 'Teen Patti Session #1',
        gameType: 'tp',
        status: 'active',
        ...FRESH_SESSION_DATA,
      });
    }
    if (!hasPk && (!gameType || gameType === 'pk')) {
      toCreate.push({
        userId,
        userEmail: userId,
        name: 'Poker Session #1',
        gameType: 'pk',
        status: 'active',
        ...FRESH_SESSION_DATA,
      });
    }

    if (toCreate.length > 0) {
      await Session.insertMany(toCreate);
      sessions = await Session.find(query).sort({ updatedAt: -1 }).lean();
    }

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
    const { name, gameType, balanceMode, defaultBuyIn } = body;

    if (!gameType || (gameType !== 'tp' && gameType !== 'pk')) {
      return NextResponse.json({ error: 'Invalid gameType. Must be "tp" or "pk".' }, { status: 400 });
    }

    const sessionCount = await Session.countDocuments({ userId, gameType });
    const sessionName = name?.trim() || `${gameType === 'pk' ? 'Poker' : 'Teen Patti'} Session #${sessionCount + 1}`;

    const newSession = await Session.create({
      userId,
      userEmail: userId,
      name: sessionName,
      gameType,
      status: 'active',
      ...FRESH_SESSION_DATA,
      balanceMode: typeof balanceMode === 'boolean' ? balanceMode : false,
      defaultBuyIn: typeof defaultBuyIn === 'number' ? defaultBuyIn : 1000,
    });

    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    console.error('POST /api/sessions error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

