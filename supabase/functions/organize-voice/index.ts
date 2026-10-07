// 받아 적은 글을 할 일·메모로 정리한다(스펙 11.5). 글은 어디에도 저장하지 않는다.
import { aiErrorCode, anthropic, logError, readJson } from '../_shared/anthropic.ts';
import { consumeQuota, fail, json, userClient } from '../_shared/http.ts';
import {
  buildOrganizeMessage,
  ORGANIZE_SCHEMA,
  ORGANIZE_SYSTEM,
  parseOrganizeInput,
  validateOrganized,
  VOICE_MAX_TOKENS,
  VOICE_MODEL,
} from './logic.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('bad_request');
  try {
    const user = await userClient(req);
    if (!user) return fail('unauthorized');
    const input = parseOrganizeInput(await req.json().catch(() => null));
    if (!input) return fail('bad_request');
    if (!(await consumeQuota(user.client, 'voice'))) return fail('quota');

    const message = await anthropic().messages.create({
      model: VOICE_MODEL,
      max_tokens: VOICE_MAX_TOKENS,
      system: ORGANIZE_SYSTEM,
      messages: [{ role: 'user', content: buildOrganizeMessage(input.text, input.today) }],
      output_config: { format: { type: 'json_schema', schema: ORGANIZE_SCHEMA } },
    });
    return json({ items: validateOrganized(readJson(message), input.today) });
  } catch (e) {
    logError('organize-voice', e);
    return fail(aiErrorCode(e));
  }
});
