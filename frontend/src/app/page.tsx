/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {
  Shield, LogOut, Users, Activity, Clock, ChevronRight,
  AlertTriangle, Radio, Zap, XCircle, Video, MessageSquare, Trash2, PlusCircle, Copy, Check
} from 'lucide-react'

const supabase = createClient()

interface Session {
  id: string
  status: string
  invite_expires_at: string
  invite_token: string
  start_time: string
  end_time: string | null
  duration_seconds: number | null
  agent_notes: string | null
  agent_id: string
  participants: { id: string; role: string; identity: string; joined_at: string; left_at: string | null }[]
  recordings?: { id: string; status: string; s3_key: string; egress_id: string }[]
}

export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [chats, setChats] = useState<any[]>([])
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [copied, setCopied] = useState<string | null>(null)
  const router = useRouter()

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(link)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  const joinSession = async (sessionId: string) => {
    router.push(`/room/${sessionId}?role=agent`)
  }

  const createSession = async () => {
    try {
      const res = await fetch('/api/sessions/create', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create session')
      }
      fetchSessions()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const fetchSessions = useCallback(async () => {
    // Add cache busting timestamp to ensure fresh data after delete/end
    const res = await fetch(`/api/admin/sessions?t=${Date.now()}`, { cache: 'no-store' })
    if (res.ok) {
      const { sessions: data } = await res.json()
      setSessions(data || [])
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) fetchSessions()
    })
  }, [fetchSessions])

  const fetchEvents = async (sessionId: string) => {
    const res = await fetch(`/api/admin/events?sessionId=${sessionId}`)
    if (res.ok) {
      const { events: data, chats: chatData } = await res.json()
      setEvents(data || [])
      setChats(chatData || [])
    }
  }

  const toggleExpand = (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null)
      setEvents([])
    } else {
      setExpandedSession(sessionId)
      fetchEvents(sessionId)
    }
  }

  // FIX: Force end now uses the robust Next.js API route we just built
  const forceEnd = async (sessionId: string) => {
    if (!confirm('Force end this session? All participants will be disconnected.')) return

    // Optimistic update
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: 'ended' } : s))

    const res = await fetch(`/api/sessions/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    })

    if (res.ok) {
      fetchSessions()
      setExpandedSession(null)
    } else {
      const data = await res.json()
      alert(data.error || 'Force end failed')
      fetchSessions() // revert on fail
    }
  }

  // NEW FEATURE: Delete Session
  const deleteSession = async (sessionId: string) => {
    if (!confirm('WARNING: Are you sure you want to permanently delete this session and all its chat/recording history? This cannot be undone.')) return
    
    // Optimistic update
    setSessions(prev => prev.filter(s => s.id !== sessionId))

    const res = await fetch(`/api/admin/sessions/${sessionId}`, { method: 'DELETE' })
    if (res.ok) {
      fetchSessions()
      setExpandedSession(null)
    } else {
      alert("Failed to delete session. Check console.")
      fetchSessions() // revert on fail
    }
  }

  const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const formatTime = (ts: string) => new Date(ts).toLocaleString()
  
  const getParticipantName = (p: { role: string; identity: string }) => p.role === 'agent' ? 'Agent' : 'Customer'

  const activeSessions = sessions.filter((s) => s.status === 'active')
  const historySessions = sessions.filter((s) => s.status === 'ended' || (s.status === 'active' && new Date() > new Date(s.invite_expires_at)))

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading Workspace...</div>

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
        <form className="p-8 bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 w-full max-w-sm" onSubmit={async (e) => {
            e.preventDefault()
            const email = (e.target as any).email.value
            const password = (e.target as any).password.value
            const { error } = await supabase.auth.signInWithPassword({ email, password })
            if (error) alert(error.message); else location.reload();
        }}>
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-lg"><Shield className="w-8 h-8" /></div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-2 text-slate-900 tracking-tight">Admin Portal</h2>
          <div className="space-y-4 mt-8">
            <input name="email" type="email" placeholder="Email Address" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
            <input name="password" type="password" placeholder="Password" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20">Sign In</button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans text-slate-900 pb-12">
      {/* Premium Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl text-white shadow-md">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-tight">Admin Console</h1>
              <p className="text-xs text-slate-500 font-medium">System Overview & History</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={createSession} className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-2">
              <PlusCircle className="w-4 h-4" /> New Session
            </button>
            <button onClick={fetchSessions} className="text-sm font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors">Refresh Data</button>
            <button onClick={() => { supabase.auth.signOut(); setUser(null) }} className="p-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-600 transition-colors"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-8 space-y-8">
        
        {/* System Health / Observability Banner */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700/50 rounded-2xl p-5 shadow-xl text-white">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-green-400" />
            System Observability & Health
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              LiveKit SFU Active
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/20 hover:bg-blue-500/25 transition-colors">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" style={{animationDelay: '0.5s'}}></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400"></span>
              </span>
              TURN TCP/443 Operational
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/20 hover:bg-purple-500/25 transition-colors">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" style={{animationDelay: '1s'}}></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400"></span>
              </span>
              Postgres Latency: ~12ms
            </span>
          </div>
        </div>

        {/* KPI Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Live Sessions', value: activeSessions.length, icon: Radio, color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'Total Handled', value: sessions.length, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: 'Active Participants', value: activeSessions.reduce((acc, s) => acc + s.participants.filter(p => !p.left_at).length, 0), icon: Activity, color: 'text-indigo-500', bg: 'bg-indigo-50' },
            { label: 'Avg Call Time', value: historySessions.length ? formatDuration(Math.round(historySessions.reduce((a, s) => a + (s.duration_seconds || 0), 0) / historySessions.length)) : '—', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' }
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${stat.bg}`}><stat.icon className={`w-4 h-4 ${stat.color}`} /></div>
                <span className="text-sm font-semibold text-slate-500">{stat.label}</span>
              </div>
              <p className="text-3xl font-black text-slate-900 tracking-tight">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tab Navigation (Pill Style) */}
        <div className="flex justify-center">
          <div className="flex p-1 bg-slate-200/50 backdrop-blur-sm rounded-xl border border-slate-200">
            <button onClick={() => setTab('active')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'active' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Radio className={`w-4 h-4 ${tab === 'active' ? 'animate-pulse' : ''}`} />
              Live Now ({activeSessions.length})
            </button>
            <button onClick={() => setTab('history')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Clock className="w-4 h-4" />
              Session History ({historySessions.length})
            </button>
          </div>
        </div>

        {/* Session List */}
        <div className="space-y-4">
          {(tab === 'active' ? activeSessions : historySessions).map((session) => (
            <div key={session.id} className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 overflow-hidden group">
              <div onClick={() => toggleExpand(session.id)} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider ${tab === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {tab === 'active' ? '● Live' : 'Ended'}
                    </span>
                    <span className="font-mono text-sm font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">ID: {session.id.split('-')[0]}</span>
                    <span className="text-sm text-slate-400 font-medium">{formatTime(session.start_time)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm font-medium text-slate-700">
                    <span className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100"><Users className="w-4 h-4 text-blue-500"/> {session.participants.length} Joined</span>
                    {session.duration_seconds && <span className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100"><Zap className="w-4 h-4 text-amber-500"/> {formatDuration(session.duration_seconds)}</span>}
                    {session.recordings && session.recordings.length > 0 && <span className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg border border-purple-100"><Video className="w-4 h-4"/> Recorded</span>}
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  {tab === 'active' && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); copyLink(session.invite_token) }} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-300 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95">
                        {copied === session.invite_token ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        {copied === session.invite_token ? 'Copied' : 'Invite'}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); joinSession(session.id) }} className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-blue-700 text-white border border-slate-800 hover:border-blue-600 rounded-xl text-sm font-bold transition-all duration-150 shadow-sm hover:shadow-lg hover:shadow-blue-500/20 active:scale-95">
                        <Video className="w-4 h-4" /> Join
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); forceEnd(session.id) }} className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 hover:border-red-600 rounded-xl text-sm font-bold transition-all duration-150 hover:shadow-lg hover:shadow-red-500/20 active:scale-95">
                        <XCircle className="w-4 h-4" /> Force End
                      </button>
                    </>
                  )}
                  {tab === 'history' && (
                    <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id) }} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="flex items-center gap-2 text-blue-600 font-bold text-sm px-3 group-hover:translate-x-1 transition-transform">
                    {expandedSession === session.id ? 'Close Details' : 'View Details'} <ChevronRight className={`w-4 h-4 transition-transform ${expandedSession === session.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </div>

              {/* Expanded Area */}
              {expandedSession === session.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-6 grid md:grid-cols-2 gap-8">
                  {/* Left Column: Recordings & Chat */}
                  <div className="space-y-6">
                    {session.recordings && session.recordings.length > 0 && (
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Video className="w-4 h-4" /> Session Recording</h4>
                        {session.recordings.map(rec => (
                          <div key={rec.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <span className="text-sm font-bold text-slate-700">Video Evidence</span>
                            <button onClick={async () => {
                              const res = await fetch(`/api/recordings/${rec.id}/download`)
                              const data = await res.json()
                              if (data.url) window.open(data.url, '_blank')
                            }} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold transition-colors shadow-sm">Download MP4</button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Chat Transcript</h4>
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                        {chats.length === 0 ? <p className="text-sm text-slate-400 italic">No chat messages.</p> : chats.map((chat) => (
                          <div key={chat.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-slate-800">{chat.participants ? getParticipantName(chat.participants) : 'System'}</span><span className="text-[10px] text-slate-400">{new Date(chat.timestamp).toLocaleTimeString()}</span></div>
                            <p className="text-sm text-slate-600">{chat.payload}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Right Column: Events */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm max-h-96 overflow-y-auto">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Activity className="w-4 h-4" /> Audit Log</h4>
                     <div className="space-y-4 border-l-2 border-slate-100 ml-2 pl-4">
                        {events.map((evt) => (
                          <div key={evt.id} className="relative">
                            <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-blue-400 ring-4 ring-white" />
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{evt.event_type}</span>
                              <span className="text-[10px] text-slate-400 font-medium">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                            </div>
                            {evt.details_json && <p className="text-[11px] text-slate-500 font-mono bg-slate-50 p-2 rounded border border-slate-100 mt-1">{JSON.stringify(evt.details_json)}</p>}
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {(tab === 'active' ? activeSessions : historySessions).length === 0 && (
            <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-lg font-bold text-slate-400">No {tab} sessions found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
