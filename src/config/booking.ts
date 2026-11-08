import type { BookingConfig } from '../domain/types'

/** Every consultation is 45 minutes and starts on the hour (one per hour per consultant). */
export const consultationMinutes = 45

export const bookingConfig: BookingConfig = {
  durations: { online: [consultationMinutes], 'in-person': [consultationMinutes] },
  durationRange: { min: consultationMinutes, max: consultationMinutes },
  bufferMin: 10,
  holdMinutes: 30,
  // One price for every consultation, online or in person.
  prices: {
    online: { [consultationMinutes]: 1000 },
    'in-person': { [consultationMinutes]: 1000 },
  },
  currency: 'EGP',
  autoConfirm: false,
  // Slots start on the hour: 45 minutes plus the 10-minute buffer fit inside each hour.
  slotStepMin: 60,
}
