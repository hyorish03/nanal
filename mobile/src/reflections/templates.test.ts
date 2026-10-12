import { BUILTIN_TEMPLATES } from './templates';

// 저장된 회고 답은 템플릿 id와 질문 key로 이어진다. 문구를 고쳐도 이 둘은 바뀌면 안 된다.
test('기본 템플릿의 id와 질문 key는 그대로다', () => {
  expect(BUILTIN_TEMPLATES.map((t) => [t.id, t.questions.map((q) => q.key)])).toEqual([
    ['lethargy', ['cause', 'recovery']],
    ['gratitude', ['good']],
    ['free', ['body']],
  ]);
});

test('기본 질문은 해요체로 묻는다', () => {
  for (const q of BUILTIN_TEMPLATES.flatMap((t) => t.questions)) {
    expect(q.text).toMatch(/요\?$|세요$/);
  }
});
