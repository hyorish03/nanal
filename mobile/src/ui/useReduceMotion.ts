import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// 마지막으로 알아낸 값. 새로 그리는 컴포넌트가 첫 프레임부터 설정을 따르게 한다(값을 다시 묻는 동안 false로 시작하지 않게).
let known = false;

// iOS '동작 줄이기'가 켜져 있으면 true. 움직임을 빼고 흐리기만 남긴다.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(known);
  useEffect(() => {
    let alive = true;
    const update = (v: boolean) => {
      known = v;
      if (alive) setReduce(v);
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(update)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
