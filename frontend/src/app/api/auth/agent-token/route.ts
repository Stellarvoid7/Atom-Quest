import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createLiveKitToken } from '@/lib/livekit';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId } = await req.json();

  // Verify ownership
  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('agent_id', user.id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 403 });
  }

  const identity = user.id;

  // Ensure agent is in participants
  const { data: existingParticipant } = await supabaseAdmin
    .from('participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('identity', identity)
    .single();

  if (!existingParticipant) {
    await supabaseAdmin.from('participants').insert({
      session_id: sessionId,
      role: 'agent',
      identity: identity
    });
  }

  // Mint token
  const token = await createLiveKitToken(identity, user.email || 'Agent', sessionId, true);

  return NextResponse.json({ token });
}
