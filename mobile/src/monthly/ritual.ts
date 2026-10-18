import type { Db } from '../db/types';
import { type DelayReason, type Item, listMigrationCandidates } from '../items/repo';
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

// 오래 머문 일: 처음 적은 달에서 이번 달까지 두 달 이상(달 경계를 두 번 넘음). 포스트잇으로 날마다 옮겨
// 줄이 길어져도 몇 번 옮겼는지가 아니라 처음 적은 날로 센다
export const CHRONIC_MONTHS = 2;

export type ChronicItem = { item: Item; months: number };
export type MonthLeftovers = { chronic: ChronicItem[]; fresh: Item[] };

// 처음 적은 달부터 이번 달까지 몇 달째인지('2026-08-04', '2026-11-01' → 3)
export function monthsSince(firstDate: string, today: string): number {
  const [y1, m1] = monthOf(firstDate).split('-').map(Number);
  const [y2, m2] = monthOf(today).split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

// 옮긴 줄을 migrated_from으로 거슬러 올라가 처음 적은 날을 찾는다. 키는 받은 줄의 id.
// 옮길 때마다 원래 줄은 지우지 않고 migrated로 남으므로 지운 줄도 따라간다. UNION이라 고리가 있어도 멈춘다
export async function listFirstDates(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.getAllAsync<{ leaf: string; first: string }>(
    `WITH RECURSIVE chain(leaf, date, prev) AS (
       SELECT id, date, migrated_from FROM items WHERE id IN (${ids.map(() => '?').join(', ')})
       UNION
       SELECT chain.leaf, items.date, items.migrated_from FROM chain JOIN items ON items.id = chain.prev
     )
     SELECT leaf, MIN(date) AS first FROM chain GROUP BY leaf`,
    ids,
  );
  return new Map(rows.map((r) => [r.leaf, r.first]));
}

// 오래 머문 일(오래된 순)과 처음 넘어온 일(받은 순서 그대로)로 나눈다
export function splitChronic(items: Item[], firstDates: Map<string, string>, today: string): MonthLeftovers {
  const chronic: ChronicItem[] = [];
  const fresh: Item[] = [];
  for (const item of items) {
    const months = monthsSince(firstDates.get(item.id) ?? item.date, today);
    if (months >= CHRONIC_MONTHS) chronic.push({ item, months });
    else fresh.push(item);
  }
  chronic.sort((a, b) => b.months - a.months);
  return { chronic, fresh };
}

export async function listMonthLeftoversSplit(db: Db, today: string): Promise<MonthLeftovers> {
  const items = await listMonthLeftovers(db, today);
  return splitChronic(items, await listFirstDates(db, items.map((i) => i.id)), today);
}

const MONTH_COUNT = ['', '한', '두', '석', '넉'];

// '석 달째 넘어온 일'. 다섯 달부터는 숫자로
export function chronicLabel(months: number): string {
  return `${MONTH_COUNT[months] ? `${MONTH_COUNT[months]} ` : months}달째 넘어온 일`;
}

// 칩 순서와 말. 모두 '왜 계속 밀렸을까요?'의 대답('~해서')으로 읽힌다
export const DELAY_REASON_LABELS: Record<DelayReason, string> = {
  too_big: '일이 너무 커서',
  not_wanted: '마음이 안 가서',
  blocked: '먼저 풀 일이 있어서',
  low_energy: '기운이 없어서',
  stressed: '부담스러워서',
};

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
