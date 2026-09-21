'use client'

import { useEffect, useEffectEvent, useState } from 'react'

import { nowTimeInSchoolTz } from '@/lib/datetime'

const MINUTE_MS = 60_000

/**
 * The school's wall-clock time as `HH:MM`, kept current while `live`.
 *
 * Starts from the server-rendered `initialTime` so hydration matches, then
 * ticks on each minute boundary and straight away when the tab becomes
 * visible again (a sleeping tablet's timers are throttled or frozen).
 * `onTick` runs on every tick, so callers can piggyback on the one timer.
 */
export function useSchoolClock(
  initialTime: string,
  live: boolean,
  onTick?: () => void,
): string {
  const [time, setTime] = useState(initialTime)
  const tick = useEffectEvent((): void => {
    setTime(nowTimeInSchoolTz())
    onTick?.()
  })

  useEffect(() => {
    if (!live) return
    let interval: ReturnType<typeof setInterval> | undefined
    const timeout = setTimeout(
      () => {
        tick()
        interval = setInterval(() => tick(), MINUTE_MS)
      },
      MINUTE_MS - (Date.now() % MINUTE_MS),
    )
    function handleVisibility(): void {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [live])

  return time
}
