import { openTestDb } from '../../test/sqlite';
import { setMood } from '../days/repo';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addReflection, listReflectionHistory, listReflections } from './repo';
import { createTemplate, deleteTemplate } from './templateRepo';

const NOW = new Date(2026, 9, 6, 23, 0);
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

test('기본 템플릿 답변을 정리해 저장하고 이름·질문과 함께 읽는다', async () => {
  const saved = await addReflection(db, { templateId: 'lethargy', answers: { cause: ' 잠 부족 ', recovery: '', x: '무시' } }, NOW);
  expect(saved).toMatchObject({ date: '2026-10-06', template: 'lethargy', answers: { cause: '잠 부족' } });
  const [r] = await listReflections(db, '2026-10-06');
  expect(r).toMatchObject({ templateName: '무기력했던 날', answers: { cause: '잠 부족' } });
  expect(r.questions.map((q) => q.key)).toEqual(['cause', 'recovery']);
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'reflections'", [])).toEqual([{ row_key: saved.id }]);
});

test('사용자 템플릿을 지워도 지난 회고는 스냅샷으로 읽힌다', async () => {
  const t = await createTemplate(db, { name: '운동한 날', questions: ['무슨 운동?'] }, NOW);
  await addReflection(db, { templateId: t.id, answers: { q1: '달리기' } }, NOW);
  await deleteTemplate(db, t.id, NOW);
  const [r] = await listReflections(db, '2026-10-06');
  expect(r).toMatchObject({ templateName: '운동한 날', questions: [{ key: 'q1', text: '무슨 운동?' }], answers: { q1: '달리기' } });
  await expect(addReflection(db, { templateId: t.id, answers: { q1: 'x' } }, NOW)).rejects.toThrow('템플릿을 찾을 수 없');
});

test('스냅샷 없는 예전 회고(완벽주의)도 이름과 질문을 복원한다', async () => {
  await db.runAsync(
    'INSERT INTO reflections (id, date, template, answers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['old', '2026-10-06', 'perfectionism', '{"want":"다 잘하고 싶었다"}', '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z'],
  );
  const [r] = await listReflections(db, '2026-10-06');
  expect(r).toMatchObject({ templateName: '완벽주의가 올라온 날', answers: { want: '다 잘하고 싶었다' } });
});

test('모든 답변이 비어 있으면 거부한다', async () => {
  await expect(addReflection(db, { templateId: 'gratitude', answers: { good: '  ' } }, NOW)).rejects.toThrow('하나 이상');
});

test('모든 회고를 최신순으로 그날 기분과 함께 돌려준다', async () => {
  await addReflection(db, { templateId: 'gratitude', answers: { good: '커피' } }, new Date(2026, 9, 2, 22, 0));
  await addReflection(db, { templateId: 'lethargy', answers: { cause: '잠' } }, new Date(2026, 9, 5, 22, 0));
  await setMood(db, '2026-10-05', 1, new Date(2026, 9, 5, 22, 0));

  const all = await listReflectionHistory(db);
  expect(all.map((r) => [r.date, r.templateName, r.mood])).toEqual([
    ['2026-10-05', '무기력했던 날', 1],
    ['2026-10-02', '감사한 날', null],
  ]);
});
