// 말로 적기 정리(스펙 11.5): 입력 검사, 프롬프트, 출력 형식, 출력 검증. 외부 의존성 없는 순수 코드다.
import { addDays, isValidDate, weekdayKo } from '../_shared/dates.ts';

export const VOICE_MODEL = 'claude-haiku-4-5';
export const VOICE_MAX_TOKENS = 1024;
export const MAX_TRANSCRIPT_CHARS = 2000;
export const MAX_ITEMS = 10;
const MAX_ITEM_CHARS = 200;

export type OrganizeInput = { text: string; today: string };
export type OrganizedItem = { kind: 'task' | 'note'; text: string; date: string };

// 구조화 출력 형식. 모델은 이 모양의 JSON만 돌려준다.
export const ORGANIZE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['task', 'note'] },
          text: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['kind', 'text', 'date'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export const ORGANIZE_SYSTEM = [
  '너는 한국어 하루 기록 앱 "나날"의 받아쓰기 정리 도우미다.',
  '사용자가 두서없이 말하거나 쓴 글에서 할 일과 메모를 골라 짧은 한 줄씩으로 정리한다.',
  '- task(할 일): 해야 하거나 하려는 행동. "~하기"로 끝나는 짧은 한 줄(예: "프론트엔드 펀더멘탈 책 사기").',
  '- note(메모): 행동은 아니지만 남겨 둘 만한 사실이나 생각.',
  '- 망설임, 혼잣말, 같은 말의 반복은 버린다. 글에 없는 내용은 지어내지 않는다.',
  '- date는 YYYY-MM-DD. "내일", "모레", "다음 주 월요일"처럼 날짜를 말했으면 오늘을 기준으로 계산하고, 말하지 않았으면 오늘 날짜를 쓴다.',
  '- 시각을 말했으면 글 앞에 붙인다(예: "15:00 치과 전화하기").',
  `- 많아도 ${MAX_ITEMS}개까지. 정리할 것이 없으면 items를 빈 배열로 둔다.`,
].join('\n');

export function parseOrganizeInput(body: unknown): OrganizeInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { text, today } = body as Record<string, unknown>;
  if (typeof text !== 'string' || typeof today !== 'string' || !isValidDate(today)) return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_TRANSCRIPT_CHARS) return null;
  return { text: trimmed, today };
}

export function buildOrganizeMessage(text: string, today: string): string {
  return `오늘 날짜: ${today} (${weekdayKo(today)}요일)\n받아 적은 글:\n<transcript>\n${text}\n</transcript>`;
}

// 형식을 지킨 출력이라도 한 번 더 거른다: 모르는 종류·빈 글은 버리고, 잘못되거나 지난 날짜, 1년 넘게 먼 날짜는 오늘로 바꾼다.
export function validateOrganized(raw: unknown, today: string): OrganizedItem[] {
  const list = typeof raw === 'object' && raw !== null ? (raw as { items?: unknown }).items : undefined;
  if (!Array.isArray(list)) throw new Error('정리 결과 형식이 아닙니다');
  const limit = addDays(today, 365);
  const out: OrganizedItem[] = [];
  for (const entry of list) {
    if (out.length >= MAX_ITEMS) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const { kind, text, date } = entry as Record<string, unknown>;
    if ((kind !== 'task' && kind !== 'note') || typeof text !== 'string') continue;
    const clean = text.trim().slice(0, MAX_ITEM_CHARS);
    if (!clean) continue;
    const ok = typeof date === 'string' && isValidDate(date) && date >= today && date <= limit;
    out.push({ kind, text: clean, date: ok ? date : today });
  }
  return out;
}
