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
  offline: '인터넷에 연결되어 있지 않아요',
  unauthorized: '로그인이 풀렸어요. 다시 로그인해 주세요',
  bad_request: '보낼 내용을 확인해 주세요',
  quota: '정리하기는 하루 10번까지예요. 내일 다시 해 주세요',
  paid_required: '더 만들려면 유료 이용이 필요해요 (준비 중)',
  not_enough_days: '기록이 조금 더 쌓이면 볼 수 있어요',
  ai_busy: '지금은 정리하는 쪽이 붐벼요. 잠시 뒤에 다시 해 주세요',
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
