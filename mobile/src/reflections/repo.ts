import type { Db, Tx } from '../db/types';
import { logicalDate } from '../lib/date';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';
import { findTemplate } from './templateRepo';
import { BUILTIN_TEMPLATES, LEGACY_TEMPLATES, type TemplateQuestion } from './templates';

type Snapshot = { name: string; questions: TemplateQuestion[] };

export type Reflection = {
  id: string;
  date: string;
  template: string;
  templateName: string;
  questions: TemplateQuestion[];
  answers: Record<string, string>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ReflectionRow = {
  id: string; date: string; template: string; answers: string; snapshot: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
};

export const MAX_ANSWER_LENGTH = 2000;

const COLUMNS = 'id, date, template, answers, snapshot, created_at, updated_at, deleted_at';

// 동기화로 깨진 행이 하나 들어와도 화면 전체가 멈추지 않게, 못 읽으면 null.
function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isQuestion(q: unknown): q is TemplateQuestion {
  return typeof q === 'object' && q !== null && typeof (q as TemplateQuestion).key === 'string'
    && typeof (q as TemplateQuestion).text === 'string';
}

function parseSnapshot(text: string | null): Snapshot | null {
  const v = parseJson(text) as Partial<Snapshot> | null;
  if (!v || typeof v !== 'object' || typeof v.name !== 'string' || !Array.isArray(v.questions)) return null;
  return { name: v.name, questions: v.questions.filter(isQuestion) };
}

function parseAnswers(text: string): Record<string, string> {
  const v = parseJson(text);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const answers: Record<string, string> = {};
  for (const [k, a] of Object.entries(v)) if (typeof a === 'string') answers[k] = a;
  return answers;
}

// 스냅샷이 있으면 그것을, 없으면(예전 회고) 알려진 템플릿에서 이름과 질문을 복원한다
function resolveSnapshot(row: ReflectionRow): Snapshot {
  const snap = parseSnapshot(row.snapshot);
  if (snap) return snap;
  const known = [...BUILTIN_TEMPLATES, ...LEGACY_TEMPLATES].find((t) => t.id === row.template);
  return known ? { name: known.name, questions: known.questions } : { name: '회고', questions: [] };
}

function toReflection(r: ReflectionRow): Reflection {
  const snap = resolveSnapshot(r);
  const answers = parseAnswers(r.answers);
  // 질문을 알 수 없으면 답변 키로 빈 질문을 세워 답이라도 보이게 한다
  const questions = snap.questions.length ? snap.questions : Object.keys(answers).map((key) => ({ key, text: '' }));
  return {
    id: r.id, date: r.date, template: r.template, templateName: snap.name, questions, answers,
    created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
  };
}

// 질문에 있는 답만 다듬어 남긴다. 하나도 없거나 너무 길면 거부한다.
function cleanAnswers(questions: TemplateQuestion[], input: Record<string, string>): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const value = (input[q.key] ?? '').trim();
    if (value.length > MAX_ANSWER_LENGTH) throw new Error(`답변은 ${MAX_ANSWER_LENGTH}자까지 쓸 수 있어요`);
    if (value) answers[q.key] = value;
  }
  if (Object.keys(answers).length === 0) throw new Error('답변을 하나 이상 입력하세요');
  return answers;
}

async function requireReflection(tx: Tx, id: string): Promise<Reflection> {
  const row = await tx.getFirstAsync<ReflectionRow>(
    `SELECT ${COLUMNS} FROM reflections WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  if (!row) throw new Error(`회고를 찾을 수 없습니다: ${id}`);
  return toReflection(row);
}

export async function addReflection(
  db: Db,
  input: { templateId: string; answers: Record<string, string> },
  now = new Date(),
): Promise<Reflection> {
  const def = await findTemplate(db, input.templateId);
  if (!def) throw new Error('템플릿을 찾을 수 없습니다');
  const answers = cleanAnswers(def.questions, input.answers);

  const ts = now.toISOString();
  const snapshot: Snapshot = { name: def.name, questions: def.questions };
  const reflection: Reflection = {
    id: newId(), date: logicalDate(now), template: def.id, templateName: def.name, questions: def.questions,
    answers, created_at: ts, updated_at: ts, deleted_at: null,
  };
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO reflections (id, date, template, answers, snapshot, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      [reflection.id, reflection.date, reflection.template, JSON.stringify(answers), JSON.stringify(snapshot), ts, ts],
    );
    await markDirty(tx, 'reflections', reflection.id);
  });
  return reflection;
}

// 답만 고친다. 질문은 남길 때의 스냅샷을 따른다.
export async function updateReflection(
  db: Db,
  id: string,
  input: Record<string, string>,
  now = new Date(),
): Promise<Reflection> {
  const ts = now.toISOString();
  return db.transaction(async (tx) => {
    const current = await requireReflection(tx, id);
    const answers = cleanAnswers(current.questions, input);
    await tx.runAsync('UPDATE reflections SET answers = ?, updated_at = ? WHERE id = ?', [JSON.stringify(answers), ts, id]);
    await markDirty(tx, 'reflections', id);
    return { ...current, answers, updated_at: ts };
  });
}

export async function deleteReflection(db: Db, id: string, now = new Date()): Promise<void> {
  const ts = now.toISOString();
  await db.transaction(async (tx) => {
    await requireReflection(tx, id);
    await tx.runAsync('UPDATE reflections SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
    await markDirty(tx, 'reflections', id);
  });
}

export async function listReflections(db: Db, date: string): Promise<Reflection[]> {
  const rows = await db.getAllAsync<ReflectionRow>(
    `SELECT ${COLUMNS} FROM reflections WHERE date = ? AND deleted_at IS NULL ORDER BY created_at`,
    [date],
  );
  return rows.map(toReflection);
}
