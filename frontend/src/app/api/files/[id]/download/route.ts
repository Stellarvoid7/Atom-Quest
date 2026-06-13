import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyLiveKitToken } from '@/lib/verify-livekit-token';

/**
 * GET /api/files/[id]/download
 *
 * Mints a fresh short-lived signed URL from s3_key.
 * Participant-scoped: only participants of the same session can download.
 * Protected by LiveKit token.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: fileId } = await params;

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const payload = await verifyLiveKitToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  const tokenRoom = payload.video?.room;
  const identity = payload.sub;

  // Fetch the file
  const { data: file, error } = await supabaseAdmin
    .from('files')
    .select('id, session_id, s3_key, mime_type')
    .eq('id', fileId)
    .single();

  if (error || !file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Participant-scoped: token's room must match the file's session
  if (tokenRoom !== file.session_id) {
    return NextResponse.json({ error: 'Not authorized for this file' }, { status: 403 });
  }

  // Verify the identity is a participant of this session
  const { data: participant } = await supabaseAdmin
    .from('participants')
    .select('id')
    .eq('session_id', file.session_id)
    .eq('identity', identity)
    .single();

  if (!participant) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
  }

  // Mint fresh short-lived signed URL (60 seconds)
  const { data: signedUrl, error: signError } = await supabaseAdmin
    .storage
    .from('shared_files')
    .createSignedUrl(file.s3_key, 60);

  if (signError || !signedUrl) {
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  return NextResponse.json({ url: signedUrl.signedUrl, mimeType: file.mime_type });
}
