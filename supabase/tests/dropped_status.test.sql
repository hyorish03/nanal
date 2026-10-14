begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.items (id, date, kind, text, status, created_at, updated_at)
     values ('dddddddd-0000-0000-0000-000000000001', '2026-10-14', 'task', 'x', 'dropped', now(), now()) $$,
  '안 하기로 한 할 일은 저장된다');
select lives_ok(
  $$ update public.items set status = 'open', updated_at = now() + interval '1 second'
     where id = 'dddddddd-0000-0000-0000-000000000001' $$,
  '안 하기로 한 일을 다시 할 일로 돌릴 수 있다');
select throws_ok(
  $$ insert into public.items (id, date, kind, text, status, created_at, updated_at)
     values ('dddddddd-0000-0000-0000-000000000002', '2026-10-14', 'task', 'x', 'gone', now(), now()) $$,
  '23514', null, '모르는 상태는 여전히 거부된다');
select throws_ok(
  $$ insert into public.items (id, date, kind, text, status, created_at, updated_at)
     values ('dddddddd-0000-0000-0000-000000000003', '2026-10-14', 'note', 'x', 'dropped', now(), now()) $$,
  '23514', null, '메모에는 상태를 둘 수 없다');

select * from finish();
rollback;
