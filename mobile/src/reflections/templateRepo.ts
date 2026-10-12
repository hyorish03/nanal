import type { Db } from '../db/types';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';
import { BUILTIN_TEMPLATES, MAX_TEMPLATE_QUESTIONS, type TemplateDef, type TemplateQuestion } from './templates';

type TemplateRow = { id: string; name: string; questions: string; created_at: string };
export type TemplateInput = { name: string; questions: string[] };

// 글자 수 한도(이모지·한글 모두 한 글자로 센다). 입력 칸의 maxLength도 이 값을 쓴다.
export const MAX_TEMPLATE_NAME = 24;
export const MAX_TEMPLATE_QUESTION = 80;
const length = (s: string) => [...s].length;

function normalize(input: TemplateInput): { name: string; questions: TemplateQuestion[] } {
  const name = input.name.trim();
  if (!name) throw new Error('템플릿 이름을 적어 주세요');
  if (length(name) > MAX_TEMPLATE_NAME) throw new Error(`템플릿 이름은 ${MAX_TEMPLATE_NAME}자까지예요`);
  const texts = input.questions.map((q) => q.trim()).filter(Boolean);
  if (texts.length === 0) throw new Error('질문을 하나 이상 적어 주세요');
  if (texts.length > MAX_TEMPLATE_QUESTIONS) throw new Error('질문은 3개까지예요');
  if (texts.some((t) => length(t) > MAX_TEMPLATE_QUESTION)) throw new Error(`질문은 ${MAX_TEMPLATE_QUESTION}자까지예요`);
  return { name, questions: texts.map((text, i) => ({ key: `q${i + 1}`, text })) };
}

// 동기화로 깨진 값이 들어와도 화면이 멈추지 않게, 읽을 수 없는 질문 목록은 자유 질문 하나로 대신한다.
const FALLBACK_QUESTIONS: TemplateQuestion[] = [{ key: 'q1', text: '자유롭게 쓰기' }];

function parseQuestions(raw: string): TemplateQuestion[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const questions = parsed.filter(
        (q): q is TemplateQuestion => typeof q === 'object' && q !== null && typeof q.key === 'string' && typeof q.text === 'string',
      );
      if (questions.length > 0) return questions;
    }
  } catch {
    // 아래 대체 질문으로
  }
  return FALLBACK_QUESTIONS;
}

const toDef = (row: TemplateRow): TemplateDef => ({
  id: row.id, name: row.name, builtin: false, questions: parseQuestions(row.questions),
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
