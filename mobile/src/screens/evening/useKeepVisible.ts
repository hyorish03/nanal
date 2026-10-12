import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, type View } from 'react-native';

type Node = View | null;
const MARGIN = 16;

const measure = (node: View) =>
  new Promise<{ top: number; bottom: number }>((resolve) =>
    node.measureInWindow((_x, y, _w, h) => resolve({ top: y, bottom: y + h })),
  );

// 앱 화면은 KeyboardResize가 키보드만큼 줄여 주므로, 여기서는 인셋을 더하지 않고
// 쓰고 있는 칸과 저장 버튼이 줄어든 화면 안에 들어오도록 스크롤만 옮긴다.
// 둘이 한 화면에 다 들어가지 않으면 쓰고 있는 칸을 먼저 보여준다.
export function useKeepVisible(scroll: RefObject<ScrollView | null>, frame: RefObject<View | null>) {
  const offset = useRef(0);
  const target = useRef<{ field: Node; button: Node } | null>(null);

  const reveal = useCallback(async () => {
    const t = target.current;
    if (!t?.field || !frame.current || !scroll.current) return;
    const [view, field, button] = await Promise.all([
      measure(frame.current),
      measure(t.field),
      t.button ? measure(t.button) : Promise.resolve(null),
    ]);
    const room = view.bottom - view.top - MARGIN * 2;
    const bottom = button && button.bottom - field.top <= room ? button.bottom : Math.min(field.bottom, field.top + room);
    let dy = 0;
    if (bottom > view.bottom - MARGIN) dy = bottom - (view.bottom - MARGIN);
    else if (field.top < view.top + MARGIN) dy = field.top - (view.top + MARGIN);
    if (Math.abs(dy) > 1) scroll.current.scrollTo({ y: Math.max(0, offset.current + dy), animated: true });
  }, [scroll, frame]);

  // 키보드가 다 올라와 화면이 줄어든 뒤에 한 번 더 맞춘다
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      reveal();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      target.current = null;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);

  // 칸에 들어갈 때와, 여러 줄로 길어질 때 부른다
  const keep = useCallback(
    (field: Node, button: Node) => {
      target.current = { field, button };
      reveal();
    },
    [reveal],
  );

  return { onScroll, keep };
}
