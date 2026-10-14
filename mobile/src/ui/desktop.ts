import * as Device from 'expo-device';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

// 아이폰 앱이 Apple 실리콘 Mac에서 돌 때(Designed for iPad). macOS가 화면을 약 77%로 줄여 그리므로
// 글자를 그만큼 되돌려 키우고, 넓은 창에서도 한 줄이 너무 길어지지 않게 본문 폭을 묶는다.
export const ON_MAC = Device.deviceType === Device.DeviceType.DESKTOP;
export const MAC_TEXT_SCALE = 1.3;
export const MAC_CONTENT_WIDTH = 640;

// Mac에서만 글자 크기·줄 높이·자간을 키운 스타일을 돌려준다. 그 밖에서는 그대로.
export function macText<T extends TextStyle>(style: StyleProp<T>): StyleProp<T> {
  if (!ON_MAC) return style;
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (!flat) return style;
  const out: TextStyle = { ...flat };
  if (typeof out.fontSize === 'number') out.fontSize = Math.round(out.fontSize * MAC_TEXT_SCALE);
  if (typeof out.lineHeight === 'number') out.lineHeight = Math.round(out.lineHeight * MAC_TEXT_SCALE);
  if (typeof out.letterSpacing === 'number') out.letterSpacing = out.letterSpacing * MAC_TEXT_SCALE;
  return out as StyleProp<T>;
}
