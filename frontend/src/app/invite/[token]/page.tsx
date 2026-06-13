'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Video, AlertCircle, LinkIcon } from 'lucide-react'
import { PreJoin } from '@livekit/components-react'
import '@livekit/components-styles'

type InviteState = 'loading' | 'valid' | 'invalid' | 'expired'

export default function CustomerInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const [inviteState, setInviteState] = useState<InviteState>('loading')
  const [errorDetail, setErrorDetail] = useState<string>('')
  const router = useRouter()

  // Pre-validate the invite token on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        const res = await fetch('/api/auth/validate-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteToken: token }),
        })
        if (res.ok) {
          setInviteState('valid')
        } else {
          const data = await res.json()
          if (
            data.error?.includes('expired') ||
            data.error?.includes('inactive')
          ) {
            setInviteState('expired')
            setErrorDetail('This invitation link has expired.')
          } else {
            setInviteState('invalid')
            setErrorDetail('This invitation link is not valid.')
          }
        }
      } catch {
        setInviteState('invalid')
        setErrorDetail(
          'Unable to verify this link. Please check your connection.'
        )
      }
    }
    validateToken()
  }, [token])

  const handlePreJoinSubmit = async (values: any) => {
    try {
      const res = await fetch('/api/auth/customer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken: token }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (
          data.error?.includes('expired') ||
          data.error?.includes('inactive')
        ) {
          setInviteState('expired')
          setErrorDetail('This invitation link has expired.')
        } else {
          setInviteState('invalid')
          setErrorDetail(data.error || 'Failed to join')
        }
        return
      }

      sessionStorage.setItem('livekit_token', data.token)
      router.push(
        `/room/${data.sessionId}?role=customer&audio=${values.audioEnabled}&video=${values.videoEnabled}`
      )
    } catch (err: any) {
      setErrorDetail(err.message)
      setInviteState('invalid')
    }
  }

  // Loading state
  if (inviteState === 'loading') {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">
            Verifying your invitation…
          </p>
        </div>
      </div>
    )
  }

  // Invalid or expired — the friendly error page
  if (inviteState === 'invalid' || inviteState === 'expired') {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex p-4 bg-red-50 rounded-2xl shadow-sm border border-red-100 mb-6">
            <LinkIcon className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">
            {inviteState === 'expired' ? 'Link Expired' : 'Invalid Link'}
          </h1>
          <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8 max-w-xs mx-auto">
            {inviteState === 'expired'
              ? 'This support call invitation has expired. Please ask your support agent for a new link.'
              : 'This link is not valid — please ask your agent for a new link.'}
          </p>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-6">
            <div className="flex items-start gap-3 text-left">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-1">
                  What can you do?
                </p>
                <ul className="text-sm text-slate-500 space-y-1.5">
                  <li>• Contact your support agent for a new invitation</li>
                  <li>• Invitation links expire after 30 minutes</li>
                  <li>• Each link can only be used for one session</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Valid — show PreJoin device setup
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center p-4 font-sans">
      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-blue-50 rounded-2xl shadow-sm border border-blue-100 mb-5">
            <Video className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">
            Device Setup
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            Please check your camera and microphone before joining the support
            call.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6">
            <PreJoin
              onSubmit={handlePreJoinSubmit}
              defaults={{
                audioEnabled: true,
                videoEnabled: true,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
