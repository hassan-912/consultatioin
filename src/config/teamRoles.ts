import type { L10n } from '../domain/types'

// Arabic job titles for the roles listed on mg-visa.com. Names stay as published (Latin script).
const ar: Record<string, string> = {
  'Founder & CEO': 'المؤسس والرئيس التنفيذي',
  'General Manager': 'المدير العام',
  'Chief Corporate Services Officer': 'رئيس خدمات الشركات',
  'Financial Director': 'المدير المالي',
  'Financial Manager': 'مدير مالي',
  'Sales Director': 'مدير المبيعات',
  'Operation Manager': 'مدير العمليات',
  'Quality Control Manager': 'مدير مراقبة الجودة',
  'Assistant Sales Manager': 'مساعد مدير المبيعات',
  'Senior Immigration Specialist': 'أخصائي هجرة أول',
  'Immigration Specialist': 'أخصائي هجرة',
  'Immigration Team Leader': 'قائد فريق الهجرة',
  'Study Team Leader': 'قائد فريق الدراسة',
  'Job-Seeker Team Leader': 'قائد فريق الباحثين عن عمل',
  'Follow Up Team Leader': 'قائد فريق المتابعة',
  'MG+ Team Leader': 'قائد فريق MG+',
  'Community Manager': 'مدير المجتمع',
  Community: 'فريق المجتمع',
  'Sales Representative': 'ممثل مبيعات',
  Receptionist: 'موظف استقبال',
  Operator: 'موظف عمليات',
  Archivist: 'مسؤول الأرشيف',
  'Support Services': 'خدمات الدعم',
  Accountant: 'محاسب',
  HR: 'الموارد البشرية',
}

export const roleName = (role: string): L10n => ({ en: role, ar: ar[role] ?? role })

/** Display order: leadership first, then consultants, then everyone else alphabetically. */
export const roleRank = (role: string) =>
  /CEO|General Manager|Director|Chief/.test(role) ? 0 : /Immigration Specialist/.test(role) ? 1 : /Manager|Leader/.test(role) ? 2 : 3
