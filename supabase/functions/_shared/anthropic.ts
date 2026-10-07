import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';

export function anthropic(options: { timeout?: number; maxRetries?: number } = {}): Anthropic {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 없습니다');
  return new Anthropic({ apiKey, timeout: options.timeout ?? 60_000, maxRetries: options.maxRetries ?? 2 });
}

// 일시적인 문제(429, 529 과부하, 5xx, 연결 실패)는 ai_busy, 그 밖(형식 오류, 거절 등)은 ai_failed.
export function aiErrorCode(e: unknown): 'ai_busy' | 'ai_failed' {
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError) return 'ai_busy';
  if (e instanceof Anthropic.APIError && typeof e.status === 'number' && e.status >= 500) return 'ai_busy';
  return 'ai_failed';
}

// 구조화 출력 응답의 text 블록을 JSON으로 읽는다. 거절·잘림은 오류로 본다.
export function readJson(message: Anthropic.Message): unknown {
  if (message.stop_reason === 'refusal') throw new Error('모델이 응답을 거절했습니다');
  if (message.stop_reason === 'max_tokens') throw new Error('응답이 잘렸습니다');
  const block = message.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('응답에 글이 없습니다');
  return JSON.parse(block.text);
}

// 로그에는 사용자 글을 남기지 않는다. 오류 이름과 상태 코드만.
export function logError(where: string, e: unknown): void {
  const status = e instanceof Anthropic.APIError ? e.status : undefined;
  console.error(where, e instanceof Error ? e.name : 'unknown', status ?? '');
}
