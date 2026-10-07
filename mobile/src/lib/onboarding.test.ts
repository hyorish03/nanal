import { hasSeenOnboarding, markOnboardingSeen, ONBOARDING_KEY } from './onboarding';

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
  expect(await hasSeenOnboarding(store)).toBe(false);
  await markOnboardingSeen(store);
  expect(store.data.get(ONBOARDING_KEY)).toBe('1');
  expect(await hasSeenOnboarding(store)).toBe(true);
});

test('저장소 오류가 나도 앱을 멈추지 않는다', async () => {
  const broken = {
    getItem: async () => {
      throw new Error('x');
    },
    setItem: async () => {
      throw new Error('x');
    },
  };
  expect(await hasSeenOnboarding(broken)).toBe(true);
  await expect(markOnboardingSeen(broken)).resolves.toBeUndefined();
});
