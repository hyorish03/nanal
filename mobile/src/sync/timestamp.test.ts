import { normalizeTimestamp } from './timestamp';

describe('normalizeTimestamp', () => {
  it('Z 형식은 그대로 둔다', () => {
    expect(normalizeTimestamp('2026-10-06T00:00:00.000Z')).toBe('2026-10-06T00:00:00.000Z');
  });

  it('소수부가 없는 +00:00를 정규화한다', () => {
    expect(normalizeTimestamp('2026-10-06T00:00:00+00:00')).toBe('2026-10-06T00:00:00.000Z');
  });

  it('양의 오프셋을 반영한다', () => {
    expect(normalizeTimestamp('2026-10-06T09:30:00.5+09:00')).toBe('2026-10-06T00:30:00.500Z');
  });

  it('전날로 넘어가는 경우를 처리한다', () => {
    expect(normalizeTimestamp('2026-10-06T05:00:00+09:00')).toBe('2026-10-05T20:00:00.000Z');
  });

  it('마이크로초는 밀리초 3자리로 자른다', () => {
    expect(normalizeTimestamp('2026-10-06T00:00:00.123456+00:00')).toBe('2026-10-06T00:00:00.123Z');
  });

  it('음의 오프셋을 반영한다', () => {
    expect(normalizeTimestamp('2026-10-06T00:00:00-05:30')).toBe('2026-10-06T05:30:00.000Z');
  });

  it('+HHMM과 +HH 오프셋을 받아들인다', () => {
    expect(normalizeTimestamp('2026-10-06T09:00:00+0900')).toBe('2026-10-06T00:00:00.000Z');
    expect(normalizeTimestamp('2026-10-06T09:00:00+09')).toBe('2026-10-06T00:00:00.000Z');
  });

  it('공백 구분자를 받아들인다', () => {
    expect(normalizeTimestamp('2026-10-06 00:00:00+00')).toBe('2026-10-06T00:00:00.000Z');
  });

  it('알 수 없는 형식은 에러를 던진다', () => {
    expect(() => normalizeTimestamp('not a date')).toThrow('알 수 없는 시각 형식: not a date');
  });
});
