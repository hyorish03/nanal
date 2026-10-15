-- 줄 순서(position): 오늘 장(items, 날짜마다)과 언젠가(someday)에서 끌어서 바꾼 순서. 앱의 로컬 스키마 v6과 같다.
-- 분수 순서라 옮긴 줄 하나만 이웃 두 줄의 가운데 값으로 바뀐다(사이가 좁아지면 앱이 그 목록을 1, 2, 3…으로 다시 매긴다).
-- 비워 둘 수 있다: 이 열을 모르는 예전 앱이 만든 줄은 null이고, 앱은 그런 줄을 맨 뒤에 적은 순서대로 놓는다.
-- LWW(apply_lww)는 다른 열과 똑같이 updated_at으로 가린다. 새 열이라 트리거·정책·권한은 고칠 것이 없다.
alter table public.items add column position double precision;
alter table public.someday add column position double precision;

-- 이미 있는 줄은 적은 순서(created_at, id)대로 사용자·날짜마다(언젠가는 사용자마다) 1, 2, 3…
-- 앱이 v6으로 올라가며 로컬에 매기는 값과 같은 규칙이다(지운 줄도 센다). 그래서 다시 받을 필요가 없어
-- LWW 트리거를 잠시 끄고 채운다: synced_at이 바뀌지 않아 모든 기기가 모든 줄을 다시 받지 않는다.
alter table public.items disable trigger items_lww;
update public.items as i
set position = r.n
from (
  select id, row_number() over (partition by user_id, date order by created_at, id) as n
  from public.items
) as r
where r.id = i.id;
alter table public.items enable trigger items_lww;

alter table public.someday disable trigger someday_lww;
update public.someday as s
set position = r.n
from (
  select id, row_number() over (partition by user_id order by created_at, id) as n
  from public.someday
) as r
where r.id = s.id;
alter table public.someday enable trigger someday_lww;
