import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Create session
  const inviteToken = randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 30);

  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .insert({
      invite_token: inviteToken,
      invite_expires_at: expiresAt.toISOString(),
      agent_id: user.id,
      status: 'active'
    })
    .select()
    .single();

  if (error) {
    console.error('Session creation error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }

  return NextResponse.json({
    sessionId: session.id,
    inviteToken: session.invite_token,
    expiresAt: session.invite_expires_at
  });
}
