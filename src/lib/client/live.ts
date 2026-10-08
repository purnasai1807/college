import { useEffect } from 'react'

// Refetch when the server says something changed. The slow timer is only a safety net.
export function useLive(refresh: () => void, fallbackMs = 30_000) {
  useEffect(() => {
    const source = new EventSource('/api/events')
    source.onmessage = () => refresh()
    const timer = setInterval(refresh, fallbackMs)
    return () => { source.close(); clearInterval(timer) }
  }, [refresh, fallbackMs])
}
