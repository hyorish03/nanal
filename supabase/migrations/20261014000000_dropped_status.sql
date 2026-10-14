-- 안 하기(dropped): 할 일을 지우지 않고 줄을 그어 남기는 상태를 다시 받는다(BuJo의 줄 긋기).
-- 규칙 v2에서 뺀 '놓아준 일'과 값은 같지만 뜻이 다르다: 끝낸 일로 세지 않고, 앱에서 다시 할 일로 돌릴 수 있다.
-- 제약만 넓히므로 기존 행은 바뀌지 않는다. 앱의 로컬 스키마 v4와 같은 목록이다.
alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check
  check (status in ('open', 'doing', 'done', 'migrated', 'dropped'));
