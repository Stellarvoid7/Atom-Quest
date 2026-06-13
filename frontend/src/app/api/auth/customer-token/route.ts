import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createLiveKitToken } from '@/lib/livekit';

export async function POST(req: Request) {
  const { inviteToken } = await req.json();

  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('invite_token', inviteToken)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
  }

  if (new Date(session.invite_expires_at) < new Date() || session.status !== 'active') {
    return NextResponse.json({ error: 'Invite expired or session inactive' }, { status: 403 });
  }

  const identity = `customer:${session.id}`;

  const { data: existingParticipant } = await supabaseAdmin
    .from('participants')
    .select('id')
    .eq('session_id', session.id)
    .eq('identity', identity)
    .single();

  if (!existingParticipant) {
    await supabaseAdmin.from('participants').insert({
      session_id: session.id,
      role: 'customer',
      identity: identity
    });
  }

  const token = await createLiveKitToken(identity, 'Customer', session.id, false);

  return NextResponse.json({ token, sessionId: session.id });
}
