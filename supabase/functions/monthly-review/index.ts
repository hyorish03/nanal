// 지난 한 달 기록을 읽어 돌아보기를 만든다(스펙 11.9). 사용자 JWT로 읽고 써서 RLS가 적용된다.
import { aiErrorCode, anthropic, logError, readJson } from '../_shared/anthropic.ts';
import { monthRange } from '../_shared/dates.ts';
import { consumeQuota, fail, json, quotaRemaining, userClient } from '../_shared/http.ts';
import {
  aggregateMonth,
  buildReviewMessage,
  type DayRow,
  type ItemRow,
  MIN_RECORDED_DAYS,
  parseReviewInput,
  type ReflectionRow,
  REVIEW_MAX_TOKENS,
  REVIEW_MODEL,
  REVIEW_SCHEMA,
  REVIEW_SYSTEM,
  validateInsights,
} from './logic.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('bad_request');
  try {
    const user = await userClient(req);
    if (!user) return fail('unauthorized');
    const input = parseReviewInput(await req.json().catch(() => null));
    if (!input) return fail('bad_request');

    const { from, to } = monthRange(input.month);
    const [days, items, reflections] = await Promise.all([
      user.client.from('days').select('date, mood, deleted_at').gte('date', from).lte('date', to),
      // 할 일 글(text)은 읽지 않는다
      user.client.from('items').select('date, kind, status, deleted_at').gte('date', from).lte('date', to),
      user.client.from('reflections').select('date, template, answers, snapshot, deleted_at').gte('date', from).lte('date', to),
    ]);
    for (const r of [days, items, reflections]) if (r.error) throw new Error(`읽기 실패: ${r.error.code ?? ''}`);

    const reflRows = (reflections.data ?? []) as ReflectionRow[];
    const stats = aggregateMonth(input.month, (days.data ?? []) as DayRow[], (items.data ?? []) as ItemRow[], reflRows);
    // 기록이 모자라면 횟수를 보기 전에 거절한다
    if (stats.recordedDays < MIN_RECORDED_DAYS) return fail('not_enough_days');
    // 대상 달마다 1번(이용권이 있으면 더). 여기서는 확인만 하고, 저장에 성공한 뒤에 센다.
    if ((await quotaRemaining(user.client, 'monthly', input.month)) < 1) return fail('paid_required');

    const message = await anthropic({ timeout: 120_000, maxRetries: 1 }).messages.create({
      model: REVIEW_MODEL,
      max_tokens: REVIEW_MAX_TOKENS,
      system: REVIEW_SYSTEM,
      messages: [{ role: 'user', content: buildReviewMessage(stats, reflRows) }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
    });
    const content = { version: 1, stats, insights: validateInsights(readJson(message)) };

    // 이용권으로 다시 만들면 같은 달 행을 덮어쓴다
    const now = new Date().toISOString();
    const row = { month: input.month, content, model: REVIEW_MODEL, created_at: now, updated_at: now, deleted_at: null };
    const { error } = await user.client.from('monthly_reviews').upsert(row, { onConflict: 'user_id,month' });
    if (error) throw new Error(`저장 실패: ${error.code ?? ''}`);
    // 저장에 성공했을 때만 센다. 세기가 실패해도 이미 저장한 결과는 돌려준다.
    await consumeQuota(user.client, 'monthly', input.month).catch((e) => logError('monthly-review quota', e));
    return json(row);
  } catch (e) {
    logError('monthly-review', e);
    return fail(aiErrorCode(e));
  }
});
