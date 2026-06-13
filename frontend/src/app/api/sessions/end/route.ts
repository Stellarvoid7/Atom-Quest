import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { RoomServiceClient } from 'livekit-server-sdk';

export async function POST(req: Request) {
  try {
    const { sessionId, notes } = await req.json();
    
    // 1. Immediately terminate the room in LiveKit to forcefully boot all clients
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';
    if (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
      const roomService = new RoomServiceClient(livekitUrl, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
      try {
        await roomService.deleteRoom(sessionId);
      } catch (e) {
        console.warn("Room already closed or not found in LiveKit");
      }
    }

    // 2. Fetch session start time to calculate accurate duration
    const { data: session } = await supabaseAdmin.from('sessions').select('start_time').eq('id', sessionId).single();
    const durationSeconds = session ? Math.floor((Date.now() - new Date(session.start_time).getTime()) / 1000) : null;

    // 3. Mark session as ended in database
    await supabaseAdmin.from('sessions').update({
      status: 'ended',
      end_time: new Date().toISOString(),
      duration_seconds: durationSeconds,
      agent_notes: notes || null
    }).eq('id', sessionId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Force end failed:", err);
    return NextResponse.json({ error: 'Failed to end session' }, { status: 500 });
  }
}
