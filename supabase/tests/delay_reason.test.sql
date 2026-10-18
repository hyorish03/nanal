begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'items', 'delay_reason', 'items에 밀린 사유(delay_reason)가 있다');
select col_is_null('public', 'items', 'delay_reason', 'delay_reason은 비워 둘 수 있다(고르지 않은 줄, 예전 앱)');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.items (id, date, kind, text, status, delay_reason, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-0000000000b1', '2026-08-04', 'task', '운동 시작하기', 'migrated', 'low_energy',
        '2026-08-04T00:00:00Z', '2026-11-01T00:00:00Z');
select is((select delay_reason from public.items where id = 'aaaaaaaa-0000-0000-0000-0000000000b1'), 'low_energy',
  '고른 사유가 저장된다');

select throws_ok(
  $$insert into public.items (id, date, kind, text, status, delay_reason, created_at, updated_at)
    values ('aaaaaaaa-0000-0000-0000-0000000000b2', '2026-08-04', 'task', 'x', 'migrated', 'lazy', now(), now())$$,
  '23514', null, '목록에 없는 사유는 거부한다');

-- 예전 앱이 delay_reason 열을 빼고 upsert해도 남긴 사유는 그대로다
insert into public.items (id, date, kind, text, status, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-0000000000b1', '2026-08-04', 'task', '운동하기', 'migrated',
        '2026-08-04T00:00:00Z', '2026-11-02T00:00:00Z')
on conflict (id) do update set text = excluded.text, updated_at = excluded.updated_at;
select is((select delay_reason from public.items where id = 'aaaaaaaa-0000-0000-0000-0000000000b1'), 'low_energy',
  'delay_reason을 모르는 쓰기는 사유를 지우지 않는다');

select * from finish();
rollback;
