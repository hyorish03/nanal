import type { Db } from '../db/types';
import { type MonthlyReviewContent, parseReviewContent } from './content';

export type MonthlyReview = { month: string; content: MonthlyReviewContent; model: string; updated_at: string };

export async function getMonthlyReview(db: Db, month: string): Promise<MonthlyReview | null> {
  const row = await db.getFirstAsync<{ month: string; content: string; model: string; updated_at: string }>(
    'SELECT month, content, model, updated_at FROM monthly_reviews WHERE month = ? AND deleted_at IS NULL',
    [month],
  );
  if (!row) return null;
  let content: MonthlyReviewContent | null = null;
  try {
    content = parseReviewContent(JSON.parse(row.content));
  } catch {
    content = null;
  }
  return content ? { month: row.month, content, model: row.model, updated_at: row.updated_at } : null;
}

// 서버 함수가 만들어 저장한 회고를 기기에 바로 넣는다. 서버에 이미 있으므로 outbox에 올리지 않고,
// 나중에 동기화로 같은 행이 내려와도 updated_at이 같아 그대로 둔다(더 새것만 덮어쓴다).
export async function saveMonthlyReview(db: Db, review: MonthlyReview): Promise<void> {
  await db.runAsync(
    `INSERT INTO monthly_reviews (month, content, model, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT (month) DO UPDATE SET content = excluded.content, model = excluded.model,
       updated_at = excluded.updated_at, deleted_at = NULL
     WHERE excluded.updated_at > monthly_reviews.updated_at`,
    [review.month, JSON.stringify(review.content), review.model, review.updated_at, review.updated_at],
  );
}
