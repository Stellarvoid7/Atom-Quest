/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  useDataChannel,
  useRoomContext,
} from '@livekit/components-react'
import { Send, MessageSquare, X, Paperclip, FileText, Image as ImageIcon } from 'lucide-react'

interface ChatMessage {
  id: string            // client_message_id (UUID)
  sender: string        // identity string
  senderLabel: string   // display name
  payload: string
  timestamp: number
  isLocal: boolean
  persisted?: boolean   // true once the POST confirms
  fileId?: string       // non-null = file message
  mimeType?: string     // for rendering inline preview
}

// Encoder/decoder for data channel
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

interface ChatPanelProps {
  sessionId: string
  livekitToken: string
  role: string
}

export default function ChatPanel({ sessionId, livekitToken, role }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const room = useRoomContext()

  // Scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Handle incoming data channel messages
  const onMessage = useCallback(
    (msg: { payload: Uint8Array }) => {
      try {
        const parsed = JSON.parse(decoder.decode(msg.payload))
        if (parsed.type !== 'chat') return

        const chatMsg: ChatMessage = {
          id: parsed.clientMessageId,
          sender: parsed.sender,
          senderLabel: parsed.senderLabel,
          payload: parsed.payload,
          timestamp: parsed.timestamp,
          isLocal: false,
          fileId: parsed.fileId,
          mimeType: parsed.mimeType,
        }

        setMessages((prev) => {
          if (prev.some((m) => m.id === chatMsg.id)) return prev
          return [...prev, chatMsg]
        })

        if (!isOpen) {
          setUnread((u) => u + 1)
        }
      } catch {
        // Ignore non-chat data
      }
    },
    [isOpen]
  )

  useDataChannel('chat', onMessage)

  const sendMessage = async () => {
    const text = draft.trim()
    if (!text || !room) return

    const clientMessageId = crypto.randomUUID()
    const identity = room.localParticipant.identity
    const senderLabel = role === 'agent' ? 'Agent' : 'Customer'
    const timestamp = Date.now()

    const chatPayload = {
      type: 'chat',
      clientMessageId,
      sender: identity,
      senderLabel,
      payload: text,
      timestamp,
    }

    const msg: ChatMessage = {
      id: clientMessageId,
      sender: identity,
      senderLabel,
      payload: text,
      timestamp,
      isLocal: true,
      persisted: false,
    }

    setMessages((prev) => [...prev, msg])
    setDraft('')

    // DUAL WRITE 1: Data channel
    try {
      const encoded = encoder.encode(JSON.stringify(chatPayload))
      await room.localParticipant.publishData(encoded, {
        reliable: true,
        topic: 'chat',
      })
    } catch (err) {
      console.error('Data channel send failed:', err)
    }

    // DUAL WRITE 2: API persistence with retry
    const persistWithRetry = async (retries: number) => {
      for (let i = 0; i <= retries; i++) {
        try {
          const res = await fetch(`/api/sessions/${sessionId}/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${livekitToken}`,
            },
            body: JSON.stringify({ payload: text, clientMessageId }),
          })
          if (res.ok) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === clientMessageId ? { ...m, persisted: true } : m
              )
            )
            return
          }
          const data = await res.json()
          if (data.deduplicated) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === clientMessageId ? { ...m, persisted: true } : m
              )
            )
            return
          }
        } catch {
          // Retry
        }
        if (i < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
        }
      }
    }
    persistWithRetry(2)
  }

  // ─── File Upload ────────────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !room) return

    // Client-side pre-check (server enforces with 413)
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert('Only JPEG, PNG, and PDF files are allowed.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      alert('File must be under 5 MB.')
      return
    }

    setUploading(true)
    const clientMessageId = crypto.randomUUID()

    try {
      // 1. Get presigned upload URL (server generates the s3_key)
      const presignRes = await fetch('/api/files/presigned-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${livekitToken}`,
        },
        body: JSON.stringify({
          mimeType: file.type,
          fileSize: file.size,
          originalName: file.name,
        }),
      })

      if (!presignRes.ok) {
        const err = await presignRes.json()
        throw new Error(err.error || 'Failed to get upload URL')
      }

      const { uploadUrl, uploadToken, s3Key } = await presignRes.json()

      // 2. Upload to Supabase Storage via presigned URL
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          'x-upsert': 'true',
        },
        body: file,
      })

      if (!uploadRes.ok) {
        if (uploadRes.status === 413) {
          throw new Error('File rejected: exceeds 5 MB or disallowed type')
        }
        throw new Error('Upload failed')
      }

      // 3. Confirm upload — creates files row + chat message with file_id
      const confirmRes = await fetch('/api/files/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${livekitToken}`,
        },
        body: JSON.stringify({
          s3Key,
          mimeType: file.type,
          fileSize: file.size,
          originalName: file.name,
          clientMessageId,
        }),
      })

      if (!confirmRes.ok) {
        throw new Error('Failed to confirm upload')
      }

      const { fileId } = await confirmRes.json()

      // 4. Broadcast file message via data channel
      const identity = room.localParticipant.identity
      const senderLabel = role === 'agent' ? 'Agent' : 'Customer'
      const timestamp = Date.now()

      const chatPayload = {
        type: 'chat',
        clientMessageId,
        sender: identity,
        senderLabel,
        payload: `📎 ${file.name}`,
        timestamp,
        fileId,
        mimeType: file.type,
      }

      const msg: ChatMessage = {
        id: clientMessageId,
        sender: identity,
        senderLabel,
        payload: `📎 ${file.name}`,
        timestamp,
        isLocal: true,
        persisted: true,
        fileId,
        mimeType: file.type,
      }

      setMessages((prev) => [...prev, msg])

      const encoded = encoder.encode(JSON.stringify(chatPayload))
      await room.localParticipant.publishData(encoded, {
        reliable: true,
        topic: 'chat',
      })
    } catch (err: any) {
      alert(err.message || 'File upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const downloadFile = async (fileId: string) => {
    try {
      const res = await fetch(`/api/files/${fileId}/download`, {
        headers: { Authorization: `Bearer ${livekitToken}` },
      })
      if (res.ok) {
        const { url } = await res.json()
        window.open(url, '_blank')
      }
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const renderFileIcon = (mimeType?: string) => {
    if (mimeType?.startsWith('image/')) return <ImageIcon className="w-4 h-4" />
    return <FileText className="w-4 h-4" />
  }

  return (
    <>
      {/* Floating toggle */}
      {!isOpen && (
        <button
          onClick={() => { setIsOpen(true); setUnread(0) }}
          className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white p-3.5 rounded-full shadow-lg shadow-blue-200/50 transition-all hover:scale-105 active:scale-95"
          aria-label="Open chat"
        >
          <MessageSquare className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full animate-pulse">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-48px)] h-[480px] max-h-[calc(100vh-96px)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-blue-700">
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4 text-blue-100" />
              <h3 className="text-sm font-semibold text-white tracking-tight">Chat</h3>
              <span className="text-xs bg-blue-500/40 text-blue-100 px-2 py-0.5 rounded-full font-medium">
                {messages.length}
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-blue-200 hover:text-white transition-colors p-1 rounded-md hover:bg-blue-500/30"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <MessageSquare className="w-8 h-8 mb-2 text-slate-300" />
                <p className="text-sm font-medium">No messages yet</p>
                <p className="text-xs mt-0.5">Send a message to start the conversation</p>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.isLocal ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 mb-0.5 px-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    {msg.senderLabel}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatTime(msg.timestamp)}</span>
                </div>
                {msg.fileId ? (
                  <button
                    onClick={() => downloadFile(msg.fileId!)}
                    className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity ${
                      msg.isLocal
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-white text-slate-800 border border-slate-200 shadow-sm rounded-bl-md'
                    }`}
                  >
                    {renderFileIcon(msg.mimeType)}
                    <span className="underline">{msg.payload}</span>
                  </button>
                ) : (
                  <div
                    className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                      msg.isLocal
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-white text-slate-800 border border-slate-200 shadow-sm rounded-bl-md'
                    }`}
                  >
                    {msg.payload}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-slate-100 bg-white">
            {uploading && (
              <div className="mb-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 font-medium flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                Uploading file…
              </div>
            )}
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="p-2 ml-1 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30"
                aria-label="Attach file"
                title="Attach file (JPEG, PNG, PDF — max 5 MB)"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 bg-transparent py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                onClick={sendMessage}
                disabled={!draft.trim()}
                className="p-2 mr-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
    </>
  )
}
