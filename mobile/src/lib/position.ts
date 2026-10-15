// 줄 순서(position). 끌어서 옮긴 줄은 새 이웃 두 줄의 한가운데 값을 받는다(분수 순서).
// 이웃 사이가 너무 좁아지면 그 목록 전체를 1, 2, 3…으로 다시 매긴다. 화면 없이 시험하는 순수한 부분이다.

// 이웃 사이가 이보다 좁으면 가운데 값을 믿지 않고 다시 매긴다(부동소수 오차·동기화로 같은 값이 될 수 있다)
export const MIN_GAP = 1e-6;

// 목록 맨 뒤에 붙일 자리. 비었으면 1부터
export function appendPosition(max: number | null): number {
  return max === null ? 1 : max + 1;
}

// 두 이웃 사이 값. 맨 앞이면 다음 줄 - 1, 맨 뒤면 앞 줄 + 1. 사이가 너무 좁으면 null(다시 매겨야 한다)
export function between(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return 1;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  if (!(after - before >= MIN_GAP)) return null;
  const mid = (before + after) / 2;
  // 가운데 값이 반올림으로 어느 한쪽과 같아지면 사이에 들어가지 못한 것이다
  return mid > before && mid < after ? mid : null;
}

export type Placed = { id: string; position: number | null };

// 옮기기 계획. one: 옮긴 줄 하나만 새 값으로, renumber: 새 순서대로 모두 1, 2, 3…, null: 제자리(할 일 없음)
export type MovePlan = { kind: 'one'; position: number } | { kind: 'renumber'; order: string[] } | null;

// rows: 지금 보이는 순서의 목록(옮길 줄 포함). toIndex: 옮긴 뒤 그 줄이 놓일 자리(0부터, 목록 길이 안으로 맞춘다)
export function planMove(rows: Placed[], id: string, toIndex: number): MovePlan {
  const from = rows.findIndex((r) => r.id === id);
  if (from < 0) throw new Error(`옮길 줄을 찾을 수 없습니다: ${id}`);
  const to = Math.max(0, Math.min(rows.length - 1, Math.round(toIndex)));
  if (to === from) return null;
  const rest = rows.filter((r) => r.id !== id);
  const order = [...rest.slice(0, to).map((r) => r.id), id, ...rest.slice(to).map((r) => r.id)];
  // 자리값이 없는 줄(예전 앱이 만든 줄)이 섞여 있으면 가운데 값을 낼 수 없으니 모두 다시 매긴다
  if (rows.some((r) => r.position === null)) return { kind: 'renumber', order };
  const before = to > 0 ? rest[to - 1].position : null;
  const after = to < rest.length ? rest[to].position : null;
  const position = between(before, after);
  return position === null ? { kind: 'renumber', order } : { kind: 'one', position };
}

// 화면이 저장을 기다리지 않고 먼저 보여 줄 새 순서(from 자리의 줄을 to 자리로)
export function moveIndex<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// 끌기 중: 끄는 줄의 위쪽 끝이 dy만큼 움직였을 때 놓일 자리. 지나가는 줄의 절반을 넘으면 그 줄과 자리를 바꾼다
export function dropIndex(heights: number[], from: number, dy: number): number {
  let to = from;
  if (dy > 0) {
    let passed = 0;
    for (let k = from + 1; k < heights.length; k++) {
      if (dy > passed + heights[k] / 2) {
        to = k;
        passed += heights[k];
      } else break;
    }
  } else if (dy < 0) {
    let passed = 0;
    for (let k = from - 1; k >= 0; k--) {
      if (-dy > passed + heights[k] / 2) {
        to = k;
        passed += heights[k];
      } else break;
    }
  }
  return to;
}

// 끄는 줄(from)이 to에 놓일 때 index번째 줄이 비켜 갈 거리. 끄는 줄 자신은 0(손가락을 따라간다)
export function shiftFor(index: number, from: number, to: number, draggedH: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -draggedH;
  if (to < from && index >= to && index < from) return draggedH;
  return 0;
}

// 끄는 줄이 to 자리에 딱 맞게 놓이려면 원래 자리에서 움직여야 할 거리(놓을 때 그 자리로 미끄러진다)
export function offsetTo(heights: number[], from: number, to: number): number {
  let sum = 0;
  if (to > from) for (let k = from + 1; k <= to; k++) sum += heights[k];
  else for (let k = to; k < from; k++) sum -= heights[k];
  return sum;
}

// 끄는 줄이 목록 위아래 끝을 넘지 않게 dy를 묶는다
export function clampDy(heights: number[], from: number, dy: number): number {
  return Math.max(offsetTo(heights, from, 0), Math.min(offsetTo(heights, from, heights.length - 1), dy));
}
