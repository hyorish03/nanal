import { addDays, daysBetween, logicalDate, weekdayOf } from '../lib/date';

// 기기 안에서 예약하는 알림(서버 푸시 아님). 앱을 열 때·기록이 바뀔 때마다 앞으로 며칠 치를 다시 짠다.
// 예약할 때 문구가 정해지므로, 지금 아는 사실(남은 일 개수·할 일 이름)은 가장 가까운 알림에만 넣고
// 그 뒤 날짜는 개수 없는 문구를 쓴다(앱을 열지 않은 날에 틀린 숫자가 나가지 않게).
export type NotificationKind = 'morning' | 'evening' | 'night' | 'month';
export type NotificationPrefs = Record<NotificationKind, boolean>;

export const NOTIFICATION_KINDS: NotificationKind[] = ['morning', 'evening', 'night', 'month'];
export const ALL_OFF: NotificationPrefs = { morning: false, evening: false, night: false, month: false };
export const ALL_ON: NotificationPrefs = { morning: true, evening: true, night: true, month: true };

// 아침 계획·월초 정리 8시, 퇴근 18시(평일), 하루 마무리 22시. 모두 새벽 4시 경계 뒤라 달력 날짜가 곧 논리 날짜다.
export const HOURS = { morning: 8, evening: 18, night: 22 } as const;
export const HORIZON_DAYS = 7; // iOS는 예약 알림을 64개까지 둔다. 하루 3개 × 7일이면 넉넉하다
const TEXT_MAX = 16; // 잠금화면에서 한눈에 읽히게 할 일 이름은 이만큼만

export type TodayFacts = {
  today: string; // 논리 날짜
  openTaskDates: string[]; // 끝나지 않은(open·doing) 할 일의 날짜, 지운 것 빼고
  todayOpenTexts: string[]; // 오늘 장의 끝나지 않은 할 일, 적힌 순서
  todayHasTasks: boolean; // 오늘 장에 할 일이 하나라도 있다(끝낸 것 포함)
  eveningDone: boolean; // 오늘 기분이나 회고를 남겼다
};

export type PlannedNotification = { id: string; kind: NotificationKind; at: Date; body: string; screen?: 'evening' };

function at(date: string, hour: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

// 날마다 다른 문구가 나오게 날짜로 고른다(같은 날 다시 짜도 같은 문구)
function pick<T>(list: T[], date: string): T {
  const i = daysBetween('2026-01-01', date);
  return list[((i % list.length) + list.length) % list.length];
}

function shorten(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > TEXT_MAX ? `${t.slice(0, TEXT_MAX)}…` : t;
}

const EVENING_GENERIC = ['오늘 남은 일, 저녁에 하나씩 끝내 봐요', '아직 오늘이 남았어요. 하나만 더 해 봐요'];
const NIGHT = ['오늘 기분 한 줄, 한 달이면 나를 알 수 있어요', '하루 1분씩 쌓으면, 한 달 뒤엔 내 마음이 보여요'];

export function morningBody(leftovers: number | null): string {
  return leftovers ? `지난 할 일 ${leftovers}개가 기다려요. 오늘 장을 펼쳐 정리해요` : '오늘 장을 펼칠 시간이에요. 할 일 한 줄 적어 볼까요?';
}

export function monthBody(date: string, leftovers: number | null): string {
  const m = Number(date.slice(5, 7));
  return leftovers ? `${m}월이에요. 지난달 남은 일 ${leftovers}개를 모아 뒀어요` : `${m}월이에요. 지난달 남은 일을 모아 뒀어요`;
}

export function eveningBody(date: string, facts: TodayFacts | null): string {
  if (!facts) return pick(EVENING_GENERIC, date);
  const n = facts.todayOpenTexts.length;
  if (n === 0) return facts.todayHasTasks ? '오늘 할 일을 다 끝냈어요. 편하게 쉬어요' : pick(EVENING_GENERIC, date);
  const first = facts.todayOpenTexts[0];
  return pick([`퇴근했어요? 남은 ${n}개, 오늘 안에 해낼 수 있어요`, `‘${shorten(first)}’ 하나만 더 해 볼까요? 할 수 있어요`, ...EVENING_GENERIC], date);
}

export function nightBody(date: string): string {
  return pick(NIGHT, date);
}

// now부터 HORIZON_DAYS일 안의 알림. 이미 지난 시각은 뺀다.
export function planNotifications(prefs: NotificationPrefs, facts: TodayFacts, now: Date): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const start = logicalDate(now);
  let firstMorning = true; // 가장 가까운 아침 알림에만 남은 일 개수를 넣는다
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = addDays(start, i);
    const isToday = date === facts.today;
    const morningAt = at(date, HOURS.morning);
    if (morningAt > now) {
      const exact = firstMorning;
      firstMorning = false;
      const leftovers = exact ? facts.openTaskDates.filter((d) => d < date).length : null;
      // 매달 1일에는 아침 계획 대신 월초 정리를 알린다. 정리할 일이 없다고 확실하면 평소 아침 알림으로.
      if (prefs.month && date.endsWith('-01') && leftovers !== 0) {
        out.push({ id: `month-${date}`, kind: 'month', at: morningAt, body: monthBody(date, leftovers) });
      } else if (prefs.morning) {
        out.push({ id: `morning-${date}`, kind: 'morning', at: morningAt, body: morningBody(leftovers) });
      }
    }
    const weekday = weekdayOf(date);
    const eveningAt = at(date, HOURS.evening);
    if (prefs.evening && weekday !== 0 && weekday !== 6 && eveningAt > now) {
      out.push({ id: `evening-${date}`, kind: 'evening', at: eveningAt, body: eveningBody(date, isToday ? facts : null) });
    }
    const nightAt = at(date, HOURS.night);
    if (prefs.night && nightAt > now && !(isToday && facts.eveningDone)) {
      out.push({ id: `night-${date}`, kind: 'night', at: nightAt, body: nightBody(date), screen: 'evening' });
    }
  }
  return out;
}
