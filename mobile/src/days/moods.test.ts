import { inkLevel, moodWord } from './moods';

test('기분 낱말과 잉크 높이', () => {
  expect(moodWord(1)).toBe('힘듦');
  expect(moodWord(5)).toBe('좋음');
  expect(moodWord(null)).toBeNull();
  expect(inkLevel(1)).toBe(0);
  expect(inkLevel(3)).toBe(0.5);
  expect(inkLevel(5)).toBe(1);
});
