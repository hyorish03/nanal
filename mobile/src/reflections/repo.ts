import type { Db } from '../db/types';
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

// 스냅샷이 있으면 그것을, 없으면(예전 회고) 알려진 템플릿에서 이름과 질문을 복원한다
function resolveSnapshot(row: ReflectionRow): Snapshot {
  if (row.snapshot) return JSON.parse(row.snapshot) as Snapshot;
  const known = [...BUILTIN_TEMPLATES, ...LEGACY_TEMPLATES].find((t) => t.id === row.template);
  return known ? { name: known.name, questions: known.questions } : { name: '회고', questions: [] };
}

function toReflection(r: ReflectionRow): Reflection {
  const snap = resolveSnapshot(r);
  return {
    id: r.id, date: r.date, template: r.template, templateName: snap.name, questions: snap.questions,
    answers: JSON.parse(r.answers) as Record<string, string>,
    created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
  };
}

export async function addReflection(
  db: Db,
  input: { templateId: string; answers: Record<string, string> },
  now = new Date(),
): Promise<Reflection> {
  const def = await findTemplate(db, input.templateId);
  if (!def) throw new Error('템플릿을 찾을 수 없습니다');
  const answers: Record<string, string> = {};
  for (const q of def.questions) {
    const value = (input.answers[q.key] ?? '').trim();
    if (value) answers[q.key] = value;
  }
  if (Object.keys(answers).length === 0) throw new Error('답변을 하나 이상 입력하세요');

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

export async function listReflections(db: Db, date: string): Promise<Reflection[]> {
  const rows = await db.getAllAsync<ReflectionRow>(
    `SELECT id, date, template, answers, snapshot, created_at, updated_at, deleted_at
     FROM reflections WHERE date = ? AND deleted_at IS NULL ORDER BY created_at`,
    [date],
  );
  return rows.map(toReflection);
}

export type ReflectionEntry = Reflection & { mood: number | null };

// 지난 기록의 회고 모아보기: 모든 회고를 최신순으로, 그날 기분과 함께.
export async function listReflectionHistory(db: Db): Promise<ReflectionEntry[]> {
  const rows = await db.getAllAsync<ReflectionRow & { mood: number | null }>(
    `SELECT r.id, r.date, r.template, r.answers, r.snapshot, r.created_at, r.updated_at, r.deleted_at,
       (SELECT mood FROM days WHERE date = r.date AND deleted_at IS NULL) AS mood
     FROM reflections r WHERE r.deleted_at IS NULL
     ORDER BY r.date DESC, r.created_at DESC`,
    [],
  );
  return rows.map((r) => ({ ...toReflection(r), mood: r.mood }));
}
