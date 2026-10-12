import { clip, deleteQuestion, eulReul, euRo, iGa } from './josa';

test('받침이 있으면 을·이, 없으면 를·가', () => {
  expect(eulReul('운동')).toBe('을');
  expect(eulReul('장보기')).toBe('를');
  expect(iGa('책')).toBe('이');
  expect(iGa('회의')).toBe('가');
});

test('으로·로: ㄹ 받침과 받침 없는 말 뒤에는 로', () => {
  expect(euRo('지난 기록')).toBe('으로');
  expect(euRo('오늘')).toBe('로');
  expect(euRo('하루 마무리')).toBe('로');
});

test('영문·기호나 빈 글은 받침 없는 쪽', () => {
  expect(eulReul('PR')).toBe('를');
  expect(eulReul('')).toBe('를');
  expect(iGa('?!')).toBe('가');
});

test('끝 숫자는 읽는 소리로 고른다(영·일·삼·육·칠·팔은 받침)', () => {
  for (const d of ['0', '1', '3', '6', '7', '8']) expect(eulReul(`보고서 ${d}`)).toBe('을');
  for (const d of ['2', '4', '5', '9']) expect(eulReul(`보고서 ${d}`)).toBe('를');
  expect(iGa('10')).toBe('이');
  expect(euRo('7')).toBe('로');
  expect(euRo('3')).toBe('으로');
  expect(euRo('2')).toBe('로');
});

test('끝의 괄호·따옴표·마침표는 건너뛰고 읽는다', () => {
  expect(eulReul('장보기(마트)')).toBe('를');
  expect(eulReul('운동.')).toBe('을');
});

test('20자를 넘으면 줄임표로 자른다', () => {
  expect(clip('짧은 글')).toBe('짧은 글');
  expect(clip('가'.repeat(25))).toBe(`${'가'.repeat(20)}…`);
});

test('이모지와 결합 문자는 한 글자로 센다', () => {
  const family = '👨‍👩‍👧';
  expect(clip(family.repeat(3), 2)).toBe(`${family}${family}…`);
  expect(clip(`${'가'.repeat(19)}${family}더`)).toBe(`${'가'.repeat(19)}${family}…`);
});

test('지우기 확인 문구는 줄인 글의 마지막 글자로 조사를 고른다', () => {
  expect(deleteQuestion('운동')).toBe('‘운동’을 지울까요?');
  expect(deleteQuestion('장보기')).toBe('‘장보기’를 지울까요?');
  expect(deleteQuestion(`${'가'.repeat(19)}각 그리고 더`)).toBe(`‘${'가'.repeat(19)}각…’을 지울까요?`);
});
