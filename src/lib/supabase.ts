import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isConfigured = Boolean(url && key && !url.includes('your-project'))
export const supabase = isConfigured ? createClient(url!, key!) : null

export function money(cents: number) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

export function eurosToCents(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
  const number = Number(normalized)
  return Number.isFinite(number) ? Math.round(number * 100) : 0
}

export function dateLabel(value?: string | null) {
  if (!value) return 'Sem data'
  return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}
