export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const ONBOARDING_KEY = 'nanal.onboarded';

// 저장소를 읽지 못하면 이미 본 것으로 친다(앱을 열 때마다 온보딩이 뜨지 않게).
export async function hasSeenOnboarding(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.getItem(ONBOARDING_KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markOnboardingSeen(store: KeyValueStore): Promise<void> {
  try {
    await store.setItem(ONBOARDING_KEY, '1');
  } catch {
    // 못 저장하면 다음에 한 번 더 보일 뿐이다.
  }
}
