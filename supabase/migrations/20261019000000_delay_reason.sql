-- 밀린 사유(delay_reason): 월초 정리에서 오래 머문 일을 옮기거나 내려놓을 때 고른 '왜 계속 밀렸는지'.
-- 옮겨진(migrated) 줄이나 내려놓은(dropped) 줄에 남는다. 고르지 않으면 null. 앱의 로컬 스키마 v7과 같은 목록이다.
-- 새 열이라 기존 행은 null이고, LWW(apply_lww)·트리거·정책·권한은 고칠 것이 없다.
-- 이 열을 모르는 예전 앱은 열을 빼고 upsert하므로 남긴 사유를 지우지 않는다.
alter table public.items add column delay_reason text
  check (delay_reason in ('too_big', 'not_wanted', 'blocked', 'low_energy', 'stressed'));
