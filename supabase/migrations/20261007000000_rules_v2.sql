-- 규칙 v2: 일정 → 할 일, 놓아준 일 제거, 진행 중·중요, 사용자 템플릿과 회고 스냅샷
-- 변환한 행의 updated_at은 바꾸지 않는다(앱의 로컬 마이그레이션도 같은 변환을 한다).
update public.items set kind = 'task', status = 'open' where kind = 'event';
update public.items set status = 'open', deleted_at = coalesce(deleted_at, updated_at) where status = 'dropped';

alter table public.items drop constraint if exists items_kind_check;
alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_kind_check check (kind in ('task', 'note'));
alter table public.items add constraint items_status_check check (status in ('open', 'doing', 'done', 'migrated'));
alter table public.items add column priority boolean not null default false;

alter table public.reflections drop constraint if exists reflections_template_check;
alter table public.reflections add constraint reflections_template_check check (length(template) > 0);
alter table public.reflections add column snapshot jsonb;

create table public.templates (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  questions jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now()
);
create index templates_user_synced on public.templates (user_id, synced_at);

create trigger templates_lww before insert or update on public.templates
  for each row execute function public.apply_lww();

alter table public.templates enable row level security;
create policy templates_select on public.templates for select to authenticated
  using (user_id = (select auth.uid()));
create policy templates_insert on public.templates for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy templates_update on public.templates for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- RLS 외에 권한으로도 막는다.
revoke all on public.templates from anon, authenticated;
grant select, insert, update on public.templates to authenticated;
