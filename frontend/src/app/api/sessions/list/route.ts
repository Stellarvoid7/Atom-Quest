import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use admin client to bypass RLS, filtered to this agent's sessions
  const { data: sessions, error } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('agent_id', user.id)
    .order('start_time', { ascending: false });

  if (error) {
    console.error('Session list error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }

  return NextResponse.json({ sessions });
}
