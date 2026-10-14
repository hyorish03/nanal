begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.someday (id, text, status, priority, created_at, updated_at)
values ('eeeeeeee-0000-0000-0000-000000000001', '읽을 책', 'open', true,
        '2026-10-15T00:00:00Z', '2026-10-15T00:00:00Z');

select is(
  (select user_id from public.someday where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_id 기본값은 auth.uid()'
);
select is((select priority from public.someday where id = 'eeeeeeee-0000-0000-0000-000000000001'), true, 'priority가 저장된다');

-- 오늘 할 일로 옮기면 migrated + migrated_to
select lives_ok(
  $$ update public.someday set status = 'migrated', migrated_to = 'aaaaaaaa-0000-0000-0000-000000000009',
       updated_at = '2026-10-15T01:00:00Z'
     where id = 'eeeeeeee-0000-0000-0000-000000000001' $$,
  '옮긴 일(migrated)과 옮겨 만든 할 일 id가 저장된다');

update public.someday set text = 'older', updated_at = '2026-10-14T00:00:00Z'
where id = 'eeeeeeee-0000-0000-0000-000000000001';
select is(
  (select text from public.someday where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  '읽을 책',
  '더 오래된 updated_at의 수정은 무시된다(LWW)'
);

select throws_ok(
  $$ insert into public.someday (id, text, status, created_at, updated_at)
     values ('eeeeeeee-0000-0000-0000-000000000002', 'x', 'doing', now(), now()) $$,
  '23514', null, '언젠가에는 진행 중이 없다');
select throws_ok(
  $$ insert into public.someday (id, text, status, created_at, updated_at)
     values ('eeeeeeee-0000-0000-0000-000000000003', '   ', 'open', now(), now()) $$,
  '23514', null, '빈 글은 거부된다');
select throws_ok($$ delete from public.someday $$, '42501', null, '행 삭제 권한이 없다');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.someday), 0, 'B는 A의 언젠가를 못 본다');
select throws_ok(
  $$ insert into public.someday (id, user_id, text, status, created_at, updated_at)
     values ('eeeeeeee-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'x', 'open', now(), now()) $$,
  '42501', null, 'B는 A 명의로 쓸 수 없다');
select throws_ok(
  $$ insert into public.someday (id, text, status, created_at, updated_at)
     values ('eeeeeeee-0000-0000-0000-000000000001', 'steal', 'open', '2026-10-15T00:00:00Z', '2027-01-01T00:00:00Z')
     on conflict (id) do update set text = excluded.text, updated_at = excluded.updated_at $$,
  '42501', null, 'B는 upsert로 A의 행을 가로챌 수 없다');

reset role;
select ok(not has_table_privilege('anon', 'public.someday', 'select'), 'anon은 someday를 읽을 수 없다');
select has_index('public', 'someday', 'someday_user_synced', '키셋 pull용 (user_id, synced_at) 색인이 있다');

-- 계정을 지우면 함께 지워진다
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.someday), 0, '계정을 지우면 언젠가도 지워진다(on delete cascade)');

select * from finish();
rollback;
