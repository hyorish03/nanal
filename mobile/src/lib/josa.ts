// 앞말의 마지막 글자로 조사를 고른다.
// 숫자는 한국어로 읽은 소리(영·일·삼·육·칠·팔은 받침, 이·사·오·구는 없음)를 따른다.
// 영문·기호는 읽는 법을 알 수 없어 받침 없는 쪽으로 읽는다(PR를). 끝의 닫는 괄호·따옴표·마침표는 건너뛴다.
const DIGIT_BATCHIM = new Set(['0', '1', '3', '6', '7', '8']);
// 숫자 중 ㄹ 받침으로 끝나는 소리: 일(1), 칠(7), 팔(8) → '로'
const DIGIT_RIEUL = new Set(['1', '7', '8']);

function lastChar(word: string): string {
  return word.trimEnd().replace(/[\s)\]}'"’”.,!?…]+$/, '').slice(-1);
}

// 0: 받침 없음, 8: ㄹ 받침, 그 밖의 양수: 다른 받침
function finalConsonant(word: string): number {
  const ch = lastChar(word);
  if (ch === '') return 0;
  if (/[0-9]/.test(ch)) return DIGIT_RIEUL.has(ch) ? 8 : DIGIT_BATCHIM.has(ch) ? 1 : 0;
  const code = ch.charCodeAt(0) - 0xac00;
  if (!(code >= 0 && code <= 11171)) return 0;
  return code % 28;
}

function hasBatchim(word: string): boolean {
  return finalConsonant(word) !== 0;
}

export const eulReul = (word: string) => (hasBatchim(word) ? '을' : '를');
export const iGa = (word: string) => (hasBatchim(word) ? '이' : '가');
// ㄹ 받침 뒤에는 '로'(오늘로)
export const euRo = (word: string) => {
  const f = finalConsonant(word);
  return f !== 0 && f !== 8 ? '으로' : '로';
};

// 사용자가 보는 글자 단위(이모지·결합 문자 묶음)로 나눈다. Intl.Segmenter가 없으면 코드 포인트로 나눈다.
function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale: string, opts: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (typeof Segmenter === 'function') return Array.from(new Segmenter('ko', { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  return Array.from(text);
}

// 확인 창에 넣을 수 있게 긴 글을 줄인다
export function clip(text: string, max = 20): string {
  const chars = graphemes(text.trim());
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : chars.join('');
}

// 지우기 확인 문구: "‘장보기’를 지울까요?"
export function deleteQuestion(text: string): string {
  const shown = clip(text);
  return `‘${shown}’${eulReul(shown.replace(/…$/, ''))} 지울까요?`;
}
