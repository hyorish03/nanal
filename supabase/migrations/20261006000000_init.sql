create table public.items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('task', 'event', 'note')),
  text text not null check (length(btrim(text)) > 0),
  status text check (status in ('open', 'done', 'migrated', 'dropped')),
  migrated_from uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now(),
  check ((kind = 'task') = (status is not null))
);
create index items_user_synced on public.items (user_id, synced_at);

create table public.days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  mood smallint check (mood between 1 and 5),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (user_id, date)
);
create index days_user_synced on public.days (user_id, synced_at);

create table public.reflections (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  template text not null check (template in ('perfectionism', 'lethargy', 'gratitude', 'free')),
  answers jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now()
);
create index reflections_user_synced on public.reflections (user_id, synced_at);

-- last-write-wins: 더 오래된 updated_at의 수정은 무시하고, 반영된 쓰기에만 synced_at을 찍는다.
create function public.apply_lww() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

create trigger items_lww before insert or update on public.items
  for each row execute function public.apply_lww();
create trigger days_lww before insert or update on public.days
  for each row execute function public.apply_lww();
create trigger reflections_lww before insert or update on public.reflections
  for each row execute function public.apply_lww();

alter table public.items enable row level security;
alter table public.days enable row level security;
alter table public.reflections enable row level security;

create policy items_select on public.items for select to authenticated
  using (user_id = (select auth.uid()));
create policy items_insert on public.items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy items_update on public.items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy days_select on public.days for select to authenticated
  using (user_id = (select auth.uid()));
create policy days_insert on public.days for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy days_update on public.days for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy reflections_select on public.reflections for select to authenticated
  using (user_id = (select auth.uid()));
create policy reflections_insert on public.reflections for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy reflections_update on public.reflections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 삭제는 deleted_at으로만 한다.
revoke delete, truncate on public.items, public.days, public.reflections from anon, authenticated;
