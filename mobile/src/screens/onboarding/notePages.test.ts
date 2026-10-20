import { NOTE_STEPS } from './notebook';
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
    expect(noteLabel(0, '2026-10-14')).toMatch(/^10월 14일 수요일 나날 쓰는 법\. 하루를 한 줄씩, 기호 하나로 적는 불렛 노트예요\./);
  });
  it('첫 장의 기호는 말로 풀어 읽고 예시 글을 함께 읽는다', () => {
    const label = noteLabel(0, '2026-10-14');
    expect(label).not.toMatch(/[•◐●✓›–←]/);
    expect(label).toContain('점은 할 일. 보고서 초안.');
    expect(label).toContain('창가 자리 최고');
    expect(label).toMatch(/꺾쇠는 내일로 옮김\. 은행 들르기\. 기호를 톡 누르면 상태가 바뀌어요\.$/);
  });
  it('밀기·형광펜 설명은 온보딩에서 뺐다(오늘 화면 안내가 맡는다)', () => {
    for (const step of [0, 1, 2] as const) expect(noteLabel(step, '2026-10-14')).not.toMatch(/형광펜|밀면/);
  });
  it('마지막 장은 첫 줄 쓰기로 끝난다', () => {
    const label = noteLabel(2, '2026-10-14');
    expect(label).toMatch(/^마지막으로\./);
    expect(label).toContain('며칠 쉬어도 괜찮아요. 쌓인 날은 줄어들지 않아요.');
    expect(label).toMatch(/이제 오늘의 첫 줄을 써 볼까요\.$/);
  });
  it('세 장 모두 문구가 있다', () => {
    expect(NOTE_STEPS).toBe(3);
    for (const step of [0, 1, 2] as const) expect(noteLabel(step, '2026-10-14').length).toBeGreaterThan(20);
  });
});
