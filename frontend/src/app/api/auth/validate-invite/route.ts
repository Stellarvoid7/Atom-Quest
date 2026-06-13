import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/auth/validate-invite
 * Lightweight endpoint to check if an invite token is valid
 * without minting a LiveKit token. Used by the invite page
 * to show a friendly error BEFORE the user sets up their device.
 */
export async function POST(req: Request) {
  const { inviteToken } = await req.json();

  if (!inviteToken) {
    return NextResponse.json({ error: 'Missing invite token' }, { status: 400 });
  }

  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .select('id, invite_expires_at, status')
    .eq('invite_token', inviteToken)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
  }

  if (new Date(session.invite_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invite expired' }, { status: 403 });
  }

  if (session.status !== 'active') {
    return NextResponse.json({ error: 'Session inactive' }, { status: 403 });
  }

  return NextResponse.json({ valid: true });
}
