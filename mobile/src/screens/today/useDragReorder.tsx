import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { clampDy, dropIndex, offsetTo, shiftFor } from '../../lib/position';
import { haptic } from '../../ui/haptics';
import { EASE_OUT } from '../../ui/motion';

// 길게 눌러 끌어 줄 순서를 바꾸기. 목록 화면(오늘 장·언젠가)이 하나 만들어 줄마다 넘긴다.
// 끄는 줄은 손가락을 따라가고(목록이 저절로 굴러도 손가락 밑에 남는다), 사이의 줄들은 끄는 줄 높이만큼 비켜 간다.
// 끄는 칸을 zIndex로 올리지 않는다: iOS는 zIndex가 바뀌면 칸 뷰의 순서를 다시 꽂아 진행 중인 터치(끌기)를 취소한다.
// 사이의 줄들이 바로 비켜 가서 끄는 줄이 다음 줄 밑으로 지나가는 순간은 짧다.
// 놓으면 그 자리로 미끄러진 뒤 화면이 새 순서를 먼저 보여 주고(저장은 뒤에서), 비켜 간 거리를 그 순간 0으로 되돌린다.

export type DragReorder = {
  valueFor(id: string): Animated.Value; // 줄의 세로 이동(끄는 줄은 손가락을 따라, 다른 줄은 비켜 가기)
  measure(id: string, height: number): void;
  begin(id: string): boolean; // 끌 수 있는 줄이고 다른 끌기가 없으면 true
  move(translationY: number, absoluteY: number): void;
  end(): void; // 놓았다: 지금 자리로 옮긴다
  cancel(): void; // 움직이지 않았거나 취소됐다: 모두 제자리로
};

type Options = {
  ids: string[]; // 끌 수 있는 줄들(보이는 순서). 이 안에서만 자리를 바꾼다
  reduce: boolean; // 동작 줄이기: 비켜 가기·놓기 애니메이션 없이 바로
  scrollTo: (offset: number) => void;
  measureViewport: (done: (top: number, height: number) => void) => void; // 목록이 보이는 칸(창 기준)
  onActive: (id: string | null) => void; // 끄는 동안 목록 스크롤을 막고 끄는 칸을 맨 위에 그린다
  onDrop: (id: string, from: number, to: number) => void; // 새 순서를 먼저 보여 주고 저장한다
};

type Session = {
  id: string;
  from: number;
  to: number;
  hs: number[];
  shifts: number[];
  startScroll: number;
  ty: number;
  absY: number;
  top: number;
  height: number;
  frame: number | null;
};

const ROW_H = 50; // 아직 재지 못한 줄의 높이(공책 한 줄)
const EDGE = 64; // 목록 위아래 끝에서 이만큼 안으로 들어오면 저절로 굴린다
const MAX_SPEED = 14; // 한 프레임에 굴리는 최대 거리(pt)
const SHIFT_MS = 160;
const DROP_MS = 150;

export function useDragReorder(options: Options) {
  const opts = useRef(options);
  opts.current = options;
  const values = useRef(new Map<string, Animated.Value>()).current;
  const heights = useRef(new Map<string, number>()).current;
  const scroll = useRef({ y: 0, contentH: 0 }).current;
  const session = useRef<Session | null>(null);
  const pendingReset = useRef(false);

  const valueFor = (id: string) => {
    let v = values.get(id);
    if (!v) {
      v = new Animated.Value(0);
      values.set(id, v);
    }
    return v;
  };
  const resetAll = () => {
    pendingReset.current = false;
    values.forEach((v) => {
      v.stopAnimation();
      v.setValue(0);
    });
  };

  // 끄는 줄을 손가락(과 저절로 굴린 거리)에 맞추고, 놓일 자리가 바뀌면 사이의 줄을 비켜 세운다
  const apply = (s: Session) => {
    const dy = clampDy(s.hs, s.from, s.ty + (scroll.y - s.startScroll));
    valueFor(s.id).setValue(dy);
    const to = dropIndex(s.hs, s.from, dy);
    if (to === s.to) return;
    s.to = to;
    const ids = opts.current.ids;
    for (let k = 0; k < s.hs.length; k++) {
      if (k === s.from) continue;
      const shift = shiftFor(k, s.from, to, s.hs[s.from]);
      if (shift === s.shifts[k]) continue;
      s.shifts[k] = shift;
      const v = valueFor(ids[k]);
      if (opts.current.reduce) v.setValue(shift);
      else Animated.timing(v, { toValue: shift, duration: SHIFT_MS, easing: EASE_OUT, useNativeDriver: false }).start();
    }
  };

  // 손가락이 목록 위아래 끝 가까이 있으면 프레임마다 조금씩 굴린다(끝에 가까울수록 빠르게)
  const tick = () => {
    const s = session.current;
    if (!s) return;
    s.frame = null;
    if (s.height <= 0) return;
    let speed = 0;
    if (s.absY < s.top + EDGE) speed = -MAX_SPEED * Math.min(1, (s.top + EDGE - s.absY) / EDGE);
    else if (s.absY > s.top + s.height - EDGE) speed = MAX_SPEED * Math.min(1, (s.absY - (s.top + s.height - EDGE)) / EDGE);
    if (speed === 0) return;
    const max = Math.max(0, scroll.contentH - s.height);
    const next = Math.max(0, Math.min(max, scroll.y + speed));
    if (next === scroll.y) return;
    scroll.y = next;
    opts.current.scrollTo(next);
    apply(s);
    s.frame = requestAnimationFrame(tick);
  };

  const finish = (s: Session) => {
    session.current = null;
    if (s.to !== s.from) {
      haptic.select();
      pendingReset.current = true;
      opts.current.onDrop(s.id, s.from, s.to);
      // 새 순서가 그려지면 아래 useLayoutEffect가 되돌린다. 그려지지 않았으면(저장 거절 등) 잠시 뒤 제자리로
      setTimeout(() => pendingReset.current && resetAll(), 600);
    } else resetAll();
    opts.current.onActive(null);
  };

  const api = useRef<DragReorder>({
    valueFor: (id) => valueFor(id),
    measure: (id, h) => {
      heights.set(id, h);
    },
    begin: (id) => {
      if (session.current) return false;
      const ids = opts.current.ids;
      const from = ids.indexOf(id);
      if (from < 0) return false;
      if (pendingReset.current) resetAll();
      const s: Session = {
        id,
        from,
        to: from,
        hs: ids.map((i) => heights.get(i) ?? ROW_H),
        shifts: ids.map(() => 0),
        startScroll: scroll.y,
        ty: 0,
        absY: 0,
        top: 0,
        height: 0,
        frame: null,
      };
      session.current = s;
      opts.current.measureViewport((top, height) => {
        s.top = top;
        s.height = height;
      });
      opts.current.onActive(id);
      return true;
    },
    move: (ty, absY) => {
      const s = session.current;
      if (!s) return;
      s.ty = ty;
      s.absY = absY;
      apply(s);
      if (s.frame === null) s.frame = requestAnimationFrame(tick);
    },
    end: () => {
      const s = session.current;
      if (!s) return;
      if (s.frame !== null) cancelAnimationFrame(s.frame);
      s.frame = null;
      const v = valueFor(s.id);
      const final = offsetTo(s.hs, s.from, s.to);
      if (opts.current.reduce) return finish(s);
      Animated.timing(v, { toValue: final, duration: DROP_MS, easing: EASE_OUT, useNativeDriver: false }).start(() => finish(s));
    },
    cancel: () => {
      const s = session.current;
      if (!s) return;
      if (s.frame !== null) cancelAnimationFrame(s.frame);
      session.current = null;
      opts.current.onActive(null);
      values.forEach((v) => {
        if (opts.current.reduce) {
          v.stopAnimation();
          v.setValue(0);
        } else Animated.timing(v, { toValue: 0, duration: SHIFT_MS, easing: EASE_OUT, useNativeDriver: false }).start();
      });
    },
  }).current;

  // 놓은 뒤 새 순서가 그려진 바로 그때(화면에 보이기 전) 비켜 간 거리를 0으로. 그래야 줄이 튀지 않는다
  useLayoutEffect(() => {
    if (pendingReset.current) resetAll();
  }, [options.ids]);
  useEffect(
    () => () => {
      const s = session.current;
      if (s?.frame != null) cancelAnimationFrame(s.frame);
    },
    [],
  );

  const [handlers] = useState(() => ({
    onScroll: (y: number) => {
      // 저절로 굴리는 동안에는 이 기기가 정한 값이 앞선다(스크롤 이벤트가 한 프레임 늦게 온다)
      if (!session.current || session.current.frame === null) scroll.y = y;
    },
    onContentSize: (_w: number, h: number) => {
      scroll.contentH = h;
    },
  }));
  return { reorder: api, ...handlers };
}
