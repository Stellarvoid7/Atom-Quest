/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Video, LogOut, Copy, Check, PlusCircle, User, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

const supabase = createClient()

export default function AgentDashboard() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<any[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const router = useRouter()

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions/list')
      if (res.ok) {
        const { sessions } = await res.json()
        if (sessions) setSessions(sessions)
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) {
        fetchSessions()
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchSessions()
    })

    return () => subscription.unsubscribe()
  }, [fetchSessions])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert(error.message)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSessions([])
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

  const joinSession = async (sessionId: string) => {
    router.push(`/room/${sessionId}?role=agent`)
  }

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(link)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] text-slate-500 font-medium">Loading...</div>

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-4 font-sans text-slate-900">
        <form onSubmit={handleLogin} className="p-8 bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shadow-sm border border-blue-100">
              <Video className="w-8 h-8" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-center mb-2 tracking-tight">Agent Login</h2>
          <p className="text-center text-slate-500 mb-8 text-sm">Sign in to support workspace</p>
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-slate-900 placeholder-slate-400 text-sm font-medium"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-slate-900 placeholder-slate-400 text-sm font-medium"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white hover:bg-blue-700 font-medium py-2.5 rounded-xl transition-all shadow-sm shadow-blue-200 text-sm"
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
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm text-blue-600">
              <Video className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Support Workspace</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">{user.email}</span>
            </div>
            <button onClick={handleLogout} className="p-2 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm rounded-lg transition-colors text-slate-500">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-slate-200 shadow-sm rounded-2xl p-6 md:p-8 gap-6">
          <div>
            <h2 className="text-lg font-bold mb-1 tracking-tight text-slate-900">Active Sessions</h2>
            <p className="text-sm text-slate-500 font-medium">Create secure links to invite customers to a support call.</p>
          </div>
          <button
            onClick={createSession}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-200 text-sm"
          >
            <PlusCircle className="w-4 h-4" />
            New Session
          </button>
        </div>

        <div className="grid gap-3">
          {sessions.map(session => (
            <div key={session.id} className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between hover:border-blue-200 hover:shadow transition-all gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="relative flex h-2 w-2">
                    {session.status === 'active' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${session.status === 'active' ? 'bg-blue-500' : 'bg-slate-300'}`}></span>
                  </span>
                  <span className="font-semibold text-sm">Session</span>
                  <span className="text-xs text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200">{session.id.split('-')[0]}</span>
                </div>
                <div className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Started {new Date(session.start_time).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => copyLink(session.invite_token)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm rounded-lg text-sm font-medium transition-all text-slate-700 flex-1 sm:flex-none justify-center"
                >
                  {copied === session.invite_token ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  {copied === session.invite_token ? 'Copied Link' : 'Copy Invite'}
                </button>
                {session.status === 'active' && (
                  <button
                    onClick={() => joinSession(session.id)}
                    className="px-6 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm flex-1 sm:flex-none"
                  >
                    Join Call
                  </button>
                )}
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl">
              <Video className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium">No sessions yet. Create one to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
