/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role bypassed for unified hackathon dashboard

  // Fetch all sessions with participant counts and recordings
  const { data: sessions, error } = await supabaseAdmin
    .from('sessions')
    .select('*, participants(id, role, identity, joined_at, left_at), recordings(id, status, s3_key, egress_id)')
    .order('start_time', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }

  return NextResponse.json({ sessions });
}
