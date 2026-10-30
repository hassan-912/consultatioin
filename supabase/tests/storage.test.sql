begin;
set local search_path = public, extensions;
select plan(20);
create function pg_temp.q(uid uuid, sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', case when uid is null then '{"role":"anon"}' else json_build_object('role','authenticated','sub',uid)::text end, true);
  perform set_config('role', case when uid is null then 'anon' else 'authenticated' end, true);
  begin execute sql into r; exception when others then r := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;
insert into auth.users(id) select ('00000000-0000-0000-0000-0000000000b'||n)::uuid from generate_series(1,4) n;
insert into staff_profiles(user_id,display_name,role,active) values
 ('00000000-0000-0000-0000-0000000000b1','Finance','finance',true),
 ('00000000-0000-0000-0000-0000000000b2','Admin','admin',true),
 ('00000000-0000-0000-0000-0000000000b3','Reception','reception',true),
 ('00000000-0000-0000-0000-0000000000b4','Inactive','finance',false);
insert into bookings(id,reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,customer_name,customer_phone,channel,lang,status,hold_expires_at)
values ('11111111-1111-1111-1111-111111111111','RC-1',md5('qr-receipt'),md5('receipt'),'mohamed-gamal','nasr-city','online',now()+interval '300 days',now()+interval '300 days 30 minutes','Africa/Cairo',1000,'Receipt','+201000000000','whatsapp','en','reserved',now()+interval '30 minutes');
insert into storage.objects(bucket_id,name) values ('receipts','11111111-1111-1111-1111-111111111111/file.jpg');
insert into rate_limits(key,window_start,count) values ('receipt-aged-sentinel',now()-interval '3 days',1);
select is((select public from storage.buckets where id='receipts'),false,'private bucket');
select is((select file_size_limit from storage.buckets where id='receipts'),5242880::bigint,'5 MB maximum');
select is((select allowed_mime_types from storage.buckets where id='receipts'),array['image/jpeg','image/png','image/webp','application/pdf'],'safe MIME allowlist');
select is(pg_temp.q(null,'select count(*) from storage.objects'), '0','anon cannot read');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b1','select count(*) from storage.objects'), '1','finance reads receipts');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b2','select count(*) from storage.objects'), '1','admin reads receipts');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b3','select count(*) from storage.objects'), '0','reception cannot read');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b4','select count(*) from storage.objects'), '0','inactive finance cannot read');
select alike(pg_temp.q(null,$q$insert into storage.objects(bucket_id,name) values ('receipts','outside/file.jpg') returning name$q$),'ERR:42501:%','no arbitrary customer insert');
select alike(pg_temp.q(null,$q$select create_receipt_upload('invalid')$q$),'ERR:P0001:NOT_FOUND','invalid token rejected');
select alike(pg_temp.q(null,$q$select create_receipt_upload(md5('receipt'),'svg')$q$),'ERR:P0001:INVALID_INPUT','SVG rejected');
select alike(pg_temp.q('00000000-0000-0000-0000-0000000000b1',$q$select create_receipt_upload(md5('receipt'))$q$),'ERR:P0001:FORBIDDEN','staff capability blocked');
select matches(pg_temp.q(null,$q$select create_receipt_upload(md5('receipt'))->>'path'$q$),'^11111111-1111-1111-1111-111111111111/[0-9a-f-]{36}\.jpg$','path bound to token booking');
select matches(pg_temp.q(null,$q$select create_receipt_upload(md5('receipt'),'pdf')->>'path'$q$),'\.pdf$','PDF extension');
select is((select count(*) from rate_limits where key='receipt-aged-sentinel'),1::bigint,'old rate counter preserved');
select alike(pg_temp.q(null,$q$select submit_payment(md5('receipt'),'instapay','tx','22222222-2222-2222-2222-222222222222/file.jpg')$q$),'ERR:P0001:INVALID_INPUT','foreign receipt path rejected');
select ok((select count(distinct create_receipt_upload(md5('receipt'))->>'path')=2 from generate_series(1,2)),'fresh paths are random');
select create_receipt_upload(md5('receipt')) from generate_series(1,6);
select alike(pg_temp.q(null,$q$select create_receipt_upload(md5('receipt'))$q$),'ERR:P0001:RATE_LIMITED','11th upload rate limited');
update bookings set hold_expires_at=now()-interval '1 second' where reference='RC-1';
select alike(pg_temp.q(null,$q$select create_receipt_upload(md5('receipt'))$q$),'ERR:P0001:HOLD_EXPIRED','expired hold cannot upload');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and cmd in ('INSERT','UPDATE','DELETE','ALL')),0::bigint,'no write/delete policies');
select * from finish();
rollback;
