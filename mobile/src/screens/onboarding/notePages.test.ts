import { leaveDelay, noteDateText, noteLabel, writeDelay } from './notePages';

describe('노트 글씨 박자', () => {
  it('써지는 차례마다 230ms씩 늦게, 첫 줄은 160ms 뒤에', () => {
    expect(writeDelay(0)).toBe(160);
    expect(writeDelay(3)).toBe(850);
  });
  it('사라질 때는 25ms씩 짧게 엇갈린다', () => {
    expect(leaveDelay(0)).toBe(0);
    expect(leaveDelay(10)).toBe(250);
  });
});

describe('노트 날짜와 읽는 문구', () => {
  it('날짜는 월. 일. 요일', () => {
    expect(noteDateText('2026-10-14')).toBe('10. 14. 수');
    expect(noteDateText('2026-03-01')).toBe('3. 1. 일');
  });
  it('첫 장은 날짜부터 읽는다', () => {
    expect(noteLabel(0, '2026-10-14')).toMatch(/^10월 14일 수요일 나날 쓰는 법/);
  });
  it('기호는 말로 풀어 읽고 예시 글을 함께 읽는다', () => {
    const label = noteLabel(1, '2026-10-14');
    expect(label).not.toMatch(/[•›–]/);
    expect(label).toContain('창가 자리 최고');
    expect(label).toMatch(/하루 3개까지\. 줄을 오른쪽으로 밀면 형광펜, 왼쪽으로 밀면 미루기와 지우기\.$/);
  });
  it('네 장 모두 문구가 있다', () => {
    for (const step of [0, 1, 2, 3] as const) expect(noteLabel(step, '2026-10-14').length).toBeGreaterThan(20);
  });
});
