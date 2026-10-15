begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_column('public', 'items', 'position', 'items에 줄 순서(position)가 있다');
select col_type_is('public', 'items', 'position', 'double precision', 'items.position은 분수 순서라 double precision');
select col_is_null('public', 'items', 'position', 'items.position은 비워 둘 수 있다(예전 앱이 만든 줄)');
select has_column('public', 'someday', 'position', 'someday에 줄 순서(position)가 있다');
select col_type_is('public', 'someday', 'position', 'double precision', 'someday.position은 double precision');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 예전 앱처럼 position 없이 넣어도 된다
insert into public.items (id, date, kind, text, status, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-16', 'task', '예전 앱', 'open',
        '2026-10-16T00:00:00Z', '2026-10-16T00:00:00Z');
select is((select position from public.items where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), null::double precision,
  'position 없이 넣은 줄은 null');

-- 끌어서 옮긴 줄: 새 updated_at과 함께 가운데 값
insert into public.items (id, date, kind, text, status, position, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-16', 'task', '예전 앱', 'open', 1.5,
        '2026-10-16T00:00:00Z', '2026-10-16T01:00:00Z')
on conflict (id) do update set position = excluded.position, updated_at = excluded.updated_at;
select is((select position from public.items where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), 1.5::double precision,
  '옮긴 자리값이 저장된다');

-- 더 오래된 쓰기의 순서는 무시된다(LWW)
update public.items set position = 9, updated_at = '2026-10-16T00:30:00Z'
where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
select is((select position from public.items where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), 1.5::double precision,
  '더 오래된 updated_at의 순서 변경은 무시된다(LWW)');

-- 예전 앱이 position 열을 빼고 upsert해도 매겨 둔 순서는 그대로다
insert into public.items (id, date, kind, text, status, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-16', 'task', '고침', 'done',
        '2026-10-16T00:00:00Z', '2026-10-16T02:00:00Z')
on conflict (id) do update set text = excluded.text, status = excluded.status, updated_at = excluded.updated_at;
select is((select position from public.items where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), 1.5::double precision,
  'position을 모르는 쓰기는 순서를 지우지 않는다');

insert into public.someday (id, text, status, position, created_at, updated_at)
values ('eeeeeeee-0000-0000-0000-0000000000a1', '읽을 책', 'open', 0.25, now(), now());
select is((select position from public.someday where id = 'eeeeeeee-0000-0000-0000-0000000000a1'), 0.25::double precision,
  '언젠가 줄의 자리값이 저장된다');

select * from finish();
rollback;
