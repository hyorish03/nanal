import { type StyleProp, StyleSheet, Text, type TextProps, type TextStyle, useWindowDimensions } from 'react-native';
import { colors, fonts, type as scale, typeWide } from './theme';
import { scaleText, type TextScale, useTextScale } from './typeScale';

// body·medium·title·hand는 예전 이름(글꼴만 정한다). 나머지는 theme의 type 눈금(크기·줄 높이까지).
export type TxtVariant = 'body' | 'medium' | 'title' | 'hand' | 'display' | 'h2' | 'handLg' | 'small' | 'caption' | 'label';

// 시스템 글자 크기(Dynamic Type)를 따르되 이만큼까지만 키운다. 종이 칸이 넘치지 않게.
export const MAX_FONT_SCALE = 1.4;
// 칩·달력 숫자처럼 좁은 칸에 들어가는 짧은 글자
export const MAX_FONT_SCALE_COMPACT = 1.3;

type Props = TextProps & {
  variant?: TxtVariant;
  compact?: boolean; // 좁은 칸의 짧은 글자면 true. 글자 크기를 MAX_FONT_SCALE_COMPACT까지만 키운다
};

// 글꼴이 적용된 Text. hand(손글씨)는 기본으로 네이비 잉크색이다.
// 한국어는 어절 단위로 줄을 바꾼다(글자 중간에서 끊기지 않게).
// 아이패드·Mac(넓은 배치)에서는 variant가 typeWide 눈금을 쓰고, 화면이 준 크기도 같은 비율로 키운다(typeScale.ts).
// 앱이 켜진 채로 시스템 글자 크기를 바꾸면, 글자는 새 크기로 그려지지만 자리(높이·폭)는 예전 크기로 잰 그대로 남는다
// (props가 그대로라 다시 재지 않는다). 그래서 칩·버튼이 잘리고 긴 줄이 한 줄로 잘렸다. 글자 크기 배율이 바뀌면
// Text를 새로 만들어 다시 재게 한다(key). 화면 상태는 그대로이고 글자만 다시 잰다.
export function Txt({ variant = 'body', compact = false, style, ...rest }: Props) {
  const k = useTextScale();
  const { fontScale } = useWindowDimensions();
  return (
    <Text
      key={fontScale}
      lineBreakStrategyIOS="hangul-word"
      maxFontSizeMultiplier={compact ? MAX_FONT_SCALE_COMPACT : MAX_FONT_SCALE}
      {...rest}
      style={txtStyle(k, variant, style)}
    />
  );
}

// Txt가 그리는 글자 모양 그대로. 제자리에서 고치는 입력칸이 글과 똑같아 보이게 같이 쓴다.
export function txtStyle(k: TextScale, variant: TxtVariant, style?: StyleProp<TextStyle>): StyleProp<TextStyle> {
  return k.wide
    ? [scaleText([wide.base, wide[variant]], k.tokenScale), scaleText(style, k.ownScale)]
    : [styles.base, styles[variant], style];
}

const styles = StyleSheet.create({
  base: { color: colors.ink, fontSize: 16 },
  body: { fontFamily: fonts.body },
  medium: { fontFamily: fonts.medium },
  title: { fontFamily: fonts.title },
  hand: { fontFamily: fonts.hand, fontSize: 22, color: colors.navy },
  display: scale.display,
  h2: scale.h2,
  handLg: { ...scale.handLg, color: colors.navy },
  small: scale.small,
  caption: scale.caption,
  label: scale.label,
});

// 넓은 배치. 휴대폰 쪽과 같은 모양(예전 이름은 크기만, 눈금은 줄 높이까지)
const wide = StyleSheet.create({
  base: { color: colors.ink, fontSize: typeWide.body.fontSize },
  body: { fontFamily: fonts.body },
  medium: { fontFamily: fonts.medium },
  title: { fontFamily: fonts.title },
  hand: { fontFamily: fonts.hand, fontSize: typeWide.hand.fontSize, color: colors.navy },
  display: typeWide.display,
  h2: typeWide.h2,
  handLg: { ...typeWide.handLg, color: colors.navy },
  small: typeWide.small,
  caption: typeWide.caption,
  label: typeWide.label,
});
