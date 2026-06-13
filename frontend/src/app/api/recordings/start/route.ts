/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await req.json();

  const egressId = 'EG_' + Math.random().toString(36).substring(2, 15);
  
  const { data, error } = await supabaseAdmin
    .from('recordings')
    .insert({
      session_id: sessionId,
      egress_id: egressId,
      status: 'in_progress',
      s3_key: `internal/buffer/${sessionId}.mp4`
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to start recording' }, { status: 500 });

  return NextResponse.json({ recordingId: data.id, egressId: egressId });
}
