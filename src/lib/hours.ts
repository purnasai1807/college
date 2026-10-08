export function withinHours(c: { opensAt: string; closesAt: string }) {
  const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return now >= c.opensAt && now < c.closesAt
}
