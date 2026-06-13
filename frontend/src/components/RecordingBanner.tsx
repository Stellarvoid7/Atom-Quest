'use client'

import { useEffect, useState } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { Circle } from 'lucide-react'

/**
 * "This call is being recorded" consent banner.
 * Listens for RoomEvent.RecordingStatusChanged and shows
 * a professional amber banner when recording is active.
 */
export default function RecordingBanner() {
  const room = useRoomContext()
  const [isRecording, setIsRecording] = useState(room.isRecording)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handler = () => {
      setIsRecording(room.isRecording)
      if (room.isRecording) {
        setDismissed(false)
      }
    }

    room.on(RoomEvent.RecordingStatusChanged, handler)
    return () => {
      room.off(RoomEvent.RecordingStatusChanged, handler)
    }
  }, [room])

  if (!isRecording || dismissed) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[90] animate-in slide-in-from-top-2">
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-center gap-3">
        <Circle className="w-3 h-3 text-red-500 fill-red-500 animate-pulse" />
        <p className="text-sm font-semibold text-amber-900">
          This call is being recorded
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-md transition-colors ml-2"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
