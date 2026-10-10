'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = await response.json()
      if (!result.success) {
        setError(result.error.message)
        return
      }
      router.replace('/admin')
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200'

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-lg font-bold text-white" aria-hidden="true">ACE</div>
        <h1 className="text-2xl font-semibold">Canteen Admin</h1>
        <p className="mt-1 text-sm text-stone-500">Sign in to manage the canteen.</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium text-stone-700" htmlFor="admin-email">Admin email</label>
        <input
          id="admin-email"
          className={field}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label className="block text-sm font-medium text-stone-700" htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          className={field}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
        >
          {busy ? 'Please wait...' : 'Sign in to admin'}
        </button>
      </form>

      <a href="/admin/forgot-password" className="mt-4 text-sm text-stone-500 hover:text-stone-800">Forgot admin password?</a>
      <a href="/login" className="mt-5 text-sm text-stone-500 hover:text-stone-800">Student and staff sign in</a>
    </main>
  )
}
