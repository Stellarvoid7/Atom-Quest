import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    
    // Execute sequential deletion to satisfy foreign key constraints
    await supabaseAdmin.from('events').delete().eq('session_id', sessionId);
    await supabaseAdmin.from('chat_messages').delete().eq('session_id', sessionId);
    await supabaseAdmin.from('files').delete().eq('session_id', sessionId);
    await supabaseAdmin.from('recordings').delete().eq('session_id', sessionId);
    await supabaseAdmin.from('participants').delete().eq('session_id', sessionId);
    
    // Delete the root session
    const { error } = await supabaseAdmin.from('sessions').delete().eq('id', sessionId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete failed:", err);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
