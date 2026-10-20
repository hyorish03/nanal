import { monthWeeks } from '../lib/calendar';
import type { KeyValueStore } from '../lib/onboarding';

// 첫 월간 돌아보기 소개(ReviewIntro 목업). 기기마다 한 번만 보여 준다.
export const REVIEW_INTRO_KEY = 'nanal.reviewIntroSeen';

// 저장소를 읽지 못하면 이미 본 것으로 친다(소개가 매번 뜨지 않게)
export async function hasSeenReviewIntro(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.getItem(REVIEW_INTRO_KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markReviewIntroSeen(store: KeyValueStore): Promise<void> {
  try {
    await store.setItem(REVIEW_INTRO_KEY, '1');
  } catch {
    // 못 저장하면 다음에 한 번 더 보일 뿐이다
  }
}

// 만들기 화면에서 무엇을 보일지: 본 적을 아직 모르면 잠깐 비워 두고(깜빡임 방지), 처음이면 소개, 아니면 그대로
export type ConsentView = 'wait' | 'intro' | 'plain';
export function consentView(seen: boolean | null): ConsentView {
  if (seen === null) return 'wait';
  return seen ? 'plain' : 'intro';
}

export const REVIEW_INTRO_COPY = {
  hand: '한 달을 다 채웠어요',
  title: (label: string) => `${label}을 같이 돌아볼까요?`, // "N월"은 늘 받침(ㄹ)으로 끝난다
  ink: '한 달의 잉크',
} as const;

// 맛보기 세 줄. 실제 결과가 아니라 무엇을 읽어 주는지만 말한다
export const REVIEW_TEASERS = [
  { label: '기분의 흐름', text: '한 달 기분이 어떻게 오르내렸는지' },
  { label: '무기력했던 날', text: '무기력했던 날과 그 이유' },
  { label: '해 볼 한 가지', text: '다음 달에 해 볼 한 가지', hand: true },
] as const;

// 날짜 순서대로 잉크가 번지고, 다 번진 뒤 맛보기 줄이 차례로 올라온다(목업의 9초 중 앞 4.8초를 한 번만)
export const CELL_STEP_MS = 90;
export const CELL_MS = 540;
export const LINE_MS = 540;
export const LINE_GAP_MS = 600;
const LINE_AFTER_MS = 270; // 마지막 칸이 다 번진 뒤 조금 쉬었다가

export type IntroCell = { date: string; day: number; mood: number | null; delay: number } | null;

// 주 단위 달력 칸. 기분이 있는 날만 delay가 의미 있다(날짜 n은 n × CELL_STEP_MS 뒤에 번진다)
export function introWeeks(month: string, moods: ReadonlyMap<string, number | null>): IntroCell[][] {
  return monthWeeks(month).map((week) =>
    week.map((date) => {
      if (!date) return null;
      const day = Number(date.slice(8));
      return { date, day, mood: moods.get(date) ?? null, delay: day * CELL_STEP_MS };
    }),
  );
}

// 맛보기 줄 i가 시작하는 때. 달 길이(마지막 날)에 맞춘다
export function lineDelay(month: string, i: number): number {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last * CELL_STEP_MS + CELL_MS + LINE_AFTER_MS + i * LINE_GAP_MS;
}
