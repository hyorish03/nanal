// 짧은 진동. 동작 하나에 한 번만, 눈에 보이는 변화와 함께 쓴다(진동만으로 알리지 않는다).
// 네이티브 모듈이 없는 빌드(다시 빌드하기 전 개발 클라이언트, 테스트)에서는 아무것도 하지 않는다.
type HapticsModule = typeof import('expo-haptics');

let mod: HapticsModule | null = null;
try {
  mod = require('expo-haptics');
} catch {
  mod = null;
}

function fire(fn: (h: HapticsModule) => Promise<void>): void {
  if (!mod) return;
  try {
    fn(mod).catch(() => {});
  } catch {
    // 모듈은 있는데 네이티브 쪽이 없을 때
  }
}

export const haptic = {
  select: () => fire((h) => h.selectionAsync()), // 상태 넘기기, 칩 고르기
  light: () => fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Light)), // 중요 표시
  success: () => fire((h) => h.notificationAsync(h.NotificationFeedbackType.Success)), // 한 줄 넣기
  warning: () => fire((h) => h.notificationAsync(h.NotificationFeedbackType.Warning)), // 지우기
};
