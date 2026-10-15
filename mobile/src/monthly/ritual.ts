import type { Db } from '../db/types';
import { type Item, listMigrationCandidates } from '../items/repo';
import { logicalDate, monthOf } from '../lib/date';
import type { KeyValueStore } from '../lib/onboarding';

// 월초 정리(불렛 저널의 월간 이동). 새 달 첫 실행에 지난달까지 끝내지 못한 일을 한 장에 모아 정리한다(스펙 11.10).
// 마지막으로 정리 시트를 띄운(띄울지 따져 본) 달 'YYYY-MM'을 기기에 남겨, 같은 달에 두 번 띄우지 않는다.
export const MONTH_RITUAL_KEY = 'nanal.monthRitual';

// 이번 달 1일(논리 날짜 기준). 이보다 앞선 날짜의 끝나지 않은 일이 정리 대상이다.
export function monthStart(today: string): string {
  return `${monthOf(today)}-01`;
}

// 이번 달에 아직 따져 보지 않았으면 true. 새벽 4시 전은 전날(=지난달 마지막 날일 수 있다)로 친다.
export function monthRitualDue(lastMonth: string | null, now: Date): boolean {
  return monthOf(logicalDate(now)) !== lastMonth;
}

// 띄울지 정한다: 이번 달에 처음이고, 정리할 일이 하나라도 있을 때만.
export function shouldShowMonthRitual(lastMonth: string | null, now: Date, leftoverCount: number): boolean {
  return monthRitualDue(lastMonth, now) && leftoverCount > 0;
}

// 지난달까지 끝내지 못한 일(open·doing, 지우지 않은 것). 오늘 포스트잇과 같은 질의를 이번 달 1일로 자른다.
export function listMonthLeftovers(db: Db, today: string): Promise<Item[]> {
  return listMigrationCandidates(db, monthStart(today));
}

// 원래 날짜별 묶기는 오늘 포스트잇과 같이 쓴다(items/carryOver.ts)
export { type DateGroup, groupByDate } from '../items/carryOver';

// 저장소를 읽지 못하면 띄우지 않는다(실행할 때마다 시트가 뜨지 않게). 포스트잇이 그대로 남아 있다.
export async function readMonthRitualDue(store: KeyValueStore, now: Date): Promise<boolean> {
  try {
    return monthRitualDue(await store.getItem(MONTH_RITUAL_KEY), now);
  } catch {
    return false;
  }
}

// 따져 본 즉시 남긴다(시트를 띄우기 전에). 앱을 바로 꺼도 같은 달에 다시 뜨지 않는다.
export async function markMonthRitual(store: KeyValueStore, now: Date): Promise<void> {
  try {
    await store.setItem(MONTH_RITUAL_KEY, monthOf(logicalDate(now)));
  } catch {
    // 못 남기면 다음 실행에 한 번 더 뜰 뿐이다.
  }
}
