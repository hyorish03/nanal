import { inkLevel } from '../../days/moods';

// 달력 날짜 뒤에 번지는 잉크. 기분이 좋을수록 크고 진하다.
// 진하기(navy 불투명도)는 기분 1~5에 맞춘 표. 숫자 글씨와의 대비(4.5:1 이상)를 지키려고 고른 값이다.
// - 0.42까지는 종이·선택 칸·카드 위 어디서나 먹색(ink)·남색(navy, 오늘) 숫자가 4.6:1 이상
// - 가장 진한 날(0.75)은 어두운 숫자가 2.4:1로 떨어지므로 숫자를 밝은 색(onDark)으로 바꾼다(5.5:1 이상)
export const INK_OPACITY = [0.14, 0.22, 0.31, 0.42, 0.75] as const;

// 이 진하기부터는 숫자를 밝은 색으로
export const LIGHT_TEXT_FROM = 0.6;

export function inkOpacity(mood: number): number {
  const i = Math.min(INK_OPACITY.length - 1, Math.max(0, Math.round(mood) - 1));
  return INK_OPACITY[i];
}

// 기분 1일 때 min, 5일 때 max 지름
export function inkSize(mood: number, min: number, max: number): number {
  const level = Math.min(1, Math.max(0, inkLevel(mood)));
  return Math.round(min + (max - min) * level);
}

// 잉크 위 숫자를 밝은 색으로 써야 하는 날인지(기분이 없으면 잉크도 없으니 아니다)
export function inkNeedsLightText(mood: number | null): boolean {
  return mood !== null && inkOpacity(mood) >= LIGHT_TEXT_FROM;
}
