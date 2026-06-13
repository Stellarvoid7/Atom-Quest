import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { RoomServiceClient } from 'livekit-server-sdk';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId, notes } = await req.json();

  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('agent_id', user.id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 403 });
  }

  // End LiveKit room
  const roomService = new RoomServiceClient(
    process.env.LIVEKIT_URL!,
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  );

  try {
    await roomService.deleteRoom(sessionId);
  } catch (e) {
    console.error('Failed to delete room on LiveKit:', e);
  }

  const durationSeconds = Math.floor((new Date().getTime() - new Date(session.start_time).getTime()) / 1000);

  const { error: updateError } = await supabaseAdmin
    .from('sessions')
    .update({
      status: 'ended',
      end_time: new Date().toISOString(),
      duration_seconds: durationSeconds,
      ...(notes ? { agent_notes: notes } : {}),
    })
    .eq('id', sessionId);

  if (updateError) {
    console.error('Failed to update session:', updateError);
    return NextResponse.json({ error: 'Failed to update session in DB' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
