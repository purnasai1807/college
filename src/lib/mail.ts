export async function sendMail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (process.env.NODE_ENV !== 'production') console.warn(`[mail not configured] to ${to}\n${text}`)
    else console.error('RESEND_API_KEY is not set, so the email to', to, 'was not sent')
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, text }),
  })
  if (!res.ok) throw new Error(`Email provider rejected the message: ${res.status}`)
}
