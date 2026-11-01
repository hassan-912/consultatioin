// Copied unchanged from hassan-912/Visa-File-Strength-Calculator (lib/exchange-rates.ts, commit 94cb7f8). Edit there first.
export interface EgpRates {
  rates: { EUR: number; SEK: number };
  updatedAt: string;
  nextUpdateAt: string;
}

const MAX_RATE_AGE_MS = 48 * 60 * 60 * 1000;

// Validate the public provider response before displaying any monetary estimate.
export function parseEgpRates(value: unknown, now = Date.now()): EgpRates {
  if (!value || typeof value !== "object") throw new Error("Invalid exchange rate response");
  const data = value as Record<string, unknown>;
  const rates = data.rates as Record<string, unknown> | undefined;
  const egp = rates?.EGP;
  const sek = rates?.SEK;
  const updated = data.time_last_update_unix;
  const next = data.time_next_update_unix;
  if (data.result !== "success" || data.base_code !== "EUR" ||
    typeof egp !== "number" || !Number.isFinite(egp) || egp <= 0 ||
    typeof sek !== "number" || !Number.isFinite(sek) || sek <= 0 ||
    typeof updated !== "number" || !Number.isFinite(updated) || updated <= 0 ||
    typeof next !== "number" || !Number.isFinite(next) || next <= updated ||
    updated * 1000 > now + 5 * 60 * 1000 || now - updated * 1000 > MAX_RATE_AGE_MS ||
    !Number.isFinite(egp / sek)) {
    throw new Error("Exchange rates are unavailable or out of date");
  }
  return { rates: { EUR: egp, SEK: egp / sek }, updatedAt: new Date(updated * 1000).toISOString(), nextUpdateAt: new Date(next * 1000).toISOString() };
}

export function convertToEgp(amount: number, currency: "EUR" | "SEK", data: EgpRates): number {
  return amount * data.rates[currency];
}
