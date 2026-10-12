import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, type KeyboardEvent, LayoutAnimation, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 시트(Modal)가 떠 있는 동안에는 뒤 화면 높이를 붙들어 둔다(시트 입력칸 키보드에 뒤 화면이 들썩이지 않게).
// 시트가 useKeyboardResizePaused(visible)로 알려 준다. 모든 시트가 닫히면 그때의 키보드 높이로 맞춘다.
let paused = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function useKeyboardResizePaused(on: boolean) {
  useEffect(() => {
    if (!on) return;
    paused += 1;
    notify();
    return () => {
      paused -= 1;
      notify();
    };
  }, [on]);
}

// 화면 아래에 붙은 키보드가 실제로 가리는 높이. 떠 있거나(iPad 분리·플로팅) 화면 밖으로 내려간 키보드는 0이다.
// Android는 창 높이와 키보드 좌표의 기준이 달라(가장자리까지 그리기) 예전처럼 키보드 높이를 그대로 쓴다.
function docked(e: KeyboardEvent): number {
  const { height, screenY } = e.endCoordinates;
  if (height <= 0) return 0;
  if (Platform.OS !== 'ios') return height;
  const windowH = Dimensions.get('window').height;
  if (screenY >= windowH) return 0;
  if (screenY + height < windowH - 1) return 0; // 아래 가장자리에 닿지 않았다: 떠 있는 키보드
  return Math.min(height, windowH - screenY);
}

// 키보드가 올라오면 앱 화면 높이를 키보드만큼 줄인다(키보드가 내용을 덮지 않게).
// 키보드와 같은 시간·곡선으로 줄어들고 늘어난다. 시트(Modal)는 별도 창이라 각자 처리한다.
export function KeyboardResize({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  const latest = useRef(0); // 붙들어 둔 동안 들어온 마지막 키보드 높이

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const follow = (e: KeyboardEvent, next: number) => {
      latest.current = next;
      if (paused > 0) return;
      if (ios && e.duration) {
        LayoutAnimation.configureNext({ duration: e.duration, update: { type: LayoutAnimation.Types.keyboard } });
      }
      setHeight(next);
    };
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => follow(e, docked(e))),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => follow(e, 0)),
    ];
    // iPad에서 키보드를 떼어 내거나 다시 붙이면 보이기·숨기기 없이 틀만 바뀐다
    if (ios) subs.push(Keyboard.addListener('keyboardWillChangeFrame', (e) => follow(e, docked(e))));
    const resume = () => {
      if (paused === 0) setHeight(latest.current);
    };
    listeners.add(resume);
    return () => {
      subs.forEach((s) => s.remove());
      listeners.delete(resume);
    };
  }, []);

  // 키보드가 홈 표시줄 영역까지 덮으므로, 화면들이 이미 비워 둔 아래 안전 여백만큼은 빼고 줄인다.
  const shrink = Math.max(0, height - insets.bottom);
  return <View style={[styles.flex, { paddingBottom: shrink }]}>{children}</View>;
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
