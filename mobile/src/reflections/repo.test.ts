import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import {
  addReflection,
  deleteReflection,
  listReflections,
  MAX_ANSWER_LENGTH,
  updateReflection,
} from './repo';
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

test('회고 답변을 고치면 정리해 저장하고 동기화 대기열에 올린다', async () => {
  const saved = await addReflection(db, { templateId: 'lethargy', answers: { cause: '잠' } }, NOW);
  await db.runAsync('DELETE FROM outbox', []);
  const later = new Date(2026, 9, 6, 23, 30);
  const updated = await updateReflection(db, saved.id, { cause: ' 잠 부족 ', recovery: '산책', x: '무시' }, later);
  expect(updated).toMatchObject({ id: saved.id, answers: { cause: '잠 부족', recovery: '산책' }, updated_at: later.toISOString() });
  const [r] = await listReflections(db, '2026-10-06');
  expect(r.answers).toEqual({ cause: '잠 부족', recovery: '산책' });
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'reflections'", [])).toEqual([{ row_key: saved.id }]);
});

test('고칠 때도 빈 답변은 거부하고, 지운 회고는 고칠 수 없다', async () => {
  const saved = await addReflection(db, { templateId: 'gratitude', answers: { good: '커피' } }, NOW);
  await expect(updateReflection(db, saved.id, { good: ' ' }, NOW)).rejects.toThrow('하나 이상');
  await deleteReflection(db, saved.id, NOW);
  await expect(updateReflection(db, saved.id, { good: '차' }, NOW)).rejects.toThrow('찾을 수 없');
});

test('회고를 지우면 목록에서 빠지고 지운 표시가 동기화된다', async () => {
  const saved = await addReflection(db, { templateId: 'gratitude', answers: { good: '커피' } }, NOW);
  await db.runAsync('DELETE FROM outbox', []);
  await deleteReflection(db, saved.id, NOW);
  expect(await listReflections(db, '2026-10-06')).toEqual([]);
  const row = await db.getFirstAsync<{ deleted_at: string | null }>('SELECT deleted_at FROM reflections WHERE id = ?', [saved.id]);
  expect(row?.deleted_at).toBe(NOW.toISOString());
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'reflections'", [])).toEqual([{ row_key: saved.id }]);
  await expect(deleteReflection(db, saved.id, NOW)).rejects.toThrow('찾을 수 없');
});

test(`답변은 ${MAX_ANSWER_LENGTH}자까지만 받는다`, async () => {
  const long = '가'.repeat(MAX_ANSWER_LENGTH + 1);
  await expect(addReflection(db, { templateId: 'gratitude', answers: { good: long } }, NOW)).rejects.toThrow('자까지');
  const saved = await addReflection(db, { templateId: 'gratitude', answers: { good: '가'.repeat(MAX_ANSWER_LENGTH) } }, NOW);
  await expect(updateReflection(db, saved.id, { good: long }, NOW)).rejects.toThrow('자까지');
});

test('동기화로 깨진 행이 들어와도 화면이 멈추지 않는다', async () => {
  const ts = '2026-10-06T00:00:00.000Z';
  await db.runAsync(
    'INSERT INTO reflections (id, date, template, answers, snapshot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['bad-snap', '2026-10-06', 'gratitude', '{"good":"커피"}', '{깨짐', ts, ts],
  );
  await db.runAsync(
    'INSERT INTO reflections (id, date, template, answers, snapshot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['bad-answers', '2026-10-06', 'unknown', 'not json', '"문자열"', ts, ts],
  );
  const list = await listReflections(db, '2026-10-06');
  expect(list.find((r) => r.id === 'bad-snap')).toMatchObject({ templateName: '감사한 날', answers: { good: '커피' } });
  expect(list.find((r) => r.id === 'bad-answers')).toMatchObject({ templateName: '회고', answers: {} });
});

test('질문을 알 수 없는 회고도 답변은 보인다', async () => {
  const ts = '2026-10-06T00:00:00.000Z';
  await db.runAsync(
    'INSERT INTO reflections (id, date, template, answers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['orphan', '2026-10-06', 'gone', '{"q1":"남은 답"}', ts, ts],
  );
  const [r] = await listReflections(db, '2026-10-06');
  expect(r.questions).toEqual([{ key: 'q1', text: '' }]);
  expect(r.answers).toEqual({ q1: '남은 답' });
});
