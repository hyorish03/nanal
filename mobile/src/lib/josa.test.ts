import { clip, deleteQuestion, eulReul, iGa } from './josa';

test('받침이 있으면 을·이, 없으면 를·가', () => {
  expect(eulReul('운동')).toBe('을');
  expect(eulReul('장보기')).toBe('를');
  expect(iGa('책')).toBe('이');
  expect(iGa('회의')).toBe('가');
});

test('한글이 아니거나 빈 글은 받침 없는 쪽', () => {
  expect(eulReul('PR')).toBe('를');
  expect(eulReul('')).toBe('를');
  expect(iGa('3')).toBe('가');
});

test('20자를 넘으면 줄임표로 자른다', () => {
  expect(clip('짧은 글')).toBe('짧은 글');
  expect(clip('가'.repeat(25))).toBe(`${'가'.repeat(20)}…`);
});

test('지우기 확인 문구는 줄인 글의 마지막 글자로 조사를 고른다', () => {
  expect(deleteQuestion('운동')).toBe('‘운동’을 지울까요?');
  expect(deleteQuestion('장보기')).toBe('‘장보기’를 지울까요?');
  expect(deleteQuestion(`${'가'.repeat(19)}각 그리고 더`)).toBe(`‘${'가'.repeat(19)}각…’을 지울까요?`);
});
