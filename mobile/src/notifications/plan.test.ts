import { ALL_OFF, ALL_ON, eveningBody, HORIZON_DAYS, planNotifications, type TodayFacts } from './plan';

const facts = (over: Partial<TodayFacts> = {}): TodayFacts => ({
  today: '2026-10-21',
  openTaskDates: [],
  todayOpenTexts: [],
  todayHasTasks: false,
  eveningDone: false,
  ...over,
});

// 2026-10-21은 수요일
const wedMorning = new Date(2026, 9, 21, 7, 0);

describe('planNotifications', () => {
  test('끈 알림은 짜지 않는다', () => {
    expect(planNotifications(ALL_OFF, facts(), wedMorning)).toEqual([]);
  });

  test('이미 지난 시각은 빼고, 7일 치만 짠다', () => {
    const late = new Date(2026, 9, 21, 19, 0);
    const list = planNotifications(ALL_ON, facts(), late);
    expect(list[0].id).toBe('night-2026-10-21');
    expect(list.every((n) => n.at > late)).toBe(true);
    const last = new Date(late);
    last.setDate(last.getDate() + HORIZON_DAYS);
    expect(list.every((n) => n.at < last)).toBe(true);
  });

  test('퇴근 알림은 평일에만', () => {
    const ids = planNotifications({ ...ALL_OFF, evening: true }, facts(), wedMorning).map((n) => n.id);
    expect(ids).toEqual(['evening-2026-10-21', 'evening-2026-10-22', 'evening-2026-10-23', 'evening-2026-10-26', 'evening-2026-10-27']);
  });

  test('가장 가까운 아침 알림에만 지난 할 일 개수를 넣는다', () => {
    const list = planNotifications({ ...ALL_OFF, morning: true }, facts({ openTaskDates: ['2026-10-19', '2026-10-20', '2026-10-21'] }), wedMorning);
    expect(list[0].body).toBe('지난 할 일 2개가 기다려요. 오늘 장을 펼쳐 정리해요');
    expect(list[1].body).toBe('오늘 장을 펼칠 시간이에요. 할 일 한 줄 적어 볼까요?');
  });

  test('오늘 마무리를 했으면 오늘 밤 알림은 건너뛰고 다음 날부터', () => {
    const list = planNotifications({ ...ALL_OFF, night: true }, facts({ eveningDone: true }), wedMorning);
    expect(list[0].id).toBe('night-2026-10-22');
    expect(list[0].screen).toBe('evening');
  });

  test('매달 1일에는 아침 계획 대신 월초 정리', () => {
    const now = new Date(2026, 9, 31, 12, 0);
    const list = planNotifications(ALL_ON, facts({ today: '2026-10-31', openTaskDates: ['2026-10-10', '2026-10-31'] }), now);
    const first = list.find((n) => n.at.getDate() === 1)!;
    expect(first).toMatchObject({ id: 'month-2026-11-01', body: '11월이에요. 지난달 남은 일 2개를 모아 뒀어요' });
    expect(list.some((n) => n.id === 'morning-2026-11-01')).toBe(false);
  });

  test('월초인데 정리할 일이 없다고 확실하면 평소 아침 알림', () => {
    const now = new Date(2026, 9, 31, 12, 0);
    const list = planNotifications(ALL_ON, facts({ today: '2026-10-31' }), now);
    expect(list.some((n) => n.id === 'morning-2026-11-01')).toBe(true);
    expect(list.some((n) => n.kind === 'month')).toBe(false);
  });

  test('먼 1일은 개수 없이 월초 정리', () => {
    const now = new Date(2026, 9, 27, 12, 0);
    const list = planNotifications({ ...ALL_OFF, month: true }, facts({ today: '2026-10-27' }), now);
    expect(list).toEqual([expect.objectContaining({ id: 'month-2026-11-01', body: '11월이에요. 지난달 남은 일을 모아 뒀어요' })]);
  });

  test('월초 정리를 끄면 1일에도 아침 계획', () => {
    const now = new Date(2026, 9, 31, 12, 0);
    const list = planNotifications({ ...ALL_OFF, morning: true }, facts({ today: '2026-10-31', openTaskDates: ['2026-10-10'] }), now);
    expect(list[0]).toMatchObject({ id: 'morning-2026-11-01', body: '지난 할 일 1개가 기다려요. 오늘 장을 펼쳐 정리해요' });
  });

  test('새벽 4시 전에는 아직 어제다', () => {
    const now = new Date(2026, 9, 22, 1, 0);
    const list = planNotifications({ ...ALL_OFF, morning: true }, facts(), now);
    expect(list[0].id).toBe('morning-2026-10-22');
  });
});

describe('eveningBody', () => {
  test('다 끝낸 날', () => {
    expect(eveningBody('2026-10-21', facts({ todayHasTasks: true }))).toBe('오늘 할 일을 다 끝냈어요. 편하게 쉬어요');
  });

  test('날마다 돌아가며, 남은 개수·할 일 이름·일반 문구', () => {
    const f = facts({ todayHasTasks: true, todayOpenTexts: ['보고서 초안 보내기 그리고 아주 긴 제목', '장보기'] });
    const bodies = new Set(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'].map((d) => eveningBody(d, f)));
    expect(bodies).toEqual(
      new Set([
        '퇴근했어요? 남은 2개, 오늘 안에 해낼 수 있어요',
        '‘보고서 초안 보내기 그리고 아…’ 하나만 더 해 볼까요? 할 수 있어요',
        '오늘 남은 일, 저녁에 하나씩 끝내 봐요',
        '아직 오늘이 남았어요. 하나만 더 해 봐요',
      ]),
    );
  });

  test('오늘이 아닌 날은 일반 문구만', () => {
    expect(['오늘 남은 일, 저녁에 하나씩 끝내 봐요', '아직 오늘이 남았어요. 하나만 더 해 봐요']).toContain(eveningBody('2026-10-22', null));
  });
});
