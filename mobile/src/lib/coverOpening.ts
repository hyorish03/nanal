import { logicalDate } from './date';
import type { KeyValueStore } from './onboarding';

// 하루의 첫 실행에만 표지를 책등 쪽으로 넘겨 펼친다. 같은 날 다시 열면 짧게 흐려지며 열린다.
export type CoverOpening = 'turn' | 'fade';

export const COVER_OPENED_KEY = 'nanal.coverOpenedOn';

// lastOpened: 마지막으로 표지를 펼친 논리 날짜(새벽 4시 경계). 없으면 그날 처음이다.
export function coverOpeningFor(lastOpened: string | null, now: Date): CoverOpening {
  return lastOpened === logicalDate(now) ? 'fade' : 'turn';
}

// 저장소를 읽지 못하면 그날 처음으로 친다.
export async function readCoverOpening(store: KeyValueStore, now: Date): Promise<CoverOpening> {
  try {
    return coverOpeningFor(await store.getItem(COVER_OPENED_KEY), now);
  } catch {
    return 'turn';
  }
}

// 표지가 다 펼쳐진 뒤에 남긴다. 못 남기면 다음 실행에 한 번 더 넘길 뿐이다.
export async function markCoverOpened(store: KeyValueStore, now: Date): Promise<void> {
  try {
    await store.setItem(COVER_OPENED_KEY, logicalDate(now));
  } catch {
    // 무시
  }
}
