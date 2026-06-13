/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { EgressClient } from 'livekit-server-sdk';

/**
 * POST /api/recordings/stop — Agent-only
 *
 * Stops an active egress by egressId.
 * The webhook on the VM event-service drives the status machine
 * from in_progress → processing → ready/failed.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId } = await req.json();

  // Verify agent owns this session
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('sessions')
    .select('id, agent_id')
    .eq('id', sessionId)
    .eq('agent_id', user.id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 403 });
  }

  // Find active recording
  const { data: recording, error: recError } = await supabaseAdmin
    .from('recordings')
    .select('id, egress_id')
    .eq('session_id', sessionId)
    .eq('status', 'in_progress')
    .single();

  if (recError || !recording) {
    return NextResponse.json({ error: 'No active recording found' }, { status: 404 });
  }

  const egressClient = new EgressClient(
    process.env.LIVEKIT_URL!,
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  );

  try {
    await egressClient.stopEgress(recording.egress_id);
  } catch (err: any) {
    console.error('Failed to stop egress:', err.message);
    return NextResponse.json({ error: 'Failed to stop recording' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recordingId: recording.id });
}
