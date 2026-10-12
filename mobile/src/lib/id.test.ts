import { newId, randomBytes } from './id';

test('newId는 UUID v4 형식이다', () => {
  expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('newId는 겹치지 않는다', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId()));
  expect(ids.size).toBe(1000);
});

test('randomBytes는 요청한 길이를 돌려준다', () => {
  expect(randomBytes(32)).toHaveLength(32);
});
