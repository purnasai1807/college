'use client'
import { useState } from 'react'
import { adminUrl } from '@/lib/client/admin-context'

export default function ImageUploadField({
  canteenId,
  value,
  onChange,
}: {
  canteenId: string
  value: string
  onChange: (value: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function upload(file: File) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(adminUrl('/api/admin/images/upload', canteenId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error?.message ?? 'Could not prepare this upload.')
      const form = new FormData()
      for (const [key, field] of Object.entries(json.data.fields as Record<string, string>)) form.append(key, field)
      form.append('file', file)
      const uploaded = await fetch(json.data.url as string, { method: 'POST', body: form })
      if (!uploaded.ok) throw new Error(`Image storage rejected the upload (${uploaded.status}).`)
      onChange(json.data.publicUrl)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Image upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1">
      <input
        name="imageUrl"
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste an image URL or upload a file"
        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
      />
      <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-700">
        {busy ? 'Uploading…' : 'Upload image'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
            event.currentTarget.value = ''
          }}
        />
      </label>
      <span className="ml-2 text-xs text-stone-500">JPG, PNG, or WebP · up to 5 MB</span>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}
