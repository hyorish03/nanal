-- 언젠가: 날짜 없이 언젠가 할 일 한 목록. 오늘 장(items)과 따로 둔다(넘어온 일·월초 정리·셈·위젯에 섞이지 않게).
-- 진행 중(doing)은 없다. 오늘 할 일로 옮기면 지우지 않고 migrated로 남기고, 오늘 장에 만든 할 일의 id를 migrated_to에 적는다.
-- 앱의 로컬 스키마 v5와 같은 열·제약이다. 계정을 지우면 auth.users의 on delete cascade로 함께 지워진다.
create table public.someday (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (length(btrim(text)) > 0),
  status text not null check (status in ('open', 'done', 'migrated', 'dropped')),
  priority boolean not null default false,
  migrated_to uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now()
);
create index someday_user_synced on public.someday (user_id, synced_at);

create trigger someday_lww before insert or update on public.someday
  for each row execute function public.apply_lww();

alter table public.someday enable row level security;
create policy someday_select on public.someday for select to authenticated
  using (user_id = (select auth.uid()));
create policy someday_insert on public.someday for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy someday_update on public.someday for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- RLS 외에 권한으로도 막는다. 지우기는 deleted_at으로만 한다(delete 권한 없음).
revoke all on public.someday from anon, authenticated;
grant select, insert, update on public.someday to authenticated;
