export const MOOD_WORDS = ['힘듦', '가라앉음', '보통', '괜찮음', '좋음'] as const;
export const MOODS = [1, 2, 3, 4, 5] as const;

export function moodWord(mood: number | null): string | null {
  return mood === null ? null : (MOOD_WORDS[mood - 1] ?? null);
}

// 잉크병에 찬 잉크 비율(1점=0, 5점=1)
export function inkLevel(mood: number): number {
  return (mood - 1) / 4;
}
