import { AiError } from '../ai/errors';

export const DEFAULT_ERROR_MESSAGE = '저장하지 못했어요. 잠시 뒤에 다시 해 주세요';
export const OFFLINE_MESSAGE = '인터넷에 연결되지 않았어요. 연결을 확인하고 다시 시도해 주세요';

// fetch·Supabase가 서버에 닿지 못했을 때 내는 오류들. 문구는 플랫폼마다 달라 이름과 문구를 함께 본다.
const NETWORK_NAMES = new Set(['AuthRetryableFetchError', 'FunctionsFetchError', 'NetworkError', 'AbortError', 'TimeoutError']);
const NETWORK_TEXT = /network request failed|failed to fetch|fetch failed|network ?error|internet connection|offline|timed? ?out|ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT/i;

// 우리 코드가 사용자에게 보여 주려고 한국어로 적어 던진 오류(예: '템플릿 이름을 적어 주세요').
// 한글이 있고 영문자가 없어야 한다. 라이브러리의 영어 문구가 섞여 나가지 않게.
const isKoreanMessage = (m: string) => /[가-힣]/.test(m) && !/[A-Za-z]/.test(m);

function isNetworkError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { name, message } = e as { name?: unknown; message?: unknown };
  if (typeof name === 'string' && NETWORK_NAMES.has(name)) return true;
  return typeof message === 'string' && NETWORK_TEXT.test(message);
}

// 화면에 띄울 오류 문구. 영어 원문은 보여 주지 않고 console.warn으로만 남긴다.
export function userMessage(e: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  console.warn('[userMessage]', e);
  if (e instanceof AiError) return e.code === 'offline' ? OFFLINE_MESSAGE : e.message;
  if (isNetworkError(e)) return OFFLINE_MESSAGE;
  if (e instanceof Error && isKoreanMessage(e.message)) return e.message;
  return fallback;
}
