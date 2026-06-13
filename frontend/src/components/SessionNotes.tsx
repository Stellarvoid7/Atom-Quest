/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Save, Check } from 'lucide-react'

interface SessionNotesProps {
  sessionId: string
}

/**
 * Agent-only split-screen notes panel alongside video.
 * Notes are saved to sessions.agent_notes when the call ends.
 */
export default function SessionNotes({ sessionId }: SessionNotesProps) {
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const saveNotes = useCallback(async () => {
    // Persisted via the sessions/end route when agent ends the call.
    // Also allow manual save mid-call.
    try {
      const res = await fetch('/api/sessions/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, notes }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (err) {
      console.error('Failed to save notes:', err)
    }
  }, [sessionId, notes])

  // Expose notes for the parent to grab on disconnect
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__agentNotes = notes
    }
  }, [notes])

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed top-4 right-4 z-40 bg-white border border-slate-200 shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
      >
        <FileText className="w-4 h-4 text-blue-600" />
        Notes
      </button>
    )
  }

  return (
    <div className="fixed top-4 right-4 z-40 w-[320px] max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-800 to-slate-900">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-300" />
          <h3 className="text-sm font-semibold text-white tracking-tight">Session Notes</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={saveNotes}
            className="text-slate-300 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-700"
            title="Save notes"
          >
            {saved ? <Check className="w-4 h-4 text-green-400" /> : <Save className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-slate-400 hover:text-white text-xs font-medium px-1.5 py-0.5 rounded hover:bg-slate-700 transition-colors"
          >
            ─
          </button>
        </div>
      </div>

      {/* Textarea */}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Type session notes here...&#10;&#10;• Customer issue&#10;• Steps taken&#10;• Resolution"
        className="flex-1 min-h-[200px] max-h-[400px] p-4 text-sm text-slate-800 placeholder-slate-400 bg-white resize-y outline-none font-mono leading-relaxed"
      />

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
        <span className="text-[10px] text-slate-400 font-medium">
          Auto-saved on call end
        </span>
        <button
          onClick={saveNotes}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          {saved ? '✓ Saved' : 'Save Now'}
        </button>
      </div>
    </div>
  )
}
