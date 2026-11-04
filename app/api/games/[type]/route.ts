import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import Game from '@/lib/models/Game';

const FRESH_STATE = {
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

export async function GET(
  _request: NextRequest,
  { params }: { params: { type: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized. Sign in with Google is required.' },
        { status: 401 }
      );
    }
    const userId = session.user.email;

    await connectDB();
    const { type } = params;

    const validTypes = ['tp', 'pk', 'rummy', 'bj'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid game type. Use "tp", "pk", "rummy", or "bj".' },
        { status: 400 }
      );
    }

    let game = await Game.findOne({ userId, gameType: type });

    if (!game) {
      game = await Game.create({ userId, gameType: type, ...FRESH_STATE });
    }

    return NextResponse.json(game);
  } catch (error) {
    console.error('GET /api/games/[type] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game state' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { type: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized. Sign in with Google is required.' },
        { status: 401 }
      );
    }
    const userId = session.user.email;

    await connectDB();
    const { type } = params;

    const validTypes = ['tp', 'pk', 'rummy', 'bj'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid game type. Use "tp", "pk", "rummy", or "bj".' },
        { status: 400 }
      );
    }

    const body = await request.json();
    delete body._id;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.__v;

    const game = await Game.findOneAndUpdate(
      { userId, gameType: type },
      { $set: { ...body, userId, gameType: type } },
      { upsert: true, new: true, runValidators: true }
    );

    return NextResponse.json(game);
  } catch (error) {
    console.error('PUT /api/games/[type] error:', error);
    return NextResponse.json(
      { error: 'Failed to update game state' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { type: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized. Sign in with Google is required.' },
        { status: 401 }
      );
    }
    const userId = session.user.email;

    await connectDB();
    const { type } = params;

    const validTypes = ['tp', 'pk', 'rummy', 'bj'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid game type. Use "tp", "pk", "rummy", or "bj".' },
        { status: 400 }
      );
    }

    const game = await Game.findOneAndUpdate(
      { userId, gameType: type },
      { $set: { userId, gameType: type, ...FRESH_STATE } },
      { upsert: true, new: true, runValidators: true }
    );

    return NextResponse.json(game);
  } catch (error) {
    console.error('DELETE /api/games/[type] error:', error);
    return NextResponse.json(
      { error: 'Failed to reset game state' },
      { status: 500 }
    );
  }
}
