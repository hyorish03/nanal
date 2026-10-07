import { normalizeTimestamp, sortableTimestamp } from './timestamp';

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

describe('sortableTimestamp', () => {
  it('UTC 마이크로초 6자리 형식으로 맞춘다', () => {
    expect(sortableTimestamp('2026-10-06T00:00:00Z')).toBe('2026-10-06T00:00:00.000000Z');
  });

  it('오프셋을 반영한다', () => {
    expect(sortableTimestamp('2026-10-06T09:30:00+09:00')).toBe('2026-10-06T00:30:00.000000Z');
    expect(sortableTimestamp('2026-10-06T00:00:00-05:30')).toBe('2026-10-06T05:30:00.000000Z');
    expect(sortableTimestamp('2026-10-06T05:00:00+09')).toBe('2026-10-05T20:00:00.000000Z');
  });

  it('마이크로초를 보존한다', () => {
    expect(sortableTimestamp('2026-10-06T00:00:00.123456+00:00')).toBe('2026-10-06T00:00:00.123456Z');
  });

  it('짧은 소수부는 0으로 채우고 긴 소수부는 자른다', () => {
    expect(sortableTimestamp('2026-10-06T00:00:00.5Z')).toBe('2026-10-06T00:00:00.500000Z');
    expect(sortableTimestamp('2026-10-06T00:00:00.12+00:00')).toBe('2026-10-06T00:00:00.120000Z');
    expect(sortableTimestamp('2026-10-06T00:00:00.1234567Z')).toBe('2026-10-06T00:00:00.123456Z');
  });

  it('오프셋이 있어도 문자열 정렬이 시간 순서와 같다', () => {
    const values = [
      '2026-10-06T09:00:00.000001+09:00',
      '2026-10-06T00:00:00.5Z',
      '2026-10-06T00:00:00.12+00:00',
      '2026-10-05T23:59:59.999999Z',
      '2026-10-06T00:00:00Z',
    ];
    const sorted = values.map(sortableTimestamp).sort();
    expect(sorted).toEqual([
      '2026-10-05T23:59:59.999999Z',
      '2026-10-06T00:00:00.000000Z',
      '2026-10-06T00:00:00.000001Z',
      '2026-10-06T00:00:00.120000Z',
      '2026-10-06T00:00:00.500000Z',
    ]);
  });

  it('알 수 없는 형식은 에러를 던진다', () => {
    expect(() => sortableTimestamp('nope')).toThrow('알 수 없는 시각 형식: nope');
  });
});
