import { formatLongDate, weekdayOf } from '../../lib/date';
import type { NoteStep } from './notebook';

// 노트 글씨가 나타나고 사라지는 박자(목업 Main의 .ink·.pop·inkOut). i는 그 장 안에서 써지는 차례다.
export const WRITE_MS = 560; // 한 줄이 써지는 시간
export const POP_MS = 520; // 그림·포스트잇이 붙는 시간
export const FADE_MS = 300; // 동작 줄이기: 움직임 없이 흐리게만
export const LEAVE_MS = 420; // 글씨가 흐려지며 사라지는 시간
const STAGGER = 230;
const LEAD = 160; // 장이 열리고 첫 글씨까지
const LEAVE_STAGGER = 25;

export function writeDelay(i: number): number {
  return i * STAGGER + LEAD;
}

export function leaveDelay(i: number): number {
  return i * LEAVE_STAGGER;
}

// 첫 장 오른쪽 위 날짜. 'YYYY-MM-DD' → '10. 14. 수'
export function noteDateText(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}. ${d}. ${'일월화수목금토'[weekdayOf(date)]}`;
}

// 스크린 리더가 한 장을 한 번에 읽는 문구. 화면에 쓴 순서대로, 기호는 말로 풀어 쓴다(그림은 읽지 않는다).
export function noteLabel(step: NoteStep, date: string): string {
  switch (step) {
    case 0:
      return [
        formatLongDate(date),
        '나날 쓰는 법',
        '하루를 한 줄씩 적는 다이어리예요.',
        '아침엔 할 일을 정하고, 저녁엔 오늘의 마음을 남겨요.',
        '한 장씩 넘기면서 알려 줄게요.',
      ].join(' ');
    case 1:
      return [
        '기호 읽는 법.',
        '점은 할 일. 보고서 초안.',
        '반쯤 칠한 동그라미는 하는 중. 3시 팀 회의.',
        '체크한 동그라미는 끝. 우유 사기.',
        '줄표는 메모. 창가 자리 최고.',
        '꺾쇠는 내일로 옮김. 은행 들르기.',
        '기호를 톡 누르면 할 일, 하는 중, 끝 순서로 바뀌어요.',
        '형광펜은 중요한 일, 하루 3개까지.',
        '줄을 오른쪽으로 밀면 형광펜, 왼쪽으로 밀면 미루기와 지우기.',
      ].join(' ');
    case 2:
      return [
        '하루는 이렇게.',
        '아침, 어제 넘어온 일을 골라요. 오늘 할까, 내일로, 지울까.',
        '낮, 떠오를 때마다 한 줄씩 적어요.',
        '저녁, 잉크병에 오늘 기분을 담고 짧은 회고는 원할 때만 남겨요.',
      ].join(' ');
    case 3:
      return [
        '마지막으로.',
        '책갈피 끈을 누르면 지난 날들을 볼 수 있어요.',
        '동그라미 친 i를 누르면 기호 설명을 다시 봐요.',
        '며칠 쉬어도 괜찮아요. 쌓인 날은 줄어들지 않아요.',
        '이제 오늘의 첫 줄을 써 볼까요.',
      ].join(' ');
  }
}
