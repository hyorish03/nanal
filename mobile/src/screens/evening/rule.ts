import { MAC_TEXT_SCALE, ON_MAC } from '../../ui/desktop';
import { type LayoutClass, useLayoutClass } from '../../ui/responsive';

// 줄 노트 눈금. 글자에 주는 lineHeight와 RuledPaper 선 간격이 늘 같이 움직여야 글자가 선 위에 앉는다.
export type Rule = {
  lineHeight: number; // Txt·TextInput 스타일에 주는 줄 높이(Mac에서는 macText가 키운다)
  line: number; // 실제로 그려지는 줄 간격. RuledPaper lineHeight와 칸 높이에 쓴다
  sit: number; // 선이 줄 상자 맨 아래에서 올라오는 만큼(글자 기준선 바로 밑)
  hand: number; // 손글씨 질문 글자 크기
  body: number; // 답 글자 크기
};

const BASE: Record<LayoutClass, Omit<Rule, 'line'>> = {
  compact: { lineHeight: 32, sit: 6, hand: 23, body: 15 },
  regular: { lineHeight: 36, sit: 7, hand: 25, body: 16 },
  wide: { lineHeight: 40, sit: 8, hand: 27, body: 17 },
};

export function ruleFor(layout: LayoutClass, onMac = ON_MAC): Rule {
  const b = BASE[layout];
  if (!onMac) return { ...b, line: b.lineHeight };
  // macText와 같은 방식으로 반올림해야 선과 글자 줄이 어긋나지 않는다
  return { ...b, line: Math.round(b.lineHeight * MAC_TEXT_SCALE), sit: Math.round(b.sit * MAC_TEXT_SCALE) };
}

export function useRule(): Rule {
  return ruleFor(useLayoutClass());
}

// 회고 카드에 적을 자리로 기본 몇 줄을 비워 둘지. 모두 합쳐 5줄 이상, 답 하나에는 2줄 이상.
// 질문이 하나면 5줄, 둘이면 3줄씩, 셋 이상이면 2줄씩. 글이 길어지면 칸이 늘어난다.
export const ANSWER_LINES_TOTAL = 5;
export function answerLines(questions: number): number {
  return Math.max(2, Math.ceil(ANSWER_LINES_TOTAL / Math.max(1, questions)));
}
