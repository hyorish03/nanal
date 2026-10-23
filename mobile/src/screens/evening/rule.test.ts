import { MAC_TEXT_SCALE } from '../../ui/desktop';
import { answerLines, ruleFor } from './rule';

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

describe('inputLift', () => {
  it('입력칸은 남는 줄 간격의 절반만큼 올린다(IBM Plex Sans KR 자연 줄 높이 1.5배)', () => {
    expect(ruleFor('compact', false).inputLift).toBe(Math.round((32 - 15 * 1.5) / 2));
    expect(ruleFor('wide', true).inputLift).toBe(Math.round((Math.round(40 * MAC_TEXT_SCALE) - Math.round(17 * MAC_TEXT_SCALE) * 1.5) / 2));
  });

  it('올린 뒤 답 글자 기준선이 선(sit) 위에 온다', () => {
    for (const mac of [false, true]) {
      for (const l of ['compact', 'regular', 'wide'] as const) {
        const r = ruleFor(l, mac);
        const body = mac ? Math.round(r.body * MAC_TEXT_SCALE) : r.body;
        const baseline = r.line - body * 1.5 + body * 1.085 - r.inputLift; // 줄 상자 위에서 기준선까지
        expect(baseline).toBeLessThanOrEqual(r.line - r.sit + 1);
      }
    }
  });
});

describe('answerLines', () => {
  it('질문이 하나면 5줄을 비워 둔다', () => {
    expect(answerLines(1)).toBe(5);
  });

  it('질문이 여럿이면 합쳐 5줄 이상, 답마다 2줄 이상', () => {
    for (const n of [2, 3, 4, 6]) {
      expect(answerLines(n)).toBeGreaterThanOrEqual(2);
      expect(answerLines(n) * n).toBeGreaterThanOrEqual(5);
    }
    expect(answerLines(2)).toBe(3);
    expect(answerLines(3)).toBe(2);
  });

  it('질문이 없어도 0줄이 되지 않는다', () => {
    expect(answerLines(0)).toBe(5);
  });
});
