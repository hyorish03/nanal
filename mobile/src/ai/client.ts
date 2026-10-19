import { FunctionsFetchError, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { type MonthlyReview } from '../monthly/repo';
import { parseReviewContent } from '../monthly/content';
import { AiError, toAiErrorCode } from './errors';
import type { OrganizedItem } from './organize';

// 서버 쪽 시간 제한(_shared/anthropic.ts, monthly-review)보다 조금 길게 기다린다
export const ORGANIZE_TIMEOUT_MS = 30_000;
export const REVIEW_TIMEOUT_MS = 90_000;

// 시간이 다 돼 끊은 요청. 오프라인이 아니라 서버가 늦은 것이라 ai_busy(잠시 뒤에 다시)로 본다
const isTimeout = (e: FunctionsFetchError) => {
  const name = (e.context as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
};

async function invoke(client: SupabaseClient, name: string, body: Record<string, unknown>, timeout: number): Promise<unknown> {
  const { data, error } = await client.functions.invoke(name, { body, timeout });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const payload = await res.json().catch(() => null);
    throw new AiError(toAiErrorCode(res.status, payload));
  }
  if (error instanceof FunctionsFetchError) throw new AiError(isTimeout(error) ? 'ai_busy' : 'offline');
  throw new AiError('ai_busy'); // FunctionsRelayError 등 중간 단계 문제
}

export async function organizeText(client: SupabaseClient, text: string, today: string): Promise<OrganizedItem[]> {
  const data = await invoke(client, 'organize-voice', { text, today }, ORGANIZE_TIMEOUT_MS);
  const items = typeof data === 'object' && data !== null ? (data as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) throw new AiError('ai_failed');
  return items.filter(
    (i): i is OrganizedItem =>
      typeof i === 'object' && i !== null && (i.kind === 'task' || i.kind === 'note') &&
      typeof i.text === 'string' && typeof i.date === 'string',
  );
}

export async function createMonthlyReview(client: SupabaseClient, month: string): Promise<MonthlyReview> {
  const data = (await invoke(client, 'monthly-review', { month }, REVIEW_TIMEOUT_MS)) as Record<string, unknown> | null;
  const content = parseReviewContent(data?.content);
  if (!data || !content || typeof data.updated_at !== 'string' || typeof data.model !== 'string') throw new AiError('ai_failed');
  return { month, content, model: data.model, updated_at: data.updated_at };
}
