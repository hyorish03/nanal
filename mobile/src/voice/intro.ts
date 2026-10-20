// 말로 적기 처음 소개(AI 동의를 함께 받는다). 화면과 상관없는 글귀와 움직임 시간표.
// 시간표는 한 바퀴(LOOP_MS)를 0~1로 보고, Animated.Value 하나를 0→1로 돌리며 interpolate로 쓴다.

export const LOOP_MS = 8000;
// 동작 줄이기거나 멈춰 보일 때의 자리: 다 말했고 세 줄이 다 보인다
export const FINAL_T = 0.9;

// 보기는 늘 같은 글이다(실제 날짜가 아니다)
export const INTRO_SPOKEN = '"오늘 책 사고, 내일 치과 전화, 금요일 3시 회의"';
export const INTRO_ROWS = [
  { text: '책 사기', when: '오늘' },
  { text: '치과 전화하기', when: '내일' },
  { text: '15:00 팀 회의', when: '10월 23일(금)' },
] as const;

export const INTRO_COPY = {
  hand: '처음이죠?',
  title: '생각나는 대로 말하면\n알아서 나눠 줘요',
  result: '이렇게 정리했어요',
  disclosure: '넣을 것만 골라 담아요. 말한 글은 Anthropic의 AI(Claude)가 정리해요. 음성은 저장하지 않고, 받아 적은 글과 오늘 날짜만 보내요.',
  agree: '동의하고 말해 보기',
  type: '글로 적을게요',
  once: '한 번 동의하면 다시 묻지 않아요',
} as const;

// 마이크를 눌렀을 때: 동의를 아직 모르면 기다리고, 안 했으면 소개, 했으면 바로 듣는다
export type VoiceStep = 'checking' | 'intro' | 'listen';
export function voiceStep(consented: boolean | null): VoiceStep {
  if (consented === null) return 'checking';
  return consented ? 'listen' : 'intro';
}

export type Track = { inputRange: number[]; outputRange: number[] };
const EPS = 0.0005;

// [t, 값] 점들로 interpolate 범위를 만든다. 같은 t가 겹치면 뒤 점을 아주 조금 민다(값이 툭 바뀌는 곳)
export function track(points: [number, number][]): Track {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (const [t, v] of points) {
    const prev = inputRange[inputRange.length - 1];
    inputRange.push(prev !== undefined && t <= prev ? prev + EPS : t);
    outputRange.push(v);
  }
  return { inputRange, outputRange };
}

const fadeOut = (v: number): [number, number][] => [
  [0.94, v],
  [1, 0],
];

// 마이크 고리: 말하는 동안(5~35%) 세 번 퍼지며 옅어진다
const PULSES = [
  [0.05, 0.15],
  [0.15, 0.25],
  [0.25, 0.35],
] as const;
export const RING_SCALE = 1.64; // 44px 마이크에서 14px씩 번진다
function pulse(from: number, to: number): Track {
  const pts: [number, number][] = [[0, from]];
  for (const [a, b] of PULSES) pts.push([a, from], [b, to], [b, from]);
  pts.push([1, from]);
  return track(pts);
}
export const ringScale = pulse(1, RING_SCALE);
export const ringOpacity = (() => {
  const pts: [number, number][] = [[0, 0]];
  for (const [a, b] of PULSES) pts.push([a, 0.35], [b, 0], [b, 0]);
  pts.push([1, 0]);
  return track(pts);
})();

// 물결 막대 다섯 개(가운데가 가장 높다). 높이 px. 그리는 쪽은 가장 큰 높이로 두고 scaleY로 줄인다
const WAVE_TIMES = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 1];
const WAVES = [
  [6, 6, 22, 10, 26, 12, 20, 6, 6],
  [6, 6, 34, 18, 38, 22, 30, 6, 6],
  [6, 6, 44, 26, 48, 30, 40, 6, 6],
];
export const BAR_SHAPE = [0, 1, 2, 1, 0];
export const barMax = (bar: number) => Math.max(...WAVES[BAR_SHAPE[bar]]);
export function barScale(bar: number): Track {
  const heights = WAVES[BAR_SHAPE[bar]];
  const max = barMax(bar);
  return track(WAVE_TIMES.map((t, i) => [t, heights[i] / max]));
}

// 말한 글이 한 글자씩(28칸) 적힌다. 0~1은 가림막이 비켜난 정도
const TYPE_FROM = 0.06;
const TYPE_TO = 0.34;
const TYPE_STEPS = 28;
export const typed = (() => {
  const pts: [number, number][] = [[0, 0]];
  const step = (TYPE_TO - TYPE_FROM) / TYPE_STEPS;
  for (let k = 0; k < TYPE_STEPS; k++) {
    const at = TYPE_FROM + k * step;
    pts.push([at, k / TYPE_STEPS], [at + step - EPS, k / TYPE_STEPS]);
  }
  pts.push([TYPE_TO, 1], [1, 1]);
  return track(pts);
})();
export const spokenOpacity = track([[0, 1], ...fadeOut(1)]);

// "이렇게 정리했어요"
export const resultOpacity = track([[0, 0], [0.38, 0], [0.44, 1], ...fadeOut(1)]);

// 정리된 줄이 0.25초 간격으로 올라온다
const ROW_GAP = 250 / LOOP_MS;
export const ROW_RISE = 10;
export function rowOpacity(i: number): Track {
  const o = i * ROW_GAP;
  return track([[0, 0], [0.46 + o, 0], [0.52 + o, 1], ...fadeOut(1)]);
}
export function rowRise(i: number): Track {
  const o = i * ROW_GAP;
  return track([[0, ROW_RISE], [0.46 + o, ROW_RISE], [0.52 + o, 0], [1, 0]]);
}

// 한 점에서 값(테스트·동작 줄이기 확인용). interpolate와 같이 선형으로 잇는다
export function valueAt({ inputRange, outputRange }: Track, t: number): number {
  if (t <= inputRange[0]) return outputRange[0];
  for (let i = 1; i < inputRange.length; i++) {
    if (t <= inputRange[i]) {
      const a = inputRange[i - 1];
      const b = inputRange[i];
      return outputRange[i - 1] + ((outputRange[i] - outputRange[i - 1]) * (t - a)) / (b - a);
    }
  }
  return outputRange[outputRange.length - 1];
}
