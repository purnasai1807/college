'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Profile = { name: string; email: string; studentId: string | null; role: string }

const field = 'mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200'

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (res) => {
        if (res.status === 401) return router.push('/login')
        const json = await res.json()
        if (json.success) setProfile(json.data)
        else setError(json.error.message)
      })
      .catch(() => setError('Could not load your profile. Check your connection.'))
  }, [router])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!profile) return
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profile.name, studentId: profile.studentId || null }),
      })
      const json = await res.json()
      if (!json.success) return setError(json.error.message)
      setProfile(json.data)
      setMessage('Profile saved.')
    } catch {
      setError('Could not save your profile. Check your connection.')
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
    } catch {
      setError('Could not sign out. Check your connection and try again.')
    }
  }

  if (!profile) return <main className="mx-auto max-w-md px-5 py-10">{error || 'Loading your profile…'}</main>

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <a href="/" className="text-sm text-stone-500 hover:text-stone-800">← Back to canteen</a>
      <h1 className="mb-5 mt-3 text-xl font-semibold">Your profile</h1>
      <form onSubmit={save} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
        <label className="block text-xs text-stone-500">
          Name
          <input className={field} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required minLength={2} maxLength={80} />
        </label>
        <label className="block text-xs text-stone-500">
          College email
          <input className={field} value={profile.email} readOnly aria-readonly="true" />
          <span className="mt-1 block">Contact your canteen administrator if your email needs to change.</span>
        </label>
        {profile.studentId !== null && (
          <label className="block text-xs text-stone-500">
            Student ID
            <input className={field} value={profile.studentId ?? ''} onChange={(e) => setProfile({ ...profile, studentId: e.target.value })} minLength={3} maxLength={30} />
          </label>
        )}
        <p className="text-xs text-stone-500">Account type: {profile.role.replace('_', ' ').toLowerCase()}</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        <div className="flex items-center justify-between">
          <button className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white">Save changes</button>
          <button type="button" onClick={logout} className="text-sm text-stone-600 hover:text-stone-900">Sign out</button>
        </div>
      </form>
    </main>
  )
}
