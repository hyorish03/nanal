import { MAC_TEXT_SCALE, ON_MAC } from '../../ui/desktop';
import { type LayoutClass, useLayoutClass } from '../../ui/responsive';

// 줄 노트 눈금. 글자에 주는 lineHeight와 RuledPaper 선 간격이 늘 같이 움직여야 글자가 선 위에 앉는다.
export type Rule = {
  lineHeight: number; // Txt·TextInput 스타일에 주는 줄 높이(Mac에서는 macText가 키운다)
  line: number; // 실제로 그려지는 줄 간격. RuledPaper lineHeight와 칸 높이에 쓴다
  sit: number; // 선이 줄 상자 맨 아래에서 올라오는 만큼(글자 기준선 바로 밑)
  hand: number; // 손글씨 질문 글자 크기
  body: number; // 답 글자 크기
  inputLift: number; // 답 입력칸을 끌어올릴 만큼. 아래 INPUT_LINE_RATIO 설명
};

// iOS 입력칸(TextInput)은 lineHeight에서 남는 간격을 전부 글자 위에 둬서 글자가 줄 상자 바닥에 붙는다.
// 글(Text)은 남는 간격을 위아래로 나눠 가운데에 둔다. 그래서 같은 눈금이어도 답 글자만 선을 깔고 앉았다.
// 남는 간격의 절반만큼 올리면 글과 같은 자리에 앉는다. 1.5는 IBM Plex Sans KR의 자연 줄 높이(hhea 1085+415 / 1000).
const INPUT_LINE_RATIO = 1.5;

const BASE: Record<LayoutClass, Omit<Rule, 'line' | 'inputLift'>> = {
  compact: { lineHeight: 32, sit: 6, hand: 23, body: 15 },
  regular: { lineHeight: 36, sit: 7, hand: 25, body: 16 },
  wide: { lineHeight: 40, sit: 8, hand: 27, body: 17 },
};

export function ruleFor(layout: LayoutClass, onMac = ON_MAC): Rule {
  const b = BASE[layout];
  // macText와 같은 방식으로 반올림해야 선과 글자 줄이 어긋나지 않는다
  const line = onMac ? Math.round(b.lineHeight * MAC_TEXT_SCALE) : b.lineHeight;
  const body = onMac ? Math.round(b.body * MAC_TEXT_SCALE) : b.body;
  const inputLift = Math.max(0, Math.round((line - body * INPUT_LINE_RATIO) / 2));
  if (!onMac) return { ...b, line, inputLift };
  return { ...b, line, sit: Math.round(b.sit * MAC_TEXT_SCALE), inputLift };
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
