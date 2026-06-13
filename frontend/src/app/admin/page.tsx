'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {
  Shield, LogOut, Users, Activity, Clock, ChevronDown, ChevronRight,
  AlertTriangle, Radio, Zap, User, XCircle, Video,
} from 'lucide-react'

const supabase = createClient()

interface Session {
  id: string
  status: string
  start_time: string
  end_time: string | null
  duration_seconds: number | null
  agent_notes: string | null
  agent_id: string
  participants: { id: string; role: string; identity: string; joined_at: string; left_at: string | null }[]
  recordings?: { id: string; status: string; s3_key: string; egress_id: string }[]
}

interface EventRow {
  id: string
  session_id: string
  event_type: string
  details_json: any
  timestamp: string
}

export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) fetchSessions()
    })
  }, [])

  const fetchSessions = async () => {
    const res = await fetch('/api/admin/sessions')
    if (res.ok) {
      const { sessions: data } = await res.json()
      setSessions(data || [])
    } else if (res.status === 403) {
      alert('Admin access required')
      router.push('/')
    }
  }

  const fetchEvents = async (sessionId: string) => {
    setEventsLoading(true)
    const res = await fetch(`/api/admin/events?sessionId=${sessionId}`)
    if (res.ok) {
      const { events: data } = await res.json()
      setEvents(data || [])
    }
    setEventsLoading(false)
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

  const forceEnd = async (sessionId: string) => {
    if (!confirm('Force end this session? All participants will be disconnected.')) return

    const eventServiceUrl = process.env.NEXT_PUBLIC_EVENT_SERVICE_URL || ''
    if (!eventServiceUrl) {
      alert('Event service URL not configured (NEXT_PUBLIC_EVENT_SERVICE_URL)')
      return
    }

    const { data: { session: authSession } } = await supabase.auth.getSession()
    const res = await fetch(`${eventServiceUrl}/api/admin/force-end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authSession?.access_token}`,
      },
      body: JSON.stringify({ sessionId }),
    })

    if (res.ok) {
      fetchSessions()
    } else {
      const data = await res.json()
      alert(data.error || 'Force end failed')
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert(error.message)
    else {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user)
      fetchSessions()
    }
    setLoading(false)
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${s}s`
  }

  const formatTime = (ts: string) => new Date(ts).toLocaleString()

  const getDisplayStatus = (session: Session) => {
    if (session.status === 'ended') {
      const customerJoined = session.participants.some((p) => p.role === 'customer')
      return customerJoined ? 'Resolved' : 'Expired'
    }
    if (session.status === 'active') {
      const isExpired = new Date() > new Date(session.invite_expires_at)
      const customerJoined = session.participants.some((p) => p.role === 'customer')
      if (isExpired && !customerJoined) {
        return 'Expired'
      }
      return 'Active'
    }
    return session.status
  }

  const getParticipantName = (p: { role: string; identity: string }) => {
    if (p.role === 'agent') return 'Agent'
    const parts = p.identity.split(':')
    return parts.length > 2 ? parts.slice(2).join(':') : 'Customer'
  }

  const activeSessions = sessions.filter((s) => getDisplayStatus(s) === 'Active')
  const historySessions = sessions.filter((s) => {
    const status = getDisplayStatus(s)
    return status === 'Resolved' || status === 'Expired'
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center text-slate-500 font-medium">
        Loading...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-4 font-sans">
        <form onSubmit={handleLogin} className="p-8 bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-slate-900 text-white rounded-xl shadow-sm">
              <Shield className="w-8 h-8" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-center mb-2 tracking-tight">Admin Panel</h2>
          <p className="text-center text-slate-500 mb-8 text-sm">Sign in with admin credentials</p>
          <div className="space-y-4">
            <input
              name="email"
              type="email"
              placeholder="Email"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-100 text-sm font-medium"
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-100 text-sm font-medium"
            />
            <button
              type="submit"
              className="w-full bg-slate-900 text-white hover:bg-slate-800 font-medium py-2.5 rounded-xl transition-all text-sm"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-lg text-white shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Admin Control Panel</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchSessions}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={() => { supabase.auth.signOut(); setUser(null) }}
              className="p-2 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm rounded-lg text-slate-500"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Radio className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-slate-500">Live Sessions</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{activeSessions.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium text-slate-500">Total Sessions</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{sessions.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-medium text-slate-500">Connected Now</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {activeSessions.reduce((acc, s) => acc + s.participants.filter((p) => !p.left_at).length, 0)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium text-slate-500">Avg Duration</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {historySessions.length > 0
                ? formatDuration(Math.round(historySessions.reduce((a, s) => a + (s.duration_seconds || 0), 0) / historySessions.length))
                : '—'}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit">
          <button
            onClick={() => setTab('active')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'active' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Live ({activeSessions.length})
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'history' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            History ({historySessions.length})
          </button>
        </div>

        {/* Session List */}
        <div className="space-y-3">
          {(tab === 'active' ? activeSessions : historySessions).map((session) => (
            <div key={session.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="relative flex h-2 w-2">
                      {getDisplayStatus(session) === 'Active' && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      )}
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${
                        getDisplayStatus(session) === 'Active' ? 'bg-blue-500' : getDisplayStatus(session) === 'Resolved' ? 'bg-green-500' : 'bg-slate-300'
                      }`} />
                    </span>
                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200">
                      {session.id.slice(0, 8)}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">
                      {session.participants.find(p => p.role === 'customer') ? getParticipantName(session.participants.find(p => p.role === 'customer')!) : 'Waiting...'}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      getDisplayStatus(session) === 'Active'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : getDisplayStatus(session) === 'Resolved'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {getDisplayStatus(session)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(session.start_time)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {session.participants.length} participants
                    </span>
                    {session.duration_seconds && (
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {formatDuration(session.duration_seconds)}
                      </span>
                    )}
                  </div>
                  {/* Participant pills */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {session.participants.map((p) => (
                      <span
                        key={p.id}
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          p.left_at
                            ? 'bg-slate-50 text-slate-400 border-slate-200'
                            : p.role === 'agent'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        <User className="w-2.5 h-2.5" />
                        {getParticipantName(p)} {p.left_at ? '(left)' : ''}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleExpand(session.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-600 transition-colors"
                  >
                    {expandedSession === session.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Events
                  </button>
                  {getDisplayStatus(session) === 'Active' && (
                    <button
                      onClick={() => forceEnd(session.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg text-xs font-semibold text-red-700 transition-colors"
                    >
                      <XCircle className="w-3 h-3" />
                      Force End
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Session Details */}
              {expandedSession === session.id && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-6">
                  
                  {/* Recordings Section */}
                  {session.recordings && session.recordings.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Video className="w-4 h-4 text-slate-500" />
                        Recordings
                      </h4>
                      <div className="flex flex-col gap-2">
                        {session.recordings.map(rec => (
                          <div key={rec.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${rec.status === 'ready' ? 'bg-green-500' : rec.status === 'failed' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
                              <span className="text-xs font-medium text-slate-700">
                                {rec.status === 'ready' ? 'Recording Ready' : rec.status === 'failed' ? 'Recording Failed' : 'Processing...'}
                              </span>
                            </div>
                            {rec.status === 'ready' && (
                              <button
                                onClick={async () => {
                                  const res = await fetch(`/api/recordings/${rec.id}/download`)
                                  const data = await res.json()
                                  if (data.url) window.open(data.url, '_blank')
                                  else alert('Failed to get download URL: ' + data.error)
                                }}
                                className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-md text-xs font-semibold transition-colors"
                              >
                                Download
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Events Section */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-slate-500" />
                      Session Events
                    </h4>
                    {eventsLoading ? (
                    <p className="text-xs text-slate-400 font-medium">Loading events...</p>
                  ) : events.length === 0 ? (
                    <p className="text-xs text-slate-400 font-medium">No events recorded yet</p>
                  ) : (
                    <div className="space-y-2">
                      {events.map((evt) => (
                        <div key={evt.id} className="flex items-start gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                evt.event_type === 'joined' ? 'bg-green-50 text-green-700' :
                                evt.event_type === 'left' ? 'bg-red-50 text-red-700' :
                                evt.event_type === 'reconnected' ? 'bg-amber-50 text-amber-700' :
                                evt.event_type === 'force_ended' ? 'bg-red-50 text-red-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {evt.event_type}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(evt.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            {evt.details_json && Object.keys(evt.details_json).length > 0 && (
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                                {JSON.stringify(evt.details_json)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>

                  {/* Agent Notes */}
                  {session.agent_notes && (
                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <p className="text-xs font-semibold text-slate-600 mb-1">Agent Notes</p>
                      <p className="text-xs text-slate-500 whitespace-pre-wrap bg-white rounded-lg p-3 border border-slate-200">
                        {session.agent_notes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {(tab === 'active' ? activeSessions : historySessions).length === 0 && (
            <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl">
              <AlertTriangle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium">
                {tab === 'active' ? 'No active sessions' : 'No historical sessions'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
