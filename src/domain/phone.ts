/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to Western digits. */
export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
}

export function cleanPhone(s: string): string {
  return normalizeDigits(s).replace(/[\s\-().]/g, '')
}

export function validatePhone(s: string): boolean {
  return /^\+\d{8,15}$/.test(cleanPhone(s))
}

export function validateEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())
}
