import { MOODS } from '../../days/moods';
import { colors } from '../../ui/theme';
import { INK_OPACITY, inkNeedsLightText, inkOpacity, inkSize } from './ink';

// WCAG 대비 계산(시험용)
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const over = (hex: string, alpha: number, bgHex: string) => {
  const fg = rgb(hex);
  return rgb(bgHex).map((v, i) => fg[i] * alpha + v * (1 - alpha));
};

describe('inkSize', () => {
  it('기분 1은 min, 5는 max, 사이는 차례로 커진다', () => {
    expect(inkSize(1, 18, 44)).toBe(18);
    expect(inkSize(5, 18, 44)).toBe(44);
    const sizes = MOODS.map((m) => inkSize(m, 18, 44));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
  });

  it('범위를 넘는 값은 끝에 맞춘다', () => {
    expect(inkSize(0, 18, 44)).toBe(18);
    expect(inkSize(9, 18, 44)).toBe(44);
  });
});

describe('inkOpacity', () => {
  it('기분이 좋을수록 진해진다(옅게 0.14에서 시작)', () => {
    expect(inkOpacity(1)).toBe(0.14);
    const ops = MOODS.map(inkOpacity);
    for (let i = 1; i < ops.length; i++) expect(ops[i]).toBeGreaterThan(ops[i - 1]);
  });

  it('범위를 넘는 값은 끝에 맞춘다', () => {
    expect(inkOpacity(0)).toBe(INK_OPACITY[0]);
    expect(inkOpacity(7)).toBe(INK_OPACITY[INK_OPACITY.length - 1]);
  });
});

describe('잉크 위 숫자 대비', () => {
  // 달력이 놓이는 바탕: 종이, 선택한 날 칸, 카드
  const grounds = [colors.paper, colors.chipSelected, colors.card];

  it('기분이 없으면 잉크도 없으니 숫자는 그대로', () => {
    expect(inkNeedsLightText(null)).toBe(false);
  });

  it('가장 좋은 날만 숫자를 밝게 바꾼다', () => {
    expect(MOODS.map(inkNeedsLightText)).toEqual([false, false, false, false, true]);
  });

  it('어느 바탕에서나 숫자 대비가 4.5:1 이상', () => {
    for (const bg of grounds) {
      for (const m of MOODS) {
        const blot = over(colors.navy, inkOpacity(m), bg);
        const texts = inkNeedsLightText(m) ? [colors.onDark] : [colors.ink, colors.navy];
        for (const t of texts) expect(contrast(rgb(t), blot)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
