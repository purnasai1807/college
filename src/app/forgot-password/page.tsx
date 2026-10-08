'use client'
import { FormEvent, useState } from 'react'

export default function Forgot() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    setState(res.ok ? 'sent' : 'error')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-semibold">Reset your password</h1>
      {state === 'sent' ? (
        <p className="text-sm text-stone-600">If that email has an account, a reset link is on its way. It works for 30 minutes.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-stone-500">Enter your college email and we’ll send you a link.</p>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" placeholder="College email" className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-amber-500" />
          {state === 'error' && <p role="alert" className="text-sm text-red-700">Something went wrong. Please try again in a minute.</p>}
          <button className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white">Send link</button>
        </form>
      )}
      <a href="/login" className="mt-5 text-sm text-stone-500 hover:text-stone-800">Back to sign in</a>
    </main>
  )
}
