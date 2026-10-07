import { StyleSheet, Text, type TextProps } from 'react-native';
import { colors, fonts } from './theme';

export type TxtVariant = 'body' | 'medium' | 'title' | 'hand';

// 글꼴이 적용된 Text. hand(손글씨)는 기본으로 네이비 잉크색이다.
export function Txt({ variant = 'body', style, ...rest }: TextProps & { variant?: TxtVariant }) {
  return <Text {...rest} style={[styles.base, styles[variant], style]} />;
}

const styles = StyleSheet.create({
  base: { color: colors.ink, fontSize: 16 },
  body: { fontFamily: fonts.body },
  medium: { fontFamily: fonts.medium },
  title: { fontFamily: fonts.title },
  hand: { fontFamily: fonts.hand, fontSize: 22, color: colors.navy },
});
