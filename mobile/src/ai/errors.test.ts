import { AI_MESSAGES, AiError, toAiErrorCode } from './errors';

test('서버가 보낸 오류 코드를 그대로 쓴다', () => {
  expect(toAiErrorCode(429, { error: 'quota' })).toBe('quota');
  expect(toAiErrorCode(422, { error: 'not_enough_days' })).toBe('not_enough_days');
  expect(toAiErrorCode(402, { error: 'paid_required' })).toBe('paid_required');
});

test('코드가 없으면 상태로 정한다', () => {
  expect(toAiErrorCode(null, null)).toBe('offline');
  expect(toAiErrorCode(401, null)).toBe('unauthorized');
  expect(toAiErrorCode(402, null)).toBe('paid_required');
  expect(toAiErrorCode(503, 'x')).toBe('ai_busy');
  expect(toAiErrorCode(400, { error: 'weird' })).toBe('ai_failed');
});

test('AiError는 한국어 문구를 담는다', () => {
  const e = new AiError('not_enough_days');
  expect(e.message).toBe(AI_MESSAGES.not_enough_days);
  expect(e.code).toBe('not_enough_days');
});
