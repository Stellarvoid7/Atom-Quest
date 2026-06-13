import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyLiveKitToken } from '@/lib/verify-livekit-token';

/**
 * POST /api/sessions/[id]/chat
 *
 * Hardened chat persistence endpoint (Gotcha #4):
 * - Auth: verifies LiveKit JWT from Authorization header
 * - Room binding: rejects if token's room claim ≠ path [id]
 * - Session guard: rejects if session is ended
 * - Sender derivation: looks up participants row by token identity + session_id
 *   and uses ITS id as participant_id FK. NEVER trusts participant_id from body.
 * - Idempotency: relies on UNIQUE(session_id, client_message_id) constraint
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  // 1. Extract and verify the LiveKit token from Authorization header
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header' },
      { status: 401 }
    );
  }

  const livekitToken = authHeader.slice(7);
  const payload = await verifyLiveKitToken(livekitToken);

  if (!payload) {
    return NextResponse.json(
      { error: 'Invalid LiveKit token' },
      { status: 403 }
    );
  }

  // 2. Reject if the token's room claim does not match the [id] in the path
  const tokenRoom = payload.video?.room;
  if (tokenRoom !== sessionId) {
    return NextResponse.json(
      { error: 'Token room does not match session' },
      { status: 403 }
    );
  }

  // 3. Reject if the session status is 'ended'
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('sessions')
    .select('status')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  }

  if (session.status === 'ended') {
    return NextResponse.json(
      { error: 'Session has ended' },
      { status: 403 }
    );
  }

  // 4. Derive sender from token identity — look up participants row
  //    for THIS session by that identity. NEVER trust body.participant_id.
  const tokenIdentity = payload.sub;
  if (!tokenIdentity) {
    return NextResponse.json(
      { error: 'Token missing identity' },
      { status: 403 }
    );
  }

  const { data: participant, error: participantError } = await supabaseAdmin
    .from('participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('identity', tokenIdentity)
    .single();

  if (participantError || !participant) {
    return NextResponse.json(
      { error: 'Participant not found for this session' },
      { status: 403 }
    );
  }

  // 5. Parse the message body
  const body = await req.json();
  const { payload: messagePayload, clientMessageId } = body;

  if (!messagePayload || !clientMessageId) {
    return NextResponse.json(
      { error: 'Missing payload or clientMessageId' },
      { status: 400 }
    );
  }

  // 6. Insert message — idempotency via UNIQUE(session_id, client_message_id)
  const { data: message, error: insertError } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      participant_id: participant.id,
      payload: messagePayload,
      client_message_id: clientMessageId,
    })
    .select('id, timestamp')
    .single();

  if (insertError) {
    // Check for unique constraint violation (duplicate = idempotent success)
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true, deduplicated: true });
    }
    console.error('Chat insert error:', insertError);
    return NextResponse.json(
      { error: 'Failed to persist message' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    messageId: message.id,
    timestamp: message.timestamp,
  });
}
