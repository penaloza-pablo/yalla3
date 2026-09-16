import { useEffect, useState } from 'react'
import { getTodayMadrid } from '../operations/dateHelpers'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const listeners = new Set<() => void>()

let selectedDate = getTodayMadrid()

const notify = () => {
  listeners.forEach((listener) => listener())
}

export const getDashboardDate = () => selectedDate

export const setDashboardDate = (date: string) => {
  if (!DATE_RE.test(date) || date === selectedDate) {
    return false
  }
  selectedDate = date
  notify()
  return true
}

export const subscribeDashboardDate = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useDashboardDate = () => {
  const [, setVersion] = useState(0)
  useEffect(
    () => subscribeDashboardDate(() => setVersion((current) => current + 1)),
    [],
  )
  return selectedDate
}
