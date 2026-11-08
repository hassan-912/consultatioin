import type { StaffRole } from '../../domain/types'
import type { IconName } from '../../components/Icon'

export type StaffScreen =
  | 'overview' | 'salesLink' | 'myClients' | 'payments' | 'nextSteps' | 'checkin' | 'arrivals' | 'customers' | 'myCalendar' | 'myBookings' | 'history' | 'records'
  | 'consultants' | 'freeSlots' | 'messages' | 'bookings' | 'paymentSettings' | 'kpi' | 'reviews' | 'audit' | 'decisions' | 'staffAccounts'

export const screens: { id: StaffScreen; path: string; icon: IconName }[] = [
  { id: 'overview', path: '', icon: 'layers' },
  { id: 'salesLink', path: 'my-link', icon: 'copy' },
  { id: 'myClients', path: 'my-clients', icon: 'user' },
  { id: 'payments', path: 'payments', icon: 'card' },
  { id: 'nextSteps', path: 'contracts-refunds', icon: 'check' },
  { id: 'checkin', path: 'checkin', icon: 'qr' },
  { id: 'arrivals', path: 'arrivals', icon: 'user' },
  { id: 'customers', path: 'customers', icon: 'table' },
  { id: 'myCalendar', path: 'my-calendar', icon: 'calendar' },
  { id: 'myBookings', path: 'my-bookings', icon: 'list' },
  { id: 'history', path: 'history', icon: 'table' },
  { id: 'records', path: 'records', icon: 'history' },
  { id: 'bookings', path: 'bookings', icon: 'list' },
  { id: 'consultants', path: 'consultants', icon: 'user' },
  { id: 'freeSlots', path: 'available-times', icon: 'clock' },
  { id: 'paymentSettings', path: 'payment-settings', icon: 'settings' },
  { id: 'messages', path: 'messages', icon: 'chat' },
  { id: 'kpi', path: 'kpi', icon: 'sparkle' },
  { id: 'reviews', path: 'reviews', icon: 'star' },
  { id: 'audit', path: 'audit', icon: 'history' },
  { id: 'decisions', path: 'decisions', icon: 'alert' },
  { id: 'staffAccounts', path: 'staff-accounts', icon: 'shield' },
]

export const permissions: Record<StaffRole, StaffScreen[]> = {
  admin: screens.map(s => s.id).filter(id => id !== 'salesLink' && id !== 'myClients'),
  finance: ['overview', 'payments', 'nextSteps', 'customers', 'bookings', 'paymentSettings', 'audit'],
  reception: ['overview', 'checkin', 'arrivals', 'customers', 'bookings'],
  consultant: ['overview', 'myCalendar', 'myBookings', 'history', 'records'],
  sales: ['salesLink', 'myClients'],
}

export const can = (role: StaffRole, s: StaffScreen) => permissions[role].includes(s)
