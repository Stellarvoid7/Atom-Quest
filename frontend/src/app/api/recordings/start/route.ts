/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { EgressClient, EncodedFileOutput, EncodedFileType } from 'livekit-server-sdk';

/**
 * POST /api/recordings/start — Agent-only
 *
 * Starts a room composite egress. If Egress is resource-strained,
 * falls back to track composite (audio + single video).
 * Inserts a recordings row with status 'in_progress'.
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
    .select('id, agent_id, status')
    .eq('id', sessionId)
    .eq('agent_id', user.id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 403 });
  }

  if (session.status === 'ended') {
    return NextResponse.json({ error: 'Session already ended' }, { status: 400 });
  }

  // Check if already recording
  const { data: existing } = await supabaseAdmin
    .from('recordings')
    .select('id')
    .eq('session_id', sessionId)
    .eq('status', 'in_progress')
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Recording already in progress' }, { status: 409 });
  }

  const egressClient = new EgressClient(
    process.env.LIVEKIT_URL!,
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  );

  // Server-generated S3 key — never use client input for the path
  const s3Key = `recordings/${sessionId}/${Date.now()}.mp4`;

  const fileOutput = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: s3Key,
  });

  let egressId: string;

  try {
    // Try room composite first
    const info = await egressClient.startRoomCompositeEgress(
      sessionId,
      { file: fileOutput }
    );
    egressId = info.egressId;
  } catch (err: any) {
    // Fallback to track composite if resource-strained
    console.error('Room composite failed, trying track composite:', err.message);
    try {
      const info = await egressClient.startTrackCompositeEgress(
        sessionId,
        { file: fileOutput }
      );
      egressId = info.egressId;
    } catch (fallbackErr: any) {
      console.error('Track composite also failed:', fallbackErr.message);
      return NextResponse.json({ error: 'Failed to start recording' }, { status: 500 });
    }
  }

  // Insert recording row
  const { data: recording, error: insertError } = await supabaseAdmin
    .from('recordings')
    .insert({
      session_id: sessionId,
      egress_id: egressId,
      status: 'in_progress',
      s3_key: s3Key,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to insert recording:', insertError);
    return NextResponse.json({ error: 'Failed to create recording record' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    recordingId: recording.id,
    egressId,
  });
}
