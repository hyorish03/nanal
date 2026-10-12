export type AiErrorCode =
  | 'offline'
  | 'unauthorized'
  | 'bad_request'
  | 'quota'
  | 'paid_required'
  | 'not_enough_days'
  | 'ai_busy'
  | 'ai_failed';

export const AI_MESSAGES: Record<AiErrorCode, string> = {
  offline: '인터넷에 연결되지 않았어요. 연결하고 다시 해 주세요',
  unauthorized: '로그인이 풀렸어요. 다시 로그인해 주세요',
  bad_request: '글을 다시 확인해 주세요. 비어 있거나 너무 길 수 있어요',
  // quota는 말로 적기 정리(voice)에만, paid_required는 월간 돌아보기(monthly)에만 온다
  quota: '오늘은 정리를 10번 다 썼어요. 내일 새벽 4시 이후에 다시 해 주세요',
  paid_required: '이번 달 돌아보기는 이미 만들었어요. 더 만드는 기능은 준비 중이에요',
  not_enough_days: '기록이 조금 더 쌓이면 볼 수 있어요',
  ai_busy: '지금은 요청이 많아 정리하지 못했어요. 잠시 뒤에 다시 해 주세요',
  ai_failed: '정리하지 못했어요. 잠시 뒤에 다시 해 주세요',
};

const SERVER_CODES = new Set<AiErrorCode>([
  'unauthorized',
  'bad_request',
  'quota',
  'paid_required',
  'not_enough_days',
  'ai_busy',
  'ai_failed',
]);

export class AiError extends Error {
  constructor(readonly code: AiErrorCode) {
    super(AI_MESSAGES[code]);
    this.name = 'AiError';
  }
}

// status가 null이면 서버에 닿지 못한 것(오프라인)이다.
export function toAiErrorCode(status: number | null, body: unknown): AiErrorCode {
  if (status === null) return 'offline';
  const code = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  if (typeof code === 'string' && SERVER_CODES.has(code as AiErrorCode)) return code as AiErrorCode;
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'quota';
  if (status === 402) return 'paid_required';
  if (status >= 500) return 'ai_busy';
  return 'ai_failed';
}
