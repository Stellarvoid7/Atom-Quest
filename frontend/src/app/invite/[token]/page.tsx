'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Loader2 } from 'lucide-react'

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: inviteToken } = use(params)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/customer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken, customerName: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join')
      
      // FIX: Pass token securely in the URL instead of sessionStorage to prevent cross-tab drops
      router.push(`/room/${data.sessionId}?role=customer&lk_token=${data.token}`)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <form onSubmit={handleJoin} className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-200">
            <Shield className="w-8 h-8" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">Join Support Session</h2>
        <p className="text-center text-slate-500 mb-8 text-sm">Please enter your name to connect with your agent.</p>
        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium border border-red-100 text-center">{error}</div>}
        <input
          type="text"
          placeholder="Your Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 transition-all"
          required
        />
        <button type="submit" disabled={loading || !name.trim()} className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50 flex justify-center items-center gap-2">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Connect to Call'}
        </button>
      </form>
    </div>
  )
}
