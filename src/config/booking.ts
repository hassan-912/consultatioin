import type { BookingConfig } from '../domain/types'

// Demo values — final durations, buffers, deadline and prices are pending decisions.
export const bookingConfig: BookingConfig = {
  durations: { online: [15, 30], 'in-person': [30, 45] },
  bufferMin: 10,
  holdMinutes: 30,
  prices: {
    online: { 15: 500, 30: 900 },
    'in-person': { 30: 1000, 45: 1400 },
  },
  currency: 'EGP',
  autoConfirm: false,
  slotStepMin: 15,
}
