import { ACTION_W, dragTo, fullAt, markAt, openRow, settleLeft, swipeActionsFor, zoneAt } from './swipe';

const W = 360; // 휴대폰 줄 폭쯤
const AW = ACTION_W * 2;

describe('swipeActionsFor', () => {
  it('끝나지 않은 할 일은 미루기·지우기와 형광펜', () => {
    expect(swipeActionsFor({ kind: 'task', status: 'open' })).toEqual({ left: ['postpone', 'delete'], mark: true });
    expect(swipeActionsFor({ kind: 'task', status: 'doing' })).toEqual({ left: ['postpone', 'delete'], mark: true });
  });

  it('끝낸 일·옮긴 일·메모는 지우기만, 형광펜 없음', () => {
    for (const item of [
      { kind: 'task' as const, status: 'done' as const },
      { kind: 'task' as const, status: 'migrated' as const },
      { kind: 'note' as const, status: null },
    ]) {
      expect(swipeActionsFor(item)).toEqual({ left: ['delete'], mark: false });
    }
  });
});

describe('dragTo', () => {
  const base = { width: W, mark: true, blocked: false, wasOpen: false };

  it('왼쪽은 줄 폭까지 그대로 따라온다', () => {
    expect(dragTo(-100, base)).toBe(-100);
    expect(dragTo(-999, base)).toBe(-W);
  });

  it('형광펜이 없는 줄이나 열린 줄은 오른쪽으로 0을 넘지 않는다', () => {
    expect(dragTo(80, { ...base, mark: false })).toBe(0);
    expect(dragTo(80, { ...base, wasOpen: true })).toBe(0);
  });

  it('칠하는 거리를 넘으면 덜 따라오고, 중요가 다 찼으면 끈적하게 조금만', () => {
    const at = markAt(W);
    expect(dragTo(at, base)).toBe(at);
    expect(dragTo(at + 100, base)).toBeLessThan(at + 100);
    expect(dragTo(200, { ...base, blocked: true })).toBe(48);
  });
});

describe('zoneAt · settleLeft', () => {
  const o = { width: W, actionsW: AW, mark: true, wasOpen: false };

  it('형광펜·지우기 구역', () => {
    expect(zoneAt(markAt(W), o)).toBe('mark');
    expect(zoneAt(markAt(W) - 1, o)).toBeNull();
    expect(zoneAt(-fullAt(W, AW), o)).toBe('delete');
    expect(zoneAt(-AW, o)).toBeNull();
  });

  it('지우기 구역은 버튼이 다 드러난 뒤에 온다', () => {
    expect(fullAt(W, AW)).toBeGreaterThan(AW);
    expect(fullAt(1000, AW)).toBe(600);
  });

  it('놓을 때: 절반 넘게 밀면 열리고, 끝까지 밀면 지운다', () => {
    expect(settleLeft(-AW / 2 - 1, 0, o)).toBe('open');
    expect(settleLeft(-AW / 2 + 1, 0, o)).toBe('close');
    expect(settleLeft(-fullAt(W, AW), 0, o)).toBe('delete');
  });

  it('빠르게 튕기면 덜 밀어도 열리고 닫힌다', () => {
    expect(settleLeft(-20, -900, o)).toBe('open');
    expect(settleLeft(-AW + 10, 900, { ...o, wasOpen: true })).toBe('close');
  });
});

describe('openRow', () => {
  it('한 줄만 열려 있고, 다른 곳을 만지면 닫힌다', () => {
    const a = jest.fn();
    const b = jest.fn();
    openRow.opened('a', a);
    openRow.opened('b', b);
    expect(a).toHaveBeenCalledTimes(1);

    // 열린 줄 안을 만지면 그대로
    openRow.touch('b');
    openRow.touchOutside();
    expect(b).not.toHaveBeenCalled();

    // 바깥을 만지면 닫힌다
    openRow.touchOutside();
    expect(b).toHaveBeenCalledTimes(1);
    openRow.touchOutside();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
