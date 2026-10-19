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

test('없는 유료 기능을 안내하지 않는다', () => {
  expect(AI_MESSAGES.paid_required).toBe('이 달 돌아보기는 이미 만들었어요. 돌아보기는 한 달에 한 번 만들 수 있어요');
  for (const m of Object.values(AI_MESSAGES)) expect(m).not.toMatch(/유료|무료|준비 중|결제/);
});

test('문구는 마침표 없이 끝난다', () => {
  for (const m of Object.values(AI_MESSAGES)) expect(m.endsWith('.')).toBe(false);
});
