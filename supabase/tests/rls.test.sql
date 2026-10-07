begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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

select * from finish();
rollback;
