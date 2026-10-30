import type { StaffRole } from '../../domain/types'
import type { IconName } from '../../components/Icon'

export type StaffScreen =
  | 'overview' | 'payments' | 'checkin' | 'arrivals' | 'myCalendar' | 'myBookings' | 'records'
  | 'consultants' | 'availability' | 'bookings' | 'paymentSettings' | 'kpi' | 'audit' | 'decisions'

export const screens: { id: StaffScreen; path: string; icon: IconName }[] = [
  { id: 'overview', path: '', icon: 'layers' },
  { id: 'payments', path: 'payments', icon: 'card' },
  { id: 'checkin', path: 'checkin', icon: 'qr' },
  { id: 'arrivals', path: 'arrivals', icon: 'user' },
  { id: 'myCalendar', path: 'my-calendar', icon: 'calendar' },
  { id: 'myBookings', path: 'my-bookings', icon: 'list' },
  { id: 'records', path: 'records', icon: 'history' },
  { id: 'bookings', path: 'bookings', icon: 'list' },
  { id: 'consultants', path: 'consultants', icon: 'user' },
  { id: 'availability', path: 'availability', icon: 'calendar' },
  { id: 'paymentSettings', path: 'payment-settings', icon: 'settings' },
  { id: 'kpi', path: 'kpi', icon: 'sparkle' },
  { id: 'audit', path: 'audit', icon: 'history' },
  { id: 'decisions', path: 'decisions', icon: 'alert' },
]

export const permissions: Record<StaffRole, StaffScreen[]> = {
  admin: screens.map(s => s.id),
  finance: ['overview', 'payments', 'bookings', 'paymentSettings', 'audit'],
  reception: ['overview', 'checkin', 'arrivals', 'bookings'],
  consultant: ['overview', 'myCalendar', 'myBookings', 'records'],
}

export const can = (role: StaffRole, s: StaffScreen) => permissions[role].includes(s)
