-- 월간 AI 회고(스펙 11.9)와 AI 호출 횟수 제한
create table public.monthly_reviews (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  content jsonb not null,
  model text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (user_id, month)
);
create index monthly_reviews_user_synced on public.monthly_reviews (user_id, synced_at);

create trigger monthly_reviews_lww before insert or update on public.monthly_reviews
  for each row execute function public.apply_lww();

alter table public.monthly_reviews enable row level security;
create policy monthly_reviews_select on public.monthly_reviews for select to authenticated
  using (user_id = (select auth.uid()));
create policy monthly_reviews_insert on public.monthly_reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy monthly_reviews_update on public.monthly_reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- RLS 외에 권한으로도 막는다.
revoke all on public.monthly_reviews from anon, authenticated;
grant select, insert, update on public.monthly_reviews to authenticated;

-- AI 호출 횟수. period: voice는 논리 날짜(한국 시간, 새벽 4시 경계) 'YYYY-MM-DD', monthly는 대상 달 'YYYY-MM'.
-- 정책도 권한도 주지 않아 사용자는 직접 읽거나 고칠 수 없고, 아래 함수로만 1씩 늘어난다(되돌리는 함수는 없다).
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('voice', 'monthly')),
  period text not null,
  count integer not null,
  primary key (user_id, kind, period)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- 나중에 유료 이용(앱 내 구입)을 확인한 서버가 채울 이용권. 기간마다 기본 한도에 더해지는 횟수.
-- 이번 계획에서는 비어 있고 사용자는 읽기·쓰기 권한이 없다.
create table public.ai_entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('voice', 'monthly')),
  extra_per_period integer not null default 0 check (extra_per_period >= 0),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.ai_entitlements enable row level security;
revoke all on public.ai_entitlements from anon, authenticated;

-- 기본 한도 + 유효한 이용권. 한도 값은 여기에 고정한다(호출하는 쪽이 정하지 않는다).
create function public.ai_limit(p_user uuid, p_kind text) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (case p_kind when 'voice' then 10 when 'monthly' then 1 end)
    + coalesce((select e.extra_per_period from public.ai_entitlements e
                where e.user_id = p_user and e.kind = p_kind
                  and (e.expires_at is null or e.expires_at > now())), 0);
$$;

-- 기간 키. voice는 서버 시각으로 정하고(호출하는 쪽이 고를 수 없다), monthly는 대상 달을 받는다.
create function public.ai_period(p_kind text, p_month text) returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_kind = 'voice' then
    return to_char((now() at time zone 'Asia/Seoul') - interval '4 hours', 'YYYY-MM-DD');
  elsif p_kind = 'monthly' then
    if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
      raise exception '대상 달이 필요합니다' using errcode = '22023';
    end if;
    return p_month;
  end if;
  raise exception '알 수 없는 종류: %', p_kind using errcode = '22023';
end;
$$;

-- 남은 횟수(0 이상). 확인만 하고 세지 않는다.
create function public.ai_quota_remaining(p_kind text, p_month text default null) returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_period text;
  v_used integer;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  v_period := public.ai_period(p_kind, p_month);
  select u.count into v_used from public.ai_usage u
  where u.user_id = v_user and u.kind = p_kind and u.period = v_period;
  return greatest(public.ai_limit(v_user, p_kind) - coalesce(v_used, 0), 0);
end;
$$;

-- 한도 안이면 1을 더하고 true, 한도에 닿았으면 false.
create function public.consume_ai_quota(p_kind text, p_month text default null) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_period text;
  v_limit integer;
  v_count integer;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  v_period := public.ai_period(p_kind, p_month);
  v_limit := public.ai_limit(v_user, p_kind);
  insert into public.ai_usage as u (user_id, kind, period, count)
  values (v_user, p_kind, v_period, 1)
  on conflict (user_id, kind, period) do update set count = u.count + 1 where u.count < v_limit
  returning u.count into v_count;
  return v_count is not null;
end;
$$;

revoke execute on function public.ai_limit(uuid, text) from public, anon, authenticated;
revoke execute on function public.ai_period(text, text) from public, anon, authenticated;
revoke execute on function public.ai_quota_remaining(text, text) from public, anon;
revoke execute on function public.consume_ai_quota(text, text) from public, anon;
grant execute on function public.ai_quota_remaining(text, text) to authenticated;
grant execute on function public.consume_ai_quota(text, text) to authenticated;
