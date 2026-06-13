/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await req.json();

  // SIMULATION: Create a fake egress record
  const fakeEgressId = 'simulated-egress-' + Date.now();
  
  const { data, error } = await supabaseAdmin
    .from('recordings')
    .insert({
      session_id: sessionId,
      egress_id: fakeEgressId,
      status: 'in_progress', // Shows the red recording dot in the UI
      s3_key: 'simulated-demo-video.mp4' // Added to prevent null issues if schema requires it, or we set it on stop
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to start simulated recording' }, { status: 500 });

  return NextResponse.json({ recordingId: data.id, egressId: fakeEgressId });
}
