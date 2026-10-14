import type { Item } from '../../items/repo';
import type { RowPlace } from '../../ui/symbols';

// 오늘 목록 줄 밀기의 규칙. 손가락 위치만 받아 정하는 순수한 부분이라 화면 없이 시험한다.

// today: 언젠가 목록의 '오늘 할 일로'(미루기 자리에 온다)
export type SwipeAction = 'postpone' | 'today' | 'drop' | 'delete';

type RowLike = Pick<Item, 'kind' | 'status'>;

// 왼쪽으로 밀면 오른쪽에 드러나는 버튼(안쪽 → 바깥쪽): 미루기 · 안 하기 · 지우기. 지우기가 늘 맨 바깥이다(끝까지 밀면 지우기).
// 오른쪽으로 밀어 형광펜을 칠하는 건 끝나지 않은 할 일만(메뉴의 중요 표시와 같다).
// 언젠가 목록은 오늘 할 일로 · 지우기 둘만(안 하기는 메뉴에).
export function swipeActionsFor(item: RowLike, place: RowPlace = 'day'): { left: SwipeAction[]; mark: boolean } {
  const unfinished = item.kind === 'task' && (item.status === 'open' || item.status === 'doing');
  if (place === 'someday') return { left: unfinished ? ['today', 'delete'] : ['delete'], mark: unfinished };
  return { left: unfinished ? ['postpone', 'drop', 'delete'] : ['delete'], mark: unfinished };
}

export const ACTION_W = 80; // 버튼 하나의 폭(넓은 배치는 글자 배율만큼 키운다)
// '오늘 할 일로'는 글이 길어 버튼 1.5개 폭을 쓴다. 나머지는 하나씩
const ACTION_SPAN: Record<SwipeAction, number> = { postpone: 1, today: 1.5, drop: 1, delete: 1 };
export const actionSpan = (a: SwipeAction) => ACTION_SPAN[a];
// 왼쪽으로 밀어 드러나는 버튼 칸 전체 폭
export function actionsWidth(actions: SwipeAction[], actionW: number): number {
  return Math.round(actions.reduce((w, a) => w + ACTION_SPAN[a], 0) * actionW);
}
export const FULL_RATIO = 0.6; // 줄 폭의 이만큼 넘게 밀면 놓자마자 지운다
const MARK_RATIO = 0.3; // 오른쪽으로 이만큼 밀면 형광펜
const MARK_MIN = 72;
const MARK_MAX = 140;
const FLICK = 600; // pt/s. 이보다 빠르게 튕기면 덜 밀어도 열고 닫는다

// 형광펜이 칠해지는 거리. 휴대폰은 줄 폭의 30%, 넓은 줄에서도 너무 멀지 않게
export function markAt(width: number): number {
  return Math.min(MARK_MAX, Math.max(MARK_MIN, width * MARK_RATIO));
}

export function fullAt(width: number, actionsW: number): number {
  // 버튼이 다 드러난 뒤에도 조금 더 밀어야 지워진다(좁은 화면에서 버튼 열기와 겹치지 않게)
  return Math.max(width * FULL_RATIO, actionsW + 48);
}

// 손가락이 간 거리(x)를 줄이 실제로 움직일 거리로 바꾼다. wasOpen: 버튼이 열린 채로 잡았다(오른쪽으로는 닫기만).
export function dragTo(x: number, o: { width: number; mark: boolean; blocked: boolean; wasOpen: boolean }): number {
  if (x < 0) return Math.max(x, -o.width);
  if (!o.mark || o.wasOpen) return 0;
  // 오늘 중요가 이미 다 찼으면 끈적하게 조금만 따라온다
  if (o.blocked) return Math.min(x * 0.35, 48);
  const at = markAt(o.width);
  return x <= at ? x : at + (x - at) * 0.4;
}

// 지금 손을 떼면 일어날 일. 이 구역에 처음 들어설 때 진동을 한 번 준다.
export type Zone = 'mark' | 'delete' | null;
export function zoneAt(x: number, o: { width: number; actionsW: number; mark: boolean; wasOpen: boolean }): Zone {
  if (x <= -fullAt(o.width, o.actionsW)) return 'delete';
  if (o.mark && !o.wasOpen && x >= markAt(o.width)) return 'mark';
  return null;
}

// 왼쪽으로 민 줄을 놓았을 때: 지우기 / 버튼 열어 두기 / 닫기
export function settleLeft(x: number, vx: number, o: { width: number; actionsW: number; wasOpen: boolean }): 'delete' | 'open' | 'close' {
  if (x <= -fullAt(o.width, o.actionsW)) return 'delete';
  if (vx > FLICK) return 'close';
  if (vx < -FLICK && x < 0) return 'open';
  // 열린 줄은 절반 넘게 되돌려야 닫히고, 닫힌 줄은 절반 넘게 밀어야 열린다
  return x < -o.actionsW / 2 ? 'open' : 'close';
}

// 버튼이 하나만 열려 있게 한다. 다른 줄을 만지거나 목록을 굴리면 닫는다.
// 줄의 onTouchStart(touch)가 화면의 onTouchStart(touchOutside)보다 먼저 불린다(이벤트가 안에서 밖으로 올라온다).
let open: { id: string; close: () => void } | null = null;
let touched: string | null = null;

export const openRow = {
  opened(id: string, close: () => void) {
    if (open && open.id !== id) open.close();
    open = { id, close };
  },
  closed(id: string) {
    if (open?.id === id) open = null;
  },
  closeAll() {
    const o = open;
    open = null;
    o?.close();
  },
  touch(id: string) {
    touched = id;
  },
  touchOutside() {
    if (open && open.id !== touched) openRow.closeAll();
    touched = null;
  },
};
