import { StyleSheet, Text, type TextProps } from 'react-native';
import { colors, fonts, type as scale } from './theme';

// body·medium·title·hand는 예전 이름(글꼴만 정한다). 나머지는 theme의 type 눈금(크기·줄 높이까지).
export type TxtVariant = 'body' | 'medium' | 'title' | 'hand' | 'display' | 'h2' | 'handLg' | 'small' | 'caption' | 'label';

// 글꼴이 적용된 Text. hand(손글씨)는 기본으로 네이비 잉크색이다.
// 한국어는 어절 단위로 줄을 바꾼다(글자 중간에서 끊기지 않게).
export function Txt({ variant = 'body', style, ...rest }: TextProps & { variant?: TxtVariant }) {
  return <Text lineBreakStrategyIOS="hangul-word" {...rest} style={[styles.base, styles[variant], style]} />;
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
