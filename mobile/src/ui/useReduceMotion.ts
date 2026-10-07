import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// iOS '동작 줄이기'가 켜져 있으면 true. 표지, 포스트잇 애니메이션을 건너뛴다.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduce(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
