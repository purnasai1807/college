'use client'

import { FormEvent, useState } from 'react'

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function requestCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/auth/admin-forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        setError(result.error?.message ?? 'Could not send a verification code. Please try again.')
        return
      }
      setCodeSent(true)
      setMessage(result.data.message)
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/auth/admin-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, password }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        setError(result.error?.message ?? 'Could not reset the password. Request a new code and try again.')
        return
      }
      setMessage('Password updated. You can now sign in with your new password.')
      setTimeout(() => { window.location.assign('/admin/login') }, 1500)
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200'

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-semibold">Reset admin password</h1>
      <p className="mb-5 text-sm text-stone-500">A one-time code is sent only to the email address registered to an admin account. It expires after 10 minutes.</p>
      {!codeSent ? (
        <form onSubmit={requestCode} className="space-y-3">
          <label className="block text-sm font-medium text-stone-700" htmlFor="admin-reset-email">Registered admin email</label>
          <input
            id="admin-reset-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={field}
          />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="text-sm text-stone-600">{message}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Sending...' : 'Send verification code'}
          </button>
        </form>
      ) : (
        <form onSubmit={resetPassword} className="space-y-3">
          <p role="status" className="text-sm text-stone-600">{message}</p>
          <label className="block text-sm font-medium text-stone-700" htmlFor="admin-reset-otp">6-digit verification code</label>
          <input
            id="admin-reset-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
            className={field}
          />
          <label className="block text-sm font-medium text-stone-700" htmlFor="admin-new-password">New password</label>
          <input
            id="admin-new-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={100}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={field}
          />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Saving...' : 'Verify code and reset password'}
          </button>
          <button
            type="button"
            onClick={() => { setCodeSent(false); setOtp(''); setPassword(''); setError('') }}
            className="w-full py-2 text-sm text-stone-500 hover:text-stone-800"
          >
            Request another code
          </button>
        </form>
      )}
      <a href="/admin/login" className="mt-5 text-sm text-stone-500 hover:text-stone-800">Back to admin sign in</a>
    </main>
  )
}
