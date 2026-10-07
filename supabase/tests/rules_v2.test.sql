begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ insert into public.items (id, date, kind, text, status, created_at, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-07', 'event', 'x', null, now(), now()) $$,
  '23514', null, '일정 종류는 거부된다');
select throws_ok(
  $$ insert into public.items (id, date, kind, text, status, created_at, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', '2026-10-07', 'task', 'x', 'dropped', now(), now()) $$,
  '23514', null, '놓아준 일 상태는 거부된다');
select lives_ok(
  $$ insert into public.items (id, date, kind, text, status, priority, created_at, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000003', '2026-10-07', 'task', 'x', 'doing', true, now(), now()) $$,
  '진행 중 + 중요 표시 할 일은 저장된다');
select is((select priority from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000003'), true, 'priority가 저장된다');
select lives_ok(
  $$ insert into public.reflections (id, date, template, answers, snapshot, created_at, updated_at)
     values ('bbbbbbbb-0000-0000-0000-000000000001', '2026-10-07', 'cccccccc-0000-0000-0000-000000000001',
             '{"q1":"달리기"}', '{"name":"운동한 날","questions":[]}', now(), now()) $$,
  '사용자 템플릿 회고와 스냅샷이 저장된다');
insert into public.templates (id, name, questions, created_at, updated_at)
values ('cccccccc-0000-0000-0000-000000000001', '운동한 날', '[{"key":"q1","text":"무슨 운동?"}]', now(), now());

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.templates), 0, 'B는 A의 템플릿을 못 본다');
select throws_ok(
  $$ insert into public.templates (id, user_id, name, questions, created_at, updated_at)
     values ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'x', '[]', now(), now()) $$,
  '42501', null, 'B는 A 명의로 템플릿을 쓸 수 없다');

reset role;
select ok(not has_table_privilege('anon', 'public.templates', 'select'), 'anon은 templates를 읽을 수 없다');

select * from finish();
rollback;
