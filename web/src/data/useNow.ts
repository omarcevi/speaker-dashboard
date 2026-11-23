import { useEffect, useState } from 'react'

/** The current time, refreshed every `everyMs`, so "3 min ago" texts stay current. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
