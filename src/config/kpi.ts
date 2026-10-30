import type { KpiConfig } from '../domain/types'

export const kpiConfig: KpiConfig = {
  scale: 10,
  approvalMinSample: 20,
  reportingPeriod: { en: 'Jan 2025 – Sep 2026 (demo)', ar: 'يناير 2025 – سبتمبر 2026 (تجريبي)' },
  attributionRule: {
    en: 'A case counts for the consultant who led the file from contract to decision.',
    ar: 'تُحتسب الحالة للمستشار الذي تولّى الملف من التعاقد حتى صدور القرار.',
  },
}
