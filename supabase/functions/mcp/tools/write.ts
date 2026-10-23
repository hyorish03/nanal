import type { McpServer } from 'npm:@modelcontextprotocol/server@2.0.0';
import { z } from 'npm:zod@4';

import { canSetStatus, checkAddDate, cleanText, logicalToday, SETTABLE_STATUS, type TaskStatus } from '../logic.ts';
import { errorResult, jsonResult, runtimeErrorResult } from './result.ts';
import type { ToolContext } from './types.ts';

// 기록을 더하거나 상태만 바꾼다(지우거나 글을 고치는 것은 앱에서만). 앱과 같은 열을 채워 동기화로 그대로 내려간다
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

// 그날(언젠가는 목록 전체) 맨 뒤 자리. 지운 줄까지 세어 겹치지 않게 한다(앱 insertItem과 같다)
async function nextPosition(ctx: ToolContext, table: 'items' | 'someday', date?: string): Promise<number> {
  let q = ctx.supabase.from(table).select('position').not('position', 'is', null).order('position', { ascending: false }).limit(1);
  if (date) q = q.eq('date', date);
  const { data, error } = await q;
  if (error) throw error;
  return (data?.[0]?.position ?? 0) + 1;
}

export function registerWriteTools(server: McpServer, ctx: ToolContext): void {
  const { supabase } = ctx;

  server.registerTool(
    'add_item',
    {
      description:
        'Add one line to a day page: a task (default) or a note. date defaults to today; past dates are rejected. Put a time in the text if any, e.g. "15:00 치과". One short line, max 200 characters.',
      inputSchema: z.object({
        text: z.string(),
        kind: z.enum(['task', 'note']).optional(),
        date: z.string().describe('YYYY-MM-DD').optional(),
      }),
      annotations: WRITE,
    },
    async ({ text, kind = 'task', date }) => {
      const t = cleanText(text);
      if (!t.ok) return errorResult(t.error);
      const d = checkAddDate(date, logicalToday());
      if (!d.ok) return errorResult(d.error);
      try {
        const now = new Date().toISOString();
        const row = {
          id: crypto.randomUUID(),
          date: d.date,
          kind,
          text: t.text,
          status: kind === 'task' ? 'open' : null,
          priority: false,
          migrated_from: null,
          position: await nextPosition(ctx, 'items', d.date),
          created_at: now,
          updated_at: now,
        };
        const { error } = await supabase.from('items').insert(row);
        if (error) throw error;
        return jsonResult({ added: { id: row.id, date: row.date, kind, text: row.text, status: row.status } });
      } catch (e) {
        return runtimeErrorResult(e);
      }
    },
  );

  server.registerTool(
    'set_status',
    {
      description:
        "Change a task's status by id: open (to do), doing (in progress), done, or dropped (decided not to do; kept with a strike-through). Moved tasks cannot be changed; change the copy on the day it moved to.",
      inputSchema: z.object({ id: z.string().min(1), status: z.enum(SETTABLE_STATUS) }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, status }) => {
      try {
        const { data: item, error } = await supabase.from('items').select('id, kind, text, status')
          .eq('id', id).is('deleted_at', null).maybeSingle();
        if (error) throw error;
        if (!item) return errorResult('그 id의 줄을 찾지 못했어요. get_day나 list_overdue로 id를 다시 확인해 주세요.');
        if (!canSetStatus(item.kind, item.status as TaskStatus | null)) {
          return errorResult(item.kind === 'note' ? '메모는 상태가 없어요.' : '옮긴 일은 바꿀 수 없어요. 옮겨 간 날의 줄을 바꿔 주세요.');
        }
        const { error: e2 } = await supabase.from('items').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
        if (e2) throw e2;
        return jsonResult({ updated: { id, text: item.text, from: item.status, to: status } });
      } catch (e) {
        return runtimeErrorResult(e);
      }
    },
  );

  server.registerTool(
    'add_someday',
    {
      description: 'Add an undated task to the "someday" list (things to do eventually, not tied to a day). Max 200 characters.',
      inputSchema: z.object({ text: z.string() }),
      annotations: WRITE,
    },
    async ({ text }) => {
      const t = cleanText(text);
      if (!t.ok) return errorResult(t.error);
      try {
        const now = new Date().toISOString();
        const row = {
          id: crypto.randomUUID(),
          text: t.text,
          status: 'open',
          priority: false,
          migrated_to: null,
          position: await nextPosition(ctx, 'someday'),
          created_at: now,
          updated_at: now,
        };
        const { error } = await supabase.from('someday').insert(row);
        if (error) throw error;
        return jsonResult({ added: { id: row.id, text: row.text } });
      } catch (e) {
        return runtimeErrorResult(e);
      }
    },
  );
}
