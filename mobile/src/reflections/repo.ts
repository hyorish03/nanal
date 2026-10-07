import type { Db } from '../db/types';
import { logicalDate } from '../lib/date';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';
import { TEMPLATES, type TemplateKey } from './templates';

export type Reflection = {
  id: string;
  date: string;
  template: TemplateKey;
  answers: Record<string, string>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ReflectionRow = Omit<Reflection, 'answers'> & { answers: string };

export async function addReflection(
  db: Db,
  input: { template: TemplateKey; answers: Record<string, string> },
  now = new Date(),
): Promise<Reflection> {
  const answers: Record<string, string> = {};
  for (const q of TEMPLATES[input.template].questions) {
    const value = (input.answers[q.key] ?? '').trim();
    if (value) answers[q.key] = value;
  }
  if (Object.keys(answers).length === 0) throw new Error('답변을 하나 이상 입력하세요');

  const ts = now.toISOString();
  const reflection: Reflection = {
    id: newId(),
    date: logicalDate(now),
    template: input.template,
    answers,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO reflections (id, date, template, answers, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [reflection.id, reflection.date, reflection.template, JSON.stringify(answers), ts, ts],
    );
    await markDirty(tx, 'reflections', reflection.id);
  });
  return reflection;
}

export async function listReflections(db: Db, date: string): Promise<Reflection[]> {
  const rows = await db.getAllAsync<ReflectionRow>(
    `SELECT id, date, template, answers, created_at, updated_at, deleted_at
     FROM reflections WHERE date = ? AND deleted_at IS NULL ORDER BY created_at`,
    [date],
  );
  return rows.map((r) => ({ ...r, answers: JSON.parse(r.answers) as Record<string, string> }));
}
