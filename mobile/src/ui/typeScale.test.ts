import { MAC_WIDE_SCALE, scaleText, textScaleFor, WIDE_RATIO } from './typeScale';
import { type, typeWide } from './theme';

describe('textScaleFor', () => {
  it('휴대폰(compact)은 그대로 둔다', () => {
    expect(textScaleFor('compact', false)).toEqual({ wide: false, tokenScale: 1, ownScale: 1 });
  });

  it('아이패드는 넓은 눈금을 쓰고, 화면이 준 크기는 본문 비율만큼 키운다', () => {
    for (const layout of ['regular', 'wide'] as const) {
      expect(textScaleFor(layout, false)).toEqual({ wide: true, tokenScale: 1, ownScale: WIDE_RATIO });
    }
  });

  it('Mac은 넓은 눈금에 한 번만 더 곱한다(본문이 화면에서 16~17pt)', () => {
    const k = textScaleFor('regular', true);
    expect(k.tokenScale).toBe(MAC_WIDE_SCALE);
    const onScreen = typeWide.body.fontSize * k.tokenScale * 0.77; // macOS가 약 77%로 줄여 그린다
    expect(onScreen).toBeGreaterThanOrEqual(16);
    expect(onScreen).toBeLessThanOrEqual(17);
    // 휴대폰 크기로 준 본문도 눈금 본문과 같은 크기가 된다
    expect(Math.round(type.body.fontSize * k.ownScale)).toBe(Math.round(typeWide.body.fontSize * k.tokenScale));
  });
});

describe('scaleText', () => {
  it('배율이 1이면 받은 스타일을 그대로 돌려준다', () => {
    const style = { fontSize: 16 };
    expect(scaleText(style, 1)).toBe(style);
  });

  it('크기·줄 높이·자간을 함께 키운다', () => {
    expect(scaleText({ fontSize: 16, lineHeight: 24, letterSpacing: 2, color: 'red' }, 1.25)).toEqual({
      fontSize: 20,
      lineHeight: 30,
      letterSpacing: 2.5,
      color: 'red',
    });
  });
});
