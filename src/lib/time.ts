/** Local datetime string for <input type="datetime-local">. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fromLocalInput(v: string): string {
  return new Date(v).toISOString()
}

export function dayKey(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function formatDay(iso: string, locale: string, labels: { today: string; yesterday: string }): string {
  const d = new Date(iso)
  const now = new Date()
  if (isSameDay(d, now)) return labels.today
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (isSameDay(d, y)) return labels.yesterday
  const sameYear = d.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(d)
}

/** "45m", "3h", "2g 3h" (unit labels passed in). */
export function formatDuration(ms: number, u: { d: string; h: string; m: string }): string {
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}${u.m}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}${u.h}`
  const days = Math.floor(hours / 24)
  const rem = hours % 24
  return rem ? `${days}${u.d} ${rem}${u.h}` : `${days}${u.d}`
}

export function thisMorning(now = new Date()): Date {
  const d = new Date(now)
  d.setHours(8, 0, 0, 0)
  return d
}

export function lastNight(now = new Date()): Date {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  d.setHours(22, 0, 0, 0)
  return d
}

export function hoursAgo(n: number, now = new Date()): Date {
  return new Date(now.getTime() - n * 3600_000)
}
