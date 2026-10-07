import { FunctionsFetchError, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { type MonthlyReview } from '../monthly/repo';
import { parseReviewContent } from '../monthly/content';
import { AiError, toAiErrorCode } from './errors';
import type { OrganizedItem } from './organize';

async function invoke(client: SupabaseClient, name: string, body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.functions.invoke(name, { body });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const payload = await res.json().catch(() => null);
    throw new AiError(toAiErrorCode(res.status, payload));
  }
  if (error instanceof FunctionsFetchError) throw new AiError('offline');
  throw new AiError('ai_busy'); // FunctionsRelayError 등 중간 단계 문제
}

export async function organizeText(client: SupabaseClient, text: string, today: string): Promise<OrganizedItem[]> {
  const data = await invoke(client, 'organize-voice', { text, today });
  const items = typeof data === 'object' && data !== null ? (data as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) throw new AiError('ai_failed');
  return items.filter(
    (i): i is OrganizedItem =>
      typeof i === 'object' && i !== null && (i.kind === 'task' || i.kind === 'note') &&
      typeof i.text === 'string' && typeof i.date === 'string',
  );
}

export async function createMonthlyReview(client: SupabaseClient, month: string): Promise<MonthlyReview> {
  const data = (await invoke(client, 'monthly-review', { month })) as Record<string, unknown> | null;
  const content = parseReviewContent(data?.content);
  if (!data || !content || typeof data.updated_at !== 'string' || typeof data.model !== 'string') throw new AiError('ai_failed');
  return { month, content, model: data.model, updated_at: data.updated_at };
}
