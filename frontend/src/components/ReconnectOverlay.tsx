'use client'

import { useConnectionState } from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'
import { Loader2 } from 'lucide-react'

/**
 * Shows ONLY an isolated, professional "Reconnecting…" spinner overlay
 * when the LiveKit connection enters the Reconnecting state.
 * Clears automatically on Reconnected. Does NOT show any "left" message.
 */
export default function ReconnectOverlay() {
  const connectionState = useConnectionState()

  if (connectionState !== ConnectionState.Reconnecting) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3 border border-slate-200">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm font-semibold text-slate-800 tracking-tight">
          Reconnecting…
        </p>
        <p className="text-xs text-slate-500 font-medium">
          Please wait, restoring your connection
        </p>
      </div>
    </div>
  )
}
