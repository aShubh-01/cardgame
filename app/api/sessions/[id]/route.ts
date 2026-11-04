import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import Session from '@/lib/models/Session';

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
    const sessionDoc = await Session.findOne({ _id: params.id, userId }).lean();
    if (!sessionDoc) {
      return NextResponse.json({ error: 'Session not found or access denied.' }, { status: 404 });
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
    delete body.createdAt;
    delete body.updatedAt;
    delete body.__v;

    const updated = await Session.findOneAndUpdate(
      { _id: params.id, userId },
      { $set: body },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: 'Session not found or access denied.' }, { status: 404 });
    }

    return NextResponse.json(updated);
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

