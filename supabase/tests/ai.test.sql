begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.monthly_reviews (month, content, model, created_at, updated_at)
     values ('2026-09', '{"version":1}', 'claude-sonnet-5-5', now(), now()) $$,
  'A는 자기 월간 회고를 저장한다');
select throws_ok(
  $$ insert into public.monthly_reviews (month, content, model, created_at, updated_at)
     values ('2026-13', '{}', 'm', now(), now()) $$,
  '23514', null, '잘못된 달은 거부된다');

-- 말로 적기: 논리 날짜당 10번
select is((select bool_and(public.consume_ai_quota('voice')) from generate_series(1, 10)), true, '말로 적기 10번까지는 된다');
select is(public.consume_ai_quota('voice'), false, '말로 적기 11번째는 막힌다');

-- 월간 회고: 대상 달당 1번
select is(public.ai_quota_remaining('monthly', '2026-09'), 1, '9월 회고는 1번 남아 있다');
select is(public.consume_ai_quota('monthly', '2026-09'), true, '9월 회고 1번째');
select is(public.consume_ai_quota('monthly', '2026-09'), false, '같은 달은 한 번만');
select is(public.ai_quota_remaining('monthly', '2026-09'), 0, '9월은 남은 횟수가 없다');
select is(public.consume_ai_quota('monthly', '2026-08'), true, '다른 달은 따로 센다');
select throws_ok($$ select public.consume_ai_quota('monthly') $$, '22023', null, '월간 회고는 대상 달이 필요하다');
select throws_ok($$ select public.consume_ai_quota('other') $$, '22023', null, '모르는 종류는 거부된다');

-- 직접 접근 금지
select throws_ok($$ select * from public.ai_usage $$, '42501', null, '사용 횟수 표는 직접 읽을 수 없다');
select throws_ok($$ update public.ai_usage set count = 0 $$, '42501', null, '사용 횟수를 직접 되돌릴 수 없다');
select throws_ok($$ select * from public.ai_entitlements $$, '42501', null, '이용권 표는 직접 읽을 수 없다');
select throws_ok($$ select public.ai_limit('11111111-1111-1111-1111-111111111111', 'monthly') $$, '42501', null, '한도 계산 함수는 직접 부를 수 없다');

-- 나중의 유료 이용권: 행만 넣으면 한도가 늘어난다(서버만 넣을 수 있다)
reset role;
insert into public.ai_entitlements (user_id, kind, extra_per_period)
values ('11111111-1111-1111-1111-111111111111', 'monthly', 1);
set local role authenticated;
select is(public.ai_quota_remaining('monthly', '2026-09'), 1, '이용권이 있으면 같은 달에 1번 더 만들 수 있다');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.monthly_reviews), 0, 'B는 A의 월간 회고를 못 본다');
select throws_ok(
  $$ insert into public.monthly_reviews (user_id, month, content, model, created_at, updated_at)
     values ('11111111-1111-1111-1111-111111111111', '2026-08', '{}', 'm', now(), now()) $$,
  '42501', null, 'B는 A 명의로 월간 회고를 쓸 수 없다');

set local role anon;
select throws_ok($$ select public.consume_ai_quota('voice') $$, '42501', null, '로그인하지 않으면 부를 수 없다');

select * from finish();
rollback;
