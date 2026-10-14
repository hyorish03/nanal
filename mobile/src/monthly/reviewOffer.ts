import { listMonthSummary } from '../archive/repo';
import type { Db } from '../db/types';
import { getMonthlyReview } from './repo';

// 월간 돌아보기를 권하려면 그달에 이만큼은 기록했어야 한다(지난 기록 배너, 월초 정리가 같이 쓴다)
export const REVIEW_MIN_DAYS = 7;

export type ReviewOffer = { hasReview: boolean; recordedDays: number };

// 이미 만든 돌아보기가 있으면 '보기', 기록한 날이 충분하면 '만들기'를 권한다. 아니면 권하지 않는다.
export function canOfferReview(offer: ReviewOffer): boolean {
  return offer.hasReview || offer.recordedDays >= REVIEW_MIN_DAYS;
}

export async function loadReviewOffer(db: Db, month: string): Promise<ReviewOffer> {
  const [review, summary] = await Promise.all([getMonthlyReview(db, month), listMonthSummary(db, month)]);
  return { hasReview: review !== null, recordedDays: summary.length };
}
