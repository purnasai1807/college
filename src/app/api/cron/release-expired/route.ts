import { NextResponse } from 'next/server'
import { releaseExpired } from '@/lib/orders/service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not allowed.' } }, { status: 403 })
  }
  return NextResponse.json({ success: true, data: { released: await releaseExpired() } })
}
