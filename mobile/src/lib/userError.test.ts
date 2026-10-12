import { AI_MESSAGES, AiError } from '../ai/errors';
import { DEFAULT_ERROR_MESSAGE, OFFLINE_MESSAGE, userMessage } from './userError';

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

test('AI 오류는 그 한국어 문구를, 오프라인이면 연결 안내를', () => {
  expect(userMessage(new AiError('quota'))).toBe(AI_MESSAGES.quota);
  expect(userMessage(new AiError('offline'))).toBe(OFFLINE_MESSAGE);
});

test('네트워크 오류는 연결 안내로 바꾼다', () => {
  expect(userMessage(new TypeError('Network request failed'))).toBe(OFFLINE_MESSAGE);
  expect(userMessage(new TypeError('Failed to fetch'))).toBe(OFFLINE_MESSAGE);
  const supabase = Object.assign(new Error('boom'), { name: 'AuthRetryableFetchError' });
  expect(userMessage(supabase)).toBe(OFFLINE_MESSAGE);
});

test('우리가 적은 한국어 오류는 그대로, 영어 원문은 기본 문구로', () => {
  expect(userMessage(new Error('템플릿 이름을 적어 주세요'))).toBe('템플릿 이름을 적어 주세요');
  expect(userMessage(new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed'))).toBe(DEFAULT_ERROR_MESSAGE);
  expect(userMessage(new Error('저장 실패: disk full'))).toBe(DEFAULT_ERROR_MESSAGE);
  expect(userMessage('oops')).toBe(DEFAULT_ERROR_MESSAGE);
  expect(userMessage(null, '불러오지 못했어요')).toBe('불러오지 못했어요');
});

test('원래 오류는 console.warn으로 남긴다', () => {
  const e = new Error('raw english');
  userMessage(e);
  expect(warn).toHaveBeenCalledWith(expect.any(String), e);
});
