-- 0038_message_templates: the admin edits the WhatsApp messages staff send to clients (the consultant's follow-up
-- and finance's booking confirmation), per language. No row = the site's default wording. Staff read; admin writes.
create table public.message_templates (
  key text not null check (key in ('follow_up','finance_confirmation')),
  lang text not null check (lang in ('ar','en')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (key, lang)
);
alter table public.message_templates enable row level security;
create policy message_templates_staff_read on public.message_templates for select to authenticated
using ((select public.current_staff_role()) is not null);
revoke all on public.message_templates from public, anon, authenticated;
grant select on public.message_templates to authenticated;

-- Admin: set one message in one language; a null or blank body goes back to the default wording.
create function public.admin_save_message_template(p_key text, p_lang text, p_body text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  perform public.require_admin();
  if p_key is null or p_key not in ('follow_up','finance_confirmation') then raise exception 'INVALID_INPUT' using detail = 'key'; end if;
  if p_lang is null or p_lang not in ('ar','en') then raise exception 'INVALID_INPUT' using detail = 'lang'; end if;
  if char_length(v_body) > 2000 then raise exception 'INVALID_INPUT' using detail = 'body'; end if;
  if v_body is null then
    delete from public.message_templates where key = p_key and lang = p_lang;
  else
    insert into public.message_templates (key, lang, body, updated_by) values (p_key, p_lang, p_body, auth.uid())
    on conflict (key, lang) do update set body = excluded.body, updated_at = now(), updated_by = excluded.updated_by;
  end if;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (auth.uid(), 'admin', 'message-template', p_key || ':' || p_lang, case when v_body is null then 'default' else 'edited' end);
end $$;
revoke execute on function public.admin_save_message_template(text, text, text) from public, anon;
grant execute on function public.admin_save_message_template(text, text, text) to authenticated;
