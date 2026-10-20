import {
  CELL_MS,
  CELL_STEP_MS,
  consentView,
  hasSeenReviewIntro,
  introWeeks,
  lineDelay,
  markReviewIntroSeen,
  REVIEW_INTRO_COPY,
  REVIEW_INTRO_KEY,
  REVIEW_TEASERS,
} from './reviewIntro';

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

test('처음에는 보지 않았고, 표시하면 본 것이 된다', async () => {
  const store = memoryStore();
  expect(await hasSeenReviewIntro(store)).toBe(false);
  await markReviewIntroSeen(store);
  expect(store.data.get(REVIEW_INTRO_KEY)).toBe('1');
  expect(await hasSeenReviewIntro(store)).toBe(true);
});

test('저장소를 읽지 못하면 본 것으로 치고, 저장 오류로 멈추지 않는다', async () => {
  const broken = {
    getItem: async () => {
      throw new Error('x');
    },
    setItem: async () => {
      throw new Error('x');
    },
  };
  expect(await hasSeenReviewIntro(broken)).toBe(true);
  await expect(markReviewIntroSeen(broken)).resolves.toBeUndefined();
});

test('본 적을 모르면 기다리고, 처음이면 소개, 봤으면 그대로', () => {
  expect(consentView(null)).toBe('wait');
  expect(consentView(false)).toBe('intro');
  expect(consentView(true)).toBe('plain');
});

test('달력 칸: 2026년 9월은 화요일에 시작하고 실제 기분을 싣는다', () => {
  const moods = new Map<string, number | null>([
    ['2026-09-03', 4],
    ['2026-09-17', 5],
  ]);
  const weeks = introWeeks('2026-09', moods);
  expect(weeks[0].slice(0, 2)).toEqual([null, null]);
  const cells = weeks.flat().filter((c) => c !== null);
  expect(cells).toHaveLength(30);
  expect(cells.find((c) => c.day === 3)?.mood).toBe(4);
  expect(cells.find((c) => c.day === 17)?.mood).toBe(5);
  expect(cells.find((c) => c.day === 4)?.mood).toBeNull();
  // 날짜 순서대로 번진다
  expect(cells.map((c) => c.delay)).toEqual(cells.map((c) => c.day * CELL_STEP_MS));
});

test('맛보기 줄은 마지막 날 잉크가 다 번진 뒤 차례로 나온다', () => {
  const lastInk = 30 * CELL_STEP_MS + CELL_MS;
  expect(lineDelay('2026-09', 0)).toBeGreaterThan(lastInk);
  expect(lineDelay('2026-09', 1)).toBeGreaterThan(lineDelay('2026-09', 0));
  expect(lineDelay('2026-10', 0)).toBeGreaterThan(lineDelay('2026-09', 0)); // 31일까지 있는 달은 조금 늦게
});

test('글귀', () => {
  expect(REVIEW_INTRO_COPY.title('9월')).toBe('9월을 같이 돌아볼까요?');
  expect(REVIEW_TEASERS.map((t) => t.label)).toEqual(['기분의 흐름', '무기력했던 날', '해 볼 한 가지']);
});
