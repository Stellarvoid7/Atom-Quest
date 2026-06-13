import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyLiveKitToken } from '@/lib/verify-livekit-token';

/**
 * POST /api/files/presigned-post
 *
 * Protected by a valid session LiveKit token (from Authorization header).
 * Returns a Supabase presigned upload URL with a SERVER-generated s3_key.
 * NEVER uses the client's filename as the key.
 *
 * The bucket `shared_files` enforces:
 *   - file_size_limit: 5242880 (5 MB) — rejects with 413
 *   - allowed_mime_types: ['image/jpeg', 'image/png', 'application/pdf']
 */
export async function POST(req: Request) {
  // 1. Verify LiveKit token
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const payload = await verifyLiveKitToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  const sessionId = payload.video?.room;
  const identity = payload.sub;
  if (!sessionId || !identity) {
    return NextResponse.json({ error: 'Token missing room or identity' }, { status: 403 });
  }

  // 2. Verify session is active
  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('status')
    .eq('id', sessionId)
    .single();

  if (!session || session.status === 'ended') {
    return NextResponse.json({ error: 'Session ended or not found' }, { status: 403 });
  }

  // 3. Look up participant for this session + identity
  const { data: participant } = await supabaseAdmin
    .from('participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('identity', identity)
    .single();

  if (!participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 403 });
  }

  // 4. Parse the requested file metadata (for the files table, NOT for the key)
  const body = await req.json();
  const { mimeType, fileSize, originalName } = body;

  if (!mimeType || !fileSize) {
    return NextResponse.json({ error: 'mimeType and fileSize required' }, { status: 400 });
  }

  // 5. SERVER-generated s3_key — never use client filename
  const ext = mimeType === 'application/pdf' ? 'pdf'
    : mimeType === 'image/png' ? 'png'
    : 'jpg';
  const s3Key = `${sessionId}/${crypto.randomUUID()}.${ext}`;

  // 6. Create a presigned upload URL via Supabase Storage
  const { data: uploadData, error: uploadError } = await supabaseAdmin
    .storage
    .from('shared_files')
    .createSignedUploadUrl(s3Key);

  if (uploadError || !uploadData) {
    console.error('Presigned upload error:', uploadError);
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
  }

  return NextResponse.json({
    uploadUrl: uploadData.signedUrl,
    uploadToken: uploadData.token,
    s3Key,
    sessionId,
    participantId: participant.id,
    path: uploadData.path,
  });
}
