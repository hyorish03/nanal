// 온보딩 노트 한 장의 기준 치수(폭 390 휴대폰 기준). 책 속 오른쪽 장과 확대된 노트가 같은 모양이 되도록
// NotePage와 책 장면이 함께 쓴다. 다른 폭에서는 noteScale만큼 모두 같은 비율로 키운다.
export const NOTE_BASE_W = 390;
export const RULE_GAP = 36; // 줄 간격
export const RULE_FIRST = 35; // 첫 줄의 y. 줄은 RULE_FIRST + RULE_GAP * n
export const MARGIN_X = 52; // 붉은 여백선 x
export const TEXT_X = 64; // 글이 시작하는 x
export const ROW_TOP = 113; // 첫 글줄(row 0)의 위쪽. row r은 ROW_TOP + RULE_GAP * r

export function noteScale(width: number): number {
  return Math.min(1.35, Math.max(1, width / NOTE_BASE_W));
}

export type NoteStep = 0 | 1 | 2;
// write: 글씨가 한 줄씩 써진다, still: 다 써진 채로, leave: 글씨가 흐려지며 사라진다, blank: 줄만 그은 빈 장
export type NoteMode = 'write' | 'still' | 'leave' | 'blank';
export const NOTE_STEPS = 3;

// 노트 아래 조작 줄(이전 장·쪽 번호·다음 장)의 높이. 손그림 화살표가 이 위에서 멈춘다
export const NOTE_BAR_H = 104;
