import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/recordings/[id]/download — Agent-only
 *
 * Mints a FRESH short-lived signed URL from s3_key on each request.
 * Never stores or returns a long-lived URL (gotcha #6).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recordingId } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch recording and verify agent ownership via session
  const { data: recording, error } = await supabaseAdmin
    .from('recordings')
    .select('id, session_id, s3_key, status')
    .eq('id', recordingId)
    .single();

  if (error || !recording) {
    return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
  }

  // Fetch the requesting user's role to allow admins
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  // Verify the requesting user is the agent who owns this session, or an admin
  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('agent_id')
    .eq('id', recording.session_id)
    .single();

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.agent_id !== user.id && userRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (recording.status !== 'ready') {
    return NextResponse.json({ error: 'Recording not ready for download' }, { status: 400 });
  }

  if (!recording.s3_key) {
    return NextResponse.json({ error: 'No file available' }, { status: 404 });
  }

  // Mint a fresh short-lived signed URL (60 seconds)
  const { data: signedUrl, error: signError } = await supabaseAdmin
    .storage
    .from('recordings')
    .createSignedUrl(recording.s3_key, 60);

  if (signError || !signedUrl) {
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  return NextResponse.json({ url: signedUrl.signedUrl });
}
