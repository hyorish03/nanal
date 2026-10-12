import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { createTemplate, deleteTemplate, findTemplate, listTemplates, updateTemplate } from './templateRepo';

const NOW = new Date(2026, 9, 7, 21, 0);
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

test('기본 템플릿 3개가 먼저, 사용자 템플릿은 그 뒤에', async () => {
  await createTemplate(db, { name: ' 운동한 날 ', questions: ['무슨 운동?', '', '몸은?'] }, NOW);
  const list = await listTemplates(db);
  expect(list.map((t) => t.name)).toEqual(['무기력했던 날', '감사한 날', '자유 일지', '운동한 날']);
  expect(list[3]).toMatchObject({ builtin: false, questions: [{ key: 'q1', text: '무슨 운동?' }, { key: 'q2', text: '몸은?' }] });
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'templates'", [])).toHaveLength(1);
});

test('이름이나 질문이 비면 거부, 질문은 3개까지', async () => {
  await expect(createTemplate(db, { name: ' ', questions: ['a'] }, NOW)).rejects.toThrow('이름');
  await expect(createTemplate(db, { name: 'x', questions: [' '] }, NOW)).rejects.toThrow('질문');
  await expect(createTemplate(db, { name: 'x', questions: ['a', 'b', 'c', 'd'] }, NOW)).rejects.toThrow('3개');
});

test('수정과 삭제는 사용자 템플릿만', async () => {
  const t = await createTemplate(db, { name: '운동한 날', questions: ['무슨 운동?'] }, NOW);
  await updateTemplate(db, t.id, { name: '걷기', questions: ['얼마나 걸었나요?'] }, NOW);
  expect(await findTemplate(db, t.id)).toMatchObject({ name: '걷기', questions: [{ key: 'q1', text: '얼마나 걸었나요?' }] });
  await deleteTemplate(db, t.id, NOW);
  expect(await findTemplate(db, t.id)).toBeNull();
  expect((await listTemplates(db)).map((x) => x.name)).not.toContain('걷기');
  await expect(updateTemplate(db, 'gratitude', { name: 'x', questions: ['y'] }, NOW)).rejects.toThrow('기본 템플릿');
  await expect(deleteTemplate(db, 'gratitude', NOW)).rejects.toThrow('기본 템플릿');
});
