/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
  const { sessionId } = await req.json();

  // Mark the active recording as ready
  const { error } = await supabaseAdmin
    .from('recordings')
    .update({ 
      status: 'ready',
      s3_key: `internal/buffer/${sessionId}.mp4`
    })
    .eq('session_id', sessionId)
    .eq('status', 'in_progress');

  if (error) return NextResponse.json({ error: 'Failed to stop recording' }, { status: 500 });

  return NextResponse.json({ success: true });
}
