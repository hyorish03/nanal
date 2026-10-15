import { appendPosition, between, clampDy, dropIndex, MIN_GAP, moveIndex, offsetTo, planMove, shiftFor } from './position';

test('appendPosition: 비었으면 1, 아니면 가장 큰 값 + 1', () => {
  expect(appendPosition(null)).toBe(1);
  expect(appendPosition(3)).toBe(4);
  expect(appendPosition(2.5)).toBe(3.5);
});

test('between: 두 이웃의 가운데, 맨 앞은 다음 - 1, 맨 뒤는 앞 + 1, 혼자면 1', () => {
  expect(between(1, 2)).toBe(1.5);
  expect(between(null, 1)).toBe(0);
  expect(between(3, null)).toBe(4);
  expect(between(null, null)).toBe(1);
});

test('between: 사이가 너무 좁거나 같거나 거꾸로면 null(다시 매겨야 한다)', () => {
  expect(between(1, 1 + MIN_GAP / 2)).toBeNull();
  expect(between(1, 1)).toBeNull();
  expect(between(2, 1)).toBeNull();
  expect(between(1, 1 + MIN_GAP * 2)).not.toBeNull();
});

const rows = (...ps: (number | null)[]) => ps.map((position, i) => ({ id: String.fromCharCode(97 + i), position }));

test('planMove: 옮긴 줄 하나만 새 이웃 사이 값을 받는다', () => {
  // a1 b2 c3 → c를 맨 앞: 0, a와 b 사이: 1.5, a를 맨 뒤: 4
  expect(planMove(rows(1, 2, 3), 'c', 0)).toEqual({ kind: 'one', position: 0 });
  expect(planMove(rows(1, 2, 3), 'c', 1)).toEqual({ kind: 'one', position: 1.5 });
  expect(planMove(rows(1, 2, 3), 'a', 2)).toEqual({ kind: 'one', position: 4 });
  expect(planMove(rows(1, 2, 3), 'a', 1)).toEqual({ kind: 'one', position: 2.5 });
});

test('planMove: 제자리는 null, 목록 밖 자리는 끝으로 맞춘다, 없는 줄은 오류', () => {
  expect(planMove(rows(1, 2), 'a', 0)).toBeNull();
  expect(planMove(rows(1, 2), 'a', 9)).toEqual({ kind: 'one', position: 3 });
  expect(planMove(rows(1, 2), 'b', -3)).toEqual({ kind: 'one', position: 0 });
  expect(() => planMove(rows(1), 'z', 0)).toThrow('옮길 줄을 찾을 수 없습니다');
});

test('planMove: 사이가 너무 좁거나 자리값 없는 줄이 섞이면 새 순서대로 모두 다시 매긴다', () => {
  expect(planMove(rows(1, 1 + 1e-7, 2), 'c', 1)).toEqual({ kind: 'renumber', order: ['a', 'c', 'b'] });
  expect(planMove(rows(1, null, 2), 'a', 2)).toEqual({ kind: 'renumber', order: ['b', 'c', 'a'] });
});

test('planMove: 같은 자리에 반복해 끼워 넣어도 언젠가는 다시 매기기로 넘어간다', () => {
  let ps = [1, 2];
  let renumbered = false;
  for (let i = 0; i < 80 && !renumbered; i++) {
    const plan = planMove([{ id: 'a', position: ps[0] }, { id: 'b', position: ps[1] }, { id: 'n', position: 100 }], 'n', 1);
    if (plan?.kind === 'one') ps = [ps[0], plan.position];
    else renumbered = true;
  }
  expect(renumbered).toBe(true);
});

test('moveIndex: 한 줄을 새 자리로 옮긴 새 배열(원래 배열은 그대로)', () => {
  const list = ['a', 'b', 'c', 'd'];
  expect(moveIndex(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  expect(moveIndex(list, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  expect(moveIndex(list, 1, 1)).toEqual(list);
  expect(list).toEqual(['a', 'b', 'c', 'd']);
});

const H = [50, 50, 74, 50]; // 줄 높이(세 번째 줄은 두 줄짜리)

test('dropIndex: 지나가는 줄의 절반을 넘어야 자리를 바꾼다', () => {
  expect(dropIndex(H, 0, 0)).toBe(0);
  expect(dropIndex(H, 0, 25)).toBe(0);
  expect(dropIndex(H, 0, 26)).toBe(1);
  expect(dropIndex(H, 0, 50 + 37)).toBe(1);
  expect(dropIndex(H, 0, 50 + 38)).toBe(2);
  expect(dropIndex(H, 0, 9999)).toBe(3);
  expect(dropIndex(H, 3, -36)).toBe(3); // 위 줄(74)의 절반 37을 아직 못 넘었다
  expect(dropIndex(H, 3, -38)).toBe(2);
  expect(dropIndex(H, 3, -74 - 25)).toBe(2);
  expect(dropIndex(H, 3, -74 - 26)).toBe(1);
  expect(dropIndex(H, 3, -9999)).toBe(0);
});

test('shiftFor: 끄는 줄과 놓일 자리 사이의 줄만 끄는 줄 높이만큼 비켜 간다', () => {
  // 0번(50)을 2번 자리로: 1·2번이 위로 50
  expect([0, 1, 2, 3].map((i) => shiftFor(i, 0, 2, 50))).toEqual([0, -50, -50, 0]);
  // 3번(50)을 1번 자리로: 1·2번이 아래로 50
  expect([0, 1, 2, 3].map((i) => shiftFor(i, 3, 1, 50))).toEqual([0, 50, 50, 0]);
  expect([0, 1, 2, 3].map((i) => shiftFor(i, 1, 1, 50))).toEqual([0, 0, 0, 0]);
});

test('offsetTo·clampDy: 놓일 자리까지의 거리, 목록 끝을 넘지 않게', () => {
  expect(offsetTo(H, 0, 2)).toBe(124);
  expect(offsetTo(H, 3, 1)).toBe(-124);
  expect(offsetTo(H, 1, 1)).toBe(0);
  expect(clampDy(H, 1, -999)).toBe(-50);
  expect(clampDy(H, 1, 999)).toBe(124);
  expect(clampDy(H, 1, 10)).toBe(10);
});
