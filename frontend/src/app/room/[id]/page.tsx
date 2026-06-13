'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  StartAudio,
} from '@livekit/components-react'
import '@livekit/components-styles'
import ChatPanel from '@/components/ChatPanel'
import ReconnectOverlay from '@/components/ReconnectOverlay'
import SessionNotes from '@/components/SessionNotes'
import RecordingBanner from '@/components/RecordingBanner'

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [token, setToken] = useState<string>('')
  const searchParams = useSearchParams()
  const router = useRouter()
  const role = searchParams.get('role') || 'customer'

  useEffect(() => {
    const fetchToken = async () => {
      if (role === 'agent') {
        try {
          const res = await fetch('/api/auth/agent-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: id }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          setToken(data.token)
        } catch (err) {
          alert('Failed to get agent token')
          router.push('/')
        }
      } else {
        const storedToken = sessionStorage.getItem('livekit_token')
        if (storedToken) {
          setToken(storedToken)
        } else {
          alert('No token found, please use your invite link')
          router.push('/')
        }
      }
    }
    fetchToken()
  }, [id, role, router])

  const handleDisconnected = useCallback(async () => {
    if (role === 'agent') {
      // Grab notes from the SessionNotes component via window global
      const notes = typeof window !== 'undefined' ? (window as any).__agentNotes || '' : ''

      if (confirm('End the session for everyone?')) {
        await fetch('/api/sessions/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id, notes }),
        })
      }
    }
    router.push(role === 'agent' ? '/' : '/thank-you')
  }, [role, id, router])

  if (token === '') {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center text-slate-500 font-medium">
        Connecting to secure server...
      </div>
    )
  }

  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" data-lk-theme="default">
      <LiveKitRoom
        video={searchParams.get('video') !== 'false'}
        audio={searchParams.get('audio') !== 'false'}
        token={token}
        serverUrl={livekitUrl}
        onDisconnected={handleDisconnected}
        className="flex-1 w-full"
      >
        {/* VideoConference already includes built-in screen share toggle */}
        <VideoConference />
        <RoomAudioRenderer />
        {/* iOS Autoplay Gotcha #9 */}
        <StartAudio label="Tap to Join/Unmute" />
        {/* Recording consent banner (customer sees it) */}
        <RecordingBanner />
        {/* Reconnection overlay */}
        <ReconnectOverlay />
        {/* Dual-write Chat */}
        <ChatPanel sessionId={id} livekitToken={token} role={role} />
        {/* Agent-only Session Notes */}
        {role === 'agent' && <SessionNotes sessionId={id} />}
      </LiveKitRoom>
    </div>
  )
}
