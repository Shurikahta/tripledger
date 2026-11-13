export type Allocation = { member: string; cents: number }
export type PlanRow = { due_date: string; planned_cents: number }
export type Schedule = { id: string; trip_member_id: string; due_date: string; planned_cents: number }
type ScheduleDraft = { trip_member_id: string; due_date: string; planned_cents: number }

export function splitEvenly(total: number, ids: string[]): Allocation[] {
  if (!ids.length || total <= 0) return ids.map((member) => ({ member, cents: 0 }))
  const base = Math.floor(total / ids.length)
  const remainder = total % ids.length
  return ids.map((member, index) => ({ member, cents: base + (index < remainder ? 1 : 0) }))
}

export function addOneMonthClamped(dateValue: string) {
  const current = new Date(`${dateValue}T12:00:00`)
  const year = current.getFullYear()
  const month = current.getMonth() + 1
  const day = Math.min(current.getDate(), new Date(year, month + 1, 0).getDate())
  return new Date(year, month, day, 12).toISOString().slice(0, 10)
}

function monthDate(anchorDate: string, offset: number, anchorDay: number) {
  const anchor = new Date(`${anchorDate}T12:00:00`)
  const year = anchor.getFullYear()
  const month = anchor.getMonth() + offset
  return new Date(year, month, Math.min(anchorDay, new Date(year, month + 1, 0).getDate()), 12).toISOString().slice(0, 10)
}

export function makeSchedule(member: string, balance: number, monthly: number, startDate: string): ScheduleDraft[] {
  if (!balance || !monthly) return []
  const count = Math.ceil(balance / monthly)
  if (count > 240) throw new Error('O plano excede 240 tranches. Aumenta o valor mensal.')
  const start = new Date(`${startDate}T12:00:00`)
  const day = start.getDate()
  return Array.from({ length: count }, (_, index) => {
    const year = start.getFullYear()
    const month = start.getMonth() + index
    const lastDay = new Date(year, month + 1, 0).getDate()
    const due = new Date(year, month, Math.min(day, lastDay), 12)
    const planned = Math.min(monthly, balance - monthly * index)
    return { trip_member_id: member, due_date: due.toISOString().slice(0, 10), planned_cents: planned }
  })
}

export function adjustScheduleAfterPayment(remaining: number, schedule: Schedule[], paidAt: string): PlanRow[] {
  let balanceLeft = remaining
  const future = schedule.filter((item) => item.due_date > paidAt).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const rows: PlanRow[] = []
  for (const installment of future) {
    if (balanceLeft <= 0) break
    const planned = Math.min(installment.planned_cents, balanceLeft)
    rows.push({ due_date: installment.due_date, planned_cents: planned })
    balanceLeft -= planned
  }
  if (balanceLeft > 0) {
    const monthly = Math.max(...schedule.map((item) => item.planned_cents))
    const anchorDate = future.at(-1)?.due_date ?? paidAt
    const anchorDay = Math.max(...schedule.map((item) => Number(item.due_date.slice(-2))))
    let offset = 1
    while (balanceLeft > 0 && rows.length < 240) {
      const planned = Math.min(monthly, balanceLeft)
      rows.push({ due_date: monthDate(anchorDate, offset++, anchorDay), planned_cents: planned })
      balanceLeft -= planned
    }
    if (balanceLeft > 0) throw new Error('O plano excede 240 tranches.')
  }
  return rows
}