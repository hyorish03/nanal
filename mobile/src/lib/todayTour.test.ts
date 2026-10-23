import {
  bubbleFrame,
  isTourDue,
  lerpRect,
  markTourDue,
  markTourSeen,
  placeBubble,
  spotFor,
  spotPath,
  TOUR_KEY,
  tourSteps,
  usableRect,
} from './todayTour';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

const broken = {
  getItem: async () => {
    throw new Error('x');
  },
  setItem: async () => {
    throw new Error('x');
  },
};

const R = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const opts = { voice: true, empty: false, sidebar: false };

describe('저장', () => {
  test('온보딩 전부터 쓰던 기기(값 없음)는 보지 않는다', async () => {
    expect(await isTourDue(memoryStore())).toBe(false);
  });

  test('온보딩을 마치면 볼 차례, 끝내면 다시 안 보인다', async () => {
    const store = memoryStore();
    await markTourDue(store);
    expect(store.data.get(TOUR_KEY)).toBe('0');
    expect(await isTourDue(store)).toBe(true);
    await markTourSeen(store);
    expect(store.data.get(TOUR_KEY)).toBe('1');
    expect(await isTourDue(store)).toBe(false);
  });

  test('한 번 본 기기는 온보딩을 다시 해도 볼 차례로 되돌리지 않는다', async () => {
    const store = memoryStore();
    await markTourSeen(store);
    await markTourDue(store);
    expect(await isTourDue(store)).toBe(false);
  });

  test('저장소를 못 읽으면 본 것으로 치고, 오류로 멈추지 않는다', async () => {
    expect(await isTourDue(broken)).toBe(false);
    await expect(markTourDue(broken)).resolves.toBeUndefined();
    await expect(markTourSeen(broken)).resolves.toBeUndefined();
  });
});

describe('단계 고르기', () => {
  const all = { composer: R(0, 0, 1, 1), capture: R(0, 0, 1, 1), symbol: R(0, 0, 1, 1), swipe: R(0, 0, 1, 1), archive: R(0, 0, 1, 1) };

  test('다섯 단계가 정해진 순서로', () => {
    const steps = tourSteps(all, opts);
    expect(steps.map((s) => s.id)).toEqual(['composer', 'capture', 'symbol', 'swipe', 'archive']);
    expect(steps[0].title).toBe('여기에 한 줄씩 적어요');
    expect(steps[3].title).toBe('줄을 옆으로 밀어 보세요');
    expect(steps[4].title).toBe('지난 날은 책갈피 끈에');
  });

  test('못 잰 단계는 건너뛴다', () => {
    const steps = tourSteps({ ...all, swipe: null, archive: undefined }, opts);
    expect(steps.map((s) => s.id)).toEqual(['composer', 'capture', 'symbol']);
  });

  test('마이크가 없으면 연필로 말한다', () => {
    const [, capture] = tourSteps(all, { ...opts, voice: false });
    expect(capture.body).toBe('연필을 누르면 두서없이 쓴 글을 AI가 정리해 줘요.');
    expect(tourSteps(all, opts)[1].title).toBe('말로 적어도 돼요');
  });

  test('빈 날은 줄 이야기를 일반적으로 한다', () => {
    const steps = tourSteps(all, { ...opts, empty: true });
    expect(steps[2].body).toContain('적은 줄 왼쪽의 기호');
    expect(steps[3].title).toBe('줄은 옆으로 밀 수 있어요');
  });

  test('사이드바에서는 지난 기록을 가리킨다', () => {
    expect(tourSteps(all, { ...opts, sidebar: true })[4].title).toBe('지난 날은 지난 기록에');
  });

  test('기호 단계는 스크린 리더용 말을 따로 둔다', () => {
    expect(tourSteps(all, opts)[2].spoken).not.toContain('○');
  });
});

describe('잰 자리', () => {
  const page = R(0, 200, 390, 500);
  test('크기가 없으면 못 잰 것', () => {
    expect(usableRect(R(10, 10, 0, 0), page)).toBeNull();
    expect(usableRect(null, page)).toBeNull();
  });
  test('보이는 칸 밖으로 반 넘게 나가면 못 잰 것', () => {
    expect(usableRect(R(0, 680, 390, 50), page)).toBeNull(); // 40%만 보인다
    expect(usableRect(R(0, 660, 390, 50), page)).toEqual(R(0, 660, 390, 50));
    expect(usableRect(R(0, 900, 390, 50), page)).toBeNull();
  });
});

describe('구멍과 말풍선 자리', () => {
  const win = { width: 390, height: 844 };

  test('구멍은 조금 넓히되 화면 밖으로 나가지 않는다', () => {
    expect(spotFor(R(20, 180, 350, 50), win)).toEqual(R(14, 174, 362, 62));
    expect(spotFor(R(380, 0, 20, 100), win, 47)).toEqual(R(368, 47, 22, 59));
    // 작은 기호도 44pt는 비춘다
    expect(spotFor(R(30, 300, 18, 24), win)).toEqual(R(17, 290, 44, 44));
  });

  test('아래에 자리가 있으면 아래', () => {
    expect(placeBubble({ spot: R(14, 174, 362, 62), bubbleH: 180, windowH: 844, insetTop: 47, insetBottom: 34 })).toEqual({ top: 250, side: 'below' });
  });

  test('아래가 모자라면 위', () => {
    const p = placeBubble({ spot: R(14, 600, 362, 60), bubbleH: 180, windowH: 844, insetTop: 47, insetBottom: 34 });
    expect(p).toEqual({ top: 600 - 14 - 180, side: 'above' });
  });

  test('둘 다 모자라면 넓은 쪽에 두고 화면 안으로', () => {
    const p = placeBubble({ spot: R(0, 300, 390, 300), bubbleH: 260, windowH: 844, insetTop: 47, insetBottom: 34 });
    expect(p.side).toBe('above');
    expect(p.top + 260).toBeLessThanOrEqual(844 - 34 - 12);
    expect(p.top).toBeGreaterThanOrEqual(47 + 12);
  });

  test('휴대폰은 꽉 차게, 넓은 화면은 구멍 가운데로', () => {
    expect(bubbleFrame(R(14, 0, 44, 44), 390)).toEqual({ left: 20, width: 350 });
    expect(bubbleFrame(R(500, 0, 100, 44), 1180)).toEqual({ left: 360, width: 380 });
    expect(bubbleFrame(R(0, 0, 40, 44), 1180)).toEqual({ left: 20, width: 380 });
  });

  test('구멍 경로는 바깥 사각형과 둥근 사각형', () => {
    const d = spotPath(win, R(10, 20, 100, 40), 14);
    expect(d.startsWith('M0 0H390V844H0Z')).toBe(true);
    expect(d).toContain('M24 20H96A14 14 0 0 1 110 34');
    // 반지름은 구멍 크기의 절반을 넘지 않는다
    expect(spotPath(win, R(0, 0, 10, 10), 14)).toContain('A5 5');
  });

  test('사이를 고르게 잇는다', () => {
    expect(lerpRect(R(0, 0, 10, 10), R(10, 20, 30, 40), 0.5)).toEqual(R(5, 10, 20, 25));
  });
});
