import { describe, expect, it } from 'vitest'
import { adjustScheduleAfterPayment, makeSchedule, splitEvenly, type Schedule } from './finance'
import { eurosToCents } from './supabase'

describe('eurosToCents', () => {
  it('converts comma decimals and grouped values without floating point loss', () => {
    expect(eurosToCents('12,34')).toBe(1234)
    expect(eurosToCents('1 234,56')).toBe(123456)
    expect(eurosToCents('0,10')).toBe(10)
  })

  it('treats invalid input as zero', () => {
    expect(eurosToCents('not an amount')).toBe(0)
  })
})

describe('splitEvenly', () => {
  it('preserves the total and assigns residual cents in input order', () => {
    const shares = splitEvenly(100, ['a', 'b', 'c'])
    expect(shares).toEqual([
      { member: 'a', cents: 34 },
      { member: 'b', cents: 33 },
      { member: 'c', cents: 33 },
    ])
    expect(shares.reduce((sum, share) => sum + share.cents, 0)).toBe(100)
  })

  it('returns no allocations for an empty participant list', () => {
    expect(splitEvenly(500, [])).toEqual([])
  })
})

describe('makeSchedule', () => {
  it('clamps month-end dates and keeps the final tranche exact', () => {
    const schedule = makeSchedule('member-a', 2350, 1000, '2026-01-31')
    expect(schedule).toEqual([
      { trip_member_id: 'member-a', due_date: '2026-01-31', planned_cents: 1000 },
      { trip_member_id: 'member-a', due_date: '2026-02-28', planned_cents: 1000 },
      { trip_member_id: 'member-a', due_date: '2026-03-31', planned_cents: 350 },
    ])
    expect(schedule.reduce((sum, row) => sum + row.planned_cents, 0)).toBe(2350)
  })

  it('limits plans to 240 tranches', () => {
    expect(() => makeSchedule('member-a', 241, 1, '2026-01-01')).toThrow('240 tranches')
  })
})

describe('adjustScheduleAfterPayment', () => {
  const schedule: Schedule[] = [
    { id: '1', trip_member_id: 'member-a', due_date: '2026-01-31', planned_cents: 1000 },
    { id: '2', trip_member_id: 'member-a', due_date: '2026-02-28', planned_cents: 1000 },
    { id: '3', trip_member_id: 'member-a', due_date: '2026-03-31', planned_cents: 1000 },
  ]

  it('keeps only future tranches and caps them at the remaining balance', () => {
    const rows = adjustScheduleAfterPayment(1750, schedule, '2026-02-15')
    expect(rows).toEqual([
      { due_date: '2026-02-28', planned_cents: 1000 },
      { due_date: '2026-03-31', planned_cents: 750 },
    ])
    expect(rows.reduce((sum, row) => sum + row.planned_cents, 0)).toBe(1750)
  })

  it('extends the plan by month-end dates when the original schedule is exhausted', () => {
    const rows = adjustScheduleAfterPayment(1500, schedule, '2026-04-15')
    expect(rows).toEqual([
      { due_date: '2026-05-31', planned_cents: 1000 },
      { due_date: '2026-06-30', planned_cents: 500 },
    ])
  })

  it('returns an empty plan when the balance is settled', () => {
    expect(adjustScheduleAfterPayment(0, schedule, '2026-02-15')).toEqual([])
  })
})