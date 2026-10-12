import { type ReactNode, useEffect, useState } from 'react';
import { Keyboard, type KeyboardEvent, LayoutAnimation, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 키보드가 올라오면 앱 화면 높이를 키보드만큼 줄인다(키보드가 내용을 덮지 않게).
// 키보드와 같은 시간·곡선으로 줄어들고 늘어난다. 시트(Modal)는 별도 창이라 각자 처리한다.
export function KeyboardResize({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const follow = (e: KeyboardEvent, next: number) => {
      if (ios && e.duration) {
        LayoutAnimation.configureNext({ duration: e.duration, update: { type: LayoutAnimation.Types.keyboard } });
      }
      setHeight(next);
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => follow(e, e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => follow(e, 0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // 키보드가 홈 표시줄 영역까지 덮으므로, 화면들이 이미 비워 둔 아래 안전 여백만큼은 빼고 줄인다.
  const shrink = Math.max(0, height - insets.bottom);
  return <View style={[styles.flex, { paddingBottom: shrink }]}>{children}</View>;
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
