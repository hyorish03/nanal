import { StyleSheet, type StyleProp, type TextStyle, useWindowDimensions } from 'react-native';
import { ON_MAC } from './desktop';
import { type LayoutClass, layoutClassFor } from './responsive';
import { space, spaceWide, type, typeWide } from './theme';

// 배치 단계마다 글자를 얼마나 키울지.
// - compact(휴대폰): type 눈금 그대로, 배율 1. 지금 모양 그대로다.
// - regular·wide(아이패드): Txt의 variant는 typeWide 눈금을 쓰고, 화면이 직접 준 fontSize·lineHeight는
//   본문 비율(17/16 ≈ 1.06)만큼 키워 눈금과 어울리게 한다.
// - Mac: 창이 좁아도 regular 이상이라 늘 typeWide 눈금이고, 그 위에 MAC_WIDE_SCALE(1.25)을 곱한다.
//   macOS는 아이패드 앱을 약 77%로 줄여 그린다. 본문은 17 × 1.25 = 21.25pt → 화면에서 약 16.4pt.
//   화면이 직접 준 크기는 17/16 × 1.25 ≈ 1.33배가 되어 예전 MAC_TEXT_SCALE(1.35)과 거의 같다.
//   눈금이 이미 한 단계 커졌으므로 1.35를 또 곱하지 않는다(두 번 키우지 않게).
export const WIDE_RATIO = typeWide.body.fontSize / type.body.fontSize;
export const MAC_WIDE_SCALE = 1.25;

export type TextScale = {
  wide: boolean; // variant가 typeWide 눈금을 쓴다
  tokenScale: number; // typeWide 눈금에 곱하는 배율
  ownScale: number; // 화면이 직접 준 크기에 곱하는 배율
};

const COMPACT: TextScale = { wide: false, tokenScale: 1, ownScale: 1 };
const WIDE: TextScale = { wide: true, tokenScale: 1, ownScale: WIDE_RATIO };
const MAC: TextScale = { wide: true, tokenScale: MAC_WIDE_SCALE, ownScale: WIDE_RATIO * MAC_WIDE_SCALE };

export function textScaleFor(layout: LayoutClass, onMac = ON_MAC): TextScale {
  if (onMac) return MAC;
  return layout === 'compact' ? COMPACT : WIDE;
}

export function useTextScale(): TextScale {
  const { width } = useWindowDimensions();
  return textScaleFor(layoutClassFor(width));
}

// 글자 크기·줄 높이·자간에 k를 곱한다. k가 1이면 받은 스타일을 그대로 돌려준다.
export function scaleText<T extends TextStyle>(style: StyleProp<T>, k: number): StyleProp<T> {
  if (k === 1) return style;
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (!flat) return style;
  const out: TextStyle = { ...flat };
  if (typeof out.fontSize === 'number') out.fontSize = Math.round(out.fontSize * k);
  if (typeof out.lineHeight === 'number') out.lineHeight = Math.round(out.lineHeight * k);
  if (typeof out.letterSpacing === 'number') out.letterSpacing = out.letterSpacing * k;
  return out as StyleProp<T>;
}

// TextInput처럼 Txt를 거치지 않는 글자. 휴대폰 크기로 적은 스타일을 배치 단계에 맞춰 키운다(macText 대신 쓴다).
export function useScaledText<T extends TextStyle>(style: StyleProp<T>): StyleProp<T> {
  return scaleText(style, useTextScale().ownScale);
}

// 배치 단계에 맞는 간격 눈금
export function useSpace() {
  const { wide } = useTextScale();
  return wide ? spaceWide : space;
}
