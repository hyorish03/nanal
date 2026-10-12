import { useCallback, useLayoutEffect, useRef } from 'react';

// 늘 같은 함수를 돌려주되, 부를 때는 마지막 렌더의 fn을 부른다(목록 줄에 넘겨도 memo가 깨지지 않게).
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
