import { addDays, weekdayOf } from './date';

// 미루기 시트의 빠른 선택지. today는 논리 날짜(새벽 4시 전은 전날)라 화면이 넘긴 값을 그대로 쓴다.
export type PostponeChoice = { key: 'tomorrow' | 'weekend' | 'nextWeekend' | 'nextMonday'; label: string; date: string };

const SAT = 6;
const SUN = 0;

// 내일 / 이번 주말(다가오는 토요일) / 다음 주 월요일.
// 이번 주말이 곧 내일(금요일)이거나 오늘이 이미 주말(토·일)이면 '이번 주말' 대신 '다음 주말'을 보인다.
// 주는 달력처럼 일요일에 시작한다: 일요일의 '다음 주 월요일'은 내일이 아니라 8일 뒤다.
export function postponeChoices(today: string): PostponeChoice[] {
  const w = weekdayOf(today);
  const tomorrow = addDays(today, 1);
  const choices: PostponeChoice[] = [{ key: 'tomorrow', label: '내일', date: tomorrow }];

  const comingSat = addDays(today, w === SAT ? 7 : SAT - w); // 오늘 뒤 첫 토요일
  if (w === SAT || w === SUN) {
    // 토요일이면 다음 토요일, 일요일이면 6일 뒤 토요일
    choices.push({ key: 'nextWeekend', label: '다음 주말', date: comingSat });
  } else if (comingSat === tomorrow) {
    choices.push({ key: 'nextWeekend', label: '다음 주말', date: addDays(comingSat, 7) });
  } else {
    choices.push({ key: 'weekend', label: '이번 주말', date: comingSat });
  }

  choices.push({ key: 'nextMonday', label: '다음 주 월요일', date: addDays(today, 8 - w) });
  return choices;
}
