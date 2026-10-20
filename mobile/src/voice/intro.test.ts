import {
  BAR_SHAPE,
  barScale,
  FINAL_T,
  INTRO_COPY,
  INTRO_ROWS,
  resultOpacity,
  ringOpacity,
  ringScale,
  rowOpacity,
  rowRise,
  spokenOpacity,
  type Track,
  track,
  typed,
  valueAt,
  voiceStep,
} from './intro';

const all: Track[] = [
  ringScale,
  ringOpacity,
  typed,
  spokenOpacity,
  resultOpacity,
  ...BAR_SHAPE.map((_, i) => barScale(i)),
  ...INTRO_ROWS.flatMap((_, i) => [rowOpacity(i), rowRise(i)]),
];

test('동의를 모르면 기다리고, 안 했으면 소개, 했으면 바로 듣는다', () => {
  expect(voiceStep(null)).toBe('checking');
  expect(voiceStep(false)).toBe('intro');
  expect(voiceStep(true)).toBe('listen');
});

test('모든 시간표는 0에서 1까지 늘 커지는 순서다(interpolate 조건)', () => {
  for (const t of all) {
    expect(t.inputRange.length).toBe(t.outputRange.length);
    expect(t.inputRange[0]).toBe(0);
    expect(t.inputRange[t.inputRange.length - 1]).toBeCloseTo(1, 2);
    for (let i = 1; i < t.inputRange.length; i++) expect(t.inputRange[i]).toBeGreaterThan(t.inputRange[i - 1]);
  }
});

test('같은 때에 찍힌 점은 조금 뒤로 민다', () => {
  expect(track([[0, 0], [0.5, 1], [0.5, 0]]).inputRange[2]).toBeGreaterThan(0.5);
});

test('멈춘 자리(동작 줄이기)에서는 다 말했고 세 줄이 다 보이며 고리는 없다', () => {
  expect(valueAt(typed, FINAL_T)).toBe(1);
  expect(valueAt(spokenOpacity, FINAL_T)).toBe(1);
  expect(valueAt(resultOpacity, FINAL_T)).toBe(1);
  INTRO_ROWS.forEach((_, i) => {
    expect(valueAt(rowOpacity(i), FINAL_T)).toBe(1);
    expect(valueAt(rowRise(i), FINAL_T)).toBe(0);
  });
  expect(valueAt(ringOpacity, FINAL_T)).toBe(0);
  expect(valueAt(barScale(2), FINAL_T)).toBeCloseTo(6 / 48);
});

test('순서: 말하기 → 받아 적기 → 정리 문구 → 줄이 차례로', () => {
  expect(valueAt(typed, 0.03)).toBe(0);
  expect(valueAt(typed, 0.2)).toBeGreaterThan(0);
  expect(valueAt(typed, 0.2)).toBeLessThan(1);
  expect(valueAt(resultOpacity, 0.36)).toBe(0);
  expect(valueAt(rowOpacity(0), 0.44)).toBe(0);
  // 첫 줄이 다 올라왔을 때 셋째 줄은 아직이다
  expect(valueAt(rowOpacity(0), 0.52)).toBe(1);
  expect(valueAt(rowOpacity(2), 0.52)).toBeLessThan(1);
  // 말하는 동안 고리가 퍼진다
  expect(valueAt(ringScale, 0.1)).toBeGreaterThan(1);
  expect(valueAt(barScale(2), 0.2)).toBe(1);
});

test('한 바퀴 끝에는 사라져 처음과 이어진다', () => {
  expect(valueAt(resultOpacity, 1)).toBe(0);
  expect(valueAt(spokenOpacity, 1)).toBe(0);
  INTRO_ROWS.forEach((_, i) => expect(valueAt(rowOpacity(i), 1)).toBe(0));
});

test('받아 적기는 칸칸이 늘어난다', () => {
  const seen = new Set<number>();
  for (let t = 0.06; t < 0.34; t += 0.001) seen.add(Math.round(valueAt(typed, t) * 28));
  expect(seen.size).toBeGreaterThanOrEqual(27);
});

test('보기 글귀: 동의 문구는 Anthropic과 보내는 것을 밝힌다', () => {
  expect(INTRO_COPY.disclosure).toContain('Anthropic');
  expect(INTRO_COPY.disclosure).toContain('음성은 저장하지 않');
  expect(INTRO_COPY.disclosure).toContain('오늘 날짜');
  expect(INTRO_ROWS.map((r) => r.when)).toEqual(['오늘', '내일', '10월 23일(금)']);
});
