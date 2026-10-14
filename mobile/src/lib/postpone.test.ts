import { formatDayWithWeekday, logicalDate } from './date';
import { postponeChoices } from './postpone';

// 2026-10-12(월) ~ 2026-10-18(일)
const pick = (today: string) => postponeChoices(today).map((c) => [c.label, c.date]);

test('평일(수): 내일, 이번 주말(토), 다음 주 월요일', () => {
  expect(pick('2026-10-14')).toEqual([
    ['내일', '2026-10-15'],
    ['이번 주말', '2026-10-17'],
    ['다음 주 월요일', '2026-10-19'],
  ]);
});

test('월요일의 다음 주 월요일은 7일 뒤', () => {
  expect(pick('2026-10-12')).toEqual([
    ['내일', '2026-10-13'],
    ['이번 주말', '2026-10-17'],
    ['다음 주 월요일', '2026-10-19'],
  ]);
});

test('금요일: 내일이 토요일이라 이번 주말 대신 다음 주말', () => {
  expect(pick('2026-10-16')).toEqual([
    ['내일', '2026-10-17'],
    ['다음 주말', '2026-10-24'],
    ['다음 주 월요일', '2026-10-19'],
  ]);
});

test('토요일: 다음 주말은 다음 토요일, 다음 주 월요일은 이틀 뒤', () => {
  expect(pick('2026-10-17')).toEqual([
    ['내일', '2026-10-18'],
    ['다음 주말', '2026-10-24'],
    ['다음 주 월요일', '2026-10-19'],
  ]);
});

test('일요일: 주는 일요일에 시작하므로 다음 주 월요일은 내일이 아니라 8일 뒤', () => {
  expect(pick('2026-10-18')).toEqual([
    ['내일', '2026-10-19'],
    ['다음 주말', '2026-10-24'],
    ['다음 주 월요일', '2026-10-26'],
  ]);
});

test('달·해를 넘어가도 달력 날짜로 센다(2026-12-31은 목요일)', () => {
  expect(pick('2026-12-31')).toEqual([
    ['내일', '2027-01-01'],
    ['이번 주말', '2027-01-02'],
    ['다음 주 월요일', '2027-01-04'],
  ]);
});

test('새벽 4시 전에는 전날이 오늘이다(토요일 새벽 3시 = 금요일)', () => {
  const friday = logicalDate(new Date(2026, 9, 17, 3, 30));
  expect(friday).toBe('2026-10-16');
  expect(postponeChoices(friday).map((c) => c.date)).toEqual(['2026-10-17', '2026-10-24', '2026-10-19']);
  // 4시부터는 토요일: 내일은 일요일
  const saturday = logicalDate(new Date(2026, 9, 17, 4, 0));
  expect(postponeChoices(saturday).map((c) => c.date)).toEqual(['2026-10-18', '2026-10-24', '2026-10-19']);
});

test('날짜와 요일을 짧게', () => {
  expect(formatDayWithWeekday('2026-10-20')).toBe('10월 20일(화)');
  expect(formatDayWithWeekday('2026-10-19')).toBe('10월 19일(월)');
});
