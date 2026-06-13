/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  StartAudio,
} from '@livekit/components-react'
import { Video, StopCircle } from 'lucide-react'
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

  const [isRecording, setIsRecording] = useState(false)

  const toggleRecording = async () => {
    try {
      if (!isRecording) {
        await fetch('/api/recordings/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id })
        });
        setIsRecording(true);
      } else {
        await fetch('/api/recordings/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id })
        });
        setIsRecording(false);
      }
    } catch (err) {
      console.error("Recording toggle failed", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative" data-lk-theme="default">
      {role === 'agent' && (
        <div className="absolute top-4 left-4 z-50">
          <button 
            onClick={toggleRecording}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm shadow-lg transition-all ${
              isRecording 
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' 
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {isRecording ? <StopCircle className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            {isRecording ? 'Stop Recording' : 'Record Session'}
          </button>
        </div>
      )}
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
        <RecordingBanner isRecording={isRecording} />
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
