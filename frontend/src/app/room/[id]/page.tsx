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
import '@livekit/components-styles'
import ChatPanel from '@/components/ChatPanel'
import ReconnectOverlay from '@/components/ReconnectOverlay'
import SessionNotes from '@/components/SessionNotes'
import RecordingBanner from '@/components/RecordingBanner'
import { Video, StopCircle, Loader2 } from 'lucide-react'

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [token, setToken] = useState<string>('')
  const [isRecording, setIsRecording] = useState(false)
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
          alert('Failed to authenticate agent. Check backend logs.')
          router.push('/')
        }
      } else {
        // Fetch token from URL param instead of sessionStorage
        const urlToken = searchParams.get('lk_token')
        if (urlToken) {
          setToken(urlToken)
        } else {
          alert('Invalid invite link. Token missing.')
          router.push('/')
        }
      }
    }
    fetchToken()
  }, [id, role, router, searchParams])

  const handleDisconnected = useCallback(async () => {
    if (role === 'agent') {
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
      console.error("Recording failed", err);
    }
  }

  if (token === '') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-600 font-semibold gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        Connecting to Secure Video Server...
      </div>
    )
  }

  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880'

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative" data-lk-theme="default">
      
      {/* FLOATING RECORD BUTTON FOR AGENT ONLY */}
      {role === 'agent' && (
        <div className="absolute top-6 left-6 z-50">
          <button 
            onClick={toggleRecording}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl transition-all border ${
              isRecording 
                ? 'bg-red-600 hover:bg-red-700 text-white border-red-500 animate-pulse shadow-red-500/20' 
                : 'bg-slate-900/80 backdrop-blur-md hover:bg-slate-800 text-white border-slate-700'
            }`}
          >
            {isRecording ? <StopCircle className="w-5 h-5" /> : <Video className="w-5 h-5" />}
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
        <VideoConference />
        <RoomAudioRenderer />
        <StartAudio label="Tap to Join/Unmute" />
        <RecordingBanner /> 
        <ReconnectOverlay />
        <ChatPanel sessionId={id} livekitToken={token} role={role} />
        {role === 'agent' && <SessionNotes sessionId={id} />}
      </LiveKitRoom>
    </div>
  )
}
