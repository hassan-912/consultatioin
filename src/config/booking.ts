import type { BookingConfig } from '../domain/types'

// Demo values — final durations, buffers, deadline and prices are pending decisions.
export const bookingConfig: BookingConfig = {
  durations: { online: [30], 'in-person': [30] },
  durationRange: { min: 15, max: 30 },
  bufferMin: 10,
  holdMinutes: 30,
  // One price for every consultation, online or in person.
  prices: {
    online: { 30: 1000 },
    'in-person': { 30: 1000 },
  },
  currency: 'EGP',
  autoConfirm: false,
  slotStepMin: 15,
}
