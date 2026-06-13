import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/sessions/notes — Save agent notes mid-call
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId, notes } = await req.json();

  const { error } = await supabaseAdmin
    .from('sessions')
    .update({ agent_notes: notes })
    .eq('id', sessionId)
    .eq('agent_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to save notes' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
