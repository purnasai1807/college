'use client'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Reset() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const token = new URLSearchParams(window.location.search).get('token') ?? ''
    const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) })
    const json = await res.json()
    if (json.success) router.push('/login')
    else setError(json.error.message)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-4 text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={submit} className="space-y-3">
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" placeholder="At least 8 characters" className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-amber-500" />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white">Save password</button>
      </form>
    </main>
  )
}
