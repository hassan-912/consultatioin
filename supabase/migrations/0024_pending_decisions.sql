-- 0024_pending_decisions: the admin's list of open operational decisions, editable in the staff app.
-- Admins add and edit items; resolving one deletes it (the wording is kept in the audit log).
create table public.pending_decisions (
  id uuid primary key default gen_random_uuid(),
  area_en text not null default '' check (char_length(area_en) <= 80),
  area_ar text not null default '' check (char_length(area_ar) <= 80),
  question_en text not null default '' check (char_length(question_en) <= 500),
  question_ar text not null default '' check (char_length(question_ar) <= 500),
  owner text not null default '' check (char_length(owner) <= 80),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(question_en) <> '' or btrim(question_ar) <> '')
);
alter table public.pending_decisions enable row level security;
create policy pending_decisions_admin_read on public.pending_decisions for select to authenticated
using ((select public.current_staff_role()) = 'admin');
revoke all on public.pending_decisions from public, anon, authenticated;
grant select on public.pending_decisions to authenticated;

-- Add (p_id null) or edit one decision. Returns its id.
create function public.staff_save_decision(p_id uuid, p_area_en text, p_area_ar text, p_question_en text, p_question_ar text, p_owner text)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_area_en text := btrim(coalesce(p_area_en, ''));
  v_area_ar text := btrim(coalesce(p_area_ar, ''));
  v_q_en text := btrim(coalesce(p_question_en, ''));
  v_q_ar text := btrim(coalesce(p_question_ar, ''));
  v_owner text := btrim(coalesce(p_owner, ''));
begin
  if public.current_staff_role() is null or public.current_staff_role() <> 'admin' then raise exception 'FORBIDDEN'; end if;
  if v_q_en = '' and v_q_ar = '' then raise exception 'INVALID_INPUT' using detail = 'question'; end if;
  if char_length(v_area_en) > 80 or char_length(v_area_ar) > 80 or char_length(v_q_en) > 500 or char_length(v_q_ar) > 500 or char_length(v_owner) > 80 then
    raise exception 'INVALID_INPUT' using detail = 'length';
  end if;

  if p_id is null then
    insert into public.pending_decisions(area_en, area_ar, question_en, question_ar, owner, position)
    values (v_area_en, v_area_ar, v_q_en, v_q_ar, v_owner, coalesce((select max(position) from public.pending_decisions), 0) + 1)
    returning id into v_id;
    insert into public.audit_log(actor_user, actor_kind, action, to_value)
    values (auth.uid(), 'admin', 'decision-added', left(coalesce(nullif(v_q_en, ''), v_q_ar), 200));
  else
    update public.pending_decisions
    set area_en = v_area_en, area_ar = v_area_ar, question_en = v_q_en, question_ar = v_q_ar, owner = v_owner, updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;
  return v_id;
end $$;

-- Resolved: the decision is removed from the list; the audit log keeps what it said.
create function public.staff_resolve_decision(p_id uuid)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare d public.pending_decisions;
begin
  if public.current_staff_role() is null or public.current_staff_role() <> 'admin' then raise exception 'FORBIDDEN'; end if;
  delete from public.pending_decisions where id = p_id returning * into d;
  if d.id is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(actor_user, actor_kind, action, to_value)
  values (auth.uid(), 'admin', 'decision-resolved', left(coalesce(nullif(d.question_en, ''), d.question_ar), 200));
end $$;

revoke execute on function public.staff_save_decision(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.staff_save_decision(uuid, text, text, text, text, text) to authenticated, service_role;
revoke execute on function public.staff_resolve_decision(uuid) from public, anon;
grant execute on function public.staff_resolve_decision(uuid) to authenticated, service_role;

-- Start from the list that was hard-coded in the app.
insert into public.pending_decisions(position, area_en, area_ar, question_en, question_ar) values
  (1, 'Schedules', 'المواعيد', 'Working hours per consultant and branch', 'ساعات العمل لكل مستشار وفرع'),
  (2, 'Schedules', 'المواعيد', 'Breaks, buffers between appointments and daily booking limits', 'فترات الراحة والفواصل بين المواعيد والحد اليومي للحجوزات'),
  (3, 'Schedules', 'المواعيد', 'Leave, holidays and unavailable-date rules', 'قواعد الإجازات والعطلات والأيام غير المتاحة'),
  (4, 'Schedules', 'المواعيد', 'Final consultation durations and prices', 'المدد والأسعار النهائية للاستشارات'),
  (5, 'Payments', 'المدفوعات', 'InstaPay link, Vodafone Cash wallet numbers and recipient name', 'رابط إنستاباي وأرقام محافظ فودافون كاش واسم المستلم'),
  (6, 'Payments', 'المدفوعات', 'Who verifies transfers, and within what time', 'من يراجع التحويلات وخلال أي مدة'),
  (7, 'Payments', 'المدفوعات', 'Currency and payment route for Dubai customers', 'العملة وطريقة الدفع لعملاء دبي'),
  (8, 'Payments', 'المدفوعات', 'Reservation deadline before an unpaid booking expires', 'المهلة قبل انتهاء الحجز غير المدفوع'),
  (9, 'Data & KPIs', 'البيانات ومؤشرات الأداء', 'KPI definitions and weighting behind the score out of 10', 'تعريف مؤشرات الأداء وأوزانها في التقييم من 10'),
  (10, 'Data & KPIs', 'البيانات ومؤشرات الأداء', 'Reliable application outcome data and attribution rules', 'بيانات موثوقة لنتائج الطلبات وقواعد نسبتها'),
  (11, 'Data & KPIs', 'البيانات ومؤشرات الأداء', 'Source of historical consultation records', 'مصدر سجلات الاستشارات السابقة'),
  (12, 'Policies', 'السياسات', 'Cancellation, refund, rescheduling, lateness and no-show policies', 'سياسات الإلغاء والاسترداد وإعادة الجدولة والتأخير وعدم الحضور'),
  (13, 'Operations', 'التشغيل', 'Staff responsibilities per role', 'مسؤوليات الموظفين لكل دور'),
  (14, 'Operations', 'التشغيل', 'Meeting platform for online consultations', 'منصة الاجتماعات للاستشارات الأونلاين'),
  (15, 'Operations', 'التشغيل', 'Reminder channels and timing', 'قنوات التذكير وتوقيتها'),
  (16, 'Operations', 'التشغيل', 'Existing CRM, calendar or spreadsheet integrations', 'التكامل مع أنظمة CRM أو التقويم أو الجداول الحالية'),
  (17, 'Profiles', 'الملفات الشخصية', 'Photos, videos, biographies, titles, specializations, languages and qualifications', 'الصور والفيديوهات والنبذ والمسميات والتخصصات واللغات والمؤهلات'),
  (18, 'Profiles', 'الملفات الشخصية', 'Confirm the spelling "Mohamed Esmail"', 'تأكيد كتابة اسم "Mohamed Esmail"');
