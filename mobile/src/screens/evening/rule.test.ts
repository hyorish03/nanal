import { MAC_TEXT_SCALE } from '../../ui/desktop';
import { ruleFor } from './rule';

describe('ruleFor', () => {
  it('휴대폰은 지금 눈금 그대로', () => {
    expect(ruleFor('compact', false)).toMatchObject({ lineHeight: 32, line: 32, sit: 6, hand: 23, body: 15 });
  });

  it('넓을수록 줄 간격과 글자가 함께 커진다', () => {
    const [c, r, w] = (['compact', 'regular', 'wide'] as const).map((l) => ruleFor(l, false));
    expect(r.line).toBeGreaterThan(c.line);
    expect(w.line).toBeGreaterThan(r.line);
    expect(w.body).toBeGreaterThan(c.body);
  });

  it('Mac에서는 선 간격이 macText가 키운 글자 줄 높이와 같다', () => {
    for (const l of ['regular', 'wide'] as const) {
      const r = ruleFor(l, true);
      expect(r.line).toBe(Math.round(r.lineHeight * MAC_TEXT_SCALE));
    }
  });
});
