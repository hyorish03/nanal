import type { KeyValueStore } from './onboarding';

// 오늘 장 처음 한 번 코치마크. 온보딩을 끝내면(건너뛰어도) 기기에 '볼 차례'(0)를 남기고, 끝내거나 건너뛰면 '봤다'(1)로 바꾼다.
// 값이 없으면(온보딩 전부터 쓰던 기기) 보이지 않는다. 투어 도중 앱을 꺼도 다음에 이어서 한 번 더 뜬다.
export const TOUR_KEY = 'nanal.todayTour';
const DUE = '0';
const SEEN = '1';

// 저장소를 읽지 못하면 본 것으로 친다(열 때마다 뜨지 않게).
export async function isTourDue(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.getItem(TOUR_KEY)) === DUE;
  } catch {
    return false;
  }
}

export async function markTourDue(store: KeyValueStore): Promise<void> {
  try {
    if ((await store.getItem(TOUR_KEY)) === SEEN) return; // 한 번 본 기기는 다시 띄우지 않는다
    await store.setItem(TOUR_KEY, DUE);
  } catch {
    // 못 남기면 이번에만 보인다
  }
}

export async function markTourSeen(store: KeyValueStore): Promise<void> {
  try {
    await store.setItem(TOUR_KEY, SEEN);
  } catch {
    // 못 남겨도 다음에 한 번 더 보일 뿐이다
  }
}

export type TourRect = { x: number; y: number; width: number; height: number };
export type TourStepId = 'composer' | 'capture' | 'symbol' | 'swipe' | 'archive';
export type TourStep = { id: TourStepId; title: string; body: string; spoken?: string; rect: TourRect };
export type TourTargets = Partial<Record<TourStepId, TourRect | null>>;
// voice: 마이크(아니면 연필). empty: 오늘 적은 줄이 없어 빈 자리를 가리킨다. sidebar: 책갈피 끈 대신 사이드바 '지난 기록'
export type TourOptions = { voice: boolean; empty: boolean; sidebar: boolean };

const ORDER: TourStepId[] = ['composer', 'capture', 'symbol', 'swipe', 'archive'];

function copyFor(id: TourStepId, o: TourOptions): Omit<TourStep, 'id' | 'rect'> {
  switch (id) {
    case 'composer':
      return { title: '여기에 한 줄씩 적어요', body: '떠오르는 대로 짧게. 엔터를 누르면 오늘 장에 바로 들어가요.' };
    case 'capture':
      return o.voice
        ? { title: '말로 적어도 돼요', body: '마이크를 누르고 말하면 AI가 할 일·메모와 날짜로 나눠 줘요. 처음 누를 때 짧게 보여 드릴게요.' }
        : { title: '한꺼번에 적어도 돼요', body: '연필을 누르면 두서없이 쓴 글을 AI가 정리해 줘요.' };
    case 'symbol':
      return o.empty
        ? {
            title: '기호를 눌러 상태를 바꿔요',
            body: '적은 줄 왼쪽의 기호를 누르면 ○ 할 일 → ◐ 하는 중 → ● 끝으로 바뀌어요.',
            spoken: '적은 줄 왼쪽의 기호를 누르면 할 일, 하는 중, 끝 순서로 바뀌어요.',
          }
        : {
            title: '기호를 눌러 상태를 바꿔요',
            body: '○ 할 일 → ◐ 하는 중 → ● 끝. 다시 누르면 할 일로 돌아와요.',
            spoken: '기호를 누를 때마다 할 일, 하는 중, 끝 순서로 바뀌어요. 다시 누르면 할 일로 돌아와요.',
          };
    case 'swipe':
      return o.empty
        ? { title: '줄은 옆으로 밀 수 있어요', body: '한 줄 적은 뒤 오른쪽으로 밀면 형광펜(중요), 왼쪽으로 밀면 미루기·안 하기·지우기.' }
        : { title: '줄을 옆으로 밀어 보세요', body: '오른쪽으로 밀면 형광펜(중요), 왼쪽으로 밀면 미루기·안 하기·지우기.' };
    case 'archive':
      return {
        title: o.sidebar ? '지난 날은 지난 기록에' : '지난 날은 책갈피 끈에',
        body: '달력, 회고 모아보기, 언젠가 목록, 월간 돌아보기가 여기 있어요.',
      };
  }
}

// 잰 자리가 있는 단계만 차례대로 남긴다(못 잰 단계는 건너뛴다).
export function tourSteps(targets: TourTargets, o: TourOptions): TourStep[] {
  const steps: TourStep[] = [];
  for (const id of ORDER) {
    const rect = targets[id];
    if (rect) steps.push({ id, rect, ...copyFor(id, o) });
  }
  return steps;
}

// measureInWindow 결과를 쓸 만한지. 크기가 없거나, 보이는 칸(bounds) 밖으로 반 넘게 나가 있으면 못 잰 것으로 친다.
export function usableRect(r: TourRect | null | undefined, bounds: TourRect): TourRect | null {
  if (!r || !(r.width > 0) || !(r.height > 0)) return null;
  const w = Math.min(r.x + r.width, bounds.x + bounds.width) - Math.max(r.x, bounds.x);
  const h = Math.min(r.y + r.height, bounds.y + bounds.height) - Math.max(r.y, bounds.y);
  if (w <= 0 || h <= 0 || w * h < (r.width * r.height) / 2) return null;
  return r;
}

export const SPOT_PAD = 6;
export const SPOT_RADIUS = 14;

export const SPOT_MIN = 44; // 작은 기호·끈도 누르는 영역만큼은 비춘다

// 가리킨 자리를 조금 넓혀(적어도 44pt) 둥근 구멍으로. 화면(안전 영역 위 끝 포함) 밖으로는 나가지 않는다.
export function spotFor(r: TourRect, win: { width: number; height: number }, minTop = 0, pad = SPOT_PAD): TourRect {
  const w = Math.max(r.width + pad * 2, SPOT_MIN);
  const h = Math.max(r.height + pad * 2, SPOT_MIN);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const x = Math.max(0, cx - w / 2);
  const y = Math.max(minTop, cy - h / 2);
  const right = Math.min(win.width, cx + w / 2);
  const bottom = Math.min(win.height, cy + h / 2);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

// 말풍선은 구멍 아래에, 자리가 모자라면 위에. 둘 다 모자라면 넓은 쪽에 두고 화면 안으로 당긴다.
export function placeBubble(a: {
  spot: TourRect;
  bubbleH: number;
  windowH: number;
  insetTop: number;
  insetBottom: number;
  gap?: number;
  margin?: number;
}): { top: number; side: 'below' | 'above' } {
  const gap = a.gap ?? 14;
  const margin = a.margin ?? 12;
  const minTop = a.insetTop + margin;
  const maxBottom = a.windowH - a.insetBottom - margin;
  const below = a.spot.y + a.spot.height + gap;
  if (below + a.bubbleH <= maxBottom) return { top: below, side: 'below' };
  const above = a.spot.y - gap - a.bubbleH;
  if (above >= minTop) return { top: above, side: 'above' };
  const roomBelow = maxBottom - below;
  const roomAbove = a.spot.y - gap - minTop;
  const clamp = (t: number) => Math.max(minTop, Math.min(t, maxBottom - a.bubbleH));
  return roomBelow >= roomAbove ? { top: clamp(below), side: 'below' } : { top: clamp(above), side: 'above' };
}

// 말풍선 가로: 휴대폰은 양옆 여백만 두고 꽉 차게, 넓은 화면은 maxW 폭으로 구멍 가운데에 맞춰 화면 안에.
export function bubbleFrame(spot: TourRect, windowW: number, margin = 20, maxW = 380): { left: number; width: number } {
  const width = Math.min(windowW - margin * 2, maxW);
  const center = spot.x + spot.width / 2;
  const left = Math.max(margin, Math.min(center - width / 2, windowW - margin - width));
  return { left, width };
}

// 화면 전체를 덮는 사각형에 둥근 구멍을 낸 SVG 경로(evenodd로 칠한다)
export function spotPath(win: { width: number; height: number }, s: TourRect, radius = SPOT_RADIUS): string {
  const r = Math.max(0, Math.min(radius, s.width / 2, s.height / 2));
  const { x, y, width: w, height: h } = s;
  const n = (v: number) => Math.round(v * 10) / 10;
  return [
    `M0 0H${n(win.width)}V${n(win.height)}H0Z`,
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}`,
    `V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}`,
    `H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}`,
    `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`,
  ].join('');
}

export function lerpRect(a: TourRect, b: TourRect, t: number): TourRect {
  const l = (p: number, q: number) => p + (q - p) * t;
  return { x: l(a.x, b.x), y: l(a.y, b.y), width: l(a.width, b.width), height: l(a.height, b.height) };
}
