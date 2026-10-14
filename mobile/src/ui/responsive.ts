import { useWindowDimensions } from 'react-native';
import { ON_MAC } from './desktop';

// 창 너비로 나누는 배치 단계. compact는 휴대폰(지금 모양 그대로), regular는 아이패드 세로·좁은 Mac 창,
// wide는 아이패드 가로·Mac 창. Mac에서는 창이 좁아도 regular 이상으로 본다(데스크톱 앱처럼 보이게).
export type LayoutClass = 'compact' | 'regular' | 'wide';

export const REGULAR_MIN = 700;
export const WIDE_MIN = 1000;

export function layoutClassFor(width: number, onMac = ON_MAC): LayoutClass {
  if (width >= WIDE_MIN) return 'wide';
  if (width >= REGULAR_MIN || onMac) return 'regular';
  return 'compact';
}

export function useLayoutClass(): LayoutClass {
  const { width } = useWindowDimensions();
  return layoutClassFor(width);
}

// 넓은 배치에서 쓰는 간격·폭 기준
export const WIDE = {
  sidebarWidth: 220,
  gutter: 32, // 칸 사이
  pageX: 40, // 바깥 좌우 여백
  readingWidth: 680, // 글을 읽는 칸의 최대 폭
};
