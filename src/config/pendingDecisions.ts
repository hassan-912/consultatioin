import type { PendingDecision } from '../domain/types'

const d = (id: string, area: [string, string], question: [string, string]): PendingDecision => ({
  id,
  area: { en: area[0], ar: area[1] },
  question: { en: question[0], ar: question[1] },
  owner: null,
})

const SCHED: [string, string] = ['Schedules', 'المواعيد']
const PAY: [string, string] = ['Payments', 'المدفوعات']
const DATA: [string, string] = ['Data & KPIs', 'البيانات ومؤشرات الأداء']
const POLICY: [string, string] = ['Policies', 'السياسات']
const OPS: [string, string] = ['Operations', 'التشغيل']
const CONTENT: [string, string] = ['Profiles', 'الملفات الشخصية']

export const pendingDecisions: PendingDecision[] = [
  d('schedules', SCHED, ['Working hours per consultant and branch', 'ساعات العمل لكل مستشار وفرع']),
  d('breaks-buffers', SCHED, ['Breaks, buffers between appointments and daily booking limits', 'فترات الراحة والفواصل بين المواعيد والحد اليومي للحجوزات']),
  d('leave-rules', SCHED, ['Leave, holidays and unavailable-date rules', 'قواعد الإجازات والعطلات والأيام غير المتاحة']),
  d('durations-prices', SCHED, ['Final consultation durations and prices', 'المدد والأسعار النهائية للاستشارات']),
  d('payment-details', PAY, ['InstaPay link, Vodafone Cash wallet numbers and recipient name', 'رابط إنستاباي وأرقام محافظ فودافون كاش واسم المستلم']),
  d('verification-owner', PAY, ['Who verifies transfers, and within what time', 'من يراجع التحويلات وخلال أي مدة']),
  d('dubai-currency', PAY, ['Currency and payment route for Dubai customers', 'العملة وطريقة الدفع لعملاء دبي']),
  d('hold-deadline', PAY, ['Reservation deadline before an unpaid booking expires', 'المهلة قبل انتهاء الحجز غير المدفوع']),
  d('kpi-definitions', DATA, ['KPI definitions and weighting behind the score out of 10', 'تعريف مؤشرات الأداء وأوزانها في التقييم من 10']),
  d('outcome-data', DATA, ['Reliable application outcome data and attribution rules', 'بيانات موثوقة لنتائج الطلبات وقواعد نسبتها']),
  d('consultation-records', DATA, ['Source of historical consultation records', 'مصدر سجلات الاستشارات السابقة']),
  d('policies', POLICY, ['Cancellation, refund, rescheduling, lateness and no-show policies', 'سياسات الإلغاء والاسترداد وإعادة الجدولة والتأخير وعدم الحضور']),
  d('staff-roles', OPS, ['Staff responsibilities per role', 'مسؤوليات الموظفين لكل دور']),
  d('meeting-platform', OPS, ['Meeting platform for online consultations', 'منصة الاجتماعات للاستشارات الأونلاين']),
  d('reminders', OPS, ['Reminder channels and timing', 'قنوات التذكير وتوقيتها']),
  d('integrations', OPS, ['Existing CRM, calendar or spreadsheet integrations', 'التكامل مع أنظمة CRM أو التقويم أو الجداول الحالية']),
  d('profile-content', CONTENT, ['Photos, videos, biographies, titles, specializations, languages and qualifications', 'الصور والفيديوهات والنبذ والمسميات والتخصصات واللغات والمؤهلات']),
  d('esmail-spelling', CONTENT, ['Confirm the spelling "Mohamed Esmail"', 'تأكيد كتابة اسم "Mohamed Esmail"']),
]
