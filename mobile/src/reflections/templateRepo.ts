import type { Db } from '../db/types';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';
import { BUILTIN_TEMPLATES, MAX_TEMPLATE_QUESTIONS, type TemplateDef, type TemplateQuestion } from './templates';

type TemplateRow = { id: string; name: string; questions: string; created_at: string };
export type TemplateInput = { name: string; questions: string[] };

function normalize(input: TemplateInput): { name: string; questions: TemplateQuestion[] } {
  const name = input.name.trim();
  if (!name) throw new Error('템플릿 이름을 적어 주세요');
  const texts = input.questions.map((q) => q.trim()).filter(Boolean);
  if (texts.length === 0) throw new Error('질문을 하나 이상 적어 주세요');
  if (texts.length > MAX_TEMPLATE_QUESTIONS) throw new Error('질문은 3개까지예요');
  return { name, questions: texts.map((text, i) => ({ key: `q${i + 1}`, text })) };
}

const toDef = (row: TemplateRow): TemplateDef => ({
  id: row.id, name: row.name, builtin: false, questions: JSON.parse(row.questions) as TemplateQuestion[],
});

function assertCustom(id: string) {
  if (BUILTIN_TEMPLATES.some((t) => t.id === id)) throw new Error('기본 템플릿은 바꿀 수 없어요');
}

export async function createTemplate(db: Db, input: TemplateInput, now = new Date()): Promise<TemplateDef> {
  const { name, questions } = normalize(input);
  const ts = now.toISOString();
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.runAsync(
      'INSERT INTO templates (id, name, questions, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)',
      [id, name, JSON.stringify(questions), ts, ts],
    );
    await markDirty(tx, 'templates', id);
  });
  return { id, name, builtin: false, questions };
}

export async function updateTemplate(db: Db, id: string, input: TemplateInput, now = new Date()): Promise<void> {
  assertCustom(id);
  const { name, questions } = normalize(input);
  await db.transaction(async (tx) => {
    const r = await tx.runAsync(
      'UPDATE templates SET name = ?, questions = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      [name, JSON.stringify(questions), now.toISOString(), id],
    );
    if (r.changes === 0) throw new Error('템플릿을 찾을 수 없습니다');
    await markDirty(tx, 'templates', id);
  });
}

export async function deleteTemplate(db: Db, id: string, now = new Date()): Promise<void> {
  assertCustom(id);
  const ts = now.toISOString();
  await db.transaction(async (tx) => {
    const r = await tx.runAsync('UPDATE templates SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [ts, ts, id]);
    if (r.changes === 0) throw new Error('템플릿을 찾을 수 없습니다');
    await markDirty(tx, 'templates', id);
  });
}

export async function listTemplates(db: Db): Promise<TemplateDef[]> {
  const rows = await db.getAllAsync<TemplateRow>(
    'SELECT id, name, questions, created_at FROM templates WHERE deleted_at IS NULL ORDER BY created_at',
    [],
  );
  return [...BUILTIN_TEMPLATES, ...rows.map(toDef)];
}

export async function findTemplate(db: Db, id: string): Promise<TemplateDef | null> {
  const builtin = BUILTIN_TEMPLATES.find((t) => t.id === id);
  if (builtin) return builtin;
  const row = await db.getFirstAsync<TemplateRow>(
    'SELECT id, name, questions, created_at FROM templates WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  return row ? toDef(row) : null;
}
