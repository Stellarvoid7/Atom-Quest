import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userRow || userRow.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });

  const { data: chats } = await supabaseAdmin
    .from('chat_messages')
    .select('*, files(s3_key, mime_type, id), participants(role, identity)')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }

  return NextResponse.json({ events, chats: chats || [] });
}
