import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyLiveKitToken } from '@/lib/verify-livekit-token';

/**
 * POST /api/files/confirm
 *
 * Called after a successful upload. Creates the files row and
 * sends a chat message with file_id so the file renders inline.
 * Protected by LiveKit token.
 */
export async function POST(req: Request) {
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

  const { data: participant } = await supabaseAdmin
    .from('participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('identity', identity)
    .single();

  if (!participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 403 });
  }

  const body = await req.json();
  const { s3Key, mimeType, fileSize, originalName, clientMessageId } = body;

  if (!s3Key || !mimeType || !clientMessageId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // 1. Create the files row
  const { data: file, error: fileError } = await supabaseAdmin
    .from('files')
    .insert({
      session_id: sessionId,
      uploader_id: participant.id,
      s3_key: s3Key,
      mime_type: mimeType,
      size_bytes: fileSize || 0,
    })
    .select('id')
    .single();

  if (fileError || !file) {
    console.error('Failed to create file record:', fileError);
    return NextResponse.json({ error: 'Failed to create file record' }, { status: 500 });
  }

  // 2. Create a chat message with file_id set so it renders inline
  const { error: chatError } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      participant_id: participant.id,
      payload: `📎 ${originalName || 'File'}`,
      file_id: file.id,
      client_message_id: clientMessageId,
    });

  if (chatError) {
    // Dedupe is fine (23505)
    if (chatError.code !== '23505') {
      console.error('Failed to create chat message for file:', chatError);
    }
  }

  return NextResponse.json({
    ok: true,
    fileId: file.id,
  });
}
