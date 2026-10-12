import { COVER_OPENED_KEY, coverOpeningFor, markCoverOpened, readCoverOpening } from './coverOpening';

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

test('그날 처음이면 넘기고, 같은 날 다시 열면 흐리게 연다', () => {
  expect(coverOpeningFor(null, new Date(2026, 9, 6, 9, 0))).toBe('turn');
  expect(coverOpeningFor('2026-10-05', new Date(2026, 9, 6, 9, 0))).toBe('turn');
  expect(coverOpeningFor('2026-10-06', new Date(2026, 9, 6, 23, 0))).toBe('fade');
});

test('새벽 4시 전은 전날로 친다', () => {
  expect(coverOpeningFor('2026-10-05', new Date(2026, 9, 6, 3, 59))).toBe('fade');
  expect(coverOpeningFor('2026-10-05', new Date(2026, 9, 6, 4, 0))).toBe('turn');
});

test('펼친 날을 남기면 같은 날 다음 실행은 흐리게 연다', async () => {
  const store = memoryStore();
  const morning = new Date(2026, 9, 6, 8, 0);
  expect(await readCoverOpening(store, morning)).toBe('turn');
  await markCoverOpened(store, morning);
  expect(store.data.get(COVER_OPENED_KEY)).toBe('2026-10-06');
  expect(await readCoverOpening(store, new Date(2026, 9, 6, 21, 0))).toBe('fade');
  expect(await readCoverOpening(store, new Date(2026, 9, 7, 8, 0))).toBe('turn');
});

test('저장소 오류면 그날 처음으로 치고 앱을 멈추지 않는다', async () => {
  const broken = {
    getItem: async () => {
      throw new Error('x');
    },
    setItem: async () => {
      throw new Error('x');
    },
  };
  expect(await readCoverOpening(broken, new Date(2026, 9, 6, 8, 0))).toBe('turn');
  await expect(markCoverOpened(broken, new Date(2026, 9, 6, 8, 0))).resolves.toBeUndefined();
});
