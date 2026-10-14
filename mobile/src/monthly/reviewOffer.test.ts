import { canOfferReview, REVIEW_MIN_DAYS } from './reviewOffer';

test('기록한 날이 충분하면 만들기를 권한다', () => {
  expect(canOfferReview({ hasReview: false, recordedDays: REVIEW_MIN_DAYS })).toBe(true);
  expect(canOfferReview({ hasReview: false, recordedDays: REVIEW_MIN_DAYS - 1 })).toBe(false);
});

test('이미 만든 돌아보기가 있으면 기록이 적어도 보기를 권한다', () => {
  expect(canOfferReview({ hasReview: true, recordedDays: 0 })).toBe(true);
});
