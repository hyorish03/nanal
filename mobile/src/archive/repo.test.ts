import { openTestDb } from '../../test/sqlite';
import { setMood } from '../days/repo';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, advanceStatus, deleteItem, migrateToToday } from '../items/repo';
import { addReflection } from '../reflections/repo';
import { listMonthSummary, listReflectionFilters, listReflectionPage } from './repo';

let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

const at = (d: number, h = 12) => new Date(2026, 9, d, h, 0);

test('기록이 있는 날만 기분, 회고 여부, 할 일 수와 함께 돌려준다', async () => {
  const a = await addItem(db, { kind: 'task', text: '보고서' }, at(5));
  await addItem(db, { kind: 'task', text: '장보기' }, at(5));
  await addItem(db, { kind: 'note', text: '비' }, at(5));
  await advanceStatus(db, a.id, at(5));
  await advanceStatus(db, a.id, at(5)); // done
  await setMood(db, '2026-10-06', 2, at(6));
  await addReflection(db, { templateId: 'free', answers: { body: '조용한 날' } }, at(6));
  await setMood(db, '2026-09-30', 4, at(30)); // 다른 달

  expect(await listMonthSummary(db, '2026-10')).toEqual([
    { date: '2026-10-05', mood: null, hasReflection: false, tasksDone: 1, tasksTotal: 2, tasksMigrated: 0 },
    { date: '2026-10-06', mood: 2, hasReflection: true, tasksDone: 0, tasksTotal: 0, tasksMigrated: 0 },
  ]);
});

test('지운 항목은 세지 않고, 다른 날로 옮긴 원래 항목은 따로 센다', async () => {
  const a = await addItem(db, { kind: 'task', text: '장보기' }, at(5));
  const b = await addItem(db, { kind: 'task', text: '책 반납' }, at(5));
  await deleteItem(db, b.id, at(5));
  await migrateToToday(db, a.id, at(7));

  expect(await listMonthSummary(db, '2026-10')).toEqual([
    { date: '2026-10-05', mood: null, hasReflection: false, tasksDone: 0, tasksTotal: 0, tasksMigrated: 1 },
    { date: '2026-10-07', mood: null, hasReflection: false, tasksDone: 0, tasksTotal: 1, tasksMigrated: 0 },
  ]);
});

test('기분이 비어 있는 날은 할 일이 없으면 빠지고, 회고가 여러 개여도 하루로 센다', async () => {
  await setMood(db, '2026-10-05', 3, at(5));
  await setMood(db, '2026-10-05', null, at(5));
  await addReflection(db, { templateId: 'free', answers: { body: '하나' } }, at(8));
  await addReflection(db, { templateId: 'free', answers: { body: '둘' } }, at(8));

  expect(await listMonthSummary(db, '2026-10')).toEqual([
    { date: '2026-10-08', mood: null, hasReflection: true, tasksDone: 0, tasksTotal: 0, tasksMigrated: 0 },
  ]);
});

describe('회고 모아보기', () => {
  test('최신순으로 한 쪽씩 나눠 읽고, 질문마다 답을 붙인다', async () => {
    await setMood(db, '2026-10-05', 3, at(5));
    await addReflection(db, { templateId: 'lethargy', answers: { cause: '잠 부족', recovery: '' } }, at(5));
    await addReflection(db, { templateId: 'free', answers: { body: '첫째' } }, at(6, 9));
    await addReflection(db, { templateId: 'free', answers: { body: '둘째' } }, at(6, 20));

    const first = await listReflectionPage(db, { limit: 2 });
    expect(first.map((e) => e.answers[0].answer)).toEqual(['둘째', '첫째']);
    expect(first[0]).toMatchObject({ date: '2026-10-06', template: 'free', templateName: '자유 일지', mood: null });

    expect(await listReflectionPage(db, { limit: 2, offset: 2 })).toEqual([
      {
        id: expect.any(String),
        date: '2026-10-05',
        template: 'lethargy',
        templateName: '무기력했던 날',
        mood: 3,
        answers: [{ question: '무기력의 원인으로 짐작되는 것은?', answer: '잠 부족' }],
      },
    ]);
    expect(await listReflectionPage(db, { limit: 2, offset: 4 })).toEqual([]);
  });

  test('템플릿으로 거르면 그 템플릿 회고만 나눠 읽는다', async () => {
    await addReflection(db, { templateId: 'gratitude', answers: { good: '햇빛' } }, at(5));
    await addReflection(db, { templateId: 'free', answers: { body: '메모' } }, at(6));
    const page = await listReflectionPage(db, { limit: 10, template: 'gratitude' });
    expect(page.map((e) => e.template)).toEqual(['gratitude']);
  });

  test('저장된 JSON이 깨져 있어도 목록은 열리고, 알려진 템플릿에서 이름을 되살린다', async () => {
    const ts = at(4).toISOString();
    await db.runAsync(
      `INSERT INTO reflections (id, date, template, answers, snapshot, created_at, updated_at, deleted_at)
       VALUES ('broken', '2026-10-04', 'free', '{oops', '{nope', ?, ?, NULL)`,
      [ts, ts],
    );
    expect(await listReflectionPage(db, { limit: 10 })).toEqual([
      { id: 'broken', date: '2026-10-04', template: 'free', templateName: '자유 일지', mood: null, answers: [] },
    ]);
  });

  test('필터는 쓰인 템플릿을 최근에 쓴 순서로, 개수와 함께 모은다', async () => {
    await addReflection(db, { templateId: 'gratitude', answers: { good: '햇빛' } }, at(5));
    await addReflection(db, { templateId: 'lethargy', answers: { cause: '비' } }, at(6));
    await addReflection(db, { templateId: 'gratitude', answers: { good: '친구' } }, at(7));
    expect(await listReflectionFilters(db)).toEqual([
      { id: 'gratitude', name: '감사한 날', count: 2 },
      { id: 'lethargy', name: '무기력했던 날', count: 1 },
    ]);
  });
});
