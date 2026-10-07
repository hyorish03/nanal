begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.items (id, date, kind, text, status, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-06', 'task', 'mine', 'open',
        '2026-10-06T00:00:00Z', '2026-10-06T00:00:00Z');
insert into public.days (date, mood, updated_at) values ('2026-10-06', 4, '2026-10-06T00:00:00Z');

select is((select count(*)::int from public.items), 1, 'A는 자기 항목을 본다');
select is(
  (select user_id from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_id 기본값은 auth.uid()'
);

update public.items set text = 'older', updated_at = '2026-10-05T00:00:00Z'
where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(
  (select text from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'mine',
  '더 오래된 updated_at의 수정은 무시된다'
);

select throws_ok($$ delete from public.items $$, '42501', null, '행 삭제 권한이 없다');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.items), 0, 'B는 A의 항목을 못 본다');
select is((select count(*)::int from public.days), 0, 'B는 A의 기분을 못 본다');
select throws_ok(
  $$ insert into public.items (id, user_id, date, kind, text, status, created_at, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
             '2026-10-06', 'note', 'x', null, now(), now()) $$,
  '42501', null, 'B는 A 명의로 쓸 수 없다'
);
update public.items set text = 'hacked', updated_at = '2027-01-01T00:00:00Z'
where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select text from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'mine',
  'B의 수정은 A의 항목에 적용되지 않았다'
);

-- 최신 updated_at의 수정은 반영된다 (LWW 대조군)
update public.items set text = 'newer', updated_at = '2026-10-07T00:00:00Z'
where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(
  (select text from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'newer',
  '더 최신 updated_at의 수정은 반영된다'
);

select throws_ok(
  $$ update public.items set user_id = '22222222-2222-2222-2222-222222222222'
     where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'A는 자기 행의 user_id를 B로 바꿀 수 없다'
);

insert into public.reflections (id, date, template, answers, created_at, updated_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', '2026-10-06', 'free', '{}'::jsonb,
        '2026-10-06T00:00:00Z', '2026-10-06T00:00:00Z');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.reflections), 0, 'B는 A의 회고를 못 본다');
select throws_ok(
  $$ insert into public.items (id, date, kind, text, status, created_at, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-06', 'note', 'steal', null,
             '2026-10-06T00:00:00Z', '2027-01-01T00:00:00Z')
     on conflict (id) do update set text = excluded.text, updated_at = excluded.updated_at $$,
  '42501', null, 'B는 upsert로 A의 행을 가로챌 수 없다'
);

reset role;
select ok(not has_table_privilege('anon', 'public.items', 'select'), 'anon은 items 권한이 없다');
select ok(not has_table_privilege('anon', 'public.days', 'select'), 'anon은 days 권한이 없다');
select ok(not has_table_privilege('anon', 'public.reflections', 'select'), 'anon은 reflections 권한이 없다');
set local role anon;
select throws_ok(
  $$ insert into public.items (id, user_id, date, kind, text, status, created_at, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
             '2026-10-06', 'note', 'x', null, now(), now()) $$,
  '42501', null, 'anon은 쓸 수 없다'
);

select * from finish();
rollback;
