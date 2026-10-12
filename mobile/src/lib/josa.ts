// 앞말의 마지막 글자에 받침이 있는지 보고 조사를 고른다. 한글이 아니면(영문, 숫자, 기호) 받침 없는 쪽으로 읽는다.
function hasBatchim(word: string): boolean {
  const code = word.trimEnd().slice(-1).charCodeAt(0) - 0xac00;
  if (!(code >= 0 && code <= 11171)) return false;
  return code % 28 !== 0;
}

export const eulReul = (word: string) => (hasBatchim(word) ? '을' : '를');
export const iGa = (word: string) => (hasBatchim(word) ? '이' : '가');
// ㄹ 받침 뒤에는 '로'(오늘로)
export const euRo = (word: string) => {
  const code = word.trimEnd().slice(-1).charCodeAt(0) - 0xac00;
  return hasBatchim(word) && code % 28 !== 8 ? '으로' : '로';
};

// 확인 창에 넣을 수 있게 긴 글을 줄인다
export function clip(text: string, max = 20): string {
  const chars = Array.from(text.trim());
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : chars.join('');
}

// 지우기 확인 문구: "‘장보기’를 지울까요?"
export function deleteQuestion(text: string): string {
  const shown = clip(text);
  return `‘${shown}’${eulReul(shown.replace(/…$/, ''))} 지울까요?`;
}
