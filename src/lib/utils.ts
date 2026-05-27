export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ")
}

export function formatIntake(value?: string | null): string {
  if (!value) return "—"
  // If it looks like a date (contains numbers and separators), parse it
  const d = new Date(value)
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" })
  }
  // If it already has text like "July_2026_20_07_2026", extract month + year
  const monthYearMatch = value.match(/(January|February|March|April|May|June|July|August|September|October|November|December)[_\s,]?(\d{4})/i)
  if (monthYearMatch) return `${monthYearMatch[1]} ${monthYearMatch[2]}`
  // Return as-is if can't parse
  return value
}
  if (!value) return "—"
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
}

export function formatRelativeTime(value?: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (mins < 60) return "Just now"
  if (hrs < 24) return `${hrs}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(value)
}

export function initials(name?: string): string {
  if (!name) return "?"
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)
}

export const BADGE_CLASSES: Record<string, string> = {
  blue:    "bg-blue-100 text-blue-700 border-blue-200",
  amber:   "bg-amber-100 text-amber-700 border-amber-200",
  green:   "bg-green-100 text-green-700 border-green-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  red:     "bg-red-100 text-red-700 border-red-200",
  indigo:  "bg-indigo-100 text-indigo-700 border-indigo-200",
  violet:  "bg-violet-100 text-violet-700 border-violet-200",
  teal:    "bg-teal-100 text-teal-700 border-teal-200",
  sky:     "bg-sky-100 text-sky-700 border-sky-200",
  cyan:    "bg-cyan-100 text-cyan-700 border-cyan-200",
  gray:    "bg-gray-100 text-gray-700 border-gray-200",
  purple:  "bg-purple-100 text-purple-700 border-purple-200",
  stone:   "bg-stone-100 text-stone-700 border-stone-200",
}
