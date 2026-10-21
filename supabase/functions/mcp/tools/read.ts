import type { McpServer } from 'npm:@modelcontextprotocol/server@2.0.0';
import { z } from 'npm:zod@4';

import { isValidDate, isValidMonth } from '../../_shared/dates.ts';
import { checkRange, logicalToday, summarizeDays } from '../logic.ts';
import { errorResult, jsonResult, runtimeErrorResult } from './result.ts';
import type { ToolContext } from './types.ts';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const DATE = z.string().describe('YYYY-MM-DD');

type Snapshot = { name?: string; questions?: { key: string; text: string }[] } | null;

// 회고 한 개를 질문과 답 쌍으로 풀어 준다(템플릿이 바뀌어도 남길 때의 질문을 쓴다)
function readableReflection(r: { template: string; answers: Record<string, string>; snapshot: Snapshot }) {
  const questions = r.snapshot?.questions ?? Object.keys(r.answers).map((key) => ({ key, text: '' }));
  return {
    template: r.snapshot?.name ?? r.template,
    answers: questions.filter((q) => r.answers[q.key]).map((q) => ({ question: q.text, answer: r.answers[q.key] })),
  };
}

export function registerReadTools(server: McpServer, { supabase }: ToolContext): void {
  server.registerTool(
    'get_day',
    {
      description:
        "One day's page: tasks and notes in written order (with id, status, priority), the mood (1-5) and evening reflections. Defaults to today (Seoul, a new day starts at 04:00).",
      inputSchema: z.object({ date: DATE.optional() }),
      annotations: READ_ONLY,
    },
    async ({ date }) => {
      const today = logicalToday();
      const day = date ?? today;
      if (!isValidDate(day)) return errorResult('date는 YYYY-MM-DD 형식이어야 해요.');
      try {
        const [items, mood, refl] = await Promise.all([
          supabase.from('items').select('id, kind, text, status, priority').eq('date', day).is('deleted_at', null)
            .order('position', { ascending: true, nullsFirst: false }).order('created_at'),
          supabase.from('days').select('mood').eq('date', day).is('deleted_at', null).maybeSingle(),
          supabase.from('reflections').select('template, answers, snapshot').eq('date', day).is('deleted_at', null).order('created_at'),
        ]);
        for (const r of [items, mood, refl]) if (r.error) throw r.error;
        return jsonResult({
          date: day,
          today,
          items: items.data,
          mood: mood.data?.mood ?? null,
          reflections: (refl.data ?? []).map(readableReflection),
        });
      } catch (e) {
        return runtimeErrorResult(e);
      }
    },
  );

  server.registerTool(
    'list_overdue',
    {
      description: 'Unfinished tasks (open or doing) from days before today, oldest first. These are what the app shows as "carried over".',
      annotations: READ_ONLY,
    },
    async () => {
      const today = logicalToday();
      const { data, error } = await supabase.from('items').select('id, date, text, status, priority')
        .eq('kind', 'task').in('status', ['open', 'doing']).lt('date', today).is('deleted_at', null)
        .order('date').order('position', { ascending: true, nullsFirst: false });
      return error ? runtimeErrorResult(error) : jsonResult({ today, items: data });
    },
  );

  server.registerTool(
    'get_range',
    {
      description:
        'Per-day summary for a date range (max 62 days): mood, task counts (done / dropped), notes and reflection counts. Set include_reflections to also get the reflection answers.',
      inputSchema: z.object({ from: DATE, to: DATE, include_reflections: z.boolean().optional() }),
      annotations: READ_ONLY,
    },
    async ({ from, to, include_reflections }) => {
      const range = checkRange(from, to);
      if (!range.ok) return errorResult(range.error);
      try {
        const [items, days, refl] = await Promise.all([
          supabase.from('items').select('date, kind, status').gte('date', from).lte('date', to).is('deleted_at', null),
          supabase.from('days').select('date, mood').gte('date', from).lte('date', to).is('deleted_at', null),
          supabase.from('reflections').select('date, template, answers, snapshot').gte('date', from).lte('date', to)
            .is('deleted_at', null).order('date'),
        ]);
        for (const r of [items, days, refl]) if (r.error) throw r.error;
        return jsonResult({
          days: summarizeDays(items.data ?? [], days.data ?? [], refl.data ?? []),
          reflections: include_reflections ? (refl.data ?? []).map((r) => ({ date: r.date, ...readableReflection(r) })) : undefined,
        });
      } catch (e) {
        return runtimeErrorResult(e);
      }
    },
  );

  server.registerTool(
    'list_someday',
    {
      description: 'The "someday" list: undated tasks the user keeps for later. Unfinished ones first.',
      annotations: READ_ONLY,
    },
    async () => {
      const { data, error } = await supabase.from('someday').select('id, text, status, priority')
        .is('deleted_at', null).neq('status', 'migrated')
        .order('position', { ascending: true, nullsFirst: false }).order('created_at');
      if (error) return runtimeErrorResult(error);
      const rank = (s: string) => (s === 'open' ? 0 : 1);
      return jsonResult({ items: [...(data ?? [])].sort((a, b) => rank(a.status) - rank(b.status)) });
    },
  );

  server.registerTool(
    'get_monthly_review',
    {
      description: "The AI monthly review the user already created in the app for a month (YYYY-MM), or null if there is none. This tool never creates one.",
      inputSchema: z.object({ month: z.string().describe('YYYY-MM') }),
      annotations: READ_ONLY,
    },
    async ({ month }) => {
      if (!isValidMonth(month)) return errorResult('month는 YYYY-MM 형식이어야 해요.');
      const { data, error } = await supabase.from('monthly_reviews').select('content, updated_at')
        .eq('month', month).is('deleted_at', null).maybeSingle();
      return error ? runtimeErrorResult(error) : jsonResult({ month, review: data?.content ?? null });
    },
  );
}
